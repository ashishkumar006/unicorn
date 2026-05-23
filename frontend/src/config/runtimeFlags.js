const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on', 'internal']);
const INTERNAL_VIEW_VALUES = new Set(['lab', 'research', 'browser', 'memory', 'sessions', 'dashboard']);

function readSearchValue(key) {
  if (typeof window === 'undefined') {
    return '';
  }

  const params = new URLSearchParams(window.location.search);
  return (params.get(key) || '').trim().toLowerCase();
}

export function isInternalToolsEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  const internalValue = readSearchValue('internal');
  const queryValue = readSearchValue('mode') || readSearchValue('view');
  const envValue = typeof process !== 'undefined' ? process.env.REACT_APP_ENABLE_INTERNAL_TOOLS : '';
  const envEnabled = TRUTHY_VALUES.has(String(envValue || '').toLowerCase());

  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

  if (isDev && internalValue && TRUTHY_VALUES.has(internalValue)) {
    return true;
  }

  if (envEnabled && queryValue && INTERNAL_VIEW_VALUES.has(queryValue)) {
    return true;
  }

  return envEnabled;
}

export function getInternalView() {
  if (typeof window === 'undefined') {
    return 'dashboard';
  }

  const params = new URLSearchParams(window.location.search);
  return (params.get('view') || params.get('mode') || 'dashboard').trim().toLowerCase();
}