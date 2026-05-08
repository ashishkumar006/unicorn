const axios = require('axios');
const cheerio = require('cheerio');
const { chatJson, resolveCloudConfig } = require('./ollamaClient');

function getModelInfo() {
  return resolveCloudConfig();
}

function normalizeDuckDuckGoUrl(href) {
  if (!href) {
    return '';
  }

  const candidateHref = href.startsWith('//') ? `https:${href}` : href;

  try {
    const parsedUrl = new URL(candidateHref, 'https://duckduckgo.com');

    if (parsedUrl.hostname.includes('duckduckgo.com') && parsedUrl.pathname === '/l/') {
      const decoded = parsedUrl.searchParams.get('uddg');
      if (decoded) {
        return decodeURIComponent(decoded);
      }
    }

    return parsedUrl.toString();
  } catch {
    return candidateHref;
  }
}

function getSearchConfig() {
  const provider = String(process.env.TRAVEL_SEARCH_PROVIDER || process.env.SEARCH_PROVIDER || 'auto')
    .trim()
    .toLowerCase();

  const googleApiKey = process.env.TRAVEL_GOOGLE_CSE_API_KEY || process.env.GOOGLE_CSE_API_KEY || '';
  const googleCx = process.env.TRAVEL_GOOGLE_CSE_CX || process.env.GOOGLE_CSE_CX || '';

  return {
    provider,
    googleApiKey,
    googleCx,
    googleConfigured: Boolean(googleApiKey && googleCx),
  };
}

function resolveSearchProvider(config = getSearchConfig()) {
  if (config.provider === 'google' || config.provider === 'google_cse') {
    return config.googleConfigured ? 'google_cse' : 'duckduckgo';
  }

  if (config.provider === 'duckduckgo' || config.provider === 'ddg') {
    return 'duckduckgo';
  }

  return config.googleConfigured ? 'google_cse' : 'duckduckgo';
}

function getSearchProviderLabel(provider) {
  switch (provider) {
    case 'google_cse':
      return 'Google Custom Search';
    case 'duckduckgo':
    default:
      return 'DuckDuckGo HTML';
  }
}

async function searchDuckDuckGo(query, limit = 5) {
  const response = await axios.get('https://html.duckduckgo.com/html/', {
    params: { q: query },
    timeout: 12000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (TravelPlannerInternalLab)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  const $ = cheerio.load(response.data);
  const results = [];

  $('.result').each((_, element) => {
    if (results.length >= limit) {
      return false;
    }

    const link = $(element).find('.result__title a').first();
    const title = link.text().trim();
    const url = normalizeDuckDuckGoUrl(link.attr('href'));
    const snippet = $(element).find('.result__snippet').first().text().trim();

    if (title && url) {
      results.push({
        rank: results.length + 1,
        title,
        url,
        snippet,
      });
    }
  });

  return results;
}

async function searchGoogleCustomSearch(query, limit = 5, config = getSearchConfig()) {
  if (!config.googleConfigured) {
    throw new Error('Google Custom Search is not configured. Set TRAVEL_GOOGLE_CSE_API_KEY and TRAVEL_GOOGLE_CSE_CX.');
  }

  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: {
      key: config.googleApiKey,
      cx: config.googleCx,
      q: query,
      num: Math.max(1, Math.min(limit, 10)),
      safe: 'active',
      hl: 'en',
    },
    timeout: 12000,
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];

  return items.slice(0, limit).map((item, index) => ({
    rank: index + 1,
    title: item.title || '',
    url: item.link || '',
    snippet: item.snippet || item.htmlSnippet || '',
  })).filter((item) => item.title && item.url);
}

async function extractReadablePage(url, maxLength = 12000) {
  const response = await axios.get(url, {
    timeout: 20000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (TravelPlannerInternalLab)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxContentLength: 10 * 1024 * 1024,
  });

  const contentType = response.headers['content-type'] || '';
  const rawBody = typeof response.data === 'string' ? response.data : String(response.data || '');

  if (contentType.includes('text/html') || rawBody.includes('<html')) {
    const $ = cheerio.load(rawBody);
    $('script, style, noscript, svg, iframe').remove();

    const title = $('title').first().text().trim() || (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return 'Document';
      }
    })();

    const content = normalizeChunkSourceText(extractHtmlParagraphText($)).slice(0, maxLength);

    return {
      title,
      content,
      contentType,
    };
  }

  const title = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Document';
    }
  })();

  return {
    title,
    content: normalizeChunkSourceText(rawBody).slice(0, maxLength),
    contentType,
  };
}

const SOURCE_CHUNK_TOKENS = 220;
const SOURCE_CHUNK_OVERLAP_TOKENS = 40;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'are', 'was', 'were', 'you', 'your',
  'into', 'about', 'what', 'when', 'where', 'why', 'how', 'who', 'which', 'will', 'shall', 'can', 'could', 'would',
  'should', 'best', 'latest', 'current', 'live', 'search', 'web', 'travel', 'trip', 'place', 'places', 'near', 'nearby',
  'goa', 'visit', 'visiting', 'guide', 'tips', 'more', 'less', 'than', 'then', 'than', 'also', 'just', 'like', 'some',
  'our', 'their', 'there', 'here', 'they', 'them', 'theirs', 'its', 'it', 'is', 'to', 'of', 'a', 'an', 'or', 'in', 'on', 'at', 'as'
]);

function normalizeWhitespace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeChunkSourceText(value = '') {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tokenizeChunkText(value = '') {
  return normalizeWhitespace(value).split(' ').filter(Boolean);
}

function splitWordsIntoChunks(text, maxTokens) {
  const words = tokenizeChunkText(text);

  if (words.length === 0) {
    return [];
  }

  const chunks = [];

  for (let start = 0; start < words.length; start += maxTokens) {
    const slice = words.slice(start, start + maxTokens);
    if (slice.length > 0) {
      chunks.push(slice.join(' '));
    }
  }

  return chunks;
}

function splitParagraphIntoChunks(paragraph, maxTokens) {
  const cleanedParagraph = normalizeWhitespace(paragraph);

  if (!cleanedParagraph) {
    return [];
  }

  if (tokenizeChunkText(cleanedParagraph).length <= maxTokens) {
    return [cleanedParagraph];
  }

  const sentenceMatches = cleanedParagraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanedParagraph];
  const chunks = [];
  let currentSentences = [];
  let currentTokenCount = 0;

  for (const sentence of sentenceMatches) {
    const cleanedSentence = normalizeWhitespace(sentence);

    if (!cleanedSentence) {
      continue;
    }

    const sentenceTokens = tokenizeChunkText(cleanedSentence);

    if (sentenceTokens.length > maxTokens) {
      if (currentSentences.length > 0) {
        chunks.push(currentSentences.join(' '));
        currentSentences = [];
        currentTokenCount = 0;
      }

      chunks.push(...splitWordsIntoChunks(cleanedSentence, maxTokens));
      continue;
    }

    if (currentTokenCount > 0 && currentTokenCount + sentenceTokens.length > maxTokens) {
      chunks.push(currentSentences.join(' '));
      currentSentences = [cleanedSentence];
      currentTokenCount = sentenceTokens.length;
      continue;
    }

    currentSentences.push(cleanedSentence);
    currentTokenCount += sentenceTokens.length;
  }

  if (currentSentences.length > 0) {
    chunks.push(currentSentences.join(' '));
  }

  return chunks.filter(Boolean);
}

function splitSourceTextIntoParagraphs(text) {
  const normalized = normalizeChunkSourceText(text);

  if (!normalized) {
    return [];
  }

  const paragraphBlocks = normalized
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter(Boolean);

  if (paragraphBlocks.length > 1) {
    return paragraphBlocks;
  }

  if (normalized.includes('\n')) {
    const lineBlocks = normalized
      .split(/\n+/)
      .map((paragraph) => normalizeWhitespace(paragraph))
      .filter(Boolean);

    if (lineBlocks.length > 1) {
      return lineBlocks;
    }
  }

  const fallback = normalizeWhitespace(normalized);
  return fallback ? [fallback] : [];
}

function extractHtmlParagraphText($) {
  const blocks = [];
  const seen = new Set();

  $('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre').each((_, element) => {
    const text = normalizeWhitespace($(element).text());

    if (!text || text.length < 8) {
      return;
    }

    const key = text.toLowerCase();

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    blocks.push(text);
  });

  if (blocks.length === 0) {
    return normalizeWhitespace($('body').text());
  }

  return blocks.join('\n\n');
}

function tokenizeSearchTerms(query = '') {
  return normalizeWhitespace(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function splitTextIntoChunks(text, chunkSize = SOURCE_CHUNK_TOKENS, overlap = SOURCE_CHUNK_OVERLAP_TOKENS) {
  const normalizedChunkSize = Math.max(1, Number(chunkSize) || SOURCE_CHUNK_TOKENS);
  const normalizedOverlap = Math.max(0, Math.min(Number(overlap) || SOURCE_CHUNK_OVERLAP_TOKENS, normalizedChunkSize - 1));
  const unitTokenLimit = Math.max(1, normalizedChunkSize - normalizedOverlap);
  const paragraphUnits = splitSourceTextIntoParagraphs(text)
    .flatMap((paragraph) => splitParagraphIntoChunks(paragraph, unitTokenLimit));

  if (paragraphUnits.length === 0) {
    return [];
  }

  const chunks = [];
  let currentParts = [];
  let currentTokens = [];
  let currentStartToken = 1;
  let totalTokenIndex = 0;

  const flushChunk = (preserveOverlap = true) => {
    if (currentTokens.length === 0) {
      return;
    }

    chunks.push({
      index: chunks.length + 1,
      text: currentParts.join('\n\n'),
      startToken: currentStartToken,
      endToken: totalTokenIndex,
      tokenCount: currentTokens.length,
    });

    if (!preserveOverlap || normalizedOverlap === 0 || currentTokens.length <= normalizedOverlap) {
      currentParts = [];
      currentTokens = [];
      currentStartToken = totalTokenIndex + 1;
      return;
    }

    const overlapTokens = currentTokens.slice(-normalizedOverlap);
    currentParts = [overlapTokens.join(' ')];
    currentTokens = overlapTokens.slice();
    currentStartToken = totalTokenIndex - overlapTokens.length + 1;
  };

  for (const unit of paragraphUnits) {
    const unitText = normalizeWhitespace(unit);
    const unitTokens = tokenizeChunkText(unitText);

    if (unitTokens.length === 0) {
      continue;
    }

    if (currentTokens.length > 0 && currentTokens.length + unitTokens.length > normalizedChunkSize) {
      flushChunk(true);
    }

    if (currentTokens.length === 0) {
      currentStartToken = totalTokenIndex + 1;
      currentParts = [];
    }

    currentParts.push(unitText);
    currentTokens.push(...unitTokens);
    totalTokenIndex += unitTokens.length;
  }

  if (currentTokens.length > 0) {
    chunks.push({
      index: chunks.length + 1,
      text: currentParts.join('\n\n'),
      startToken: currentStartToken,
      endToken: totalTokenIndex,
      tokenCount: currentTokens.length,
    });
  }

  return chunks;
}

function scoreChunk(text, terms = [], title = '') {
  const normalizedText = normalizeWhitespace(text).toLowerCase();
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();

  if (!normalizedText) {
    return 0;
  }

  let score = 0;

  for (const term of terms) {
    if (!term) {
      continue;
    }

    const termPattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    const matches = normalizedText.match(termPattern);

    if (matches && matches.length > 0) {
      score += Math.min(8, matches.length) * (term.length > 6 ? 2 : 1.5);
    }

    if (normalizedTitle.includes(term)) {
      score += 2.5;
    }
  }

  if (normalizedText.length > 0) {
    score += Math.min(2, normalizedText.length / 1400);
  }

  return score;
}

function selectRelevantChunks(query, sourcePages = [], options = {}) {
  const queryTerms = tokenizeSearchTerms(query);
  const maxChunks = Math.max(1, Math.min(Number(options.maxChunks) || 6, 10));
  const perSource = Math.max(1, Math.min(Number(options.perSource) || 2, 4));
  const chunkSize = Number(options.chunkSize || options.chunkTokens || SOURCE_CHUNK_TOKENS) || SOURCE_CHUNK_TOKENS;
  const overlap = Number(options.overlap || options.overlapTokens || SOURCE_CHUNK_OVERLAP_TOKENS) || SOURCE_CHUNK_OVERLAP_TOKENS;

  const scoredChunks = [];

  sourcePages.forEach((sourcePage, sourceIndex) => {
    const content = normalizeChunkSourceText(sourcePage?.content || sourcePage?.preview || sourcePage?.snippet || '');
    const pageChunks = splitTextIntoChunks(content, chunkSize, overlap);

    const sourceChunks = pageChunks.map((chunk) => ({
      sourceIndex: sourceIndex + 1,
      chunkIndex: chunk.index,
      title: sourcePage?.title || `Source ${sourceIndex + 1}`,
      url: sourcePage?.url || '',
      text: chunk.text,
      snippet: normalizeWhitespace(chunk.text).slice(0, 380),
      score: scoreChunk(chunk.text, queryTerms, sourcePage?.title || ''),
    }));

    const topChunks = sourceChunks
      .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)
      .slice(0, perSource);

    scoredChunks.push(...topChunks);

    if (topChunks.length === 0 && content) {
      scoredChunks.push({
        sourceIndex: sourceIndex + 1,
        chunkIndex: 1,
        title: sourcePage?.title || `Source ${sourceIndex + 1}`,
        url: sourcePage?.url || '',
        text: normalizeWhitespace(content).slice(0, 450),
        snippet: normalizeWhitespace(content).slice(0, 380),
        score: 0,
      });
    }
  });

  return scoredChunks
    .sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex || a.chunkIndex - b.chunkIndex)
    .slice(0, maxChunks)
    .map((chunk, index) => ({
      index: index + 1,
      sourceIndex: chunk.sourceIndex,
      chunkIndex: chunk.chunkIndex,
      title: chunk.title,
      url: chunk.url,
      snippet: chunk.snippet,
      text: chunk.text,
      score: Number(chunk.score.toFixed(2)),
    }));
}

function buildSourcePreviews(sourcePages = [], selectedChunks = []) {
  return sourcePages.map((sourcePage, index) => {
    const sourceIndex = index + 1;
    const matchingChunks = selectedChunks.filter((chunk) => chunk.sourceIndex === sourceIndex);
    const previewText = matchingChunks.length > 0
      ? matchingChunks.map((chunk) => chunk.snippet).join(' ... ')
      : normalizeWhitespace(sourcePage?.snippet || sourcePage?.preview || sourcePage?.content || '').slice(0, 420);

    return {
      index: sourceIndex,
      title: sourcePage?.title || `Source ${sourceIndex}`,
      url: sourcePage?.url || '',
      snippet: normalizeWhitespace(sourcePage?.snippet || '').slice(0, 220),
      preview: previewText.slice(0, 520),
      chunkCount: matchingChunks.length,
      chunks: matchingChunks.map((chunk) => ({
        index: chunk.chunkIndex,
        snippet: chunk.snippet,
        score: chunk.score,
      })),
    };
  });
}

async function synthesizeWithOllama({ systemPrompt, payload, fallback = {}, timeoutMs = 7000 }) {
  const config = getModelInfo();

  try {
    let timeoutId;
    const chatPromise = chatJson({
      model: config.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
      think: false,
      keepAlive: '15m',
      options: {
        temperature: 0.2,
        top_p: 0.9,
        top_k: 40,
      },
    });

    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({
          ...fallback,
          ollamaTimedOut: true,
        });
      }, timeoutMs);
    });

    const result = await Promise.race([chatPromise, timeoutPromise]);
    clearTimeout(timeoutId);

    return result;
  } catch (error) {
    return {
      ...fallback,
      ollamaError: error.message,
    };
  }
}

async function searchWeb(query, limit = 5) {
  const config = getModelInfo();
  const searchConfig = getSearchConfig();
  const preferredProvider = resolveSearchProvider(searchConfig);
  let providerUsed = preferredProvider;
  let providerError = null;
  let results = [];

  try {
    if (preferredProvider === 'google_cse') {
      results = await searchGoogleCustomSearch(query, limit, searchConfig);
    } else {
      results = await searchDuckDuckGo(query, limit);
    }
  } catch (error) {
    providerError = error.message;
    if (preferredProvider === 'google_cse') {
      providerUsed = 'duckduckgo';
      results = await searchDuckDuckGo(query, limit);
    } else {
      throw error;
    }
  }

  if (providerUsed === 'google_cse' && results.length === 0) {
    providerUsed = 'duckduckgo';
    results = await searchDuckDuckGo(query, limit);
  }

  const sourceLimit = Math.min(results.length, Math.max(1, Math.min(limit, 3)));
  const sourceCandidates = results.slice(0, sourceLimit);
  const sourceReadings = await Promise.allSettled(
    sourceCandidates.map(async (result) => {
      const page = await extractReadablePage(result.url, 4000);
      return {
        rank: result.rank,
        title: page.title || result.title,
        url: result.url,
        snippet: result.snippet,
        content: page.content,
        contentType: page.contentType,
      };
    })
  );

  const sourcePages = sourceReadings.map((entry, index) => {
    const baseResult = sourceCandidates[index] || {};

    if (entry.status === 'fulfilled') {
      return entry.value;
    }

    return {
      rank: baseResult.rank,
      title: baseResult.title,
      url: baseResult.url,
      snippet: baseResult.snippet || '',
      content: baseResult.snippet || '',
      contentType: 'text/plain',
      readError: entry.reason?.message || String(entry.reason || 'Failed to read source'),
    };
  }).filter((source) => source.url);

  const selectedChunks = selectRelevantChunks(query, sourcePages, { maxChunks: 6, perSource: 2 });
  const sourcePreviews = buildSourcePreviews(sourcePages, selectedChunks);
  const citations = sourcePreviews.map((source, index) => ({
    index: index + 1,
    title: source.title || `Source ${index + 1}`,
    url: source.url,
    snippet: source.preview || source.snippet || '',
  }));

  const synthesis = await synthesizeWithOllama({
    systemPrompt: [
      'You are Oracle, the internal research analyst for a travel product.',
      'Use the provided web search results and selected source chunks to produce a concise, citation-ready synthesis.',
      'Return JSON only with fields: summary, keyPoints, recommendedSources, followUpQuery.',
      'Each keyPoints item should be either a string or an object with point and sourceIndexes.',
      'Each recommendedSources item should include title, url, and whyRelevant.',
      'Use only the provided source chunks and do not invent facts.',
    ].join(' '),
    payload: {
      query,
      results,
      sourcePreviews,
      selectedChunks,
      provider: providerUsed,
      providerLabel: getSearchProviderLabel(providerUsed),
      limit,
    },
    timeoutMs: 10000,
    fallback: {
      summary: results.length > 0 ? `Found ${results.length} search result(s).` : 'No search results found.',
      keyPoints: [],
      recommendedSources: citations.slice(0, 3).map((citation) => ({
        title: citation.title,
        url: citation.url,
        whyRelevant: 'Top search result',
      })),
      followUpQuery: query,
    },
  });

  return {
    success: true,
    model: config.model,
    provider: providerUsed,
    providerLabel: getSearchProviderLabel(providerUsed),
    providerError,
    searchConfig: {
      requested: searchConfig.provider,
      googleConfigured: searchConfig.googleConfigured,
    },
    query,
    count: results.length,
    results,
    sourcePages: sourcePreviews,
    sourcePreviews,
    selectedChunks,
    citations,
    synthesis,
    ollamaTimedOut: Boolean(synthesis.ollamaTimedOut),
    summary: synthesis.summary || synthesis.answer || '',
    keyPoints: synthesis.keyPoints || [],
    recommendedSources: synthesis.recommendedSources || [],
    followUpQuery: synthesis.followUpQuery || query,
  };
}

async function readUrlContent(url, maxLength = 6000) {
  const config = getModelInfo();
  const response = await axios.get(url, {
    timeout: 20000,
    responseType: 'text',
    headers: {
      'User-Agent': 'Mozilla/5.0 (TravelPlannerInternalLab)',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxContentLength: 10 * 1024 * 1024,
  });

  const contentType = response.headers['content-type'] || '';
  const rawBody = typeof response.data === 'string' ? response.data : String(response.data || '');
  const deriveTitle = () => {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Document';
    }
  };

  const buildResult = async ({ title, content, timeoutMs, fallbackMessage }) => {
    const sourcePages = [
      {
        title,
        url,
        content,
        preview: content.slice(0, 220),
        snippet: content.slice(0, 220),
      },
    ];
    const selectedChunks = selectRelevantChunks(`${title} ${content.slice(0, 1500)}`, sourcePages, {
      maxChunks: 4,
      perSource: 4,
      chunkSize: 110,
      overlap: 25,
    });
    const sourcePreviews = buildSourcePreviews(sourcePages, selectedChunks);

    const insight = await synthesizeWithOllama({
      systemPrompt: [
        'You are Oracle, the internal research analyst for a travel product.',
        'Summarize the provided selected chunks for a travel planner.',
        'Return JSON only with fields: summary, keyFacts, risks, recommendedAction.',
        'Do not invent details not present in the provided chunks.',
      ].join(' '),
      payload: {
        url,
        title,
        sourcePreviews,
        selectedChunks,
      },
      timeoutMs,
      fallback: {
        summary: content.slice(0, 300),
        keyFacts: [],
        risks: [],
        recommendedAction: fallbackMessage,
      },
    });

    return {
      success: true,
      model: config.model,
      url,
      title,
      content,
      contentType,
      insight,
      ollamaTimedOut: Boolean(insight.ollamaTimedOut),
      summary: insight.summary || '',
      keyFacts: insight.keyFacts || [],
      risks: insight.risks || [],
      recommendedAction: insight.recommendedAction || '',
      sourcePreview: sourcePreviews[0] || null,
      sourcePreviews,
      selectedChunks,
    };
  };

  if (contentType.includes('text/html') || rawBody.includes('<html')) {
    const $ = cheerio.load(rawBody);
    $('script, style, noscript, svg, iframe').remove();

    const title = $('title').first().text().trim() || deriveTitle();
    const content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, maxLength);
    return buildResult({
      title,
      content,
      timeoutMs: 9000,
      fallbackMessage: 'Review the page manually.',
    });
  }

  const title = deriveTitle();
  const content = rawBody.slice(0, maxLength);
  return buildResult({
    title,
    content,
    timeoutMs: 6000,
    fallbackMessage: 'Review the raw text manually.',
  });
}

async function analyzeMemoryNote({ title, content, tags = [] }) {
  const config = getModelInfo();

  const insight = await synthesizeWithOllama({
    systemPrompt: [
      'You are Mnemo, the internal memory analyst for a travel product.',
      'Analyze the note and produce a concise internal storage summary.',
      'Return JSON only with fields: summary, suggestedTags, importance, followUp.',
      'Do not invent details beyond the note content.',
    ].join(' '),
    payload: {
      title,
      content,
      tags,
    },
    fallback: {
      summary: String(content || '').slice(0, 240),
      suggestedTags: tags,
      importance: 'normal',
      followUp: '',
    },
  });

  return {
    success: true,
    model: config.model,
    insight,
    ollamaTimedOut: Boolean(insight.ollamaTimedOut),
    summary: insight.summary || '',
    suggestedTags: insight.suggestedTags || tags,
    importance: insight.importance || 'normal',
    followUp: insight.followUp || '',
  };
}

async function runBrowserWorkflow({ url, actions = [], goal = '' }) {
  const config = getModelInfo();
  const puppeteer = require('puppeteer');
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    let resolvedActions = Array.isArray(actions) ? actions : [];
    let actionPlan = null;

    if ((!resolvedActions || resolvedActions.length === 0) && goal) {
      const planned = await synthesizeWithOllama({
        systemPrompt: [
          'You are Phantom, the internal browser automation planner for a travel product.',
          'Turn the user goal into a concise browser action plan.',
          'Return JSON only with fields: actions, summary, warnings.',
          'Allowed actions: goto, click, type, press, wait, select.',
          'Each action must include only the fields needed to execute it.',
        ].join(' '),
        payload: {
          goal,
          startUrl: url,
        },
        timeoutMs: 6000,
        fallback: {
          actions: [],
          summary: 'No autonomous action plan generated.',
          warnings: ['Fell back to manual mode.'],
        },
      });

      actionPlan = planned;
      resolvedActions = Array.isArray(planned.actions) ? planned.actions : [];
    }

    const executionLog = [];

    for (const action of resolvedActions) {
      if (!action || !action.type) {
        continue;
      }

      switch (action.type) {
        case 'goto':
          if (action.url) {
            await page.goto(action.url, { waitUntil: 'networkidle2', timeout: 30000 });
            executionLog.push(`goto:${action.url}`);
          }
          break;
        case 'click':
          if (action.selector) {
            await page.click(action.selector);
            executionLog.push(`click:${action.selector}`);
          }
          break;
        case 'type':
          if (action.selector && typeof action.text === 'string') {
            await page.click(action.selector);
            await page.type(action.selector, action.text, { delay: 20 });
            executionLog.push(`type:${action.selector}`);
          }
          break;
        case 'press':
          if (action.key) {
            await page.keyboard.press(action.key);
            executionLog.push(`press:${action.key}`);
          }
          break;
        case 'wait':
          await sleep(Number(action.ms) || 1000);
          executionLog.push(`wait:${Number(action.ms) || 1000}`);
          break;
        case 'select':
          if (action.selector && action.value !== undefined) {
            await page.select(action.selector, String(action.value));
            executionLog.push(`select:${action.selector}`);
          }
          break;
        default:
          executionLog.push(`skip:${action.type}`);
          break;
      }
    }

    await sleep(750);

    const title = await page.title();
    const finalUrl = page.url();
    const content = await page.evaluate(() => (document.body ? document.body.innerText : ''));
    const insight = await synthesizeWithOllama({
      systemPrompt: [
        'You are Phantom, the internal browser automation analyst for a travel product.',
        'Summarize what the workflow achieved from the final page state.',
        'Return JSON only with fields: summary, keyFindings, nextSteps, achieved, caveats.',
        'Base the response only on the provided browser execution data.',
      ].join(' '),
      payload: {
        goal,
        startUrl: url,
        finalUrl,
        title,
        content: (content || '').replace(/\s+/g, ' ').trim().slice(0, 12000),
        executionLog,
        actions: resolvedActions,
      },
      timeoutMs: 7000,
      fallback: {
        summary: 'Browser workflow completed.',
        keyFindings: [],
        nextSteps: [],
        achieved: true,
        caveats: [],
      },
    });

    return {
      success: true,
      model: config.model,
      title,
      url: finalUrl,
      content: (content || '').replace(/\s+/g, ' ').trim().slice(0, 12000),
      executionLog,
      actionPlan,
      insight,
      ollamaTimedOut: Boolean(insight.ollamaTimedOut),
      summary: insight.summary || '',
      keyFindings: insight.keyFindings || [],
      nextSteps: insight.nextSteps || [],
      achieved: typeof insight.achieved === 'boolean' ? insight.achieved : null,
      caveats: insight.caveats || [],
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function summarizeInternalSession({ userId, notes = [], conversations = [], plans = [] }) {
  const config = getModelInfo();
  const insight = await synthesizeWithOllama({
    systemPrompt: [
      'You are Chronicle, the internal session recorder for a travel product.',
      'Summarize the provided notes, conversations, and plans into a concise internal report.',
      'Return JSON only with fields: summary, highlights, risks, nextSteps.',
      'Do not invent details not present in the supplied data.',
    ].join(' '),
    payload: {
      userId,
      notes,
      conversations,
      plans,
    },
    timeoutMs: 7000,
    fallback: {
      summary: 'No session data available yet.',
      highlights: [],
      risks: [],
      nextSteps: [],
    },
  });

  return {
    success: true,
    model: config.model,
    notes,
    conversations,
    plans,
    insight,
    ollamaTimedOut: Boolean(insight.ollamaTimedOut),
    summary: insight.summary || '',
    highlights: insight.highlights || [],
    risks: insight.risks || [],
    nextSteps: insight.nextSteps || [],
  };
}

module.exports = {
  getModelInfo,
  getSearchConfig,
  resolveSearchProvider,
  getSearchProviderLabel,
  searchWeb,
  readUrlContent,
  analyzeMemoryNote,
  runBrowserWorkflow,
  summarizeInternalSession,
};
