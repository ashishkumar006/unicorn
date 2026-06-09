export const API_BASE = process.env.REACT_APP_API_BASE || '/api';

const normalizePath = (path) => {
  if (!path) return API_BASE;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${suffix}`;
};

export async function apiFetch(path, options = {}) {
  const response = await fetch(normalizePath(path), options);
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      payload?.details ||
      response.statusText ||
      'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function apiUrl(path) {
  return normalizePath(path);
}

export const browserApi = {
  run: async ({ url, actions = [], goal = '' } = {}) =>
    apiFetch('/browser/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, actions, goal }),
    }),

  screenshot: async ({ url, fullPage = false } = {}) =>
    apiFetch('/browser/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, fullPage }),
    }),

  extract: async ({ url, selector = '', goal = '' } = {}) =>
    apiFetch('/browser/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, selector, goal }),
    }),
};
