const axios = require('axios');

const DEFAULT_BASE_URL = 'https://ollama.com/api';
const DEFAULT_MODEL = 'gemma4:31b-cloud';
const DEFAULT_OPTIONS = {
  temperature: 1.0,
  top_p: 0.95,
  top_k: 64,
};

function resolveCloudConfig() {
  const baseUrl = (process.env.TRAVEL_OLLAMA_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.TRAVEL_OLLAMA_MODEL || DEFAULT_MODEL;
  const apiKey = process.env.TRAVEL_OLLAMA_API_KEY || process.env.OLLAMA_API_KEY || '';

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
      format: 'json',
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

module.exports = {
  chatJson,
  extractJsonPayload,
  resolveCloudConfig,
};
