/**
 * BROWSER AUTOMATION ROUTES
 *
 * New unified API surface under /api/browser.
 * Backward-compatible: existing internal/browser/run continues to work.
 */

const express = require('express');
const router = express.Router();
const { runBrowserWorkflow, takeScreenshot, extractPageData } = require('../services/browserRunner');

router.post('/run', async (req, res) => {
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
    console.error('[BrowserAPI] Browser run error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/screenshot', async (req, res) => {
  try {
    const { url, fullPage = false } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    const result = await takeScreenshot({
      url: String(url),
      fullPage: Boolean(fullPage),
    });

    res.json(result);
  } catch (error) {
    console.error('[BrowserAPI] Screenshot error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/extract', async (req, res) => {
  try {
    const { url, selector = '', goal = '' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Missing url' });
    }

    const result = await extractPageData({
      url: String(url),
      selector: String(selector || '').trim(),
      goal: String(goal || '').trim(),
    });

    res.json(result);
  } catch (error) {
    console.error('[BrowserAPI] Extract error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
