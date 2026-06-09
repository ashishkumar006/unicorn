/**
 * BROWSER RUNNER SERVICE
 *
 * Unified browser automation interface.
 * Delegates to the real Puppeteer-based implementation in services/internalLab.js
 */

async function runBrowserWorkflow({ url, actions = [], goal = '' }) {
  try {
    const { runBrowserWorkflow: internalRunBrowserWorkflow } = require('./internalLab');
    const result = await internalRunBrowserWorkflow({
      url: String(url || ''),
      goal: String(goal || 'extract travel data'),
      actions: Array.isArray(actions) ? actions : [],
    });

    return {
      success: true,
      provider: 'browser-runner',
      url: result.url || url,
      goal: result.goal || goal,
      actions: result.actions || actions,
      message: result.summary || result.message || 'Browser workflow completed.',
      page: {
        title: result.page?.title || result.title || '',
        content: result.page?.content || result.content || '',
        extracted: result.page?.extracted || result.extracted || [],
        screenshots: result.page?.screenshots || result.screenshots || [],
      },
      result,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('[BrowserRunner] Workflow failed, returning degraded result:', error.message);
    return {
      success: false,
      provider: 'browser-runner',
      url: String(url || ''),
      goal: String(goal || ''),
      actions: Array.isArray(actions) ? actions : [],
      message: `Browser workflow failed: ${error.message}`,
      page: {
        title: '',
        content: '',
        extracted: [],
        screenshots: [],
      },
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function takeScreenshot({ url, fullPage = false } = {}) {
  try {
    const { runBrowserWorkflow } = require('./internalLab');
    const result = await runBrowserWorkflow({
      url: String(url || ''),
      goal: 'capture screenshot',
      actions: [{ type: 'screenshot', fullPage: Boolean(fullPage) }],
    });

    return {
      success: true,
      provider: 'browser-runner',
      url: result.url || url,
      fullPage: Boolean(fullPage),
      screenshot: result.page?.screenshot || result.screenshot || '',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      provider: 'browser-runner',
      url: String(url || ''),
      fullPage: Boolean(fullPage),
      screenshot: '',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function extractPageData({ url, selector = '', goal = '' } = {}) {
  try {
    const { runBrowserWorkflow } = require('./internalLab');
    const result = await runBrowserWorkflow({
      url: String(url || ''),
      goal: String(goal || 'extract structured data'),
      actions: selector ? [{ type: 'extract', selector: String(selector) }] : [],
    });

    return {
      success: true,
      provider: 'browser-runner',
      url: result.url || url,
      selector: String(selector || ''),
      goal: String(goal || ''),
      extracted: result.page?.extracted || result.extracted || {},
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      provider: 'browser-runner',
      url: String(url || ''),
      selector: String(selector || ''),
      goal: String(goal || ''),
      extracted: {},
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = {
  runBrowserWorkflow,
  takeScreenshot,
  extractPageData,
};
