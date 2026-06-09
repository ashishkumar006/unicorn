const playwright = require('playwright');
const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OLLAMA_API_KEY = process.env.TRAVEL_OLLAMA_API_KEY || process.env.OLLAMA_API_KEY;
const OLLAMA_MODEL = process.env.TRAVEL_OLLAMA_MODEL || 'gemma4:31b-cloud';
const OLLAMA_URL = process.env.TRAVEL_OLLAMA_URL === 'http://localhost:11434' ? 'https://ollama.com/api' : (process.env.TRAVEL_OLLAMA_URL || 'https://ollama.com/api');

const SESSION_STATE_PATH = path.join(__dirname, 'state.json');
const ARTIFACTS_DIR = path.join(__dirname, 'artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

function generateArtifactId(goal) {
  return `${Date.now()}-${goal.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30)}.json`;
}

function normalizeStatusText(text, fallback) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 120) : fallback;
}

function emitStatus(hooks, text, fallback = 'Working on it...') {
  if (hooks && typeof hooks.onStatus === 'function') {
    hooks.onStatus(normalizeStatusText(text, fallback));
  }
}

function getDecisionStatus(decision, pageTitle, currentUrl) {
  const primaryDecision = Array.isArray(decision) ? decision[0] : decision;

  if (!primaryDecision) {
    return normalizeStatusText(`Reviewing ${pageTitle || currentUrl || 'the page'}`, 'Working on it...');
  }

  if (primaryDecision.status) {
    return normalizeStatusText(primaryDecision.status, 'Working on it...');
  }

  if (primaryDecision.reason) {
    return normalizeStatusText(primaryDecision.reason, 'Working on it...');
  }

  if (primaryDecision.action === 'click' && primaryDecision.selector) {
    return normalizeStatusText(`Clicking ${primaryDecision.selector}`, 'Clicking an element');
  }

  if (primaryDecision.action === 'type' && primaryDecision.selector) {
    return normalizeStatusText(`Typing into ${primaryDecision.selector}`, 'Typing into a field');
  }

  if (primaryDecision.action === 'extract') {
    return normalizeStatusText('Extracting the results', 'Extracting data');
  }

  if (primaryDecision.action === 'wait') {
    return normalizeStatusText('Waiting for the page to update', 'Waiting');
  }

  if (primaryDecision.action === 'done') {
    return normalizeStatusText('Wrapping up the task', 'Finishing up');
  }

  return normalizeStatusText(`Reviewing ${pageTitle || currentUrl || 'the page'}`, 'Working on it...');
}

async function callLLM(messages, system) {
  if (!OLLAMA_API_KEY) {
    throw new Error('Missing TRAVEL_OLLAMA_API_KEY environment variable');
  }

  const response = await axios.post(
    `${OLLAMA_URL}/chat`,
    {
      model: OLLAMA_MODEL,
      messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
      format: 'json',
      stream: false,
      options: { temperature: 0.2, top_p: 0.9 }
    },
    {
      headers: { Authorization: `Bearer ${OLLAMA_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 6000000
    }
  );

  let content = response.data?.message?.content;
  const contentSummary = typeof content === 'string'
    ? `string(${content.length})`
    : Array.isArray(content)
      ? `array(${content.length})`
      : content && typeof content === 'object'
        ? `object(${Object.keys(content).length})`
        : String(content);

  console.log(`[LLM] Response summary: ${contentSummary}`);

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('```')) {
      content = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    }
  }

  return content;
}

// Missing critical functions - adding them
async function extractJSON(content) {
  let text = String(content || '').trim()
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '');

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(text.slice(arrayStart, arrayEnd + 1));
    } catch (e) {}
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e) {}
  }
  throw new Error('Could not extract valid JSON from response');
}

async function analyzePage(page) {
  const elements = [];
  try {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    function flattenA11yTree(node, results, depth) {
      if (!node || depth > 4) return results;
      if (node.role && node.role !== 'generic' && node.role !== 'group') {
        results.push({ role: node.role, name: node.name || '', value: node.value || '', children: node.children?.length || 0 });
      }
      if (node.children) {
        for (const child of node.children) {
          flattenA11yTree(child, results, depth + 1);
        }
      }
      return results;
    }
    return flattenA11yTree(snapshot, [], 0).slice(0, 30);
  } catch (e) {
    return elements;
  }
}

function hasInteractiveControls(elements) {
  if (!elements || elements.length === 0) return false;
  const interactiveRoles = ['button', 'link', 'textbox', 'combobox', 'menuitem', 'checkbox', 'radio', 'tab'];
  return elements.some(el => interactiveRoles.includes((el.role || '').toLowerCase()));
}

function hasMeaningfulProgress(actionLog) {
  const meaningfulActions = ['typed', 'clicked', 'extracted'];
  return actionLog.some(step => meaningfulActions.some(action => step.toLowerCase().includes(action)));
}

function canFinishWithExtraction(elements, actionLog, extracted, selector) {
  const hasControls = hasInteractiveControls(elements);
  const hasProgress = hasMeaningfulProgress(actionLog);
  if (hasControls && !hasProgress) return false;
  if (!extracted || !String(extracted).trim()) return false;
  const extractedText = String(extracted).toLowerCase();
  if (extractedText.includes('select all') || extractedText.includes('captcha') || extractedText.includes('are you a robot')) return false;
  return true;
}

async function executeAction(page, decision, actionLog, clickedSelectors, elements) {
  try {
    if (decision.action === 'click' && decision.selector) {
      const locator = await resolveGenericLocator(page, decision.selector, elements);
      if (!locator) {
        throw new Error('Could not resolve click target: ' + decision.selector);
      }

      const count = await locator.count().catch(() => 0);
      let resolvedLocator = locator;
      if (count > 1) {
        for (let index = 0; index < Math.min(count, 12); index++) {
          const candidate = locator.nth(index);
          const isVisible = await candidate.isVisible().catch(() => false);
          if (isVisible) {
            resolvedLocator = candidate;
            break;
          }
        }
      }

      await resolvedLocator.click({ timeout: 5000 });
      actionLog.push('Clicked: ' + decision.selector);
      clickedSelectors?.add(decision.selector);
      await page.waitForTimeout(1000);
    } else if (decision.action === 'type' && decision.selector && decision.value) {
      const locator = await resolveGenericLocator(page, decision.selector, elements);
      if (!locator) {
        throw new Error('Could not resolve type target: ' + decision.selector);
      }

      await locator.waitFor({ state: 'visible' });
      await locator.fill(decision.value);
      actionLog.push('Typed "' + decision.value + '" into ' + decision.selector);
      console.log('[Agent] Typed "' + decision.value + '" into ' + decision.selector);
      await page.waitForTimeout(1500);

      let suggestionClicked = false;
      try {
        await page.waitForTimeout(1000);

        const suggestionSelectors = [
          '[role="listbox"] [role="option"]',
          '[role="option"]',
          '[role="listitem"]',
          'li[data-autocomplete]',
          'li.cursor-pointer',
          'li.selectable',
          '.dropdown-menu li',
          '.suggestion li',
          '.suggestions li',
          '.ac-item',
          '[class*="dropdown"] li',
          '[class*="suggestion"] li',
          '[class*="autocomplete"] li',
          '[id*="suggestion"] li',
          '[id*="dropdown"] li',
          'ul li', 'ol li'
        ];

        for (const sel of suggestionSelectors) {
          try {
            const count = await page.locator(sel).count();
            if (count > 0) {
              console.log('[Agent] Found ' + count + ' elements matching: ' + sel);
              const matchingSuggestion = page.locator(sel).filter({ hasText: decision.value.split(',')[0].trim() });
              const matchingCount = await matchingSuggestion.count();
              if (matchingCount > 0) {
                await matchingSuggestion.first().click({ timeout: 1000 });
                actionLog.push('Clicked dropdown suggestion for ' + decision.selector + ': ' + decision.value);
                console.log('[Agent] Clicked matching dropdown suggestion: ' + sel);
                suggestionClicked = true;
                break;
              } else {
                await page.locator(sel).first().click({ timeout: 1000 });
                actionLog.push('Clicked dropdown suggestion for ' + decision.selector);
                console.log('[Agent] Clicked dropdown suggestion: ' + sel);
                suggestionClicked = true;
                break;
              }
            }
          } catch (e) {
            console.log('[Agent] Selector ' + sel + ' failed: ' + e.message);
          }
        }
      } catch (e) {
        console.log('[Agent] No dropdown suggestion found: ' + e.message);
      }

      if (!suggestionClicked) {
        await page.keyboard.press('Enter');
        actionLog.push('Pressed Enter after typing ' + decision.value);
        console.log('[Agent] Pressed Enter as fallback');
      }

      await page.waitForTimeout(500);
    } else if (decision.action === 'wait') {
      await page.waitForTimeout(decision.value || 1000);
    }
  } catch (e) {
    actionLog.push(decision.action + ' failed: ' + (decision.selector || '') + ' - ' + e.message);
  }
}

function semanticFieldHintMatches(hint, text) {
  const normalizedHint = normalizeText(hint).toLowerCase();
  const normalizedText = normalizeText(text).toLowerCase();

  if (!normalizedHint || !normalizedText) {
    return false;
  }

  if (normalizedText.includes(normalizedHint) || normalizedHint.includes(normalizedText)) {
    return true;
  }

  const synonyms = FIELD_HINT_SYNONYMS[normalizedHint] || [];
  return synonyms.some((synonym) => normalizedText.includes(normalizeText(synonym).toLowerCase()));
}

function extractSemanticTargetHints(targetText) {
  const normalizedTarget = normalizeText(targetText).toLowerCase();
  const hints = [];

  const fieldHintMatch = normalizedTarget.match(/fieldhint\s*=\s*['"]?([a-z_]+)['"]?/i);
  if (fieldHintMatch) {
    hints.push(fieldHintMatch[1]);
  }

  for (const hint of Object.keys(FIELD_HINT_SYNONYMS)) {
    if (semanticFieldHintMatches(hint, normalizedTarget)) {
      hints.push(hint);
    }
  }

  return uniqueStrings(hints);
}

function scoreAnalyzedElement(element, targetText) {
  const normalizedTarget = normalizeText(targetText).toLowerCase();
  if (!normalizedTarget || !element) {
    return 0;
  }

  const candidateFieldHint = normalizeText(element.fieldHint).toLowerCase();
  const candidateRegion = normalizeText(element.region).toLowerCase();
  const candidateText = uniqueStrings([
    element.id,
    element.testId,
    element.name,
    element.ariaLabel,
    element.label,
    element.placeholder,
    element.text,
    element.fieldHint,
    element.region,
    element.role,
    element.tag,
    element.href
  ]).join(' ').toLowerCase();

  let score = 0;

  if (candidateText === normalizedTarget) {
    score += 120;
  }

  if (candidateText.includes(normalizedTarget) || normalizedTarget.includes(candidateText)) {
    score += 80;
  }

  const targetHints = extractSemanticTargetHints(normalizedTarget);
  for (const hint of targetHints) {
    if (semanticFieldHintMatches(hint, candidateFieldHint)) {
      score += 120;
    }

    if (semanticFieldHintMatches(hint, candidateRegion)) {
      score += 80;
    }

    if (semanticFieldHintMatches(hint, element.name) || semanticFieldHintMatches(hint, element.label) || semanticFieldHintMatches(hint, element.placeholder) || semanticFieldHintMatches(hint, element.text)) {
      score += 60;
    }
  }

  const words = normalizedTarget.split(/\s+/).filter(Boolean);
  score += words.filter((word) => candidateText.includes(word)).length * 5;

  if (element.role && ['combobox', 'textbox'].includes(normalizeText(element.role).toLowerCase()) && !element.name && !element.label && !element.placeholder && !element.text) {
    score -= 10;
  }

  return Math.max(score, 0);
}

function findBestAnalyzedElement(targetText, elements) {
  const matches = (elements || [])
    .map((element) => ({ element, score: scoreAnalyzedElement(element, targetText) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  return matches.length > 0 ? matches[0] : null;
}

async function getLocatorMetadata(locator) {
  try {
    return await locator.evaluate((el) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const truncate = (value, maxLength = 120) => {
        const text = normalize(value);
        return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
      };
      const container = el.closest('dialog, [role="dialog"], form, [role="form"], main, [role="main"], section, article, [class*="modal"], [class*="popup"], [class*="booking"], [class*="search"], [class*="result"], [class*="listing"], [class*="checkout"]');
      const region = container ? truncate(container.innerText || container.textContent || '', 220) : '';

      return {
        id: el.id || '',
        testId: el.getAttribute('data-testid') || '',
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        tag: el.tagName.toLowerCase(),
        name: truncate(el.getAttribute('aria-label') || el.getAttribute('name') || el.id || el.innerText || el.textContent || '', 80),
        label: '',
        placeholder: truncate(el.getAttribute('placeholder') || '', 80),
        text: truncate(el.innerText || el.textContent || '', 80),
        region,
        href: el.href || '',
        visible: (() => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        })()
      };
    });
  } catch (error) {
    return null;
  }
}

function scoreLocatorMetadata(metadata, analyzedElement) {
  if (!metadata || !analyzedElement) {
    return -Infinity;
  }

  const candidate = {
    id: metadata.id || '',
    testId: metadata.testId || '',
    role: metadata.role || '',
    tag: metadata.tag || '',
    name: metadata.name || '',
    label: metadata.label || metadata.name || '',
    placeholder: metadata.placeholder || '',
    text: metadata.text || '',
    fieldHint: extractSemanticTargetHints([
      metadata.id,
      metadata.testId,
      metadata.name,
      metadata.placeholder,
      metadata.text,
      metadata.region,
      metadata.href
    ].join(' '))[0] || '',
    region: metadata.region || '',
    href: metadata.href || ''
  };

  const targetText = uniqueStrings([
    analyzedElement.id,
    analyzedElement.testId,
    analyzedElement.name,
    analyzedElement.ariaLabel,
    analyzedElement.label,
    analyzedElement.placeholder,
    analyzedElement.text,
    analyzedElement.fieldHint,
    analyzedElement.region,
    analyzedElement.href,
    analyzedElement.role,
    analyzedElement.tag
  ]).join(' ');

  let score = scoreAnalyzedElement(candidate, targetText);

  if (metadata.visible) {
    score += 15;
  }

  if (analyzedElement.role && normalizeText(metadata.role).toLowerCase() === normalizeText(analyzedElement.role).toLowerCase()) {
    score += 10;
  }

  if (analyzedElement.fieldHint && semanticFieldHintMatches(analyzedElement.fieldHint, metadata.region)) {
    score += 20;
  }

  return score;
}

async function chooseBestLocatorMatch(locator, analyzedElement) {
  const count = await locator.count().catch(() => 0);
  if (count <= 1) {
    return locator;
  }

  const scoredCandidates = [];
  const maxCandidates = Math.min(count, 12);

  for (let index = 0; index < maxCandidates; index++) {
    const candidate = locator.nth(index);
    const metadata = await getLocatorMetadata(candidate);
    const score = scoreLocatorMetadata(metadata, analyzedElement);

    if (score > -Infinity) {
      scoredCandidates.push({ index, score });
    }
  }

  if (scoredCandidates.length === 0) {
    return locator.first();
  }

  scoredCandidates.sort((left, right) => right.score - left.score);
  return locator.nth(scoredCandidates[0].index);
}

async function resolveLocatorFromAnalyzedElement(page, analyzedElement) {
  if (!analyzedElement) {
    return null;
  }

  if (analyzedElement.testId) {
    return chooseBestLocatorMatch(page.getByTestId(analyzedElement.testId), analyzedElement);
  }

  if (analyzedElement.id) {
    return page.locator(`[id="${String(analyzedElement.id).replace(/"/g, '\\"')}"]`);
  }

  if (analyzedElement.role && analyzedElement.name && ['button', 'link', 'option', 'tab', 'checkbox', 'radio', 'combobox', 'textbox', 'menuitem'].includes(normalizeText(analyzedElement.role).toLowerCase())) {
    return chooseBestLocatorMatch(page.getByRole(analyzedElement.role, { name: analyzedElement.name, exact: true }), analyzedElement);
  }

  if (analyzedElement.placeholder && ['input', 'textarea'].includes(normalizeText(analyzedElement.tag).toLowerCase())) {
    return chooseBestLocatorMatch(page.getByPlaceholder(analyzedElement.placeholder, { exact: true }), analyzedElement);
  }

  if (analyzedElement.label) {
    return chooseBestLocatorMatch(page.getByLabel(analyzedElement.label, { exact: true }), analyzedElement);
  }

  if (analyzedElement.text) {
    return chooseBestLocatorMatch(page.getByText(analyzedElement.text, { exact: true }), analyzedElement);
  }

  return null;
}

async function resolveGenericLocator(page, selector, elements) {
  const semanticMatch = findBestAnalyzedElement(selector, elements);

  if (semanticMatch && semanticMatch.score >= 40) {
    const semanticLocator = await resolveLocatorFromAnalyzedElement(page, semanticMatch.element);
    if (semanticLocator) {
      return semanticLocator;
    }
  }

  if (selector.startsWith('getByTestId')) {
    const match = selector.match(/getByTestId\(['"](.+?)['"]\)/);
    if (match) {
      return chooseBestLocatorMatch(page.getByTestId(match[1]), semanticMatch?.element || null);
    }
  }

  if (selector.startsWith('getByRole')) {
    const match = selector.match(/getByRole\(['"](\w+)['"],\s*\{[^}]*name:\s*['"](.+?)['"][^}]*\}/);
    if (match) {
      return chooseBestLocatorMatch(page.getByRole(match[1], { name: match[2], exact: true }), semanticMatch?.element || { role: match[1], name: match[2] });
    }
  }

  if (selector.startsWith('getByText')) {
    const match = selector.match(/getByText\(['"](.+?)['"]\)/);
    if (match) {
      return chooseBestLocatorMatch(page.getByText(match[1], { exact: true }), semanticMatch?.element || { text: match[1] });
    }
  }

  if (selector.startsWith('getByLabel')) {
    const match = selector.match(/getByLabel\(['"](.+?)['"]\)/);
    if (match) {
      return chooseBestLocatorMatch(page.getByLabel(match[1], { exact: true }), semanticMatch?.element || { label: match[1] });
    }
  }

  if (selector.startsWith('getByPlaceholder')) {
    const match = selector.match(/getByPlaceholder\(['"](.+?)['"]\)/);
    if (match) {
      return chooseBestLocatorMatch(page.getByPlaceholder(match[1], { exact: true }), semanticMatch?.element || { placeholder: match[1] });
    }
  }

  return page.locator(selector);
}

async function initStealthBrowser() {
  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-IN',
    bypassCSP: true
  };

  if (fs.existsSync(SESSION_STATE_PATH)) {
    try {
      const stateContent = fs.readFileSync(SESSION_STATE_PATH, 'utf8');
      if (stateContent.trim()) {
        JSON.parse(stateContent);
        contextOptions.storageState = SESSION_STATE_PATH;
        console.log('[Agent] Using saved session state');
      } else {
        console.log('[Agent] state.json is empty, ignoring');
        fs.unlinkSync(SESSION_STATE_PATH);
      }
    } catch (e) {
      console.log('[Agent] Failed to load session state:', e.message);
      fs.unlinkSync(SESSION_STATE_PATH);
    }
  }

  const browser = await playwright.chromium.launch({ 
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });
  
  const context = await browser.newContext(contextOptions);
  
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
  });
  
  return { browser, context };
}

async function saveSessionState(context) {
  try {
    await context.storageState({ path: SESSION_STATE_PATH });
    console.log('[Agent] Session state saved');
  } catch (e) {
    console.log('[Agent] Failed to save session state:', e.message);
  }
}

async function runAutonomousBrowserTask(goal, startUrl, resume, hooks = {}) {
  console.log(`[Agent] Starting autonomous task: ${goal}`);
  emitStatus(hooks, resume ? 'Resuming the paused task' : `Starting browser task for ${goal}`);
  
  const defaultSearchUrl = process.env.BROWSER_AGENT_DEFAULT_START_URL || 'https://duckduckgo.com';
  
  let safeUrl = startUrl && startUrl.startsWith('http') ? startUrl : defaultSearchUrl;
  if (safeUrl.includes('/aclk?') || safeUrl.includes('google.com/aclk') || safeUrl.includes('www.google.com/aclk')) {
    console.log('[Agent] Ignoring redirect URL, using fallback start page');
    safeUrl = defaultSearchUrl;
  }
  
  console.log(`[Agent] Target URL: ${safeUrl}`);
  emitStatus(hooks, safeUrl === 'about:blank' ? 'Opening the starting page' : `Opening ${safeUrl}`);
  
  const { browser, context } = await initStealthBrowser();
  const page = await context.newPage();
  
  const actionLog = [];
  const clickedSelectors = new Set();
  let currentUrl = safeUrl;
  const screenshotPath = path.join(__dirname, 'public', 'captcha-screenshot.png');
  let artifactId = null;
  
  try {
    console.log('[Agent] Navigating with stealth profile...');
    emitStatus(hooks, 'Launching the browser and loading the page');
    try {
      await page.goto(currentUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const currentNavUrl = page.url();
      if (!currentNavUrl || currentNavUrl.includes('google.com/aclk') || currentNavUrl.includes('www.google.com/aclk') || currentNavUrl.includes('/aclk?')) {
        console.log('[Agent] Redirect detected, navigating to fallback start page');
        await page.goto(defaultSearchUrl, { waitUntil: 'domcontentloaded' });
        currentUrl = defaultSearchUrl;
      } else {
        currentUrl = currentNavUrl;
      }
    } catch (navError) {
      console.log('[Agent] Initial navigation failed, trying fallback start page:', navError.message);
      await page.goto(defaultSearchUrl, { waitUntil: 'domcontentloaded' });
      currentUrl = defaultSearchUrl;
    }
    actionLog.push(`Navigated to ${currentUrl}`);
    console.log('[Agent] Page loaded, proceeding with actions');
    emitStatus(hooks, 'Reading the page to find the next step');
    
    await saveSessionState(context);
    
    let iterations = 0;
    const maxIterations = 30;
    
    while (iterations < maxIterations) {
      iterations++;
      
      emitStatus(hooks, 'Inspecting the page and asking the LLM what to do next');
      const elements = await analyzePage(page);
      const pageTitle = await page.title();
      const pageContent = await page.evaluate(() => (document.body.textContent || '').slice(0, 1200));
      
      const lowerContent = pageContent.toLowerCase();
      const hasCaptcha = lowerContent.includes('select all squares') ||
                         lowerContent.includes('captcha') ||
                         lowerContent.includes('are you a robot') ||
                         lowerContent.includes('detected unusual traffic') ||
                         lowerContent.includes('blocked for security');
      
      if (hasCaptcha) {
        console.log('[Agent] CAPTCHA detected - waiting for human');
        emitStatus(hooks, 'CAPTCHA detected. Waiting for human help.');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        actionLog.push('CAPTCHA detected - screenshot saved');
        
        await context.close();
        await browser.close();
        return {
          success: false,
          needsHuman: true,
          message: 'CAPTCHA detected! Please solve it in the browser, then click "Continue".',
          captchaScreenshot: '/captcha-screenshot.png',
          goal,
          steps: actionLog
        };
      }
      
      const analysis = await callLLM(
        [{ role: 'user', content: 'Goal: ' + goal + '\n\nCurrent URL: ' + currentUrl + '\nTitle: ' + pageTitle + '\n\nAccessibility elements (role, name, testId):\n' + JSON.stringify(elements, null, 2) + '\n\nPage text:\n' + pageContent }],
        'You are an autonomous web agent. Analyze the page-state data and choose actions. Use the visible controls, labels, placeholders, regions, headings, and recent actions as the source of truth. When multiple controls look similar, prefer the one whose label, placeholder, field hint, or region best matches the goal. For forms, interact with the most relevant visible fields before any submit or confirm action. For autocomplete or dropdown widgets, type the value, wait for suggestions, and choose the best matching option. Only return done when the target result, confirmation, or complete answer is visible in the page state. Do not use title/body/html/head as a final answer for a booking task. Return ONLY JSON: either single { action: "...", selector: "...", value: "...", reason: "...", status: "short live loading text" } or array [...]. Every response must include a short, present-tense status text for the UI that describes what you are doing right now. Actions: click, type, wait, extract, done'
      );
      
      const decision = typeof analysis === 'object' ? analysis : await extractJSON(analysis);
      console.log('[Agent] Action:', JSON.stringify(decision, null, 2));
      emitStatus(hooks, getDecisionStatus(decision, pageTitle, currentUrl));
      
      const decisions = Array.isArray(decision) ? decision : [decision];
      const hasControls = hasInteractiveControls(elements);
      const hasProgress = hasMeaningfulProgress(actionLog);
      
      for (const dec of decisions) {
        if (dec.action === 'click' && dec.selector && clickedSelectors.has(dec.selector)) {
          console.log('[Agent] Skipping repeated click on already-used selector:', dec.selector);
          emitStatus(hooks, 'The booking panel is already open. Looking for the form fields.');
          continue;
        }

        if (dec.action === 'done' || dec.action === 'extract') {
          emitStatus(hooks, dec.status || 'Checking whether results are ready');

if (dec.action === 'extract') {
             let extracted = null;
             try {
               emitStatus(hooks, 'Extracting visible content');
               artifactId = generateArtifactId(goal);
               
               const locator = await resolveGenericLocator(page, dec.selector, elements);
               if (locator) {
                 extracted = await locator.textContent().catch(() => null);
                 if (!extracted) {
                   extracted = await locator.innerText().catch(() => null);
                 }
               }

               if (!extracted || !String(extracted).trim()) {
                 const fallbackLocator = page.locator('main, article, section, dialog, [role="dialog"], [role="main"]').first();
                 extracted = await fallbackLocator.textContent().catch(() => null);
               }

               if (!extracted || !String(extracted).trim()) {
                 extracted = await page.locator('body').textContent().catch(() => null);
               }
               
               // Save raw artifact
               if (extracted && String(extracted).trim()) {
                 const rawPath = path.join(ARTIFACTS_DIR, artifactId);
                 fs.writeFileSync(rawPath, JSON.stringify({ raw: extracted, url: currentUrl, timestamp: new Date().toISOString() }, null, 2));
                 actionLog.push('Saved artifact: ' + artifactId);
                 console.log('[Agent] Saved artifact to ' + rawPath);
               }

               actionLog.push('Extracted: ' + String(extracted || '').slice(0, 100));
             } catch (e) {
               console.log('[Agent] Extraction failed:', e.message);
               extracted = 'Extraction failed: ' + e.message;
             }

            if (!canFinishWithExtraction(elements, actionLog, extracted, dec.selector)) {
              console.log('[Agent] Extraction looked premature, continuing DOM exploration');
              actionLog.push('Extraction deferred - page still has actionable controls');
              emitStatus(hooks, 'The page still has interactive fields. Continuing the DOM flow.');
              continue;
            }
            
await context.close();
             await browser.close();
             emitStatus(hooks, 'Task complete');
             return {
               success: true,
               goal,
               steps: actionLog,
               extractedInfo: extracted,
               artifactId: extracted && artifactId ? artifactId : null,
               finalUrl: currentUrl,
               pageTitle
             };
          }
        }

        if (dec.action === 'done' && hasControls && !hasProgress) {
          console.log('[Agent] Ignoring premature done decision before any real DOM action');
          emitStatus(hooks, 'The page still has interactive fields. Continuing the DOM flow.');
          continue;
        }
      }
      
      for (const dec of decisions) {
        emitStatus(hooks, getDecisionStatus(dec, pageTitle, currentUrl));
        await executeAction(page, dec, actionLog, clickedSelectors, elements);
      }
      emitStatus(hooks, 'Waiting for the page to update');
      await page.waitForTimeout(2000);
      
      currentUrl = page.url();
    }
    
    await saveSessionState(context);
    emitStatus(hooks, 'Wrapping up the task');
    const finalContent = await page.content();
    await context.close();
    await browser.close();
    
    return {
      success: true,
      goal,
      steps: actionLog,
      finalHtml: finalContent.slice(0, 2000),
      finalUrl: currentUrl
    };
  } catch (error) {
    emitStatus(hooks, `Task failed: ${error.message}`, 'Task failed');
    try {
      await context.close();
    } catch (closeError) {}
    try {
      await browser.close();
    } catch (closeError) {}
    return { success: false, error: error.message, steps: actionLog };
  }
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => normalizeText(value)).filter(Boolean)));
}

const FIELD_HINT_SYNONYMS = {
  destination: ['destination', 'location', 'city', 'place', 'to'],
  origin: ['origin', 'from', 'pickup', 'source'],
  check_in: ['check in', 'check-in', 'arrival', 'start date', 'start time', 'from date'],
  check_out: ['check out', 'check-out', 'departure', 'end date', 'end time', 'to date'],
  guests: ['guest', 'guests', 'person', 'people', 'traveler', 'traveller', 'adult', 'room', 'occupancy', 'passenger'],
  submit: ['search', 'book', 'reserve', 'submit', 'find', 'check availability', 'go']
};

function semanticFieldHintMatches(hint, text) {
  const normalizedHint = normalizeText(hint).toLowerCase();
  const normalizedText = normalizeText(text).toLowerCase();

  if (!normalizedHint || !normalizedText) {
    return false;
  }

  if (normalizedText.includes(normalizedHint) || normalizedHint.includes(normalizedText)) {
    return true;
  }

  const synonyms = FIELD_HINT_SYNONYMS[normalizedHint] || [];
  return synonyms.some((synonym) => normalizedText.includes(normalizeText(synonym).toLowerCase()));
}

function extractSemanticTargetHints(targetText) {
  const normalizedTarget = normalizeText(targetText).toLowerCase();
  const hints = [];

  const fieldHintMatch = normalizedTarget.match(/fieldhint\s*=\s*['"]?([a-z_]+)['"]?/i);
  if (fieldHintMatch) {
    hints.push(fieldHintMatch[1]);
  }

  for (const hint of Object.keys(FIELD_HINT_SYNONYMS)) {
    if (semanticFieldHintMatches(hint, normalizedTarget)) {
      hints.push(hint);
    }
  }

  return uniqueStrings(hints);
}

function scoreAnalyzedElement(element, targetText) {
  const normalizedTarget = normalizeText(targetText).toLowerCase();
  if (!normalizedTarget || !element) {
    return 0;
  }

  const candidateText = uniqueStrings([
    element.id,
    element.testId,
    element.name,
    element.ariaLabel,
    element.label,
    element.placeholder,
    element.text,
    element.fieldHint,
    element.region,
    element.role,
    element.tag,
    element.href
  ]).join(' ').toLowerCase();

  let score = 0;

  if (candidateText === normalizedTarget) {
    score += 120;
  }

  if (candidateText.includes(normalizedTarget) || normalizedTarget.includes(candidateText)) {
    score += 80;
  }

  const targetHints = extractSemanticTargetHints(normalizedTarget);
  for (const hint of targetHints) {
    if (semanticFieldHintMatches(hint, element.fieldHint)) {
      score += 120;
    }

    if (semanticFieldHintMatches(hint, element.region)) {
      score += 80;
    }

    if (semanticFieldHintMatches(hint, element.name) || semanticFieldHintMatches(hint, element.label) || semanticFieldHintMatches(hint, element.placeholder) || semanticFieldHintMatches(hint, element.text)) {
      score += 60;
    }
  }

  const words = normalizedTarget.split(/\s+/).filter(Boolean);
  score += words.filter((word) => candidateText.includes(word)).length * 5;

  if (element.role && ['combobox', 'textbox'].includes(normalizeText(element.role).toLowerCase()) && !element.name && !element.label && !element.placeholder && !element.text) {
    score -= 10;
  }

  return Math.max(score, 0);
}

function findBestAnalyzedElement(targetText, elements) {
  const matches = (elements || [])
    .map((element) => ({ element, score: scoreAnalyzedElement(element, targetText) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  return matches.length > 0 ? matches[0] : null;
}

async function resolveLocatorFromAnalyzedElement(page, analyzedElement) {
  if (!analyzedElement) {
    return null;
  }

  const pickVisible = async (locator) => {
    const count = await locator.count().catch(() => 0);
    if (count <= 1) {
      return locator;
    }

    for (let index = 0; index < Math.min(count, 12); index++) {
      const candidate = locator.nth(index);
      const isVisible = await candidate.isVisible().catch(() => false);
      if (isVisible) {
        return candidate;
      }
    }

    return locator.first();
  };

  if (analyzedElement.testId) {
    return pickVisible(page.getByTestId(analyzedElement.testId));
  }

  if (analyzedElement.id) {
    return page.locator(`[id="${String(analyzedElement.id).replace(/"/g, '\\"')}"]`);
  }

  if (analyzedElement.role && analyzedElement.name && ['button', 'link', 'option', 'tab', 'checkbox', 'radio', 'combobox', 'textbox', 'menuitem'].includes(normalizeText(analyzedElement.role).toLowerCase())) {
    return pickVisible(page.getByRole(analyzedElement.role, { name: analyzedElement.name, exact: true }));
  }

  if (analyzedElement.placeholder && ['input', 'textarea'].includes(normalizeText(analyzedElement.tag).toLowerCase())) {
    return pickVisible(page.getByPlaceholder(analyzedElement.placeholder, { exact: true }));
  }

  if (analyzedElement.label) {
    return pickVisible(page.getByLabel(analyzedElement.label, { exact: true }));
  }

  if (analyzedElement.text) {
    return pickVisible(page.getByText(analyzedElement.text, { exact: true }));
  }

  return null;
}

async function resolveGenericLocator(page, selector, elements) {
  const semanticMatch = findBestAnalyzedElement(selector, elements);

  if (semanticMatch && semanticMatch.score >= 40) {
    const semanticLocator = await resolveLocatorFromAnalyzedElement(page, semanticMatch.element);
    if (semanticLocator) {
      return semanticLocator;
    }
  }

  if (selector.startsWith('getByTestId')) {
    const match = selector.match(/getByTestId\(['"](.+?)['"]\)/);
    if (match) {
      return page.getByTestId(match[1]);
    }
  }

  if (selector.startsWith('getByRole')) {
    const match = selector.match(/getByRole\(['"](\w+)['"],\s*\{[^}]*name:\s*['"](.+?)['"][^}]*\}/);
    if (match) {
      return page.getByRole(match[1], { name: match[2], exact: true });
    }
  }

  if (selector.startsWith('getByText')) {
    const match = selector.match(/getByText\(['"](.+?)['"]\)/);
    if (match) {
      return page.getByText(match[1], { exact: true });
    }
  }

  if (selector.startsWith('getByLabel')) {
    const match = selector.match(/getByLabel\(['"](.+?)['"]\)/);
    if (match) {
      return page.getByLabel(match[1], { exact: true });
    }
  }

  if (selector.startsWith('getByPlaceholder')) {
    const match = selector.match(/getByPlaceholder\(['"](.+?)['"]\)/);
    if (match) {
      return page.getByPlaceholder(match[1], { exact: true });
    }
  }

  return page.locator(selector);
}

module.exports = { runAutonomousBrowserTask };