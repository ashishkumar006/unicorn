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

const FALLBACK_CATEGORIES = [
  'Beaches and Waterfronts',
  'Heritage and Culture',
  'Food and Markets',
];

const FALLBACK_RESTAURANT_NAMES = [
  'Coastal Table',
  'Heritage Kitchen',
  'Sunset Dine',
  'Local Flavors Cafe',
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

function buildWorkingMapLink(link, name, destination) {
  const candidate = toText(link, '');

  if (candidate && !/olamaps?/i.test(candidate)) {
    return candidate;
  }

  return buildOpenStreetMapFallbackUrl(name, destination);
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
      searchUrl: openStreetMapReferenceData.searchUrl,
      mapUrl: openStreetMapReferenceData.mapUrl,
      embedUrl: openStreetMapReferenceData.embedUrl,
      summary: openStreetMapReferenceData.summary || '',
    } : {
      enabled: false,
      destination: trip.toPlace,
      displayName: '',
      name: '',
      lat: null,
      lon: null,
      zoom: 13,
      searchUrl: buildOpenStreetMapSearchUrl(trip.toPlace || 'OpenStreetMap'),
      mapUrl: buildOpenStreetMapSearchUrl(trip.toPlace || 'OpenStreetMap'),
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
    ? `[OpenStreetMap preview](${referenceData.openStreetMap.mapUrl})`
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
        mapUrl: hotelMap?.mapUrl || buildOpenStreetMapSearchUrl(trip.toPlace || 'OpenStreetMap stay area'),
        embedUrl: hotelMap?.embedUrl || '',
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
      mapUrl: hotelMap?.mapUrl || buildOpenStreetMapSearchUrl(trip.toPlace || 'OpenStreetMap stay area'),
      embedUrl: hotelMap?.embedUrl || '',
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

function buildDefaultItinerary(trip) {
  const itinerary = [];

  for (let index = 0; index < trip.days; index += 1) {
    const dayNumber = index + 1;
    const dayDate = trip.startDate ? addDays(trip.startDate, index) : `Day ${dayNumber}`;
    const theme = defaultTheme(index);

    itinerary.push({
      day: dayNumber,
      date: dayDate,
      title: `${trip.toPlace} - ${theme}`,
      activities: [
        { time: 'Morning', activity: `Arrive and settle into ${trip.toPlace}` },
        { time: 'Afternoon', activity: `Explore a local highlight in ${trip.toPlace}` },
        { time: 'Evening', activity: `Enjoy dinner and a relaxed walk in ${trip.toPlace}` },
      ],
    });
  }

  return itinerary;
}

function normalizeActivities(activities, trip, dayIndex) {
  const list = Array.isArray(activities) ? activities : [];

  if (list.length === 0) {
    const defaultDay = buildDefaultItinerary(trip)[dayIndex];
    return defaultDay ? defaultDay.activities : [];
  }

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
  const sourcePlan = rawPlan && typeof rawPlan === 'object' ? rawPlan : {};
  const itinerarySource = Array.isArray(sourcePlan.itinerary) ? sourcePlan.itinerary : [];
  const itinerary = itinerarySource.map((day, index) => ({
    day: toInteger(day.day, index + 1),
    date: toText(day.date, trip.startDate ? addDays(trip.startDate, index) : `Day ${index + 1}`),
    title: toText(day.title || day.theme, `${trip.toPlace} - Day ${index + 1}`),
    activities: normalizeActivities(day.activities, trip, index),
  }));

  while (itinerary.length < trip.days) {
    const defaultDay = buildDefaultItinerary(trip)[itinerary.length];
    itinerary.push(defaultDay);
  }

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
  const fallbackOptions = buildDefaultTravelOptions(trip);

  const options = (rawOptions.length > 0 ? rawOptions : fallbackOptions).map((option, index) => ({
    name: toText(option.name, fallbackOptions[index]?.name || `Travel option ${index + 1}`),
    type: toText(option.type, fallbackOptions[index]?.type || 'Transport'),
    mode: toText(option.mode, fallbackOptions[index]?.mode || toText(option.type, 'Transport')),
    duration: toText(option.duration, fallbackOptions[index]?.duration || 'Flexible'),
    price: toNumber(option.price, fallbackOptions[index]?.price || Math.max(1, Math.round(trip.budget * 0.2))),
    rating: clampRating(option.rating, fallbackOptions[index]?.rating || 4.5),
    departure: toText(option.departure, fallbackOptions[index]?.departure || trip.fromPlace),
    arrival: toText(option.arrival, fallbackOptions[index]?.arrival || trip.toPlace),
    departureTime: toText(option.departureTime, fallbackOptions[index]?.departureTime || 'Flexible'),
    arrivalTime: toText(option.arrivalTime, fallbackOptions[index]?.arrivalTime || 'Flexible'),
    highlights: toStringArray(option.highlights, fallbackOptions[index]?.highlights || []),
    details: toText(option.details || option.description, fallbackOptions[index]?.details || 'Travel option'),
    description: toText(option.description || option.details, fallbackOptions[index]?.description || 'Travel option'),
    bookingRequired: Boolean(option.bookingRequired),
    link: buildWorkingMapLink(
      option.link || option.url,
      `${toText(option.name, fallbackOptions[index]?.name || `Travel option ${index + 1}`)} ${trip.fromPlace} ${trip.toPlace}`,
      trip.toPlace
    ),
  }));

  return {
    description: toText(sourceTravel.description, `${trip.fromPlace} to ${trip.toPlace} travel options`),
    options,
  };
}

function buildDefaultTravelOptions(trip) {
  const budget = Math.max(1, trip.budget);
  const perPersonBudget = Math.max(1, Math.round(budget / trip.travelers));
  const airPrice = Math.max(1, Math.round(perPersonBudget * 0.35));
  const railPrice = Math.max(1, Math.round(perPersonBudget * 0.22));
  const roadPrice = Math.max(1, Math.round(perPersonBudget * 0.16));

  return [
    {
      name: `${trip.fromPlace} to ${trip.toPlace} Express Flight`,
      type: 'Flight',
      mode: 'Air',
      duration: '1-3 hours',
      price: airPrice,
      rating: 4.8,
      departure: trip.fromPlace,
      arrival: trip.toPlace,
      departureTime: 'Morning',
      arrivalTime: 'Same day',
      highlights: ['Fastest arrival', 'Best for short trips', 'More time on ground'],
      details: `Direct flight option from ${trip.fromPlace} to ${trip.toPlace}.`,
      description: 'Fast air transfer for travelers who want maximum time at the destination.',
    },
    {
      name: `${trip.fromPlace} to ${trip.toPlace} Scenic Rail`,
      type: 'Train',
      mode: 'Rail',
      duration: '10-14 hours',
      price: railPrice,
      rating: 4.6,
      departure: trip.fromPlace,
      arrival: trip.toPlace,
      departureTime: 'Afternoon',
      arrivalTime: 'Next morning',
      highlights: ['Scenic route', 'Comfortable for overnight travel', 'Budget friendly'],
      details: `Rail option suited for a relaxed trip from ${trip.fromPlace} to ${trip.toPlace}.`,
      description: 'Balanced travel choice with a comfortable journey and lower cost.',
    },
    {
      name: `${trip.fromPlace} to ${trip.toPlace} Road Transfer`,
      type: 'Road',
      mode: 'Car/Bus',
      duration: 'Flexible',
      price: roadPrice,
      rating: 4.3,
      departure: trip.fromPlace,
      arrival: trip.toPlace,
      departureTime: 'Early morning',
      arrivalTime: 'Evening',
      highlights: ['Flexible stops', 'Good for groups', 'Lowest transfer cost'],
      details: `Road travel option from ${trip.fromPlace} to ${trip.toPlace}.`,
      description: 'Good for travelers who want flexibility and lower transfer cost.',
    },
  ];
}

function normalizeHotels(rawHotels, trip) {
  const sourceHotels = rawHotels && typeof rawHotels === 'object' ? rawHotels : {};
  const rawOptions = Array.isArray(sourceHotels.options) ? sourceHotels.options : Array.isArray(sourceHotels.topHotels) ? sourceHotels.topHotels : [];
  const fallbackOptions = buildDefaultHotels(trip);

  const options = (rawOptions.length > 0 ? rawOptions : fallbackOptions).map((hotel, index) => ({
    name: toText(hotel.name, fallbackOptions[index]?.name || `Stay option ${index + 1}`),
    rating: clampRating(hotel.rating, fallbackOptions[index]?.rating || 4.5),
    location: toText(hotel.location, fallbackOptions[index]?.location || trip.toPlace),
    amenities: toStringArray(hotel.amenities, fallbackOptions[index]?.amenities || []),
    highlights: toStringArray(hotel.highlights, fallbackOptions[index]?.highlights || []),
    pricePerNight: toNumber(hotel.pricePerNight || hotel.price, fallbackOptions[index]?.pricePerNight || Math.max(1, Math.round(trip.budget * 0.25))),
    stars: toInteger(hotel.stars, fallbackOptions[index]?.stars || 4),
    roomTypes: Array.isArray(hotel.roomTypes) ? hotel.roomTypes : fallbackOptions[index]?.roomTypes || [],
    facilities: toStringArray(hotel.facilities, fallbackOptions[index]?.facilities || []),
    checkIn: toText(hotel.checkIn, fallbackOptions[index]?.checkIn || '2:00 PM'),
    checkOut: toText(hotel.checkOut, fallbackOptions[index]?.checkOut || '11:00 AM'),
    link: buildWorkingMapLink(
      hotel.link || hotel.website || hotel.url,
      `${toText(hotel.name, fallbackOptions[index]?.name || `Stay option ${index + 1}`)} ${toText(hotel.location, fallbackOptions[index]?.location || trip.toPlace)} hotel`,
      trip.toPlace
    ),
  }));

  return {
    options,
  };
}

function buildDefaultHotels(trip) {
  const perNightBudget = Math.max(1, Math.round(trip.budget * 0.28));
  const starNames = ['Boutique Stay', 'Comfort Resort', 'City Hotel'];

  return [
    {
      name: `${trip.toPlace} ${starNames[0]}`,
      rating: 4.7,
      location: `Central ${trip.toPlace}`,
      amenities: ['WiFi', 'Breakfast', 'AC', 'Housekeeping'],
      highlights: ['Central access', 'Comfort-first service', 'Good for short stays'],
      pricePerNight: Math.round(perNightBudget * 0.85),
      stars: 4,
      roomTypes: [{ type: 'Standard Room', pricePerNight: Math.round(perNightBudget * 0.85) }],
      facilities: ['Front desk', 'Room service', 'Laundry'],
      checkIn: '2:00 PM',
      checkOut: '11:00 AM',
    },
    {
      name: `${trip.toPlace} ${starNames[1]}`,
      rating: 4.5,
      location: `Near ${trip.toPlace} attractions`,
      amenities: ['Pool', 'WiFi', 'Breakfast', 'Restaurant'],
      highlights: ['Better for leisure', 'Easy access to attractions', 'Balanced pricing'],
      pricePerNight: perNightBudget,
      stars: 4,
      roomTypes: [{ type: 'Deluxe Room', pricePerNight: perNightBudget }],
      facilities: ['Restaurant', 'Pool', 'Concierge'],
      checkIn: '2:00 PM',
      checkOut: '12:00 PM',
    },
    {
      name: `${trip.toPlace} ${starNames[2]}`,
      rating: 4.2,
      location: `Main market area of ${trip.toPlace}`,
      amenities: ['WiFi', 'AC', 'Breakfast'],
      highlights: ['Budget-conscious', 'Convenient location', 'Simple and clean'],
      pricePerNight: Math.round(perNightBudget * 0.7),
      stars: 3,
      roomTypes: [{ type: 'Compact Room', pricePerNight: Math.round(perNightBudget * 0.7) }],
      facilities: ['Front desk', 'Laundry'],
      checkIn: '3:00 PM',
      checkOut: '11:00 AM',
    },
  ];
}

function normalizePlaces(rawPlaces, trip) {
  const sourcePlaces = rawPlaces && typeof rawPlaces === 'object' ? rawPlaces : {};
  const rawCategories = Array.isArray(sourcePlaces.categories) ? sourcePlaces.categories : Array.isArray(sourcePlaces.topAttractions) ? groupFlatPlaces(sourcePlaces.topAttractions) : [];
  const fallbackCategories = buildDefaultPlaces(trip);

  const categories = (rawCategories.length > 0 ? rawCategories : fallbackCategories).map((category, categoryIndex) => ({
    name: toText(category.name, fallbackCategories[categoryIndex]?.name || FALLBACK_CATEGORIES[categoryIndex] || 'Attractions'),
    places: (Array.isArray(category.places) ? category.places : []).map((place, placeIndex) => ({
      name: toText(place.name, `Place ${placeIndex + 1}`),
      type: toText(place.type || place.category, 'Attraction'),
      description: toText(place.description, 'Recommended stop'),
      timeRequired: toText(place.timeRequired, '2-3 hours'),
      entryFee: toText(place.entryFee, 'Free'),
      rating: clampRating(place.rating, 4.5),
      distance: toText(place.distance, `Near ${trip.toPlace}`),
      openingHours: toText(place.openingHours, 'Open all day'),
      bestFor: toStringArray(place.bestFor, ['Sightseeing']),
      link: buildWorkingMapLink(
        place.link || place.googleMapsUrl || place.website || place.url,
        `${toText(place.name, `Place ${placeIndex + 1}`)} ${trip.toPlace} attraction`,
        trip.toPlace
      ),
    })),
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

function buildDefaultPlaces(trip) {
  return [
    {
      name: `${trip.toPlace} Waterfront Walk`,
      places: [
        {
          name: `${trip.toPlace} Waterfront Walk`,
          type: 'Scenic Spot',
          description: `A relaxed route to start exploring ${trip.toPlace}.`,
          timeRequired: '2-3 hours',
          entryFee: 'Free',
          rating: 4.6,
          distance: `Central ${trip.toPlace}`,
          openingHours: 'Open all day',
          bestFor: ['Walks', 'Sunset views'],
        },
        {
          name: `${trip.toPlace} Local Market`,
          type: 'Market',
          description: `Browse souvenirs and snacks in ${trip.toPlace}.`,
          timeRequired: '1-2 hours',
          entryFee: 'Free',
          rating: 4.4,
          distance: `Market area in ${trip.toPlace}`,
          openingHours: '10:00 AM - 08:00 PM',
          bestFor: ['Shopping', 'Street food'],
        },
      ],
    },
    {
      name: 'Heritage and History',
      places: [
        {
          name: `${trip.toPlace} Heritage Quarter`,
          type: 'Heritage',
          description: `A compact heritage walk through the older part of ${trip.toPlace}.`,
          timeRequired: '2-3 hours',
          entryFee: 'Free',
          rating: 4.5,
          distance: `Historic center of ${trip.toPlace}`,
          openingHours: '09:00 AM - 05:00 PM',
          bestFor: ['History', 'Photography'],
        },
        {
          name: `${trip.toPlace} Cultural Museum`,
          type: 'Museum',
          description: `Learn the local story and context of ${trip.toPlace}.`,
          timeRequired: '1-2 hours',
          entryFee: '₹100',
          rating: 4.3,
          distance: `Near city center`,
          openingHours: '10:00 AM - 06:00 PM',
          bestFor: ['Museums', 'Family visits'],
        },
      ],
    },
    {
      name: 'Food and Leisure',
      places: [
        {
          name: `${trip.toPlace} Sunset Point`,
          type: 'Viewpoint',
          description: `A pleasant stop for sunsets and a light evening outing.`,
          timeRequired: '1-2 hours',
          entryFee: 'Free',
          rating: 4.7,
          distance: `Short ride from central ${trip.toPlace}`,
          openingHours: 'Late afternoon - evening',
          bestFor: ['Sunset', 'Photography', 'Relaxing evening'],
        },
        {
          name: `${trip.toPlace} Food Street`,
          type: 'Food Street',
          description: `Try regional snacks and simple meals across ${trip.toPlace}.`,
          timeRequired: '2 hours',
          entryFee: 'Free',
          rating: 4.5,
          distance: `Popular food lane in ${trip.toPlace}`,
          openingHours: '06:00 PM - 11:00 PM',
          bestFor: ['Street food', 'Evening walks'],
        },
      ],
    },
  ];
}

function normalizeFood(rawFood, trip) {
  const sourceFood = rawFood && typeof rawFood === 'object' ? rawFood : {};
  const rawRestaurants = Array.isArray(sourceFood.restaurants) ? sourceFood.restaurants : Array.isArray(sourceFood.topRestaurants) ? sourceFood.topRestaurants : [];
  const rawSpecialties = Array.isArray(sourceFood.localSpecialties) ? sourceFood.localSpecialties : [];
  const rawStreetFood = Array.isArray(sourceFood.streetFood) ? sourceFood.streetFood : [];
  const fallbackRestaurants = buildDefaultRestaurants(trip);
  const fallbackSpecialties = buildDefaultSpecialties(trip);
  const fallbackStreetFood = buildDefaultStreetFood(trip);

  return {
    restaurants: (rawRestaurants.length > 0 ? rawRestaurants : fallbackRestaurants).map((restaurant, index) => ({
      name: toText(restaurant.name, fallbackRestaurants[index]?.name || `Restaurant ${index + 1}`),
      cuisine: toText(restaurant.cuisine, fallbackRestaurants[index]?.cuisine || 'Local cuisine'),
      area: toText(restaurant.area || restaurant.location, fallbackRestaurants[index]?.area || trip.toPlace),
      specialties: toStringArray(restaurant.specialties || restaurant.dishes, fallbackRestaurants[index]?.specialties || []),
      vibe: toText(restaurant.vibe || restaurant.ambiance, fallbackRestaurants[index]?.vibe || 'Casual'),
      avgCost: toNumber(restaurant.avgCost || restaurant.costForTravelers || restaurant.price, fallbackRestaurants[index]?.avgCost || Math.max(1, Math.round(trip.budget * 0.08))),
      rating: clampRating(restaurant.rating, fallbackRestaurants[index]?.rating || 4.5),
      description: toText(restaurant.description || restaurant.speciality, fallbackRestaurants[index]?.description || 'Recommended restaurant'),
      bestFor: toText(restaurant.bestFor, fallbackRestaurants[index]?.bestFor || 'Lunch or dinner'),
      timings: toText(restaurant.timings || restaurant.timing, fallbackRestaurants[index]?.timings || '10:00 AM - 10:00 PM'),
      bookingRequired: Boolean(restaurant.bookingRequired),
      link: buildWorkingMapLink(
        restaurant.link || restaurant.googleMapsUrl || restaurant.website || restaurant.url,
        `${toText(restaurant.name, fallbackRestaurants[index]?.name || `Restaurant ${index + 1}`)} ${trip.toPlace} restaurant`,
        trip.toPlace
      ),
    })),
    localSpecialties: (rawSpecialties.length > 0 ? rawSpecialties : fallbackSpecialties).map((specialty, index) => ({
      name: toText(specialty.name, fallbackSpecialties[index]?.name || `Specialty ${index + 1}`),
      description: toText(specialty.description, fallbackSpecialties[index]?.description || 'Local specialty'),
      whereToFind: toText(specialty.whereToFind || specialty.whereToTry, fallbackSpecialties[index]?.whereToFind || trip.toPlace),
      price: toText(specialty.price, fallbackSpecialties[index]?.price || '₹200-400'),
      mustTry: specialty.mustTry !== false,
      bestTime: toText(specialty.bestTime, fallbackSpecialties[index]?.bestTime || 'Anytime'),
      link: buildWorkingMapLink(
        specialty.link || specialty.url,
        `${toText(specialty.name, fallbackSpecialties[index]?.name || `Specialty ${index + 1}`)} ${trip.toPlace}`,
        trip.toPlace
      ),
    })),
    streetFood: (rawStreetFood.length > 0 ? rawStreetFood : fallbackStreetFood).map((item, index) => ({
      name: toText(item.name, fallbackStreetFood[index]?.name || `Street food ${index + 1}`),
      price: toText(item.price, fallbackStreetFood[index]?.price || '₹100-200'),
      location: toText(item.location, fallbackStreetFood[index]?.location || trip.toPlace),
      link: buildWorkingMapLink(
        item.link || item.url,
        `${toText(item.name, fallbackStreetFood[index]?.name || `Street food ${index + 1}`)} ${trip.toPlace}`,
        trip.toPlace
      ),
    })),
  };
}

function buildDefaultRestaurants(trip) {
  return FALLBACK_RESTAURANT_NAMES.map((name, index) => ({
    name: `${trip.toPlace} ${name}`,
    cuisine: index === 0 ? 'Local cuisine' : index === 1 ? 'Seafood' : index === 2 ? 'Continental' : 'Cafe',
    area: `Popular area in ${trip.toPlace}`,
    specialties: ['Chef recommendation', 'Seasonal dish', 'Signature item'],
    vibe: index === 2 ? 'Relaxed' : 'Casual',
    avgCost: Math.max(1, Math.round(trip.budget * (0.07 + index * 0.01))),
    rating: 4.4 + index * 0.1,
    description: `A reliable dining option in ${trip.toPlace}.`,
    bestFor: index === 0 ? 'Dinner' : 'Lunch',
    timings: '10:00 AM - 10:00 PM',
  }));
}

function buildDefaultSpecialties(trip) {
  return [
    {
      name: `${trip.toPlace} Thali`,
      description: `A complete local meal showcasing ${trip.toPlace}'s flavors.`,
      whereToFind: `Popular restaurants in ${trip.toPlace}`,
      price: '₹250-450',
      bestTime: 'Lunch',
    },
    {
      name: 'Fresh Local Catch',
      description: `Freshly cooked seafood inspired by the destination cuisine.`,
      whereToFind: `Coastal restaurants and shacks`,
      price: '₹300-600',
      bestTime: 'Dinner',
    },
    {
      name: 'Regional Dessert',
      description: `A sweet finish from the region.`,
      whereToFind: `Dessert shops and heritage cafes`,
      price: '₹100-250',
      bestTime: 'Evening',
    },
  ];
}

function buildDefaultStreetFood(trip) {
  return [
    {
      name: `${trip.toPlace} Snack Roll`,
      price: '₹50-100',
      location: `Street vendors in ${trip.toPlace}`,
    },
    {
      name: 'Spiced Fritters',
      price: '₹80-150',
      location: `Evening markets in ${trip.toPlace}`,
    },
    {
      name: 'Local Chaat',
      price: '₹60-120',
      location: `Food lanes across ${trip.toPlace}`,
    },
  ];
}

function normalizeWeather(rawWeather, trip) {
  const sourceWeather = rawWeather && typeof rawWeather === 'object' ? rawWeather : {};
  const rawForecast = Array.isArray(sourceWeather.forecast) ? sourceWeather.forecast : [];
  const fallbackForecast = buildDefaultForecast(trip);

  return {
    weatherInfo: sourceWeather.weatherInfo || sourceWeather.current || {
      temp: 31,
      condition: 'Warm and pleasant',
      humidity: 68,
      windSpeed: 12,
    },
    forecast: (rawForecast.length > 0 ? rawForecast : fallbackForecast).slice(0, trip.days).map((day, index) => ({
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

function buildDefaultForecast(trip) {
  return Array.from({ length: trip.days }, (_, index) => ({
    day: `Day ${index + 1}`,
    high: 31 + (index % 3),
    low: 24 + (index % 2),
    condition: index % 2 === 0 ? 'Sunny' : 'Partly Cloudy',
    humidity: 68 + (index % 4),
    seaCondition: 'Calm',
    uvIndex: '8',
    recommendation: `A comfortable day in ${trip.toPlace}.`,
  }));
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

function mergeGooglePlacesIntoPackage(rawPackage, referenceData) {
  if (!referenceData) {
    return rawPackage;
  }

  const places = referenceData.places && Array.isArray(referenceData.places.categories) && referenceData.places.categories.length > 0
    ? referenceData.places
    : rawPackage.places;

  const referenceFood = referenceData.food || {};
  const rawFood = rawPackage.food || {};

  const restaurants = Array.isArray(referenceFood.restaurants) && referenceFood.restaurants.length > 0
    ? referenceFood.restaurants
    : rawFood.restaurants;
  const localSpecialties = Array.isArray(referenceFood.localSpecialties) && referenceFood.localSpecialties.length > 0
    ? referenceFood.localSpecialties
    : rawFood.localSpecialties;
  const streetFood = Array.isArray(referenceFood.streetFood) && referenceFood.streetFood.length > 0
    ? referenceFood.streetFood
    : rawFood.streetFood;

  return {
    ...rawPackage,
    places,
    food: {
      ...rawFood,
      ...referenceFood,
      restaurants,
      localSpecialties,
      streetFood,
    },
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
  const now = Date.now();
  const cached = packageCache.get(cacheKey);

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (inflightPackages.has(cacheKey)) {
    return inflightPackages.get(cacheKey);
  }

  const requestPromise = (async () => {
    const config = resolveCloudConfig();
    
    // Spawn parallel deep research subagents
    const researchResults = await runDeepResearchSubagents(trip, sessionId);

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', 'Gathering deep research summaries from subagents...', 'searching');
    }

    const referenceData = await buildTravelReferenceData(trip, provider);
    const budgetPrompt = buildBudgetAllocationPrompt(referenceData, trip);
    const referencePrompt = buildTravelReferencePrompt(referenceData, trip);

    // Inject deep research summaries into Main Agent prompt context
    const subagentResearchPrompt = `
    
Subagent Deep Research Syntheses:
The specialized Accommodation, Transit, Gastronomy, and Places subagents have researched official websites, maps, schedules, and forms.
You MUST strictly incorporate the chosen options below in the final package JSON:

1. Hotels Options (Accommodation Subagent selection):
${JSON.stringify(researchResults.accommodation.options, null, 2)}

2. Travel Options (Transit Subagent selection):
${JSON.stringify(researchResults.transit.options, null, 2)}

3. Food Options (Gastronomy Subagent selection):
${JSON.stringify(researchResults.food.food, null, 2)}

4. Sights Categories (Places Subagent selection):
${JSON.stringify(researchResults.places.places, null, 2)}
`;

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', 'Synthesizing local routes and day-by-day travel map...', 'searching');
    }

    const rawPackage = await chatJson({
      system: TRAVEL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${buildTravelPackagePrompt(trip)}${budgetPrompt}${referencePrompt}${subagentResearchPrompt}`,
        },
      ],
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      think: false,
      options: {
        temperature: 1.0,
        top_p: 0.95,
        top_k: 64,
      },
      keepAlive: '15m',
    });

    const enrichedRawPackage = mergeGooglePlacesIntoPackage(rawPackage, referenceData);
    


    const packageData = normalizeTravelPackage(enrichedRawPackage, trip);
    let routeInsights = {
      enabled: false,
      summary: `Distance insights are unavailable for ${trip.toPlace} right now.`,
      localTransport: { bus: 0, auto: 0, taxi: 0 },
      nearbyRestaurants: [],
      nearbyAttractions: [],
    };

    try {
      routeInsights = await buildRouteInsights(referenceData, rawPackage, trip);
    } catch (error) {
      console.warn(`[TravelPlanner] Route insight build failed for ${trip.toPlace}: ${error.message}`);
    }

    // Dynamic budget splits reconciliation
    reconcileBudgetSplits(packageData, trip, routeInsights);

    packageData.meta = {
      budgetAllocation: packageData.budget,
      referenceProvider: referenceData?.primaryProvider || provider,
      referenceSources: {
        primary: referenceData?.primaryProvider || null,
        secondary: referenceData?.secondaryProvider || null,
      },
      openStreetMap: referenceData?.openStreetMap || {
        enabled: false,
        destination: trip.toPlace,
        displayName: '',
        name: '',
        lat: null,
        lon: null,
        zoom: 13,
        searchUrl: buildOpenStreetMapSearchUrl(trip.toPlace || 'OpenStreetMap'),
        mapUrl: buildOpenStreetMapSearchUrl(trip.toPlace || 'OpenStreetMap'),
        embedUrl: '',
        summary: '',
      },
      googlePlaces: referenceData?.googlePlaces || {
        enabled: false,
        destination: trip.toPlace,
        restaurants: 0,
        attractions: 0,
        summary: '',
      },
      olaPlaces: referenceData?.olaPlaces || {
        enabled: false,
        destination: trip.toPlace,
        restaurants: 0,
        attractions: 0,
        summary: '',
      },
      routeInsights,
      researchArtifacts: researchResults.artifacts,
      model: config.model,
      generatedAt: packageData.generatedAt,
    };

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', 'Polishing final budget splits and writing dashboard data...', 'complete');
    }

    packageCache.set(cacheKey, {
      timestamp: Date.now(),
      data: packageData,
    });
    return packageData;
  })()
    .finally(() => {
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
