/**
 * AGENT API ROUTES
 * 
 * Endpoints for agent interaction:
 * - POST /api/agent/chat - Chat with agent
 * - POST /api/agent/modify - Quick modify plan
 * - GET /api/agent/capabilities - Get agent capabilities
 * - GET /api/agent/status - Agent status
 * - POST /api/agent/plan - Set plan for agent
 */

const express = require('express');
const router = express.Router();
const EmailAgent = require('../agents/emailAgent');
const { ragStore } = require('../rag/ragStore');
const db = require('../db/database');

// Store agent instances per user
const agents = new Map();
const activeChatRequests = new Set();
const MAX_MESSAGE_LENGTH = 4000;
const MAX_USER_ID_LENGTH = 120;

function createRequestId(prefix = 'agent') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendError(res, status, code, message, details, requestId) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    details: details || message,
    requestId,
  });
}

function validateUserId(userId, errors) {
  const normalized = String(userId || '').trim();
  if (!normalized) {
    errors.push('userId is required.');
  } else if (normalized.length > MAX_USER_ID_LENGTH) {
    errors.push(`userId must be ${MAX_USER_ID_LENGTH} characters or less.`);
  }
  return normalized;
}

function normalizeSseEvent(update = {}, requestId, startedAt) {
  const typeMap = {
    tool_result: 'tool_end',
    tool_result_chunk: 'tool_end',
  };

  return {
    ...update,
    type: typeMap[update.type] || update.type || 'message',
    requestId,
    elapsedMs: Date.now() - startedAt,
  };
}

function normalizeAgentModel(agentModel) {
  return 'gemma-cloud';
}

// Get or create agent for user
function getAgent(userId, agentModel = 'gemma-cloud') {
  const resolvedAgentModel = normalizeAgentModel(agentModel);

  if (!agents.has(userId)) {
    agents.set(userId, new EmailAgent({ groupId: userId, provider: resolvedAgentModel }));
  } else {
    // Update provider if it changed
    const agent = agents.get(userId);
    if (resolvedAgentModel && agent.state.provider !== resolvedAgentModel) {
      agent.state.provider = resolvedAgentModel;
    }
  }
  return agents.get(userId);
}

// ============================================================
// POST /api/agent/chat
// Chat with agent about current plan (Streams responses)
// ============================================================
router.post('/chat', async (req, res) => {
  const requestId = createRequestId('chat');
  const startedAt = Date.now();
  const sendStreamEvent = (payload) => {
    if (res.writableEnded || res.destroyed) {
      return false;
    }

    try {
      const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
      res.write(`data: ${serialized}\n\n`);
      return true;
    } catch (streamError) {
      console.warn('[AGENT API] Failed to write SSE update:', streamError.message);
      return false;
    }
  };

  const endStream = () => {
    if (res.writableEnded) {
      return;
    }

    try {
      res.end();
    } catch (endError) {
      console.warn('[AGENT API] Failed to close SSE response:', endError.message);
    }
  };

  try {
    const { userId, message, planId, agentModel } = req.body;

    const errors = [];
    const normalizedUserId = validateUserId(userId, errors);
    const normalizedMessage = String(message || '').trim();

    if (!normalizedMessage) {
      errors.push('message is required.');
    } else if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      errors.push(`message must be ${MAX_MESSAGE_LENGTH} characters or less.`);
    }

    if (errors.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid chat request.', errors, requestId);
    }

    console.info('[AgentAPI] Chat stream started', {
      requestId,
      userId: normalizedUserId,
      messageLength: normalizedMessage.length,
      planId: planId || null,
      agentModel: normalizeAgentModel(agentModel),
    });

    if (activeChatRequests.has(normalizedUserId)) {
      return sendError(res, 429, 'CHAT_IN_PROGRESS', 'Your previous message is still being processed. Please wait a moment.', null, requestId);
    }

    activeChatRequests.add(normalizedUserId);

    const agent = getAgent(normalizedUserId, agentModel);
    
    // Set headers for Server-Sent Events (SSE) / chunked JSON streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Progress callback directly writes chunks to frontend.
    const onProgress = (update) => {
      sendStreamEvent(normalizeSseEvent(update, requestId, startedAt));
    };

    try {
      // Save user message to database
      const userMsgId = await db.saveMessage(normalizedUserId, normalizedMessage, 'user');
      console.info('[AgentAPI] Saved user message', { 
        requestId,
        userId: normalizedUserId, 
        messageLength: normalizedMessage.length, 
        dbId: userMsgId 
      });

      // Process message with streaming progress updates
      const response = await agent.processMessage(normalizedMessage, onProgress);

      if (!response || response.error) {
        throw new Error(response?.error || 'Agent returned an error');
      }

      const agentMessage = typeof response.message === 'string' ? response.message : '';

      if (!agentMessage) {
        throw new Error('Agent returned an empty response');
      }
      
      // Save agent response to database
      const agentMsgId = await db.saveMessage(normalizedUserId, agentMessage, 'agent');
      console.info('[AgentAPI] Saved agent response', { 
        requestId,
        userId: normalizedUserId, 
        messageLength: agentMessage.length, 
        dbId: agentMsgId 
      });

      if (response.updatedPlan) {
        const recentPlans = ragStore.getRecentPlans(normalizedUserId, 1);
        if (recentPlans.length > 0) {
          await ragStore.updatePlan(normalizedUserId, recentPlans[0].id, response.updatedPlan);
          console.info('[AgentAPI] Persisted updated plan to RAG store', { requestId, userId: normalizedUserId });
        }
      }

      const agentContext = ragStore.buildAgentContext(normalizedUserId, agent.getPlan());

      // Send the final summary response
      sendStreamEvent({ 
        type: 'final', 
        success: true, 
        requestId,
        elapsedMs: Date.now() - startedAt,
        response: response, 
        agentStatus: agent.getStatus(),
        ragContext: agentContext 
      });
      sendStreamEvent('[DONE]');
      endStream();
    } catch (error) {
      console.error('[AgentAPI] Chat processing failed', { requestId, userId: normalizedUserId, error: error.message });
      sendStreamEvent({ type: 'error', requestId, elapsedMs: Date.now() - startedAt, error: { code: 'CHAT_FAILED', message: error.message } });
      endStream();
    } finally {
      activeChatRequests.delete(normalizedUserId);
    }
  } catch (error) {
    console.error('[AgentAPI] Chat endpoint failed', { requestId, error: error.message });
    if (!res.headersSent) {
      sendError(res, 500, 'CHAT_FAILED', 'Failed to process chat request.', error.message, requestId);
    } else {
      endStream();
    }
  }
});

// ============================================================
// POST /api/agent/plan
// Set the plan for agent to work with
// ============================================================
router.post('/plan', async (req, res) => {
  const requestId = createRequestId('plan');
  try {
    const { userId, plan, planId, agentModel } = req.body;
    const errors = [];
    const normalizedUserId = validateUserId(userId, errors);

    if (!plan || typeof plan !== 'object') {
      errors.push('plan is required.');
    }

    if (errors.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid plan request.', errors, requestId);
    }

    console.info('[AgentAPI] Plan init started', {
      requestId,
      userId: normalizedUserId,
      planId: planId || null,
      destination: plan?.destination || plan?.summary?.toPlace || null,
    });

    const agent = getAgent(normalizedUserId, agentModel);
    agent.setPlan(plan);

    // Store in RAG + Database
    const storedPlanId = await ragStore.storePlan(normalizedUserId, plan, { planId });

    // Build context for agent
    const context = ragStore.buildAgentContext(normalizedUserId, plan);

    res.json({
      success: true,
      message: 'Plan set successfully',
      requestId,
      storedPlanId,
      agentStatus: agent.getStatus(),
      agentContext: context
    });
  } catch (error) {
    console.error('[AgentAPI] Set plan failed', { requestId, error: error.message });
    sendError(res, 500, 'PLAN_INIT_FAILED', 'Failed to set plan.', error.message, requestId);
  }
});

// ============================================================
// POST /api/agent/modify
// Quick modify without Gemini (direct tool call)
// ============================================================
router.post('/modify', async (req, res) => {
  try {
    const { userId, modification, agentModel } = req.body;

    if (!userId || !modification) {
      return res.status(400).json({
        error: 'Missing userId or modification'
      });
    }

    const agent = getAgent(userId, agentModel);
    const result = await agent.quickModify(modification);

    if (result.updatedPlan) {
      // Update RAG + Database
      const recentPlans = ragStore.getRecentPlans(userId, 1);
      if (recentPlans.length > 0) {
        await ragStore.updatePlan(userId, recentPlans[0].id, result.updatedPlan);
      }
    }

    res.json({
      success: true,
      result,
      agentStatus: agent.getStatus()
    });
  } catch (error) {
    console.error('Modify error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/agent/capabilities
// Get agent capabilities (what it can do)
// ============================================================
router.get('/capabilities', (req, res) => {
  try {
    const { userId } = req.query;
    const agent = getAgent(userId || 'default');

    res.json({
      success: true,
      capabilities: agent.getCapabilities(),
      agentName: agent.name
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/agent/status
// Get current agent status
// ============================================================
router.get('/status', (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const agent = getAgent(userId);

    res.json({
      success: true,
      status: agent.getStatus(),
      planSummary: agent.getPlanSummary(),
      isPlanComplete: agent.isPlanComplete()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/agent/history/:userId
// Get chat history with agent
// ============================================================
router.get('/history/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const agent = getAgent(userId);

    res.json({
      success: true,
      history: agent.getHistory()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// POST /api/agent/reset/:userId
// Reset agent (new conversation, keep plan)
// ============================================================
router.post('/reset/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const agent = getAgent(userId);

    agent.reset();

    res.json({
      success: true,
      message: 'Agent reset',
      agentStatus: agent.getStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/rag/search
// Search RAG for similar plans
// ============================================================
router.get('/rag/search', (req, res) => {
  try {
    const { userId, query } = req.query;

    if (!userId || !query) {
      return res.status(400).json({
        error: 'Missing userId or query'
      });
    }

    const results = ragStore.searchPlans(userId, query);

    res.json({
      success: true,
      results,
      count: results.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/rag/documents/:userId
// Get all stored plans for user
// ============================================================
router.get('/rag/documents/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const documents = ragStore.getUserDocuments(userId);

    res.json({
      success: true,
      documents,
      count: documents.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/agent/conversation-history/:userId
// Get chat history from database
// ============================================================
router.get('/conversation-history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit || 50;

    const history = await db.getConversationHistory(userId, limit);

    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Get conversation history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/agent/plans/:userId
// Get all saved plans from database
// ============================================================
router.get('/plans/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const plans = await db.getUserPlans(userId);

    res.json({
      success: true,
      plans,
      count: plans.length
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/rag/stats
// Get RAG system statistics
// ============================================================
router.get('/rag/stats', (req, res) => {
  try {
    const stats = ragStore.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

/**
 * USAGE IN server.js:
 * 
 * const agentRoutes = require('./routes/agent');
 * app.use('/api/agent', agentRoutes);
 * 
 * ENDPOINTS:
 * POST   /api/agent/chat             - Chat with agent
 * POST   /api/agent/plan             - Set plan
 * POST   /api/agent/modify           - Quick modify
 * GET    /api/agent/capabilities     - What agent can do
 * GET    /api/agent/status           - Current status
 * GET    /api/agent/history/:userId  - Chat history
 * POST   /api/agent/reset/:userId    - Reset agent
 * GET    /api/rag/search             - Search plans
 * GET    /api/rag/documents/:userId  - Get all plans
 * GET    /api/rag/stats              - System stats
 */
