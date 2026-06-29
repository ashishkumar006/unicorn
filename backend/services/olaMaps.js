const axios = require('axios');

function buildOlaMapsUrl(place = {}) {
  const name = toText(place.name, '');
  const description = toText(place.description || place.location || '', '');
  const query = [name, description].filter(Boolean).join(' ').trim();

  if (!query) {
    return '';
  }

  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('query', query);

  return `https://www.olamaps.com/search/?${params.toString()}`;
}

const tokenState = {
  accessToken: '',
  expiresAt: 0,
  inflight: null,
};

function toText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) {
      return fallback;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toInteger(value, fallback = 0) {
  return Math.max(0, Math.round(toNumber(value, fallback)));
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }

    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.values(value);
  }

  return [];
}

const OLA_PLACE_CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const OLA_PLACE_CACHE = new Map();

function getOlaPlaceCacheKey(destination, focus, limit) {
  return `${toText(destination, '').trim().toLowerCase()}::${toText(focus, 'all').trim().toLowerCase()}::${Number(limit) || 0}`;
}

async function withRetry(fn, options = {}) {
  const retries = Number.isFinite(options.retries) ? Math.max(0, Math.floor(options.retries)) : 2;
  const baseDelay = Number.isFinite(options.baseDelayMs) ? Math.max(0, options.baseDelayMs) : 400;
  const maxDelay = Number.isFinite(options.maxDelayMs) ? Math.max(baseDelay, options.maxDelayMs) : 2000;
  const shouldRetry = options.shouldRetry || (() => true);

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === retries || !shouldRetry(error, attempt)) {
        break;
      }

      const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function isRetryableOlaError(error) {
  if (!error) {
    return false;
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return true;
  }

  const status = error.response?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  const message = String(error.message || '').toLowerCase();
  if (/timeout|timed out|aborted|temporarily unavailable|service unavailable|too many requests/.test(message)) {
    return true;
  }

  return false;
}

function standardizeOlaError(error, fallbackMessage = 'Ola Maps request failed.') {
  const status = error?.response?.status;
  const message = error?.message || fallbackMessage;

  if (status) {
    return new Error(`Ola Maps error ${status}: ${message}`);
  }

  return new Error(`${fallbackMessage} ${message}`.trim());
}

function validateRequiredStrings(input = {}, fields = []) {
  const missing = [];

  for (const field of fields) {
    const value = toText(input[field], '').trim();

    if (!value) {
      missing.push(field);
    }
  }

  return missing;
}

function getOlaMapsConfig() {
  const baseUrl = toText(
    process.env.OLA_MAPS_BASE_URL ||
    process.env.TRAVEL_OLA_MAPS_BASE_URL ||
    'https://api.olamaps.io',
    'https://api.olamaps.io'
  );

  const apiKey = toText(
    process.env.OLA_MAPS_API_KEY ||
    process.env.TRAVEL_OLA_MAPS_API_KEY ||
    '',
    ''
  );

  const clientId = toText(
    process.env.OLA_MAPS_CLIENT_ID ||
    process.env.TRAVEL_OLA_MAPS_CLIENT_ID ||
    '',
    ''
  );

  const clientSecret = toText(
    process.env.OLA_MAPS_CLIENT_SECRET ||
    process.env.TRAVEL_OLA_MAPS_CLIENT_SECRET ||
    '',
    ''
  );

  const authMode = toText(
    process.env.OLA_MAPS_AUTH_MODE ||
    process.env.TRAVEL_OLA_MAPS_AUTH_MODE ||
    '',
    ''
  ).toLowerCase() || (apiKey ? 'api-key' : 'oauth');

  const language = toText(
    process.env.OLA_MAPS_LANGUAGE ||
    process.env.TRAVEL_OLA_MAPS_LANGUAGE ||
    'en',
    'en'
  );

  const region = toText(
    process.env.OLA_MAPS_REGION ||
    process.env.TRAVEL_OLA_MAPS_REGION ||
    'in',
    'in'
  );

  return {
    baseUrl,
    apiKey,
    clientId,
    clientSecret,
    authMode,
    language,
    region,
    enabled: Boolean(apiKey || (clientId && clientSecret)),
  };
}

function isOlaMapsConfigured(config = getOlaMapsConfig()) {
  return Boolean(config && config.enabled);
}

function resolveAuthMode(config = getOlaMapsConfig(), requestedMode = 'auto') {
  const normalizedRequestedMode = toText(requestedMode, 'auto').toLowerCase();

  if (normalizedRequestedMode === 'oauth') {
    return config.clientId && config.clientSecret ? 'oauth' : 'api-key';
  }

  if (normalizedRequestedMode === 'api-key') {
    return config.apiKey ? 'api-key' : 'oauth';
  }

  if (config.authMode === 'oauth' && config.clientId && config.clientSecret) {
    return 'oauth';
  }

  if (config.apiKey) {
    return 'api-key';
  }

  return 'oauth';
}

async function getOlaAccessToken(config = getOlaMapsConfig()) {
  if (!config.clientId || !config.clientSecret) {
    return '';
  }

  const now = Date.now();
  if (tokenState.accessToken && tokenState.expiresAt > now + 30000) {
    return tokenState.accessToken;
  }

  if (tokenState.inflight) {
    return tokenState.inflight;
  }

  tokenState.inflight = (async () => {
    const response = await axios.post(
      `${config.baseUrl}/auth/v1/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'openid',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 12000,
      }
    );

    const accessToken = toText(response.data?.access_token, '');
    const expiresIn = Math.max(60, toNumber(response.data?.expires_in, 3600));

    tokenState.accessToken = accessToken;
    tokenState.expiresAt = Date.now() + ((expiresIn - 60) * 1000);

    return accessToken;
  })();

  try {
    return await tokenState.inflight;
  } finally {
    tokenState.inflight = null;
  }
}

async function getOlaAuthHeaders(config = getOlaMapsConfig(), requestedMode = 'auto') {
  const authMode = resolveAuthMode(config, requestedMode);

  if (authMode === 'oauth') {
    const accessToken = await getOlaAccessToken(config);

    if (!accessToken) {
      throw new Error('Unable to obtain an Ola Maps OAuth access token.');
    }

    return {
      authMode,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };
  }

  if (!config.apiKey) {
    throw new Error('Ola Maps API key is not configured.');
  }

  return {
    authMode,
    headers: {},
  };
}

async function requestOlaMaps(path, options = {}, config = getOlaMapsConfig()) {
  const method = toText(options.method, 'GET').toUpperCase();
  const timeout = Math.max(1000, toInteger(options.timeout, 12000));
  const params = options.params && typeof options.params === 'object' ? { ...options.params } : {};
  const data = options.data ?? null;
  const requestedAuthMode = toText(options.auth, 'auto');

  const response = await withRetry(
    async () => {
      const auth = await getOlaAuthHeaders(config, requestedAuthMode);

      if (auth.authMode === 'api-key') {
        params.api_key = config.apiKey;
      }

      return axios.request({
        method,
        url: `${config.baseUrl}${path}`,
        params,
        data,
        headers: {
          ...auth.headers,
          ...(options.headers && typeof options.headers === 'object' ? options.headers : {}),
        },
        timeout,
      });
    },
    {
      retries: 2,
      baseDelayMs: 400,
      maxDelayMs: 2000,
      shouldRetry: isRetryableOlaError,
    }
  );

  return response;
}

function extractListFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const listCandidates = [
    payload.predictions,
    payload.results,
    payload.suggestions,
    payload.places,
    payload.items,
    payload.data,
  ];

  for (const candidate of listCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }

    if (candidate && typeof candidate === 'object') {
      const nestedList = extractListFromPayload(candidate);
      if (nestedList.length > 0) {
        return nestedList;
      }
    }
  }

  return [];
}

function inferPlaceType(entry, fallback = '') {
  const entryText = [
    entry?.types,
    entry?.category,
    entry?.type,
    entry?.description,
    entry?.name,
  ]
    .flat()
    .map((value) => toText(value, ''))
    .join(' ')
    .toLowerCase();

  const queryText = toText(fallback, '').toLowerCase();

  if (/restaurant|food|dining|eat|cafe|bakery|bar|pub|fast_food|meal_takeaway|meal_delivery/.test(entryText)) {
    return 'Restaurant';
  }

  if (/hotel|stay|resort|lodge|inn|lodging/.test(entryText)) {
    return 'Stay';
  }

  if (/airport|station|bus|terminal|port|metro|transit/.test(entryText)) {
    return 'Transit';
  }

  if (/travel_agency|tour_operator|travel_service/.test(entryText)) {
    return /sightseeing|tour/.test(queryText) ? 'Service' : 'Place';
  }

  if (/sightseeing|tour/.test(entryText) || /tourist_attraction|attraction|museum|park|beach|landmark|view_point|natural_feature|temple|church|mosque|monument|gallery|zoo|garden|waterfall|lake/.test(entryText)) {
    return 'Attraction';
  }

  if (/sightseeing|tour/.test(queryText) && /place|point_of_interest/.test(entryText)) {
    return 'Transit';
  }

  return 'Place';
}

function normalizeOlaPlaceFocus(value = 'all') {
  const normalized = toText(value, 'all').toLowerCase();

  if (/(restaurant|restaurants|food|dining|eat|meal)/.test(normalized)) {
    return 'restaurants';
  }

  if (/(place|places|attraction|attractions|things to do|sightseeing|landmark|visit|tour)/.test(normalized)) {
    return 'attractions';
  }

  return 'all';
}

function extractDestinationFromQuery(value = '') {
  const normalized = toText(value, '').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return '';
  }

  const capturePatterns = [
    /(?:best|top|popular|recommended|must see|must visit)?\s*(?:sightseeing places|places to visit|things to do|tourist attractions|attractions?|restaurants?|food|dining|stay|hotels?)\s*(?:in|at|around|near)\s+(.+)$/i,
    /^(.+?)\s+(?:sightseeing places|places to visit|things to do|tourist attractions|attractions?|restaurants?|food|dining|stay|hotels?)$/i,
    /(?:in|at|around|near)\s+([^,;]+)$/i,
  ];

  for (const pattern of capturePatterns) {
    const match = normalized.match(pattern);

    if (match && match[1]) {
      return toText(match[1], '')
        .replace(/[\s,;:-]+$/g, '')
        .replace(/^(?:the|a|an)\s+/i, '')
        .trim();
    }
  }

  return normalized
    .replace(/^(?:best|top|popular|recommended|must see|must visit)\s+/i, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/\s+(?:sightseeing|sightseeing places|places to visit|things to do|tourist attractions|attractions?|restaurants?|food|dining|stay|hotels?)$/i, '')
    .trim();
}

function normalizeOlaPlaceSearchInput(value, fallbackFocus = 'all') {
  const originalQuery = toText(value, '').replace(/\s+/g, ' ').trim();
  const explicitFocus = normalizeOlaPlaceFocus(fallbackFocus);
  const inferredFocus = normalizeOlaPlaceFocus(originalQuery);

  return {
    destination: extractDestinationFromQuery(originalQuery),
    focus: explicitFocus !== 'all' ? explicitFocus : inferredFocus,
    originalQuery,
  };
}

function scoreOlaPlaceRelevance(place, destination, focus) {
  const destinationText = toText(destination, '').toLowerCase().trim();
  const placeType = toText(place?.type, '').toLowerCase();

  if (!destinationText) {
    return 0;
  }

  const searchText = [
    place?.name,
    place?.description,
    place?.location,
    place?.matchedQuery,
    place?.type,
  ]
    .map((value) => toText(value, '').toLowerCase())
    .join(' ');

  let score = 0;

  if (searchText.includes(destinationText)) {
    score += 6;
  }

  const destinationTokens = destinationText.split(/[\s,/-]+/).filter((token) => token.length > 2);
  for (const token of destinationTokens) {
    if (searchText.includes(token)) {
      score += 2;
    }
  }

  if (focus === 'restaurants' && /restaurant|food|dining|cafe|bakery|bar|pub|fast_food|meal_takeaway|meal_delivery/.test(searchText)) {
    score += 2;
  }

  if (focus === 'restaurants') {
    if (/restaurant/.test(placeType)) {
      score += 4;
    } else if (/stay|transit|service/.test(placeType)) {
      score -= 3;
    }
  }

  if (focus === 'attractions' && /sightseeing|tourist|attraction|museum|park|beach|landmark|view point|viewpoint|temple|church|mosque|monument|gallery|zoo|garden|waterfall|lake/.test(searchText)) {
    score += 2;
  }

  if (focus === 'attractions') {
    if (/attraction|place/.test(placeType)) {
      score += 4;
    } else if (/service|stay|transit/.test(placeType)) {
      score -= 3;
    }
  }

  if (/airport|station|terminal|bus|metro|train|port/.test(searchText)) {
    score -= 1;
  }

  return score;
}

function extractCoordinates(entry = {}) {
  const geometryLocation = entry.geometry && typeof entry.geometry === 'object'
    ? (entry.geometry.location && typeof entry.geometry.location === 'object'
      ? entry.geometry.location
      : entry.geometry)
    : null;

  const location = geometryLocation || (entry.location && typeof entry.location === 'object' ? entry.location : null);

  if (!location) {
    return null;
  }

  const latitude = toNumber(location.lat ?? location.latitude ?? location.y, NaN);
  const longitude = toNumber(location.lng ?? location.longitude ?? location.x, NaN);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    lat: latitude,
    lng: longitude,
  };
}

function mapAutocompleteItem(entry, query, index) {
  const structuredFormatting = entry.structured_formatting || entry.structuredFormatting || {};
  const placeId = toText(
    entry.place_id ||
    entry.placeId ||
    entry.id ||
    entry.uid ||
    entry.resourceId ||
    '',
    `ola-place-${index + 1}`
  );

  const name = toText(
    entry.name ||
    entry.title ||
    entry.label ||
    structuredFormatting.main_text ||
    entry.text ||
    entry.display_name ||
    entry.description ||
    '',
    `Place ${index + 1}`
  );

  const description = toText(
    structuredFormatting.secondary_text ||
    entry.secondary_text ||
    entry.formatted_address ||
    entry.formattedAddress ||
    entry.subtitle ||
    entry.address ||
    entry.description ||
    '',
    query
  );

  const coordinates = extractCoordinates(entry);

  return {
    id: `ola-place-${index + 1}`,
    placeId,
    name,
    description,
    location: description,
    type: inferPlaceType(entry, query),
    source: 'Ola Maps',
    matchedQuery: query,
    coordinates,
    link: buildOlaMapsUrl({ name, placeId }),
    olaMapsUrl: buildOlaMapsUrl({ name, placeId }),
    rating: null,
    reviews: 0,
    openingHours: toBoolean(entry.opening_hours?.open_now ?? entry.openingHours?.open_now, false) ? 'Open now' : 'Check live hours',
    raw: entry,
  };
}

function buildPlaceQueries(destination, focus = 'all') {
  const destinationText = toText(destination, '').trim();

  if (!destinationText) {
    return [];
  }

  const normalizedFocus = toText(focus, 'all').toLowerCase();

  if (/(restaurant|restaurants|food|dining|meal)/.test(normalizedFocus)) {
    return [
      `${destinationText} restaurant`,
      `${destinationText} restaurants`,
      `${destinationText} food`,
    ];
  }

  if (/(attraction|attractions|things to do|sightseeing|visit|place|places)/.test(normalizedFocus)) {
    return [
      `${destinationText} beach`,
      `${destinationText} fort`,
      `${destinationText} church`,
      `${destinationText} temple`,
      `${destinationText} museum`,
      `${destinationText} waterfall`,
      `${destinationText} sightseeing`,
      `${destinationText} things to do`,
    ];
  }

  return [
    destinationText,
    `${destinationText} restaurant`,
    `${destinationText} sightseeing`,
  ];
}

async function searchOlaPlaces(destination, limit = 6, focus = 'all', config = getOlaMapsConfig()) {
  const searchInput = normalizeOlaPlaceSearchInput(destination, focus);
  const destinationText = searchInput.destination;
  const normalizedFocus = searchInput.focus;
  const resolvedLimit = Math.max(1, Math.min(Number(limit) || 6, 24));

  if (!destinationText || !isOlaMapsConfigured(config)) {
    return [];
  }

  const cacheKey = getOlaPlaceCacheKey(destinationText, normalizedFocus, resolvedLimit);
  const cachedEntry = OLA_PLACE_CACHE.get(cacheKey);

  if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
    return cachedEntry.value;
  }

  const queries = buildPlaceQueries(destinationText, normalizedFocus);
  console.log(`[OlaMaps] place search start: raw="${searchInput.originalQuery}" destination="${destinationText}" focus=${normalizedFocus}`);
  console.log(`[OlaMaps] place search queries: ${queries.join(' | ')}`);
  const queryResults = await Promise.all(
    queries.map(async (query) => {
      try {
        const response = await requestOlaMaps('/places/v1/autocomplete', {
          params: {
            input: query,
            language: config.language,
            region: config.region,
          },
          auth: 'auto',
          timeout: 12000,
        }, config);

        const items = extractListFromPayload(response.data);
        const candidateLimit = Math.max(resolvedLimit * 2, 6);
        return items.slice(0, candidateLimit).map((entry, index) => mapAutocompleteItem(entry, query, index));
      } catch (error) {
        console.warn(`[OlaMaps] autocomplete failed for "${query}": ${error.message}`);
        return [];
      }
    })
  );

  const deduped = [];
  const seen = new Set();

  for (const group of queryResults) {
    for (const place of group) {
      const key = `${toText(place.name, '').toLowerCase()}|${toText(place.description || place.location, '').toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(place);

      if (deduped.length >= resolvedLimit) {
        break;
      }
    }

    if (deduped.length >= resolvedLimit) {
      break;
    }
  }

  const scored = deduped.map((place) => ({
    ...place,
    relevanceScore: scoreOlaPlaceRelevance(place, destinationText, normalizedFocus),
  }));

  const preferredTypes = normalizedFocus === 'attractions'
    ? ['Attraction', 'Place']
    : normalizedFocus === 'restaurants'
      ? ['Restaurant']
      : [];
  const preferredMatches = preferredTypes.length > 0
    ? scored.filter((place) => preferredTypes.includes(place.type))
    : [];
  const strongMatches = scored.filter((place) => place.relevanceScore >= 2);
  const prioritized = preferredMatches.length > 0
    ? preferredMatches
    : (strongMatches.length > 0 ? strongMatches : scored);
  prioritized.sort((left, right) => right.relevanceScore - left.relevanceScore);
  const finalResults = prioritized.slice(0, resolvedLimit).map(({ relevanceScore, ...place }) => place);

  console.log(`[OlaMaps] place search complete: destination="${destinationText}" focus=${normalizedFocus} results=${finalResults.length} strongMatches=${strongMatches.length}`);

  const cacheValue = finalResults.slice();
  OLA_PLACE_CACHE.set(cacheKey, {
    value: cacheValue,
    expiresAt: Date.now() + OLA_PLACE_CACHE_TTL_MS,
  });

  return cacheValue;
}

/**
 * Get driving directions between two points via Ola Maps.
 *
 * @param {Object} input
 * @param {string} input.origin - Start location or coordinates.
 * @param {string} input.destination - End location or coordinates.
 * @param {string} [input.waypoints] - Pipe-delimited waypoints.
 * @param {string} [input.mode=driving] - Travel mode.
 * @param {boolean} [input.alternatives=false] - Request alternative routes.
 * @param {boolean} [input.steps=true] - Include turn-by-turn steps.
 * @param {string} [input.overview=full] - Route overview detail level.
 * @param {string} [input.language] - Preferred language.
 * @param {boolean} [input.trafficMetadata=false] - Include traffic metadata.
 * @param {string} [input.routePreference=fastest] - Route preference.
 * @param {string} [input.auth=auto] - Auth mode override.
 * @param {number} [input.timeout] - Request timeout in milliseconds.
 * @param {Object} [config] - Ola Maps config override.
 * @returns {Promise<Object|null>} Route result object or null when Ola Maps is not configured.
 * @throws {Error} When required inputs are missing or the API request fails.
 */
async function getOlaDirections(input = {}, config = getOlaMapsConfig()) {
  const missing = validateRequiredStrings(input, ['origin', 'destination']);

  if (missing.length > 0) {
    throw new Error(`Missing required Ola Maps direction fields: ${missing.join(', ')}`);
  }

  if (!isOlaMapsConfigured(config)) {
    return null;
  }

  const origin = toText(input.origin, '').trim();
  const destination = toText(input.destination, '').trim();

  const waypoints = Array.isArray(input.waypoints)
    ? input.waypoints.map((waypoint) => toText(waypoint, '')).filter(Boolean).join('|')
    : toText(input.waypoints, '');

  const response = await requestOlaMaps('/routing/v1/directions', {
    method: 'POST',
    params: {
      origin,
      destination,
      waypoints,
      mode: toText(input.mode, 'driving'),
      alternatives: toBoolean(input.alternatives, false),
      steps: toBoolean(input.steps, true),
      overview: toText(input.overview, 'full'),
      language: toText(input.language, config.language),
      traffic_metadata: toBoolean(input.trafficMetadata ?? input.traffic_metadata, false),
      route_preference: toText(input.routePreference || input.route_preference, 'fastest'),
    },
    auth: toText(input.auth, 'auto'),
    timeout: 15000,
  }, config);

  const routes = normalizeArray(response.data?.routes);
  const firstRoute = routes[0] || null;

  return {
    success: true,
    origin,
    destination,
    routeCount: routes.length,
    route: firstRoute,
    routes,
    summary: firstRoute?.summary || `Directions ready for ${origin} to ${destination}.`,
    raw: response.data,
  };
}

/**
 * Get a distance matrix between origins and destinations via Ola Maps.
 *
 * @param {Object} input
 * @param {string|string[]} input.origins - Single origin or pipe-delimited / array of origins.
 * @param {string|string[]} input.destinations - Single destination or pipe-delimited / array of destinations.
 * @param {string} [input.mode=driving] - Travel mode.
 * @param {string} [input.routePreference=fastest] - Route preference.
 * @param {string} [input.auth=auto] - Auth mode override.
 * @param {number} [input.timeout] - Request timeout in milliseconds.
 * @param {Object} [config] - Ola Maps config override.
 * @returns {Promise<Object|null>} Distance matrix result object or null when Ola Maps is not configured.
 * @throws {Error} When required inputs are missing or the API request fails.
 */
async function getOlaDistanceMatrix(input = {}, config = getOlaMapsConfig()) {
  const missing = validateRequiredStrings(input, ['origins', 'destinations']);

  if (missing.length > 0) {
    throw new Error(`Missing required Ola Maps distance matrix fields: ${missing.join(', ')}`);
  }

  if (!isOlaMapsConfigured(config)) {
    return null;
  }

  const originList = normalizeArray(input.origins);
  const destinationList = normalizeArray(input.destinations);

  const origins = originList.length > 0
    ? originList.map((origin) => toText(origin, '')).filter(Boolean).join('|')
    : toText(input.origins, '').trim();

  const destinations = destinationList.length > 0
    ? destinationList.map((destination) => toText(destination, '')).filter(Boolean).join('|')
    : toText(input.destinations, '').trim();

  if (!origins || !destinations) {
    throw new Error('Origins and destinations are required for Ola Maps distance matrix lookups.');
  }

  const response = await requestOlaMaps('/routing/v1/distanceMatrix', {
    method: 'GET',
    params: {
      origins,
      destinations,
      mode: toText(input.mode, 'driving'),
      route_preference: toText(input.routePreference || input.route_preference, 'fastest'),
    },
    auth: toText(input.auth, 'auto'),
    timeout: 15000,
  }, config);

  const rows = normalizeArray(response.data?.rows);

  return {
    success: true,
    origins,
    destinations,
    rowCount: rows.length,
    matrix: rows,
    summary: `Distance matrix ready for ${origins.split('|').length} origin(s) and ${destinations.split('|').length} destination(s).`,
    raw: response.data,
  };
}

module.exports = {
  getOlaMapsConfig,
  isOlaMapsConfigured,
  requestOlaMaps,
  searchOlaPlaces,
  getOlaDirections,
  getOlaDistanceMatrix,
  buildOlaMapsUrl,
};