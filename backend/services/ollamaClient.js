const axios = require('axios');

const DEFAULT_BASE_URL = 'https://ollama.com/api';
const DEFAULT_MODEL = 'gemma4:31b-cloud';
const DEFAULT_OPTIONS = {
  temperature: 1.0,
  top_p: 0.95,
  top_k: 64,
};

function resolveCloudConfig() {
  const baseUrl = (process.env.TRAVEL_OLLAMA_URL || process.env.OLLAMA_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.TRAVEL_OLLAMA_MODEL || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.TRAVEL_OLLAMA_API_KEY || process.env.OLLAMA_API_KEY || '';

  return { baseUrl, model, apiKey };
}

function resolveKiloCodeConfig() {
  const baseUrl = (process.env.TRAVEL_KILOCODE_URL || 'https://api.kilo.ai/api/gateway').replace(/\/+$/, '');
  const model = process.env.TRAVEL_KILOCODE_MODEL || 'stepfun/step-3.7-flash:free';
  const apiKey = process.env.TRAVEL_KILOCODE_API_KEY || '';

  return { baseUrl, model, apiKey };
}

function extractJsonPayload(content) {
  if (content && typeof content === 'object') {
    return content;
  }

  let text = String(content || '').trim();
  text = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/^<\|[^>]+\|>/g, '')
    .trim();

  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    text = text.slice(startIndex, endIndex + 1);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

async function chatJson({
  messages,
  system,
  model,
  baseUrl,
  apiKey,
  options = {},
  think = false,
  keepAlive = '10m',
  timeoutMs = 600000,
}) {
  const config = resolveCloudConfig();
  const resolvedBaseUrl = (baseUrl || config.baseUrl).replace(/\/+$/, '');
  const resolvedModel = model || config.model;
  const resolvedApiKey = apiKey || config.apiKey;

  if (!resolvedApiKey) {
    throw new Error('Missing Ollama Cloud API key. Set TRAVEL_OLLAMA_API_KEY (or OLLAMA_API_KEY) in .env.');
  }

  const payloadMessages = [];

  if (system) {
    payloadMessages.push({ role: 'system', content: system });
  }

  if (Array.isArray(messages)) {
    payloadMessages.push(...messages);
  }

  const response = await axios.post(
    `${resolvedBaseUrl}/chat`,
    {
      model: resolvedModel,
      messages: payloadMessages,
      think,
      stream: false,
      keep_alive: keepAlive,
      options: {
        ...DEFAULT_OPTIONS,
        ...options,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: Math.max(1000, Number(timeoutMs) || 600000),
    }
  );

  const content = response.data?.message?.content ?? response.data?.response;

  if (!content) {
    throw new Error('Ollama returned an empty response.');
  }

  return extractJsonPayload(content);
}

async function chatJsonKiloCode({
  messages,
  system,
  model,
  baseUrl,
  apiKey,
  options = {},
  timeoutMs = 600000,
}) {
  const config = resolveKiloCodeConfig();
  const resolvedBaseUrl = (baseUrl || config.baseUrl).replace(/\/+$/, '');
  const resolvedModel = model || config.model;
  const resolvedApiKey = apiKey || config.apiKey;

  if (!resolvedApiKey) {
    throw new Error('Missing Kilo Code API key. Set TRAVEL_KILOCODE_API_KEY in .env.');
  }

  const payloadMessages = [];

  if (system) {
    payloadMessages.push({ role: 'system', content: system });
  }

  if (Array.isArray(messages)) {
    payloadMessages.push(...messages);
  }

  try {
    const response = await axios.post(
      `${resolvedBaseUrl}/v1/chat/completions`,
      {
        model: resolvedModel,
        messages: payloadMessages,
        temperature: typeof options?.temperature === 'number' ? options.temperature : 0.7,
        top_p: typeof options?.top_p === 'number' ? options.top_p : 0.9,
        response_format: { type: 'json_object' },
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${resolvedApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: Math.max(1000, Number(timeoutMs) || 600000),
      }
    );

    const content = response.data?.choices?.[0]?.message?.content || response.data?.message?.content;

    if (!content) {
      throw new Error('Kilo Code returned an empty response.');
    }

    return extractJsonPayload(content);
  } catch (error) {
    // Fallback to Ollama Cloud on 401/402/403/404 errors
    if ([401, 402, 403, 404].includes(error.response?.status)) {
      console.log(`[OllamaClient] Kilo Code failed with ${error.response?.status}, falling back to Ollama Cloud`);
      return chatJson({ messages, system, model, options, timeoutMs });
    }
    throw error;
  }
}

function isKiloCodeConfigured() {
  const config = resolveKiloCodeConfig();
  return Boolean(config && config.apiKey);
}

module.exports = {
  chatJson,
  chatJsonKiloCode,
  extractJsonPayload,
  resolveCloudConfig,
  resolveKiloCodeConfig,
  isKiloCodeConfigured,
};
