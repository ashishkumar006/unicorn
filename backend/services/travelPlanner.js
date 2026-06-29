const { chatJson, resolveCloudConfig } = require('./ollamaClient');
const { buildTravelPackagePrompt, TRAVEL_SYSTEM_PROMPT } = require('./travelPrompt');
const {
  buildGoogleTravelReferenceData,
  buildGoogleMapsUrl,
  buildPlacesCategoriesFromAttractions,
  buildFoodSectionsFromRestaurants,
} = require('./googlePlaces');
const {
  buildOpenStreetMapSearchUrl,
  resolveOpenStreetMapLocation,
} = require('./openStreetMap');
const {
  getOlaMapsConfig,
  isOlaMapsConfigured,
  searchOlaPlaces,
} = require('./olaMaps');
const { runDeepResearchSubagents } = require('./subagentRunner');

const packageCache = new Map();
const inflightPackages = new Map();
const CACHE_TTL_MS = 1000 * 60 * 30;

const DAY_THEMES = [
  'Arrival and settle in',
  'Iconic highlights and local orientation',
  'Culture, heritage, and food',
  'Adventure and leisure',
  'Markets, sunset, and nightlife',
  'Relaxed local experiences',
  'Departure and final stop',
];

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

function normalizeTravelProvider(provider = 'auto') {
  const normalized = toText(provider, 'auto').toLowerCase();

  if (/(google|google_places|googleplaces|maps-google)/.test(normalized)) {
    return 'google';
  }

  if (/(ola|olamaps|ola_maps|maps-ola)/.test(normalized)) {
    return 'ola';
  }

  return 'auto';
}

function buildOpenStreetMapFallbackUrl(name, destination) {
  const query = [toText(name, ''), toText(destination, '')].filter(Boolean).join(' ').trim();
  return buildOpenStreetMapSearchUrl(query || destination || name || 'OpenStreetMap place');
}

// Map/search-engine domains that must NEVER appear as user-facing links.
// OSM, Google Maps, and Ola Maps are data-gathering inputs only.
// The only user-visible links may be official hotel/restaurant/attraction/booking domains.
const MAP_DOMAIN_PATTERN = /maps\.(google|gstatic|olamaps|kratrim|ola)\.|openstreetmap|nominatim\.openstreetmap/i;

function isOfficialBusinessUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    // Reject bare map-search engines regardless of path.
    if (MAP_DOMAIN_PATTERN.test(url.hostname)) return false;
    // Accept only registered TLD or organisational/ccTLD hostnames.
    return /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.(com|in|org|net|co|io|ai|travel|hotel|resort|restaurant|cafe|museum|park|gov|edu|info|biz|co\.in|org\.in|ac\.in|me|us|uk|ca|au|de|fr|sg|ae|jp|th|lk|np|sa|eg|za|zw|ke|gh|tz|ug)(\.[a-z]{2})?$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function buildWorkingMapLink(link, name, destination) {
  const candidate = toText(link, '');

  if (!candidate) return '';

  // Always keep links that subagents or the main agent explicitly provided,
  // as long as they are not obvious map/search tool URLs.
  if (isOfficialBusinessUrl(candidate)) {
    return candidate;
  }

  // Fallback: if it at least looks like a real external http(s) URL, keep it
  // (subagent research links are trusted). Only drop pure map/search junk.
  try {
    const url = new URL(candidate);
    if (!MAP_DOMAIN_PATTERN.test(url.hostname) && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  } catch {}

  return '';
}

function normalizeReferenceKey(value = '') {
  return toText(value, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function deriveOlaRestaurantCuisine(place = {}) {
  const text = [place.name, place.description, place.type].join(' ').toLowerCase();

  if (/vegetarian|veg|pure veg/.test(text)) {
    return 'Vegetarian';
  }

  if (/cafe/.test(text)) {
    return 'Cafe';
  }

  if (/bakery/.test(text)) {
    return 'Bakery';
  }

  if (/bar|pub|night_club/.test(text)) {
    return 'Bar and Pub';
  }

  if (/meal_takeaway|fast_food/.test(text)) {
    return 'Quick Bites';
  }

  return 'Local cuisine';
}

function deriveOlaRestaurantVibe(place = {}) {
  const text = [place.name, place.description, place.type].join(' ').toLowerCase();

  if (/cafe|bakery/.test(text)) {
    return 'Casual';
  }

  if (/bar|pub|night_club/.test(text)) {
    return 'Evening';
  }

  if (/meal_takeaway|fast_food/.test(text)) {
    return 'Quick';
  }

  return 'Casual';
}

function deriveOlaRestaurantBestFor(place = {}) {
  const text = [place.name, place.description, place.type].join(' ').toLowerCase();

  if (/cafe|bakery/.test(text)) {
    return 'Breakfast or coffee';
  }

  if (/bar|pub|night_club/.test(text)) {
    return 'Dinner and evening drinks';
  }

  if (/meal_takeaway|fast_food/.test(text)) {
    return 'Quick lunch';
  }

  return 'Lunch or dinner';
}

function deriveOlaAttractionType(place = {}) {
  const text = [place.name, place.description, place.type].join(' ').toLowerCase();

  if (/museum/.test(text)) {
    return 'Museum';
  }

  if (/park/.test(text)) {
    return 'Park';
  }

  if (/beach/.test(text)) {
    return 'Beach';
  }

  if (/church|temple|mosque|religious/.test(text)) {
    return 'Religious Site';
  }

  if (/market|shopping/.test(text)) {
    return 'Market';
  }

  return 'Attraction';
}

function deriveOlaAttractionBestFor(place = {}) {
  const text = [place.name, place.description, place.type].join(' ').toLowerCase();

  if (/museum/.test(text)) {
    return ['History', 'Culture'];
  }

  if (/park|beach|water|sunset|scenic/.test(text)) {
    return ['Relaxation', 'Photography'];
  }

  if (/market|shopping/.test(text)) {
    return ['Shopping', 'Street food'];
  }

  if (/church|temple|mosque|religious/.test(text)) {
    return ['Culture', 'Architecture'];
  }

  return ['Sightseeing'];
}

function estimateOlaRestaurantCost(place = {}, trip = {}, index = 0) {
  const text = [place.name, place.description, place.type].join(' ').toLowerCase();

  if (/fine dining|luxury|resort|bar|pub/.test(text)) {
    return Math.max(1200, Math.round(trip.budget * 0.12));
  }

  if (/cafe|bakery|street|fast food|snack|quick/.test(text)) {
    return Math.max(200, Math.round(trip.budget * 0.04));
  }

  return Math.max(300, Math.round(trip.budget * (0.06 + (index * 0.01))));
}

function mergeReferenceEntry(primary = null, secondary = null, kind = 'restaurant', trip = {}, index = 0) {
  const base = primary && typeof primary === 'object' ? primary : {};
  const supplemental = secondary && typeof secondary === 'object' ? secondary : {};
  const name = toText(base.name || supplemental.name, `${kind === 'restaurant' ? 'Restaurant' : 'Place'} ${index + 1}`);
  const text = [
    name,
    base.description,
    supplemental.description,
    base.type,
    supplemental.type,
    base.cuisine,
    supplemental.cuisine,
    base.speciality,
    supplemental.speciality,
  ].join(' ').toLowerCase();
  const primarySource = toText(base.source, '').toLowerCase();
  const secondarySource = toText(supplemental.source, '').toLowerCase();
  const preferSecondaryMetrics = /ola/.test(primarySource) && /google/.test(secondarySource);

  if (kind === 'restaurant') {
    const cuisine = toText(base.cuisine || supplemental.cuisine, deriveOlaRestaurantCuisine({ name, description: text, type: base.type || supplemental.type }));
    const baseCost = toNumber(base.avgCost || base.avg_cost, 0);
    const supplementalCost = toNumber(supplemental.avgCost || supplemental.avg_cost, 0);
    const avgCost = preferSecondaryMetrics
      ? (supplementalCost || baseCost || estimateOlaRestaurantCost({ name, description: text, type: base.type || supplemental.type }, trip, index))
      : (baseCost || supplementalCost || estimateOlaRestaurantCost({ name, description: text, type: base.type || supplemental.type }, trip, index));
    const ratingValue = preferSecondaryMetrics
      ? (supplemental.rating != null ? supplemental.rating : base.rating)
      : (base.rating != null ? base.rating : supplemental.rating);
    const location = toText(base.location || base.area || supplemental.location || supplemental.area, `Popular area in ${trip.toPlace}`);
    const specialties = toStringArray(base.specialties || supplemental.specialties, cuisine ? [cuisine] : []);
    const vibe = toText(base.vibe || base.ambiance || supplemental.vibe || supplemental.ambiance, deriveOlaRestaurantVibe({ name, description: text, type: base.type || supplemental.type }));
    const bestFor = toText(base.bestFor || supplemental.bestFor, deriveOlaRestaurantBestFor({ name, description: text, type: base.type || supplemental.type }));
    const source = toText(base.source || supplemental.source, preferSecondaryMetrics ? supplemental.source || base.source || 'Ola Maps' : base.source || supplemental.source || 'Ola Maps');
    const link = buildWorkingMapLink(
      base.link || base.googleMapsUrl || base.website || supplemental.link || supplemental.googleMapsUrl || supplemental.website,
      `${name} ${trip.toPlace} restaurant`,
      trip.toPlace
    );

    return {
      id: base.id || supplemental.id || `restaurant-${index + 1}`,
      name,
      cuisine,
      rating: ratingValue != null ? clampRating(ratingValue, 4.4) : null,
      reviews: Math.max(0, Math.round(toNumber(base.reviews || supplemental.reviews, 0))),
      avgCost,
      avg_cost: avgCost,
      location,
      area: location,
      serves: toText(base.serves || supplemental.serves, 'Lunch, Dinner'),
      speciality: toText(base.speciality || supplemental.speciality, cuisine),
      specialties,
      vibe,
      ambiance: vibe,
      veg_options: Boolean(base.veg_options || supplemental.veg_options || /vegetarian|veg|pure veg|vegan/.test(text)),
      vegetarian_friendly: Boolean(base.vegetarian_friendly || supplemental.vegetarian_friendly || /vegetarian|veg|pure veg|vegan/.test(text)),
      description: toText(base.description || supplemental.description, `Recommended dining option in ${trip.toPlace}`),
      bestFor,
      timings: toText(base.timings || supplemental.timings, 'Check live hours'),
      bookingRequired: Boolean(base.bookingRequired || supplemental.bookingRequired),
      link,
      googleMapsUrl: toText(base.googleMapsUrl || supplemental.googleMapsUrl, ''),
      website: toText(base.website || supplemental.website, ''),
      openingHours: toText(base.openingHours || supplemental.openingHours, 'Check live hours'),
      coordinates: base.coordinates || supplemental.coordinates || null,
      source,
    };
  }

  const type = toText(base.type || supplemental.type, deriveOlaAttractionType({ name, description: text }));
  const entryFee = toText(base.entry_fee || base.entryFee || supplemental.entry_fee || supplemental.entryFee, 'Check locally');
  const ratingValue = preferSecondaryMetrics
    ? (supplemental.rating != null ? supplemental.rating : base.rating)
    : (base.rating != null ? base.rating : supplemental.rating);
  const location = toText(base.location || supplemental.location, `Near ${trip.toPlace}`);
  const bestFor = toStringArray(base.bestFor || supplemental.bestFor, deriveOlaAttractionBestFor({ name, description: text, type }));
  const source = toText(base.source || supplemental.source, preferSecondaryMetrics ? supplemental.source || base.source || 'Ola Maps' : base.source || supplemental.source || 'Ola Maps');
  const link = buildWorkingMapLink(
    base.link || base.googleMapsUrl || base.website || supplemental.link || supplemental.googleMapsUrl || supplemental.website,
    `${name} ${trip.toPlace} attraction`,
    trip.toPlace
  );
  const distanceFromCity = toText(base.distance_from_city || supplemental.distance_from_city || location, `Near ${trip.toPlace}`);

  return {
    id: base.id || supplemental.id || `attraction-${index + 1}`,
    name,
    type,
    description: toText(base.description || supplemental.description, `Recommended stop in ${trip.toPlace}`),
    location,
    rating: ratingValue != null ? clampRating(ratingValue, 4.4) : null,
    reviews: Math.max(0, Math.round(toNumber(base.reviews || supplemental.reviews, 0))),
    entry_fee: entryFee,
    entryFee,
    best_time: toText(base.best_time || base.bestTime || supplemental.best_time || supplemental.bestTime, '09:00 AM - 06:00 PM'),
    bestTime: toText(base.best_time || base.bestTime || supplemental.best_time || supplemental.bestTime, '09:00 AM - 06:00 PM'),
    duration: toText(base.duration || supplemental.duration, '1-2 hours'),
    distance_from_city: distanceFromCity,
    distanceFromCity,
    openingHours: toText(base.openingHours || supplemental.openingHours, 'Check live hours'),
    bestFor,
    link,
    googleMapsUrl: toText(base.googleMapsUrl || supplemental.googleMapsUrl, ''),
    website: toText(base.website || supplemental.website, ''),
    coordinates: base.coordinates || supplemental.coordinates || null,
    source,
  };
}

function mergeReferenceCollections(primaryItems = [], secondaryItems = [], kind = 'restaurant', trip = {}, limit = kind === 'restaurant' ? 6 : 9) {
  const primaryList = Array.isArray(primaryItems) ? primaryItems : [];
  const secondaryList = Array.isArray(secondaryItems) ? secondaryItems : [];
  const secondaryLookup = new Map();

  secondaryList.forEach((item, index) => {
    const key = normalizeReferenceKey(item?.name);
    if (key && !secondaryLookup.has(key)) {
      secondaryLookup.set(key, { item, index });
    }
  });

  const merged = primaryList.map((item, index) => {
    const key = normalizeReferenceKey(item?.name);
    const match = key ? secondaryLookup.get(key) : null;

    if (match) {
      secondaryLookup.delete(key);
    }

    return mergeReferenceEntry(item, match?.item || null, kind, trip, index);
  });

  for (const { item } of secondaryLookup.values()) {
    merged.push(mergeReferenceEntry(null, item, kind, trip, merged.length));

    if (merged.length >= limit) {
      break;
    }
  }

  return merged.slice(0, limit);
}

async function buildOlaTravelReferenceData(trip = {}) {
  const config = getOlaMapsConfig();

  if (!isOlaMapsConfigured(config)) {
    return null;
  }

  const destination = toText(trip.toPlace, '').trim();

  if (!destination) {
    return null;
  }

  try {
    console.log('[TravelPlanner] Fetching Ola Maps reference:', {
      destination,
      provider: 'ola',
    });

    const [restaurantsRaw, attractionsRaw] = await Promise.all([
      searchOlaPlaces(destination, 6, 'restaurants', config),
      searchOlaPlaces(destination, 9, 'attractions', config),
    ]);

    const restaurants = mergeReferenceCollections([], restaurantsRaw, 'restaurant', trip, 6);
    const attractions = mergeReferenceCollections([], attractionsRaw, 'attraction', trip, 9);

    return {
      enabled: true,
      primaryProvider: 'ola',
      secondaryProvider: null,
      restaurants,
      attractions,
      places: {
        categories: buildPlacesCategoriesFromAttractions(attractions, trip),
      },
      food: buildFoodSectionsFromRestaurants(restaurants, trip),
      summary: `Ola Maps found ${restaurants.length} restaurants and ${attractions.length} attractions in ${destination}.`,
    };
  } catch (error) {
    console.warn(`[TravelPlanner] Ola Maps reference failed for ${destination}: ${error.message}`);
    return null;
  }
}

async function buildOpenStreetMapTravelReferenceData(trip = {}) {
  const destination = toText(trip.toPlace, '').trim();

  if (!destination) {
    return null;
  }

  try {
    const location = await resolveOpenStreetMapLocation(destination, { zoom: 13 });

    if (!location) {
      return null;
    }

    return {
      enabled: true,
      destination,
      displayName: location.displayName || destination,
      name: location.name || destination,
      lat: location.lat,
      lon: location.lon,
      zoom: location.zoom,
      searchUrl: location.searchUrl,
      mapUrl: location.mapUrl,
      embedUrl: location.embedUrl,
      source: location.source,
      summary: `OpenStreetMap preview ready for ${destination}.`,
    };
  } catch (error) {
    console.warn(`[TravelPlanner] OpenStreetMap preview failed for ${destination}: ${error.message}`);
    return null;
  }
}

async function buildTravelReferenceData(trip = {}, provider = 'auto') {
  const normalizedProvider = normalizeTravelProvider(provider);
  const wantsGoogle = normalizedProvider !== 'ola';
  const wantsOla = normalizedProvider !== 'google';

  const [googleReferenceData, olaReferenceData, openStreetMapReferenceData] = await Promise.all([
    wantsGoogle ? buildGoogleTravelReferenceData(trip) : Promise.resolve(null),
    wantsOla ? buildOlaTravelReferenceData(trip) : Promise.resolve(null),
    buildOpenStreetMapTravelReferenceData(trip),
  ]);

  const primaryProvider = normalizedProvider === 'google'
    ? (googleReferenceData ? 'google' : olaReferenceData ? 'ola' : 'google')
    : normalizedProvider === 'ola'
      ? (olaReferenceData ? 'ola' : googleReferenceData ? 'google' : 'ola')
      : (olaReferenceData ? 'ola' : googleReferenceData ? 'google' : 'auto');

  const primaryReference = primaryProvider === 'google' ? googleReferenceData : olaReferenceData;
  const secondaryReference = primaryProvider === 'google' ? olaReferenceData : googleReferenceData;

  if (!primaryReference && !secondaryReference && !openStreetMapReferenceData) {
    return null;
  }

  const restaurants = mergeReferenceCollections(
    primaryReference?.restaurants || [],
    secondaryReference?.restaurants || [],
    'restaurant',
    trip,
    6
  );
  const attractions = mergeReferenceCollections(
    primaryReference?.attractions || [],
    secondaryReference?.attractions || [],
    'attraction',
    trip,
    9
  );

  const summaryParts = [];

  if (primaryReference?.summary) {
    summaryParts.push(primaryReference.summary);
  }

  if (secondaryReference?.summary) {
    const secondaryLabel = primaryProvider === 'google' ? 'Ola Maps' : 'Google Places';
    summaryParts.push(`Supplemental ${secondaryLabel} data: ${secondaryReference.summary}`);
  }

  if (openStreetMapReferenceData?.summary) {
    summaryParts.push(openStreetMapReferenceData.summary);
  }

  return {
    enabled: Boolean(primaryReference || secondaryReference || openStreetMapReferenceData),
    primaryProvider,
    secondaryProvider: secondaryReference ? (primaryProvider === 'google' ? 'ola' : 'google') : null,
    restaurants,
    attractions,
    places: {
      categories: buildPlacesCategoriesFromAttractions(attractions, trip),
    },
    food: buildFoodSectionsFromRestaurants(restaurants, trip),
    summary: summaryParts.join(' ') || `Travel reference data found for ${trip.toPlace}.`,
    googlePlaces: googleReferenceData ? {
      enabled: true,
      restaurants: googleReferenceData.restaurants?.length || 0,
      attractions: googleReferenceData.attractions?.length || 0,
      summary: googleReferenceData.summary || '',
    } : null,
    olaPlaces: olaReferenceData ? {
      enabled: true,
      restaurants: olaReferenceData.restaurants?.length || 0,
      attractions: olaReferenceData.attractions?.length || 0,
      summary: olaReferenceData.summary || '',
    } : null,
    openStreetMap: openStreetMapReferenceData ? {
      enabled: true,
      destination: openStreetMapReferenceData.destination,
      displayName: openStreetMapReferenceData.displayName,
      name: openStreetMapReferenceData.name,
      lat: openStreetMapReferenceData.lat,
      lon: openStreetMapReferenceData.lon,
      zoom: openStreetMapReferenceData.zoom,
      // searchUrl, mapUrl, and embedUrl are intentionally blank — map/service URLs are internal inputs only.
      searchUrl: '',
      mapUrl: '',
      embedUrl: '',
      summary: openStreetMapReferenceData.summary || '',
    } : {
      enabled: false,
      destination: trip.toPlace,
      displayName: '',
      name: '',
      lat: null,
      lon: null,
      zoom: 13,
      // searchUrl, mapUrl, and embedUrl are intentionally blank — map/search URLs are internal research inputs only.
      searchUrl: '',
      mapUrl: '',
      embedUrl: '',
      summary: '',
    },
  };
}

function buildTravelReferencePrompt(referenceData, trip = {}) {
  if (!referenceData) {
    return '';
  }

  const destination = toText(trip.toPlace, 'the destination');
  const primaryLabel = referenceData.primaryProvider === 'ola'
    ? 'Ola Maps'
    : referenceData.primaryProvider === 'google'
      ? 'Google Places'
      : referenceData.openStreetMap?.enabled
        ? 'OpenStreetMap'
        : 'Google Places';
  const secondaryLabel = referenceData.secondaryProvider === 'ola'
    ? 'Ola Maps'
    : referenceData.secondaryProvider === 'google'
      ? 'Google Places'
      : '';
  const openStreetMapLine = referenceData.openStreetMap?.mapUrl
    ? `Coordinates for ${destination}: lat ${referenceData.openStreetMap.lat ?? 'n/a'}, lon ${referenceData.openStreetMap.lon ?? 'n/a'}`
    : '';

  const restaurantLines = (referenceData.restaurants || [])
    .slice(0, 5)
    .map((restaurant, index) => {
      const rating = restaurant.rating != null ? `${restaurant.rating}/5` : 'rating unavailable';
      const costValue = toNumber(restaurant.avgCost || restaurant.avg_cost, 0);
      const costText = costValue > 0 ? `, approx ${formatCurrency(costValue)}` : '';
      const sourceText = restaurant.source ? `, source: ${restaurant.source}` : '';
      return `${index + 1}. ${restaurant.name} (${restaurant.cuisine || 'Local cuisine'}, ${rating}${costText}${sourceText})`;
    });

  const attractionLines = (referenceData.attractions || [])
    .slice(0, 5)
    .map((place, index) => {
      const rating = place.rating != null ? `${place.rating}/5` : 'rating unavailable';
      const entryFee = toText(place.entry_fee || place.entryFee, 'Check locally');
      const sourceText = place.source ? `, source: ${place.source}` : '';
      return `${index + 1}. ${place.name} (${place.type || 'Attraction'}, ${rating}, ${entryFee}${sourceText})`;
    });

  return `

Travel reference data for ${destination}:
Primary source: ${primaryLabel}
${secondaryLabel ? `Supplemental source: ${secondaryLabel}` : ''}
Use Ola Maps names first when they are present. Use Google Places only for supplemental cost/rating enrichment or as a fallback when Ola coverage is thin.
If a cost looks estimated, treat it as a planning estimate rather than a confirmed live fare.
Use the map links and coordinates to keep each day geographically compact and to avoid unnecessary backtracking.
${openStreetMapLine ? `OpenStreetMap preview: ${openStreetMapLine}
` : ''}

Restaurants:
${restaurantLines.length > 0 ? restaurantLines.join('\n') : 'None found.'}

Attractions:
${attractionLines.length > 0 ? attractionLines.join('\n') : 'None found.'}
`;
}

function buildBudgetSignals(referenceData, trip) {
  const restaurants = Array.isArray(referenceData?.restaurants) ? referenceData.restaurants : [];
  const attractions = Array.isArray(referenceData?.attractions) ? referenceData.attractions : [];
  const restaurantCosts = restaurants
    .map((restaurant) => toNumber(restaurant.avgCost, 0))
    .filter((amount) => amount > 0);
  const averageRestaurantCost = restaurantCosts.length > 0
    ? Math.round(restaurantCosts.reduce((sum, amount) => sum + amount, 0) / restaurantCosts.length)
    : Math.max(1, Math.round(trip.budget * 0.08));
  const inexpensiveRestaurants = restaurantCosts.filter((amount) => amount <= 500).length;
  const midRangeRestaurants = restaurantCosts.filter((amount) => amount > 500 && amount <= 1200).length;
  const premiumRestaurants = restaurantCosts.filter((amount) => amount > 1200).length;
  const freeAttractions = attractions.filter((place) => /free|check locally/i.test(String(place.entry_fee || place.entryFee || ''))).length;
  const paidAttractions = attractions.length - freeAttractions;

  return [
    `Average restaurant cost signal: ${formatCurrency(averageRestaurantCost)} per meal stop`,
    `Restaurant mix: ${inexpensiveRestaurants} low-cost, ${midRangeRestaurants} mid-range, ${premiumRestaurants} premium`,
    `Attraction mix: ${freeAttractions} free/low-cost, ${paidAttractions} paid`,
    `Trip length: ${trip.days} days for ${trip.travelers} traveler(s)`,
  ].join('\n');
}

function buildBudgetAllocationPrompt(referenceData, trip) {
  const totalBudget = Math.max(1, trip.budget);
  const perPersonBudget = Math.max(1, Math.round(totalBudget / trip.travelers));

  return `

Budget decision guidance:
Use a cost-first algorithm. Do not split the budget into fixed percentages at the start.
1. Estimate mandatory costs first: intercity transportation, accommodation nights, daily local transport, and food.
2. Use the place and restaurant signals to judge how expensive the destination actually feels.
3. Allocate activities only after the essentials are covered.
4. Add a buffer last.
5. If the total is too high, reduce discretionary activities or stay comfort before cutting essential travel.
6. The final amounts must sum exactly to the total budget.
7. Include a separate localTransport section with bus, auto/rickshaw, and taxi/cab estimates when possible.
8. Keep the route and day plan geographically tight so local transport stays efficient.

Luxury tuning:
- If luxury is low, keep stay and transport lean.
- If luxury is semi, balance stay, food, and transport.
- If luxury is full, spend more on comfort, stay quality, and smoother transport.
- Prefer to put more money into categories that are likely to feel expensive for this destination.

Total budget: ${formatCurrency(totalBudget)}
Per person budget: ${formatCurrency(perPersonBudget)}
Luxury level: ${trip.luxuryType}

Price signals:
${buildBudgetSignals(referenceData, trip)}

Return a budget section in the final JSON with realistic numeric values and short details for each category.
`;
}

function extractCoordinates(entry = {}) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const coordinates = entry.coordinates || entry.geometry || entry.coordinate || null;

  if (!coordinates || typeof coordinates !== 'object') {
    return null;
  }

  const lat = toNumber(coordinates.lat ?? coordinates.latitude, NaN);
  const lon = toNumber(coordinates.lon ?? coordinates.lng ?? coordinates.longitude, NaN);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

function haversineDistanceKm(pointA, pointB) {
  if (!pointA || !pointB) {
    return null;
  }

  const lat1 = toNumber(pointA.lat, NaN);
  const lon1 = toNumber(pointA.lon ?? pointA.lng, NaN);
  const lat2 = toNumber(pointB.lat, NaN);
  const lon2 = toNumber(pointB.lon ?? pointB.lng, NaN);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) {
    return null;
  }

  const radiusKm = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round((radiusKm * c) * 10) / 10;
}

function estimateLocalTransportFares(distanceKm) {
  const distance = Math.max(0.5, toNumber(distanceKm, 0.5));

  if (distance <= 2) {
    return { bus: 20, auto: 60, taxi: 110, bestMode: 'auto' };
  }

  if (distance <= 5) {
    return { bus: 30, auto: 110, taxi: 180, bestMode: 'auto' };
  }

  if (distance <= 10) {
    return { bus: 45, auto: 180, taxi: 320, bestMode: 'taxi' };
  }

  return { bus: 60, auto: 260, taxi: 480, bestMode: 'taxi' };
}

async function buildRouteInsights(referenceData, rawPackage, trip) {
  const rawHotels = Array.isArray(rawPackage?.hotels?.options) ? rawPackage.hotels.options : [];
  const primaryHotel = rawHotels[0] || null;
  const hotelLabel = toText(primaryHotel?.name || primaryHotel?.location || trip.toPlace, trip.toPlace);
  const destinationCoordinates = Number.isFinite(referenceData?.openStreetMap?.lat) && Number.isFinite(referenceData?.openStreetMap?.lon)
    ? { lat: referenceData.openStreetMap.lat, lon: referenceData.openStreetMap.lon }
    : null;

  let hotelCoordinates = extractCoordinates(primaryHotel) || destinationCoordinates;
  let hotelMap = destinationCoordinates ? {
    displayName: referenceData?.openStreetMap?.displayName || trip.toPlace,
    mapUrl: referenceData?.openStreetMap?.mapUrl || buildOpenStreetMapSearchUrl(trip.toPlace || 'OpenStreetMap stay area'),
    embedUrl: referenceData?.openStreetMap?.embedUrl || '',
    lat: destinationCoordinates.lat,
    lon: destinationCoordinates.lon,
  } : null;

  if (!hotelCoordinates) {
    try {
      hotelMap = await resolveOpenStreetMapLocation(trip.toPlace, { zoom: 14 });
      if (hotelMap) {
        hotelCoordinates = { lat: hotelMap.lat, lon: hotelMap.lon };
      }
    } catch (error) {
      console.warn(`[TravelPlanner] Route insight geocode failed for ${hotelLabel}: ${error.message}`);
    }
  }

  const stopCandidates = [
    ...(Array.isArray(referenceData?.restaurants) ? referenceData.restaurants.filter(Boolean) : []).map((restaurant, index) => ({
      kind: 'restaurant',
      index,
      name: toText(restaurant.name, `Restaurant ${index + 1}`),
      location: toText(restaurant.location || restaurant.area || '', trip.toPlace),
      description: toText(restaurant.description || restaurant.speciality || '', ''),
      link: toText(restaurant.link || restaurant.googleMapsUrl || '', ''),
      coordinates: extractCoordinates(restaurant),
      rating: toNumber(restaurant.rating, 0),
      avgCost: toNumber(restaurant.avgCost || restaurant.avg_cost, 0),
      source: toText(restaurant.source, 'Google Places'),
    })),
    ...(Array.isArray(referenceData?.attractions) ? referenceData.attractions.filter(Boolean) : []).map((place, index) => ({
      kind: 'attraction',
      index,
      name: toText(place.name, `Place ${index + 1}`),
      location: toText(place.location || place.distance_from_city || '', trip.toPlace),
      description: toText(place.description || place.type || '', ''),
      link: toText(place.link || place.googleMapsUrl || '', ''),
      coordinates: extractCoordinates(place),
      rating: toNumber(place.rating, 0),
      entryFee: toText(place.entry_fee || place.entryFee || '', 'Check locally'),
      source: toText(place.source, 'Google Places'),
    })),
  ];

  const scoredStops = stopCandidates
    .map((stop) => {
      const distanceKm = hotelCoordinates ? haversineDistanceKm(hotelCoordinates, stop.coordinates) : null;

      if (!Number.isFinite(distanceKm)) {
        return null;
      }

      const fares = estimateLocalTransportFares(distanceKm);

      return {
        ...stop,
        distanceKm,
        distanceLabel: `${distanceKm.toFixed(1)} km`,
        fares,
        mapUrl: stop.link || buildOpenStreetMapSearchUrl([stop.name, trip.toPlace].filter(Boolean).join(' ')),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearbyRestaurants = scoredStops.filter((stop) => stop.kind === 'restaurant').slice(0, 3);
  const nearbyAttractions = scoredStops.filter((stop) => stop.kind === 'attraction').slice(0, 4);
  const primaryNearby = nearbyRestaurants[0] || nearbyAttractions[0] || null;

  if (!hotelCoordinates || scoredStops.length === 0) {
    return {
      enabled: false,
      hotel: {
        name: hotelLabel,
        location: toText(primaryHotel?.location || trip.toPlace, trip.toPlace),
        // coordinates and map-service links are intentionally omitted — they are internal inputs only.
      },
      nearbyRestaurants,
      nearbyAttractions,
      localTransport: {
        bus: 0,
        auto: 0,
        taxi: 0,
      },
      summary: `Distance insights will populate once the stay and place coordinates are available for ${trip.toPlace}.`,
    };
  }

  const averageNearbyDistance = primaryNearby ? primaryNearby.distanceKm : scoredStops[0].distanceKm;
  const baseFares = estimateLocalTransportFares(averageNearbyDistance);

  return {
    enabled: true,
    hotel: {
      name: hotelLabel,
      location: toText(primaryHotel?.location || hotelMap?.displayName || trip.toPlace, trip.toPlace),
      // Coordinates-only — map-service links are internal inputs, never surfaced to the user.
      coordinates: hotelCoordinates,
    },
    nearbyRestaurants,
    nearbyAttractions,
    localTransport: {
      bus: baseFares.bus,
      auto: baseFares.auto,
      taxi: baseFares.taxi,
      bestMode: baseFares.bestMode,
      estimatedDailyRange: {
        bus: Math.round(baseFares.bus * 2.5),
        auto: Math.round(baseFares.auto * 2.5),
        taxi: Math.round(baseFares.taxi * 2.5),
      },
    },
    summary: `Stay base ${hotelMap?.displayName || trip.toPlace} is closest to ${primaryNearby?.name || 'the tracked places'}; the nearest stop is ${primaryNearby ? primaryNearby.distanceLabel : 'unavailable'}.`,
  };
}

function toText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function toStringArray(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item, '')).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return fallback.slice();
}

function formatCurrency(value) {
  return `₹${toNumber(value, 0).toLocaleString('en-IN')}`;
}

function clampRating(value, fallback = 4.5) {
  const rating = toNumber(value, fallback);
  return Math.max(1, Math.min(5, Number(rating.toFixed(1))));
}

function addDays(dateValue, offset) {
  const baseDate = new Date(dateValue);

  if (Number.isNaN(baseDate.getTime())) {
    return `${offset + 1}`;
  }

  baseDate.setDate(baseDate.getDate() + offset);
  return baseDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function normalizeTripInput(input = {}) {
  const days = Math.max(1, toInteger(input.days, 7));
  const travelers = Math.max(1, toInteger(input.travelers, 1));
  const budget = Math.max(1, toNumber(input.budget, 10000));

  return {
    fromPlace: toText(input.fromPlace, 'Origin city'),
    toPlace: toText(input.toPlace, 'Destination city'),
    budget,
    luxuryType: toText(input.luxuryType, 'semi'),
    days,
    startDate: toText(input.startDate, ''),
    endDate: toText(input.endDate, ''),
    travelers,
  };
}

function buildCacheKey(trip, provider = 'auto') {
  return [
    trip.fromPlace.toLowerCase(),
    trip.toPlace.toLowerCase(),
    trip.budget,
    trip.luxuryType,
    trip.days,
    trip.startDate,
    trip.endDate,
    trip.travelers,
    provider,
  ].join('|');
}

function defaultTheme(dayIndex) {
  return DAY_THEMES[dayIndex] || `Day ${dayIndex + 1}`;
}



function normalizeActivities(activities, trip, dayIndex) {
  const list = Array.isArray(activities) ? activities : [];

  return list.map((item, index) => {
    if (typeof item === 'string') {
      const match = item.match(/^(morning|afternoon|evening|anytime|night)\s*[-:]\s*(.*)$/i);
      if (match) {
        return {
          time: match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(),
          activity: match[2].trim()
        };
      }
      return {
        time: ['Morning', 'Afternoon', 'Evening'][index] || 'Anytime',
        activity: item.trim()
      };
    }
    
    const activityObj = item && typeof item === 'object' ? item : {};
    
    let activityText = toText(
      activityObj.activity || activityObj.place || activityObj.description,
      ''
    );
    
    if (!activityText && typeof item !== 'object' && item != null) {
      activityText = String(item).trim();
    }
    
    if (!activityText) {
      activityText = `Enjoy ${trip.toPlace} throughout the day`;
    }

    return {
      time: toText(activityObj.time, ['Morning', 'Afternoon', 'Evening'][index] || 'Anytime'),
      activity: activityText
    };
  });
}

function normalizePlan(rawPlan, trip) {
  // Handle if rawPlan is directly an array (agent returned plan as array)
  let sourceArray = [];
  let sourcePlan = {};
  
  if (Array.isArray(rawPlan)) {
    // If rawPlan is directly an array, treat it as the itinerary
    sourceArray = rawPlan;
    sourcePlan = {};
  } else if (rawPlan && typeof rawPlan === 'object') {
    sourcePlan = rawPlan;
    // Try multiple possible keys for the itinerary array
    sourceArray = Array.isArray(sourcePlan.itinerary) ? sourcePlan.itinerary 
               : Array.isArray(sourcePlan.days) ? sourcePlan.days
               : Array.isArray(sourcePlan.plan) ? sourcePlan.plan
               : [];
  }

  console.log('[DEBUG normalizePlan] Input type:', typeof rawPlan, 'Is array:', Array.isArray(rawPlan), 'Days found:', sourceArray.length);

  const itinerary = sourceArray.map((day, index) => ({
    day: toInteger(day.day, index + 1),
    date: toText(day.date, trip.startDate ? addDays(trip.startDate, index) : `Day ${index + 1}`),
    title: toText(day.title || day.theme, `${trip.toPlace} - Day ${index + 1}`),
    activities: normalizeActivities(day.activities, trip, index),
  }));

  const plan = {
    summary: sourcePlan.summary || {
      fromPlace: trip.fromPlace,
      toPlace: trip.toPlace,
      duration: trip.days,
      totalBudget: formatCurrency(trip.budget),
      travelers: trip.travelers,
      luxuryLevel: trip.luxuryType,
    },
    totalDays: toInteger(sourcePlan.totalDays, trip.days),
    bestTime: toText(sourcePlan.bestTime, 'Year-round'),
    estimatedBudget: toText(sourcePlan.estimatedBudget, formatCurrency(trip.budget)),
    highlights: toStringArray(sourcePlan.highlights, [
      `${trip.toPlace} highlights`,
      'Balanced travel and stay options',
      'Food and sightseeing suggestions',
    ]),
    packingEssentials: toStringArray(sourcePlan.packingEssentials, [
      'Comfortable clothes',
      'Travel documents',
      'Power bank',
      'Weather-appropriate footwear',
    ]),
    itinerary,
  };

  return plan;

}

function normalizeTravel(rawTravel, trip) {
  const sourceTravel = rawTravel && typeof rawTravel === 'object' ? rawTravel : {};
  const rawOptions = Array.isArray(sourceTravel.options) ? sourceTravel.options : [];

  const options = (rawOptions || []).map((option, index) => {
    const mode = toText(option.mode, toText(option.type, 'Transport'));
    const fallbackName = mode ? `${mode} option ${index + 1}` : `Travel option ${index + 1}`;
    return {
      name: toText(option.name, fallbackName),
      type: toText(option.type, mode),
      mode,
      duration: toText(option.duration, 'Flexible'),
      price: toNumber(option.price, 0),
      rating: clampRating(option.rating, 4.5),
      departure: toText(option.departure, trip.fromPlace),
      arrival: toText(option.arrival, trip.toPlace),
      departureTime: toText(option.departureTime, 'Flexible'),
      arrivalTime: toText(option.arrivalTime, 'Flexible'),
      highlights: toStringArray(option.highlights, []),
      details: toText(option.details || option.description, 'Travel option'),
      description: toText(option.description || option.details, 'Travel option'),
      bookingRequired: Boolean(option.bookingRequired),
      link: buildWorkingMapLink(
        option.link || option.url,
        `${toText(option.name, fallbackName)} ${trip.fromPlace} ${trip.toPlace}`,
        trip.toPlace
      ),
    };
  });

  return {
    description: toText(sourceTravel.description, `${trip.fromPlace} to ${trip.toPlace} travel options`),
    options,
  };
}



function normalizeHotels(rawHotels, trip) {
  const sourceHotels = rawHotels && typeof rawHotels === 'object' ? rawHotels : {};
  const rawOptions = Array.isArray(sourceHotels.options) ? sourceHotels.options : Array.isArray(sourceHotels.topHotels) ? sourceHotels.topHotels : [];

  const options = (rawOptions || []).map((hotel, index) => {
    const name = toText(hotel.name, `Stay option ${index + 1}`);
    return {
      name,
      rating: clampRating(hotel.rating, 4.5),
      location: toText(hotel.location, trip.toPlace),
      amenities: toStringArray(hotel.amenities, []),
      highlights: toStringArray(hotel.highlights, []),
      pricePerNight: toNumber(hotel.pricePerNight || hotel.price, 0),
      stars: toInteger(hotel.stars, 4),
      roomTypes: Array.isArray(hotel.roomTypes) ? hotel.roomTypes : [],
      facilities: toStringArray(hotel.facilities, []),
      checkIn: toText(hotel.checkIn, '2:00 PM'),
      checkOut: toText(hotel.checkOut, '11:00 AM'),
      image: toText(hotel.image || hotel.photoUrl || hotel.photoReference || '', ''),
      photoUrl: toText(hotel.photoUrl || hotel.image || hotel.photoReference || '', ''),
      link: buildWorkingMapLink(
        hotel.link || hotel.website || hotel.url,
        `${name} ${toText(hotel.location, trip.toPlace)} hotel`,
        trip.toPlace
      ),
    };
  });

  return {
    options,
  };
}



function normalizePlaces(rawPlaces, trip) {
  const sourcePlaces = rawPlaces && typeof rawPlaces === 'object' ? rawPlaces : {};
  const rawCategories = Array.isArray(sourcePlaces.categories) ? sourcePlaces.categories : Array.isArray(sourcePlaces.topAttractions) ? groupFlatPlaces(sourcePlaces.topAttractions) : [];

  const categories = (rawCategories || []).map((category, categoryIndex) => ({
    name: toText(category.name, 'Attractions'),
    places: (Array.isArray(category.places) ? category.places : []).map((place, placeIndex) => {
      const name = toText(place.name, `Place ${placeIndex + 1}`);
      return {
        name,
        type: toText(place.type || place.category, 'Attraction'),
        description: toText(place.description, 'Recommended stop'),
        timeRequired: toText(place.timeRequired, '2-3 hours'),
        entryFee: toText(place.entryFee, 'Free'),
        rating: clampRating(place.rating, 4.5),
        distance: toText(place.distance, `Near ${trip.toPlace}`),
        openingHours: toText(place.openingHours, 'Open all day'),
        bestFor: toStringArray(place.bestFor, ['Sightseeing']),
        image: toText(place.image || place.photoUrl || place.photoReference || '', ''),
        photoUrl: toText(place.photoUrl || place.image || place.photoReference || '', ''),
        link: buildWorkingMapLink(
          place.link || place.googleMapsUrl || place.website || place.url,
          `${name} ${trip.toPlace} attraction`,
          trip.toPlace
        ),
      };
    }),
  }));

  return {
    categories,
  };
}

function groupFlatPlaces(flatPlaces) {
  const categories = [];

  (Array.isArray(flatPlaces) ? flatPlaces : []).forEach((place) => {
    const categoryName = toText(place.category, 'Attractions');
    let category = categories.find((entry) => entry.name === categoryName);

    if (!category) {
      category = { name: categoryName, places: [] };
      categories.push(category);
    }

    category.places.push(place);
  });

  return categories;
}



function normalizeFood(rawFood, trip) {
  const sourceFood = rawFood && typeof rawFood === 'object' ? rawFood : {};
  const rawRestaurants = Array.isArray(sourceFood.restaurants) ? sourceFood.restaurants : Array.isArray(sourceFood.topRestaurants) ? sourceFood.topRestaurants : [];
  const rawSpecialties = Array.isArray(sourceFood.localSpecialties) ? sourceFood.localSpecialties : [];
  const rawStreetFood = Array.isArray(sourceFood.streetFood) ? sourceFood.streetFood : [];

  return {
    restaurants: (rawRestaurants || []).map((restaurant, index) => ({
      name: toText(restaurant.name, `Restaurant ${index + 1}`),
      cuisine: toText(restaurant.cuisine, 'Local cuisine'),
      area: toText(restaurant.area || restaurant.location, trip.toPlace),
      specialties: toStringArray(restaurant.specialties || restaurant.dishes, []),
      vibe: toText(restaurant.vibe || restaurant.ambiance, 'Casual'),
      avgCost: toNumber(restaurant.avgCost || restaurant.costForTravelers || restaurant.price, 0),
      rating: clampRating(restaurant.rating, 4.5),
      description: toText(restaurant.description || restaurant.speciality, 'Recommended restaurant'),
      bestFor: toText(restaurant.bestFor, 'Lunch or dinner'),
      timings: toText(restaurant.timings || restaurant.timing, '10:00 AM - 10:00 PM'),
      bookingRequired: Boolean(restaurant.bookingRequired),
      link: buildWorkingMapLink(
        restaurant.link || restaurant.googleMapsUrl || restaurant.website || restaurant.url,
        `${toText(restaurant.name, `Restaurant ${index + 1}`)} ${trip.toPlace} restaurant`,
        trip.toPlace
      ),
    })),
    localSpecialties: (rawSpecialties || []).map((specialty, index) => ({
      name: toText(specialty.name, `Specialty ${index + 1}`),
      description: toText(specialty.description, 'Local specialty'),
      whereToFind: toText(specialty.whereToFind || specialty.whereToTry, trip.toPlace),
      price: toText(specialty.price, '₹200-400'),
      mustTry: specialty.mustTry !== false,
      bestTime: toText(specialty.bestTime, 'Anytime'),
      link: buildWorkingMapLink(
        specialty.link || specialty.url,
        `${toText(specialty.name, `Specialty ${index + 1}`)} ${trip.toPlace}`,
        trip.toPlace
      ),
    })),
    streetFood: (rawStreetFood || []).map((item, index) => ({
      name: toText(item.name, `Street food ${index + 1}`),
      price: toText(item.price, '₹100-200'),
      location: toText(item.location, trip.toPlace),
      link: buildWorkingMapLink(
        item.link || item.url,
        `${toText(item.name, `Street food ${index + 1}`)} ${trip.toPlace}`,
        trip.toPlace
      ),
    })),
  };
}



function normalizeWeather(rawWeather, trip) {
  const sourceWeather = rawWeather && typeof rawWeather === 'object' ? rawWeather : {};
  const rawForecast = Array.isArray(sourceWeather.forecast) ? sourceWeather.forecast : [];

  return {
    weatherInfo: sourceWeather.weatherInfo || sourceWeather.current || {
      temp: 31,
      condition: 'Warm and pleasant',
      humidity: 68,
      windSpeed: 12,
    },
    forecast: (rawForecast || []).slice(0, trip.days).map((day, index) => ({
      day: toText(day.day, `Day ${index + 1}`),
      high: toNumber(day.high, 31 + (index % 3)),
      low: toNumber(day.low, 24 + (index % 2)),
      condition: toText(day.condition, index % 2 === 0 ? 'Sunny' : 'Partly Cloudy'),
      humidity: toNumber(day.humidity, 70),
      seaCondition: toText(day.seaCondition, 'Calm'),
      uvIndex: toText(day.uvIndex, '8'),
      recommendation: toText(day.recommendation, 'Carry sunscreen and stay hydrated'),
    })),
  };
}



function normalizeBudget(rawBudget, trip) {
  const sourceBudget = rawBudget && typeof rawBudget === 'object' ? rawBudget : {};
  const totalBudget = Math.max(1, trip.budget);

  return {
    accommodation: normalizeBudgetSection(sourceBudget.accommodation, 'Accommodation', totalBudget * 0.35, 35, `Stay costs in ${trip.toPlace}`),
    food: normalizeBudgetSection(sourceBudget.food, 'Food & Dining', totalBudget * 0.2, 20, `Meals in ${trip.toPlace}`),
    transportation: normalizeBudgetSection(sourceBudget.transportation, 'Transportation', totalBudget * 0.25, 25, `Travel to and around ${trip.toPlace}`),
    localTransport: normalizeBudgetSection(sourceBudget.localTransport, 'Local Transport', totalBudget * 0.08, 8, `Bus, auto, and taxi fares around ${trip.toPlace}`),
    activities: normalizeBudgetSection(sourceBudget.activities, 'Activities & Sightseeing', totalBudget * 0.15, 15, `Experiences in ${trip.toPlace}`),
    miscellaneous: normalizeBudgetSection(sourceBudget.miscellaneous, 'Miscellaneous', totalBudget * 0.05, 5, 'Contingency buffer'),
  };
}

function normalizeBudgetSection(section, label, fallbackValue, percentage, details) {
  const source = section && typeof section === 'object' ? section : {};
  const amount = Math.max(1, Math.round(toNumber(source.value ?? source.amount, fallbackValue)));

  return {
    label: toText(source.label, label),
    value: amount,
    percentage: toNumber(source.percentage, percentage),
    details: toText(source.details, details),
    breakdown: Array.isArray(source.breakdown) && source.breakdown.length > 0
      ? source.breakdown.map((item) => ({
        type: toText(item.type, 'Item'),
        amount: toNumber(item.amount, amount),
      }))
      : [{ type: details, amount }],
  };
}

function mergeGooglePlacesIntoPackage(rawPackage, referenceData, subagentResults) {
  // 1. Prepare candidate search lists from referenceData and subagentResults
  const hotelCandidates = [];
  const travelCandidates = [];
  const restaurantCandidates = [];
  const attractionCandidates = [];

  // Add reference data candidates
  if (referenceData) {
    if (Array.isArray(referenceData.hotels)) hotelCandidates.push(...referenceData.hotels);
    if (Array.isArray(referenceData.restaurants)) restaurantCandidates.push(...referenceData.restaurants);
    if (Array.isArray(referenceData.attractions)) attractionCandidates.push(...referenceData.attractions);
    if (referenceData.places && Array.isArray(referenceData.places.categories)) {
      for (const cat of referenceData.places.categories) {
        if (Array.isArray(cat.places)) attractionCandidates.push(...cat.places);
      }
    }
    if (referenceData.food) {
      if (Array.isArray(referenceData.food.restaurants)) restaurantCandidates.push(...referenceData.food.restaurants);
    }
  }

  // Add subagent results candidates
  if (subagentResults) {
    if (subagentResults.accommodation && Array.isArray(subagentResults.accommodation.options)) {
      hotelCandidates.push(...subagentResults.accommodation.options);
    }
    if (subagentResults.transit && Array.isArray(subagentResults.transit.options)) {
      travelCandidates.push(...subagentResults.transit.options);
    }
    if (subagentResults.food && subagentResults.food.food) {
      if (Array.isArray(subagentResults.food.food.restaurants)) {
        restaurantCandidates.push(...subagentResults.food.food.restaurants);
      }
      if (Array.isArray(subagentResults.food.food.localSpecialties)) {
        restaurantCandidates.push(...subagentResults.food.food.localSpecialties);
      }
      if (Array.isArray(subagentResults.food.food.streetFood)) {
        restaurantCandidates.push(...subagentResults.food.food.streetFood);
      }
    }
    if (subagentResults.places && subagentResults.places.places) {
      if (Array.isArray(subagentResults.places.places.categories)) {
        for (const cat of subagentResults.places.places.categories) {
          if (Array.isArray(cat.places)) attractionCandidates.push(...cat.places);
        }
      }
    }
  }

  // Helper matching function
  function findMatch(name, candidates) {
    if (!name || typeof name !== 'string') return null;
    const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    if (!cleanName) return null;

    // First try exact / full containment match
    for (const cand of candidates) {
      if (!cand || !cand.name || typeof cand.name !== 'string') continue;
      const cleanCandName = cand.name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      if (!cleanCandName) continue;
      if (cleanName === cleanCandName || cleanName.includes(cleanCandName) || cleanCandName.includes(cleanName)) {
        return cand;
      }
    }

    // Secondary soft match: check first 2 words if they are long enough
    const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    if (words.length >= 2) {
      const matchPrefix = words.slice(0, 2).join('');
      for (const cand of candidates) {
        if (!cand || !cand.name || typeof cand.name !== 'string') continue;
        const cleanCandName = cand.name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        if (cleanCandName.includes(matchPrefix)) {
          return cand;
        }
      }
    }
    return null;
  }

  // Helper to enrich a single target object
  function enrichItem(target, candidates) {
    if (!target || typeof target !== 'object') return;
    const matched = findMatch(target.name, candidates);
    if (matched) {
      target.link = target.link || matched.link || matched.website || matched.googleMapsUrl || matched.url || '';
      target.website = target.website || matched.website || matched.link || matched.googleMapsUrl || matched.url || '';
      if (matched.googleMapsUrl) target.googleMapsUrl = target.googleMapsUrl || matched.googleMapsUrl;
      if (matched.url) target.url = target.url || matched.url;
      if (matched.image) target.image = target.image || matched.image;
      if (matched.photoUrl) target.photoUrl = target.photoUrl || matched.photoUrl;
      if (matched.coordinates) target.coordinates = target.coordinates || matched.coordinates;
      if (matched.geometry) target.geometry = target.geometry || matched.geometry;
      if (matched.rating && !target.rating) target.rating = matched.rating;
    }
  }

  // 2. Perform the fallback assignments as originally coded
  const referencePlaces = referenceData?.places && Array.isArray(referenceData.places.categories) && referenceData.places.categories.length > 0
    ? referenceData.places
    : null;
  const subagentPlaces = subagentResults?.places?.places || null;
  const places = referencePlaces
    ? referencePlaces
    : (rawPackage.places || (subagentPlaces ? { categories: subagentPlaces.categories } : { categories: [] }));

  const referenceFood = referenceData?.food || {};
  const rawFood = rawPackage.food || {};
  const subagentFood = subagentResults?.food?.food || {};

  const restaurants = Array.isArray(referenceFood.restaurants) && referenceFood.restaurants.length > 0
    ? referenceFood.restaurants
    : (Array.isArray(rawFood.restaurants) && rawFood.restaurants.length > 0 ? rawFood.restaurants : (Array.isArray(subagentFood.restaurants) ? subagentFood.restaurants : []));
  const localSpecialties = Array.isArray(referenceFood.localSpecialties) && referenceFood.localSpecialties.length > 0
    ? referenceFood.localSpecialties
    : (Array.isArray(rawFood.localSpecialties) && rawFood.localSpecialties.length > 0 ? rawFood.localSpecialties : (Array.isArray(subagentFood.localSpecialties) ? subagentFood.localSpecialties : []));
  const streetFood = Array.isArray(referenceFood.streetFood) && referenceFood.streetFood.length > 0
    ? referenceFood.streetFood
    : (Array.isArray(rawFood.streetFood) && rawFood.streetFood.length > 0 ? rawFood.streetFood : (Array.isArray(subagentFood.streetFood) ? subagentFood.streetFood : []));

  // Prefer subagent data for hotels/travel (they contain verified deep-researched links).
  // Only fall back to main agent's version if it has real non-empty options and subagents didn't.
  const subagentHotels = (subagentResults?.accommodation?.options?.length > 0)
    ? { options: subagentResults.accommodation.options }
    : null;
  const subagentTravel = (subagentResults?.transit?.options?.length > 0)
    ? { options: subagentResults.transit.options }
    : null;

  const mainHasRealHotels = Array.isArray(rawPackage.hotels?.options) && rawPackage.hotels.options.length > 0;
  const mainHasRealTravel = Array.isArray(rawPackage.travel?.options) && rawPackage.travel.options.length > 0;

  const mergedHotels = subagentHotels || (mainHasRealHotels ? rawPackage.hotels : { options: [] });
  const mergedTravel = subagentTravel || (mainHasRealTravel ? rawPackage.travel : { options: [] });

  // 3. Enrich targets in place!
  if (mergedHotels && Array.isArray(mergedHotels.options)) {
    mergedHotels.options.forEach(hotel => enrichItem(hotel, hotelCandidates));
  }
  if (mergedTravel && Array.isArray(mergedTravel.options)) {
    mergedTravel.options.forEach(opt => enrichItem(opt, travelCandidates));
  }
  if (places && Array.isArray(places.categories)) {
    places.categories.forEach(cat => {
      if (Array.isArray(cat.places)) {
        cat.places.forEach(place => enrichItem(place, attractionCandidates));
      }
    });
  }
  if (Array.isArray(restaurants)) {
    restaurants.forEach(rest => enrichItem(rest, restaurantCandidates));
  }
  if (Array.isArray(localSpecialties)) {
    localSpecialties.forEach(spec => enrichItem(spec, restaurantCandidates));
  }
  if (Array.isArray(streetFood)) {
    streetFood.forEach(item => enrichItem(item, restaurantCandidates));
  }

  return {
    ...rawPackage,
    places,
    food: {
      ...rawFood,
      ...referenceFood,
      ...subagentFood,
      restaurants,
      localSpecialties,
      streetFood,
    },
    hotels: mergedHotels,
    travel: mergedTravel,
  };
}

function normalizeTravelPackage(rawPackage, trip) {
  const sourcePackage = rawPackage && typeof rawPackage === 'object' ? rawPackage : {};

  const plan = normalizePlan(sourcePackage.plan || sourcePackage, trip);
  const travel = normalizeTravel(sourcePackage.travel || sourcePackage.transportation || sourcePackage, trip);
  const hotels = normalizeHotels(sourcePackage.hotels || sourcePackage.accommodation || sourcePackage, trip);
  const places = normalizePlaces(sourcePackage.places || sourcePackage.attractions || sourcePackage, trip);
  const food = normalizeFood(sourcePackage.food || sourcePackage.restaurants || sourcePackage, trip);
  const weather = normalizeWeather(sourcePackage.weather || sourcePackage, trip);
  const budget = normalizeBudget(sourcePackage.budget || sourcePackage.budgetBreakdown || sourcePackage, trip);

  return {
    source: 'gemma4:31b-cloud',
    model: resolveCloudConfig().model,
    generatedAt: new Date().toISOString(),
    trip,
    plan,
    travel,
    hotels,
    places,
    food,
    weather,
    budget,
  };
}

function reconcileBudgetSplits(packageData, trip, routeInsights) {
  const travelersCount = trip.travelers || 1;
  const days = trip.days || 1;
  const totalBudget = trip.budget || 10000;

  // Accommodation actual total
  const preferredHotel = packageData.hotels?.options?.[0];
  const hotelPricePerNight = preferredHotel?.pricePerNight || Math.round((totalBudget * 0.35) / days);
  const accommodationVal = Math.round(hotelPricePerNight * days);

  // Transportation actual total
  const preferredTravel = packageData.travel?.options?.[0];
  const travelPrice = preferredTravel?.price || Math.round((totalBudget * 0.25) / travelersCount);
  const transportationVal = Math.round(travelPrice * travelersCount);

  // Food actual total
  const preferredRestaurant = packageData.food?.restaurants?.[0];
  const avgCost = preferredRestaurant?.avgCost || preferredRestaurant?.avg_cost || Math.round((totalBudget * 0.2) / (days * travelersCount));
  const foodVal = Math.round(avgCost * days * travelersCount);

  // Local Transport actual total
  const transportMode = routeInsights?.localTransport || {};
  const dailyFare = transportMode.taxi || transportMode.auto || Math.round((totalBudget * 0.08) / days);
  const localTransportVal = Math.round(dailyFare * days);

  // Activities actual total
  let activitiesVal = 0;
  if (packageData.places?.categories) {
    packageData.places.categories.forEach(cat => {
      if (Array.isArray(cat.places)) {
        cat.places.forEach(p => {
          const fee = parseInt(String(p.entryFee || p.entry_fee || '0').replace(/[^0-9]/g, '')) || 0;
          activitiesVal += fee * travelersCount;
        });
      }
    });
  }
  if (activitiesVal === 0) {
    activitiesVal = Math.round(totalBudget * 0.12);
  }

  // Miscellaneous / Buffer
  const spent = accommodationVal + transportationVal + foodVal + localTransportVal + activitiesVal;
  const miscellaneousVal = Math.max(0, totalBudget - spent);

  packageData.budget = {
    accommodation: {
      label: 'Accommodation',
      value: accommodationVal,
      percentage: Math.round((accommodationVal / totalBudget) * 100),
      details: `Stays at ${preferredHotel?.name || 'hotel'} for ${days} days`
    },
    transportation: {
      label: 'Transportation',
      value: transportationVal,
      percentage: Math.round((transportationVal / totalBudget) * 100),
      details: `Intercity travel tickets (${preferredTravel?.type || 'Transport'})`
    },
    food: {
      label: 'Food & Dining',
      value: foodVal,
      percentage: Math.round((foodVal / totalBudget) * 100),
      details: `Meals and regional gastronomy`
    },
    localTransport: {
      label: 'Local Transport',
      value: localTransportVal,
      percentage: Math.round((localTransportVal / totalBudget) * 100),
      details: `Local commuting in destination`
    },
    activities: {
      label: 'Activities & Sightseeing',
      value: activitiesVal,
      percentage: Math.round((activitiesVal / totalBudget) * 100),
      details: `Attraction entry fees & local guide fares`
    },
    miscellaneous: {
      label: 'Miscellaneous',
      value: miscellaneousVal,
      percentage: Math.round((miscellaneousVal / totalBudget) * 100),
      details: `Contingency buffer`
    }
  };
}

async function generateTravelPackage(input) {
  const trip = normalizeTripInput(input);
  const sessionId = input.sessionId || null;
  const provider = normalizeTravelProvider(input?.provider);
  const cacheKey = buildCacheKey(trip, provider);
  const startedAt = Date.now();
  const now = Date.now();
  const cached = packageCache.get(cacheKey);

  const emitEventFn = (() => {
    try { return require('./monitorBridge').emitEvent; } catch { return null; }
  })();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    if (emitEventFn) {
      emitEventFn('cache', 'lookup_hit', { key: cacheKey, age: now - cached.timestamp }, sessionId);
    }
    return cached.data;
  }

  if (inflightPackages.has(cacheKey)) {
    if (emitEventFn) {
      emitEventFn('cache', 'request_inflight', { key: cacheKey }, sessionId);
    }
    return inflightPackages.get(cacheKey);
  }

  const requestPromise = (async () => {
    const config = resolveCloudConfig();
    const fusion = require('./fusion');

    if (emitEventFn) {
      emitEventFn('cache', 'lookup_miss', { key: cacheKey, ttlRemaining: 0, reason: 'No cached package for this config' }, sessionId);
    }

    if (emitEventFn) {
      emitEventFn('orchestrator', 'generate_started', {
        trip,
        provider,
        complexity: 'moderate',
      }, sessionId);
    }

    const researchResults = await runDeepResearchSubagents(trip, sessionId);

    if (emitEventFn) {
      emitEventFn('browser', 'subagents_completed', {
        accommodation: researchResults.accommodation ? { options: researchResults.accommodation.options?.length || 0 } : null,
        transit: researchResults.transit ? { options: researchResults.transit.options?.length || 0 } : null,
        food: researchResults.food ? { restaurants: researchResults.food.food?.restaurants?.length || 0 } : null,
        places: researchResults.places ? { categories: researchResults.places.places?.categories?.length || 0 } : null,
      }, sessionId);
    }

    const referenceData = await buildTravelReferenceData(trip, provider);

    if (emitEventFn) {
      const apiProviders = [referenceData?.googlePlaces, referenceData?.olaPlaces].filter(Boolean);
      emitEventFn('api', 'reference_built', {
        primary: referenceData?.primaryProvider || provider,
        secondary: referenceData?.secondaryProvider || null,
        destination: trip.toPlace,
        providers: apiProviders.map(p => ({ name: p.name || p.provider, restaurants: p.restaurants || 0, attractions: p.attractions || 0 })),
      }, sessionId);

      emitEventFn('api', 'places_fetched', {
        provider: referenceData?.primaryProvider || 'google',
        candidates: (referenceData?.restaurants?.length || 0) + (referenceData?.attractions?.length || 0),
        used: Math.min(12, (referenceData?.restaurants?.length || 0) + (referenceData?.attractions?.length || 0)),
      }, sessionId);
    }

    if (emitEventFn) {
      const rawInputCount = [
        researchResults.accommodation?.options?.length || 0,
        researchResults.transit?.options?.length || 0,
        (referenceData?.restaurants?.length || 0) + (researchResults.food?.food?.restaurants?.length || 0),
        (referenceData?.attractions?.length || 0) + (researchResults.places?.places?.categories?.length || 0),
      ].reduce((a, b) => a + b, 0);

      emitEventFn('fusion', 'normalize_started', {
        sources: [researchResults.accommodation, researchResults.transit, researchResults.food, researchResults.places, referenceData].filter(Boolean).length,
        rawCount: rawInputCount,
      }, sessionId);
    }

    const fusedRestaurants = fusion.mergePlaceSets(
      referenceData?.restaurants || [], researchResults.food?.food?.restaurants || [],
      { destination: trip.toPlace, limit: 8, defaultSource: referenceData?.primaryProvider || 'google' }, 'restaurant'
    );
    const fusedAttractions = fusion.mergePlaceSets(
      referenceData?.attractions || [], researchResults.places?.places?.categories?.flatMap(c => c.places || []) || [],
      { destination: trip.toPlace, limit: 10, defaultSource: referenceData?.primaryProvider || 'google' }, 'attraction'
    );
    const fusedHotels = fusion.normalizeHotels({ options: researchResults.accommodation?.options || [] }, trip);
    const fusedTransit = fusion.normalizeTravel(researchResults.transit?.options || [], trip);

    const scoredHotels = fusion.pickBestCandidates(fusedHotels.options, 6);
    const scoredTransit = fusion.pickBestCandidates(fusedTransit.options, 6);
    const scoredRestaurants = fusion.pickBestCandidates(fusedRestaurants, 8);
    const scoredAttractions = fusion.pickBestCandidates(fusedAttractions, 10);

    const sanitizedRestaurants = fusion.sanitizeReferenceData({ restaurants: scoredRestaurants }).restaurants;
    const sanitizedAttractions = fusion.sanitizeReferenceData({ attractions: scoredAttractions }).attractions;

    const dedupedCount = {
      hotels: fusedHotels.options.length - scoredHotels.length,
      transit: fusedTransit.options.length - scoredTransit.length,
      restaurants: fusedRestaurants.length - scoredRestaurants.length,
      attractions: fusedAttractions.length - sanitizedAttractions.length,
    };

    if (emitEventFn) {
      emitEventFn('fusion', 'dedup_complete', {
        duplicatesRemoved: Object.values(dedupedCount).reduce((a, b) => a + b, 0),
        remaining: scoredHotels.length + scoredTransit.length + sanitizedRestaurants.length + sanitizedAttractions.length,
        breakdown: dedupedCount,
      }, sessionId);

      emitEventFn('fusion', 'score_rank', {
        hotels: scoredHotels.length, transit: scoredTransit.length,
        restaurants: sanitizedRestaurants.length, attractions: sanitizedAttractions.length,
      }, sessionId);
    }

    const budgetPrompt = buildBudgetAllocationPrompt(referenceData, trip);
    const referencePrompt = buildTravelReferencePrompt(referenceData, trip);

    const fusionContextPrompt = `
Fusion-processed data (normalized, deduped, scored, sanitized):

Hotels (${scoredHotels.length} options):
${JSON.stringify(scoredHotels, null, 2)}

Travel (${scoredTransit.length} options):
${JSON.stringify(scoredTransit, null, 2)}

Restaurants (${sanitizedRestaurants.length}, links sanitized):
${JSON.stringify(sanitizedRestaurants, null, 2)}

Attractions (${sanitizedAttractions.length}, links sanitized):
${JSON.stringify(sanitizedAttractions, null, 2)}
`;

    console.log('[DEBUG Pipeline] Subagent Results Summary:');
    console.log(`  - Accommodation options: ${researchResults.accommodation?.options?.length || 0}`);
    console.log(`  - Transit options: ${researchResults.transit?.options?.length || 0}`);
    console.log(`  - Food restaurants: ${researchResults.food?.food?.restaurants?.length || 0}`);
    console.log(`  - Places categories: ${researchResults.places?.places?.categories?.length || 0}`);

    if (emitEventFn) {
      emitEventFn('llm', 'synthesize_call', {
        model: config.model,
        promptSections: ['travel_prompt', 'budget_allocation', 'reference_data', 'fusion_normalized_data'],
        referenceProvider: referenceData?.primaryProvider,
        fusionInputCounts: {
          hotels: scoredHotels.length,
          transit: scoredTransit.length,
          restaurants: sanitizedRestaurants.length,
          attractions: sanitizedAttractions.length,
        },
      }, sessionId);
    }

    const REQUIRED_PACKAGE_KEYS = ['plan', 'hotels', 'travel', 'places', 'food', 'budget'];

    const buildCorrectionPrompt = (attempt, missingKeys, badSection) =>
      `SYSTEM CORRECTION — Attempt ${attempt}: Your previous JSON response was missing or empty for: ${missingKeys.join(', ')}.
       The "${badSection}" section must be a non-empty array/object with real options derived from the fusion data below.
       Respond ONLY with valid JSON. Do NOT add markdown fences, comments, or preamble.`;

    let rawPackage = await chatJson({
      system: TRAVEL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${buildTravelPackagePrompt(trip)}${budgetPrompt}${referencePrompt}${fusionContextPrompt}`,
        },
      ],
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      think: false,
      options: { temperature: 1.0, top_p: 0.95, top_k: 64 },
      keepAlive: '15m',
    });

    let parseAttempts = 0;
    const MAX_JSON_RETRIES = 3;

    while (parseAttempts < MAX_JSON_RETRIES) {
      parseAttempts++;

      if (!rawPackage || typeof rawPackage !== 'object') {
        if (emitEventFn) {
          emitEventFn('llm', 'json_parse_failed', { attempt: parseAttempts, reason: 'response is not an object' }, sessionId);
        }
        const correction = buildCorrectionPrompt(parseAttempts, REQUIRED_PACKAGE_KEYS, 'all');
        rawPackage = await chatJson({
          system: `${TRAVEL_SYSTEM_PROMPT}\n\n${correction}`,
          messages: [
            {
              role: 'user',
              content: `${buildTravelPackagePrompt(trip)}${budgetPrompt}${referencePrompt}${fusionContextPrompt}\n\n${correction}`,
            },
          ],
          model: config.model,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          think: false,
          options: { temperature: 0.3, top_p: 0.9, top_k: 32 },
          keepAlive: '15m',
        });
        continue;
      }

      const missingKeys = REQUIRED_PACKAGE_KEYS.filter((k) => {
        const v = rawPackage[k];
        if (Array.isArray(v)) return v.length === 0;
        if (v && typeof v === 'object') return Object.keys(v).length === 0;
        return !v;
      });

      if (missingKeys.length > 0) {
        if (emitEventFn) {
          emitEventFn('llm', 'json_parse_failed', { attempt: parseAttempts, missingKeys, reason: 'required section empty or missing' }, sessionId);
        }

        const correction = buildCorrectionPrompt(parseAttempts, missingKeys, missingKeys[0]);

        rawPackage = await chatJson({
          system: `${TRAVEL_SYSTEM_PROMPT}\n\n${correction}`,
          messages: [
            {
              role: 'user',
              content: `${buildTravelPackagePrompt(trip)}${budgetPrompt}${referencePrompt}${fusionContextPrompt}\n\n${correction}`,
            },
          ],
          model: config.model,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          think: false,
          options: { temperature: 0.3, top_p: 0.9, top_k: 32 },
          keepAlive: '15m',
        });
        continue;
      }

      break;
    }

    if (parseAttempts >= MAX_JSON_RETRIES) {
      if (emitEventFn) {
        emitEventFn('llm', 'json_parse_failed', { attempt: parseAttempts, reason: 'max retries exceeded', fallback: 'fusion_data_only' }, sessionId);
      }
      console.warn(`[TravelPlanner] LLM JSON parse failed after ${parseAttempts} attempts — falling back to fusion-only package.`);
    }

    console.log('[DEBUG Pipeline] Main Agent Output:');
    console.log(`  - Travel options: ${rawPackage.travel?.options?.length || 0}`);
    console.log(`  - Hotels options: ${rawPackage.hotels?.options?.length || 0}`);
    console.log(`  - Plan days: ${rawPackage.plan?.itinerary?.length || (Array.isArray(rawPackage.plan) ? rawPackage.plan.length : 0) || 0}`);
    console.log(`  - Places categories: ${rawPackage.places?.categories?.length || 0}`);
    console.log(`  - Food restaurants: ${rawPackage.food?.restaurants?.length || 0}`);

    const enrichedRawPackage = {
      ...rawPackage,
      plan: rawPackage.plan,
      hotels: { options: scoredHotels },
      travel: { options: scoredTransit },
      places: { categories: fusion.buildAttractionCategories(sanitizedAttractions, trip) },
      food: fusion.buildRestaurantSections(sanitizedRestaurants, trip),
      weather: rawPackage.weather || {},
      budget: rawPackage.budget || {},
    };

    console.log('[DEBUG Pipeline] After Merge:');
    console.log(`  - Travel options: ${enrichedRawPackage.travel?.options?.length || 0}`);
    console.log(`  - Hotels options: ${enrichedRawPackage.hotels?.options?.length || 0}`);
    console.log(`  - Plan days: ${enrichedRawPackage.plan?.itinerary?.length || 0}`);
    console.log(`  - Places categories: ${enrichedRawPackage.places?.categories?.length || 0}`);
    console.log(`  - Food restaurants: ${enrichedRawPackage.food?.restaurants?.length || 0}`);

    const packageData = normalizeTravelPackage(enrichedRawPackage, trip);

    console.log('[DEBUG Pipeline] After Normalization:');
    console.log(`  - Travel options: ${packageData.travel?.options?.length || 0}`);
    console.log(`  - Hotels options: ${packageData.hotels?.options?.length || 0}`);
    console.log(`  - Plan days: ${packageData.plan?.itinerary?.length || 0}`);
    console.log(`  - Places categories: ${packageData.places?.categories?.length || 0}`);
    console.log(`  - Food restaurants: ${packageData.food?.restaurants?.length || 0}`);

    const defaultRouteInsights = {
      enabled: false,
      summary: `Distance insights unavailable for ${trip.toPlace}.`,
      localTransport: { bus: 0, auto: 0, taxi: 0 },
      nearbyRestaurants: [],
      nearbyAttractions: [],
    };

    let routeInsights = defaultRouteInsights;
    try {
      routeInsights = await buildRouteInsights(referenceData, rawPackage, trip);
    } catch (error) {
      console.warn(`[TravelPlanner] Route insight build failed for ${trip.toPlace}: ${error.message}`);
    }

    reconcileBudgetSplits(packageData, trip, routeInsights);

    packageData.meta = {
      budgetAllocation: packageData.budget,
      referenceProvider: referenceData?.primaryProvider || provider,
      referenceSources: {
        primary: referenceData?.primaryProvider || null,
        secondary: referenceData?.secondaryProvider || null,
      },
      openStreetMap: referenceData?.openStreetMap || { enabled: false, destination: trip.toPlace, displayName: '', name: '', lat: null, lon: null, zoom: 13, searchUrl: '', mapUrl: '', embedUrl: '', summary: '' },
      googlePlaces: referenceData?.googlePlaces || { enabled: false, destination: trip.toPlace, restaurants: 0, attractions: 0, summary: '' },
      olaPlaces: referenceData?.olaPlaces || { enabled: false, destination: trip.toPlace, restaurants: 0, attractions: 0, summary: '' },
      routeInsights,
      researchArtifacts: researchResults.artifacts,
      model: config.model,
      generatedAt: packageData.generatedAt,
    };

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', 'Polishing final budget splits and writing dashboard data...', 'complete');
    }

    packageCache.set(cacheKey, { timestamp: Date.now(), data: packageData });

    if (emitEventFn) {
      emitEventFn('response', 'package_ready', {
        requestId: input.requestId || null,
        elapsedMs: Date.now() - startedAt,
        budget: packageData?.budget?.accommodation?.percentage ? packageData.budget : trip.budget,
        itineraryDays: packageData?.plan?.itinerary?.length ?? (Array.isArray(packageData?.plan) ? packageData.plan.length : 0) ?? 0,
        hotels: packageData?.hotels?.options?.length || 0,
        travel: packageData?.travel?.options?.length || 0,
        food: packageData?.food?.restaurants?.length || 0,
        places: packageData?.places?.categories?.length || 0,
        warnings: packageData?.meta?.warnings || [],
      }, sessionId);
    }

    return packageData;
  })().finally(() => {
    inflightPackages.delete(cacheKey);
  });

  inflightPackages.set(cacheKey, requestPromise);
  return requestPromise;
}

async function getTravelPlan(input) {
  const packageData = await generateTravelPackage(input);
  return packageData.plan;
}

async function getTravelDetails(input, tabType) {
  const packageData = await generateTravelPackage(input);
  const tabKey = String(tabType || '').toLowerCase();

  if (tabKey === 'travel') {
    return packageData.travel;
  }

  if (tabKey === 'hotels') {
    return packageData.hotels;
  }

  if (tabKey === 'places') {
    return packageData.places;
  }

  if (tabKey === 'food') {
    return packageData.food;
  }

  if (tabKey === 'weather') {
    return packageData.weather;
  }

  if (tabKey === 'budget') {
    return packageData.budget;
  }

  return packageData.plan;
}

function clearTravelCache() {
  packageCache.clear();
  inflightPackages.clear();
}

module.exports = {
  generateTravelPackage,
  getTravelPlan,
  getTravelDetails,
  clearTravelCache,
};
