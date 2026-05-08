const express = require('express');
const router = express.Router();

const db = require('../db/database');
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