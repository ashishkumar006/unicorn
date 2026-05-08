const axios = require('axios');

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
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function trimTrailingSlash(value, fallback) {
  const text = toText(value, fallback);
  return text.replace(/\/+$/, '');
}

function getOpenStreetMapConfig() {
  return {
    nominatimUrl: trimTrailingSlash(process.env.TRAVEL_OSM_NOMINATIM_URL, 'https://nominatim.openstreetmap.org'),
    embedBaseUrl: trimTrailingSlash(process.env.TRAVEL_OSM_EMBED_BASE_URL, 'https://www.openstreetmap.org/export/embed.html'),
    searchBaseUrl: trimTrailingSlash(process.env.TRAVEL_OSM_SEARCH_BASE_URL, 'https://www.openstreetmap.org/search'),
    mapBaseUrl: trimTrailingSlash(process.env.TRAVEL_OSM_MAP_BASE_URL, 'https://www.openstreetmap.org'),
    userAgent: toText(process.env.TRAVEL_OSM_USER_AGENT, 'TravelPlannerAI/1.0 (+https://openstreetmap.org)'),
    timeoutMs: Math.max(3000, Number(process.env.TRAVEL_OSM_TIMEOUT_MS) || 10000),
  };
}

function buildOpenStreetMapSearchUrl(query, config = getOpenStreetMapConfig()) {
  const normalizedQuery = encodeURIComponent(toText(query, ''));
  return `${config.searchBaseUrl}?query=${normalizedQuery}`;
}

function buildOpenStreetMapMapUrl({ lat, lon, zoom = 13 } = {}, config = getOpenStreetMapConfig()) {
  const latitude = toNumber(lat, NaN);
  const longitude = toNumber(lon, NaN);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return config.searchBaseUrl;
  }

  const safeZoom = Math.max(1, Math.min(19, Math.round(toNumber(zoom, 13))));
  return `${config.mapBaseUrl}/#map=${safeZoom}/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;
}

function buildOpenStreetMapEmbedUrl(location = {}, config = getOpenStreetMapConfig()) {
  const latitude = toNumber(location.lat, NaN);
  const longitude = toNumber(location.lon, NaN);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '';
  }

  const safeZoom = Math.max(4, Math.min(19, Math.round(toNumber(location.zoom, 13))));
  let bbox = '';

  if (Array.isArray(location.boundingbox) && location.boundingbox.length >= 4) {
    const [south, north, west, east] = location.boundingbox.slice(0, 4).map((entry) => Number(entry));
    if ([south, north, west, east].every(Number.isFinite)) {
      bbox = [west, south, east, north].map((entry) => entry.toFixed(6)).join('%2C');
    }
  }

  if (!bbox) {
    const span = Math.max(0.01, Math.min(0.25, 0.7 / safeZoom));
    const west = (longitude - span).toFixed(6);
    const south = (latitude - span).toFixed(6);
    const east = (longitude + span).toFixed(6);
    const north = (latitude + span).toFixed(6);
    bbox = [west, south, east, north].join('%2C');
  }

  const marker = location.marker === false
    ? ''
    : `&marker=${latitude.toFixed(6)}%2C${longitude.toFixed(6)}`;

  return `${config.embedBaseUrl}?bbox=${bbox}&layer=mapnik${marker}`;
}

async function resolveOpenStreetMapLocation(query, options = {}, config = getOpenStreetMapConfig()) {
  const normalizedQuery = toText(query, '');

  if (!normalizedQuery) {
    return null;
  }

  const limit = Math.max(1, Math.min(Number(options.limit) || 1, 5));

  const response = await axios.get(`${config.nominatimUrl}/search`, {
    params: {
      q: normalizedQuery,
      format: 'jsonv2',
      addressdetails: 1,
      limit,
    },
    headers: {
      'User-Agent': config.userAgent,
      'Accept-Language': options.language || 'en',
    },
    timeout: config.timeoutMs,
  });

  const results = Array.isArray(response.data) ? response.data : [];
  if (results.length === 0) {
    return null;
  }

  const result = results[0];
  const lat = toNumber(result.lat, NaN);
  const lon = toNumber(result.lon, NaN);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const displayName = toText(result.display_name, normalizedQuery);
  const name = toText(result.name, normalizedQuery);
  const zoom = Math.max(4, Math.min(19, Math.round(toNumber(options.zoom, 13))));
  const boundingbox = Array.isArray(result.boundingbox)
    ? result.boundingbox.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
    : [];

  return {
    query: normalizedQuery,
    name,
    displayName,
    lat,
    lon,
    zoom,
    boundingbox,
    osmType: toText(result.osm_type, ''),
    osmId: toText(result.osm_id, ''),
    class: toText(result.class, ''),
    type: toText(result.type, ''),
    searchUrl: buildOpenStreetMapSearchUrl(normalizedQuery, config),
    mapUrl: buildOpenStreetMapMapUrl({ lat, lon, zoom }, config),
    embedUrl: buildOpenStreetMapEmbedUrl({ lat, lon, zoom, boundingbox: result.boundingbox }, config),
    coordinates: { lat, lon },
    source: 'OpenStreetMap',
  };
}

module.exports = {
  getOpenStreetMapConfig,
  buildOpenStreetMapSearchUrl,
  buildOpenStreetMapMapUrl,
  buildOpenStreetMapEmbedUrl,
  resolveOpenStreetMapLocation,
};
