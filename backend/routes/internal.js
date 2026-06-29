const express = require('express');
const router = express.Router();

const db = require('../db/database');
const crypto = require('crypto');
const { createAccount } = require('../services/auth');

function generateRecoveryCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

router.post('/guest/recovery-code', async (req, res) => {
  try {
    const { userId, sessionId, planId, planData } = req.body;

    if (!userId || !sessionId) {
      return res.status(400).json({ error: 'userId and sessionId are required' });
    }

    const code = generateRecoveryCode();
    await db.saveGuestRecoveryCode(code, userId, sessionId, planId, planData, 10080); // 7 days

    res.json({
      success: true,
      code,
      expiresIn: '7 days',
      message: 'Save this code to recover your plan later'
    });
  } catch (error) {
    console.error('[Guest] Recovery code error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/guest/recover', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Recovery code is required' });
    }

    const recovery = await db.getGuestRecoveryCode(code);

    if (!recovery) {
      return res.status(404).json({ error: 'Invalid or expired recovery code' });
    }

    let planData = null;

    if (recovery.planData) {
      try {
        planData = JSON.parse(recovery.planData);
      } catch (parseError) {
        console.error('[Guest] Failed to parse stored planData:', parseError);
      }
    }

    if (!planData) {
      const plans = await db.getUserPlans(recovery.userId);
      const plan = plans.find(p => p.planId === recovery.planId) || plans[0];
      planData = plan?.planData || null;
    }

    if (!planData) {
      return res.status(404).json({ error: 'No saved plan found for this recovery code' });
    }

    res.json({
      success: true,
      userId: recovery.userId,
      sessionId: recovery.sessionId,
      plan: planData,
      message: 'Plan recovered successfully'
    });
  } catch (error) {
    console.error('[Guest] Recover error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/guest/upgrade', async (req, res) => {
  try {
    const { guestUserId, newUserId, planId } = req.body;

    if (!guestUserId || !newUserId) {
      return res.status(400).json({ error: 'guestUserId and newUserId are required' });
    }

    // Get guest plans
    const guestPlans = await db.getUserPlans(guestUserId);
    
    // Migrate plans to new user
    for (const plan of guestPlans) {
      await db.savePlan(newUserId, plan.planId, plan.planData, {
        destination: plan.destination,
        groupSize: plan.groupSize,
        budget: plan.budget
      });
    }

    // Get guest RAG documents
    const guestDocs = await db.getUserRAGDocuments(guestUserId);
    for (const doc of guestDocs) {
      await db.saveRAGDocument(newUserId, doc.id, doc.data, doc.keywords);
    }

    // Get guest memory notes
    const guestNotes = await db.getInternalMemoryNotes(guestUserId);
    for (const note of guestNotes) {
      await db.saveInternalMemoryNote(newUserId, note.title, note.content, note.tags);
    }

    res.json({
      success: true,
      migratedPlans: guestPlans.length,
      migratedDocs: guestDocs.length,
      migratedNotes: guestNotes.length,
      message: 'Account upgraded successfully'
    });
  } catch (error) {
    console.error('[Guest] Upgrade error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/account/create', async (req, res) => {
  try {
    const { email, password, name, guestUserId, sessionId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const account = await createAccount({
      userId: guestUserId,
      email,
      password,
      name: name || email.split('@')[0],
    });

    // If guest session provided, migrate guest data to new account
    if (guestUserId && sessionId) {
      try {
        const guestPlans = await db.getUserPlans(guestUserId);
        for (const plan of guestPlans) {
          await db.savePlan(account.id, plan.planId, plan.planData, {
            destination: plan.destination,
            groupSize: plan.groupSize,
            budget: plan.budget,
          });
        }
      } catch (migrationError) {
        console.error('[Account] Guest migration error:', migrationError);
      }
    }

    res.json({
      success: true,
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        createdAt: account.createdAt,
      },
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('[Account] Create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
const {
  getModelInfo,
  getSearchConfig,
  resolveSearchProvider,
  getSearchProviderLabel,
  searchWeb,
  readUrlContent,
  analyzeMemoryNote,
  runBrowserWorkflow,
  summarizeInternalSession,
} = require('../services/internalLab');

router.get('/status', (req, res) => {
  const modelInfo = getModelInfo();
  const searchConfig = getSearchConfig();
  const searchProvider = resolveSearchProvider(searchConfig);

  res.json({
    success: true,
    ollama: {
      model: modelInfo.model,
      baseUrl: modelInfo.baseUrl,
    },
    search: {
      provider: searchProvider,
      providerLabel: getSearchProviderLabel(searchProvider),
      googleConfigured: searchConfig.googleConfigured,
    },
    capabilities: {
      oracle: 'web search and page reading',
      phantom: 'headless browser workflows',
      mnemo: 'internal memory notes',
      chronicle: 'conversation and plan history',
    },
    timestamp: new Date().toISOString(),
  });
});

router.post('/research/search', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query || !String(query).trim()) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const result = await searchWeb(String(query).trim(), Math.max(1, Math.min(Number(limit) || 5, 10)));
    res.json(result);
  } catch (error) {
    console.error('[INTERNAL] Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/research/read-url', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    const result = await readUrlContent(String(url));
    res.json(result);
  } catch (error) {
    console.error('[INTERNAL] Read URL error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/browser/run', async (req, res) => {
  try {
    const { url, actions = [], goal = '' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    const result = await runBrowserWorkflow({
      url: String(url),
      actions: Array.isArray(actions) ? actions : [],
      goal: String(goal || '').trim(),
    });
    res.json(result);
  } catch (error) {
    console.error('[INTERNAL] Browser error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/memory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const notes = await db.getInternalMemoryNotes(userId);
    res.json({ success: true, notes });
  } catch (error) {
    console.error('[INTERNAL] Memory load error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/memory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, content, tags = [] } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Missing title or content' });
    }

    const normalizedTags = Array.isArray(tags)
      ? tags
      : String(tags)
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

    const noteId = await db.saveInternalMemoryNote(userId, title, content, normalizedTags);
    const notes = await db.getInternalMemoryNotes(userId);
    const noteInsight = await analyzeMemoryNote({ title, content, tags: normalizedTags });

    res.json({ success: true, noteId, notes, noteInsight });
  } catch (error) {
    console.error('[INTERNAL] Memory save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/memory/:userId/:noteId', async (req, res) => {
  try {
    const { userId, noteId } = req.params;
    const removed = await db.deleteInternalMemoryNote(userId, noteId);

    res.json({
      success: true,
      removed,
    });
  } catch (error) {
    console.error('[INTERNAL] Memory delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/summary/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [notes, conversations, plans] = await Promise.all([
      db.getInternalMemoryNotes(userId),
      db.getConversationHistory(userId, 25),
      db.getUserPlans(userId),
    ]);

    const result = await summarizeInternalSession({ userId, notes, conversations, plans });

    res.json(result);
  } catch (error) {
    console.error('[INTERNAL] Summary load error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;