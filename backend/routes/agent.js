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

    console.log('\n[AGENT API] /chat endpoint (Streaming)');
    console.log('[AGENT API] userId:', userId);
    console.log('[AGENT API] message:', message?.substring(0, 100));
    console.log('[AGENT API] agentModel:', agentModel);

    if (!userId || !message) {
      console.warn('[AGENT API] Missing userId or message');
      return res.status(400).json({ error: 'Missing userId or message' });
    }

    if (activeChatRequests.has(userId)) {
      console.warn('[AGENT API] Duplicate chat request ignored for userId:', userId);
      return res.status(429).json({
        error: 'Your previous message is still being processed. Please wait a moment.'
      });
    }

    activeChatRequests.add(userId);

    const agent = getAgent(userId, agentModel);
    console.log('[AGENT API] Got agent:', agent.name);
    
    // Set headers for Server-Sent Events (SSE) / chunked JSON streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Progress callback directly writes chunks to frontend
    const onProgress = (update) => {
      console.log('[AGENT API] 📤 Sending update to frontend:', {
        type: update.type,
        content: update.content?.substring(0, 80) || update.tool || 'N/A'
      });
      sendStreamEvent(update);
    };

    try {
      // Save user message to database
      const userMsgId = await db.saveMessage(userId, message, 'user');
      console.log('[AGENT API] 💾 Saved user message:', { 
        userId, 
        messageLength: message.length, 
        dbId: userMsgId 
      });

      // Process message with streaming progress updates
      const response = await agent.processMessage(message, onProgress);

      if (!response || response.error) {
        throw new Error(response?.error || 'Agent returned an error');
      }

      const agentMessage = typeof response.message === 'string' ? response.message : '';

      if (!agentMessage) {
        throw new Error('Agent returned an empty response');
      }
      
      // Save agent response to database
      const agentMsgId = await db.saveMessage(userId, agentMessage, 'agent');
      console.log('[AGENT API] 💾 Saved agent response:', { 
        userId, 
        messageLength: agentMessage.length, 
        dbId: agentMsgId 
      });

      if (response.updatedPlan) {
        const recentPlans = ragStore.getRecentPlans(userId, 1);
        if (recentPlans.length > 0) {
          await ragStore.updatePlan(userId, recentPlans[0].id, response.updatedPlan);
          console.log('[AGENT API] 🔄 Persisted updated plan to RAG store');
        }
      }

      console.log('[AGENT API] Agent processing complete');
      const agentContext = ragStore.buildAgentContext(userId, agent.getPlan());

      // Send the final summary response
      sendStreamEvent({ 
        type: 'final', 
        success: true, 
        response: response, 
        agentStatus: agent.getStatus(),
        ragContext: agentContext 
      });
      sendStreamEvent('[DONE]');
      endStream();
    } catch (error) {
      console.error('[AGENT API] Processing error:', error);
      sendStreamEvent({ type: 'error', error: error.message });
      endStream();
    } finally {
      activeChatRequests.delete(userId);
    }
  } catch (error) {
    console.error('[AGENT API] Chat endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
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
  try {
    const { userId, plan, planId, agentModel } = req.body;

    console.log('\n[AGENT API] /plan endpoint');
    console.log('[AGENT API] userId:', userId);
    console.log('[AGENT API] planId:', planId);
    console.log('[AGENT API] agentModel:', agentModel);
    console.log('[AGENT API] plan.destination:', plan?.destination);
    console.log('[AGENT API] plan has budgetBreakdown:', !!plan?.budgetBreakdown);

    if (!userId || !plan) {
      console.warn('[AGENT API] Missing userId or plan');
      return res.status(400).json({
        error: 'Missing userId or plan'
      });
    }

    const agent = getAgent(userId, agentModel);
    console.log('[AGENT API] Setting plan for agent:', agent.name);
    agent.setPlan(plan);

    // Store in RAG + Database
    const storedPlanId = await ragStore.storePlan(userId, plan, { planId });
    console.log('[AGENT API] Plan stored in RAG and database');

    // Build context for agent
    const context = ragStore.buildAgentContext(userId, plan);

    res.json({
      success: true,
      message: 'Plan set successfully',
      storedPlanId,
      agentStatus: agent.getStatus(),
      agentContext: context
    });
  } catch (error) {
    console.error('[AGENT API] Set plan error:', error);
    res.status(500).json({ error: error.message });
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
