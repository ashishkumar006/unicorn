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

function clampRating(value, fallback = 4.4) {
  const rating = toNumber(value, fallback);
  return Math.max(1, Math.min(5, Number(rating.toFixed(1))));
}

function getGooglePlacesConfig() {
  const apiKey = String(
    process.env.TRAVEL_GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.TRAVEL_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();

  const language = String(
    process.env.TRAVEL_GOOGLE_PLACES_LANGUAGE ||
    process.env.GOOGLE_PLACES_LANGUAGE ||
    'en'
  ).trim() || 'en';

  const region = String(
    process.env.TRAVEL_GOOGLE_PLACES_REGION ||
    process.env.GOOGLE_PLACES_REGION ||
    'in'
  ).trim() || 'in';

  return {
    apiKey,
    language,
    region,
    enabled: Boolean(apiKey),
  };
}

function isGooglePlacesConfigured(config = getGooglePlacesConfig()) {
  return Boolean(config && config.enabled && config.apiKey);
}

function buildGoogleMapsUrl(place = {}) {
  const placeId = toText(place.placeId || place.place_id, '');
  const name = toText(place.name, '');
  const params = new URLSearchParams({ api: '1' });

  if (placeId) {
    params.set('query', `place_id:${placeId}`);
    params.set('query_place_id', placeId);
  } else if (name) {
    params.set('query', name);
  }

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function buildDuckDuckGoSearchUrl(query) {
  const normalizedQuery = toText(query, '').trim();
  if (!normalizedQuery) {
    return '';
  }

  return `https://duckduckgo.com/?q=${encodeURIComponent(normalizedQuery)}`;
}

function normalizeTypes(types) {
  return Array.isArray(types)
    ? types.map((type) => toText(type, '')).filter(Boolean)
    : [];
}

function removeGenericTypes(types) {
  return normalizeTypes(types).filter((type) => !['point_of_interest', 'establishment'].includes(type));
}

function priceLevelToCost(priceLevel, fallback = 600) {
  switch (Number(priceLevel)) {
    case 0:
      return 250;
    case 1:
      return 450;
    case 2:
      return 800;
    case 3:
      return 1500;
    case 4:
      return 2500;
    default:
      return fallback;
  }
}

function deriveRestaurantCuisine(place) {
  const name = toText(place.name, '').toLowerCase();
  const types = removeGenericTypes(place.types).join(' ').toLowerCase();

  if (/vegetarian|veg|pure veg/.test(name) || /vegetarian|veg/.test(types)) {
    return 'Vegetarian';
  }

  if (/cafe/.test(types) || /cafe/.test(name)) {
    return 'Cafe';
  }

  if (/bakery/.test(types) || /bakery/.test(name)) {
    return 'Bakery';
  }

  if (/bar|pub|night_club/.test(types)) {
    return 'Bar and Pub';
  }

  if (/meal_takeaway|fast_food/.test(types)) {
    return 'Quick Bites';
  }

  return 'Local cuisine';
}

function deriveRestaurantVibe(place) {
  const types = removeGenericTypes(place.types);

  if (types.includes('cafe') || types.includes('bakery')) {
    return 'Casual';
  }

  if (types.includes('bar') || types.includes('night_club')) {
    return 'Evening';
  }

  if (types.includes('meal_takeaway') || types.includes('fast_food')) {
    return 'Quick';
  }

  return 'Casual';
}

function deriveRestaurantBestFor(place) {
  const types = removeGenericTypes(place.types);

  if (types.includes('cafe') || types.includes('bakery')) {
    return 'Breakfast or coffee';
  }

  if (types.includes('bar') || types.includes('night_club')) {
    return 'Dinner and evening drinks';
  }

  if (types.includes('meal_takeaway') || types.includes('fast_food')) {
    return 'Quick lunch';
  }

  return 'Lunch or dinner';
}

function isLikelyVegetarian(place) {
  const text = [place.name, place.formattedAddress, ...(place.types || [])].join(' ').toLowerCase();
  return /vegetarian|veg|pure veg|vegan/.test(text);
}

function deriveAttractionType(place) {
  const types = removeGenericTypes(place.types);

  if (types.includes('museum')) {
    return 'Museum';
  }

  if (types.includes('park')) {
    return 'Park';
  }

  if (types.includes('tourist_attraction')) {
    return 'Attraction';
  }

  if (types.includes('beach')) {
    return 'Beach';
  }

  if (types.includes('church') || types.includes('hindu_temple') || types.includes('mosque')) {
    return 'Religious Site';
  }

  if (types.includes('shopping_mall') || types.includes('market')) {
    return 'Market';
  }

  return 'Attraction';
}

function deriveAttractionBestFor(place) {
  const types = removeGenericTypes(place.types);

  if (types.includes('museum')) {
    return ['History', 'Culture'];
  }

  if (types.includes('park') || types.includes('beach')) {
    return ['Relaxation', 'Photography'];
  }

  if (types.includes('shopping_mall') || types.includes('market')) {
    return ['Shopping', 'Street food'];
  }

  if (types.includes('church') || types.includes('hindu_temple') || types.includes('mosque')) {
    return ['Culture', 'Architecture'];
  }

  return ['Sightseeing'];
}

function getOpeningHoursText(place) {
  if (place.openingHours && place.openingHours.open_now === true) {
    return 'Open now';
  }

  if (place.openingHours && place.openingHours.open_now === false) {
    return 'Check live hours';
  }

  return 'Check live hours';
}

function mapGoogleRestaurant(place, destination, index) {
  const rating = clampRating(place.rating, 4.4);

  return {
    id: `google-restaurant-${index + 1}`,
    placeId: place.placeId,
    name: toText(place.name, `Restaurant ${index + 1}`),
    cuisine: deriveRestaurantCuisine(place),
    rating,
    reviews: Math.max(0, Math.round(toNumber(place.userRatingsTotal, 0))),
    avg_cost: priceLevelToCost(place.priceLevel, Math.round(600 + (index * 150))),
    location: toText(place.formattedAddress, destination),
    serves: 'Lunch, Dinner',
    speciality: deriveRestaurantCuisine(place),
    veg_options: isLikelyVegetarian(place),
    vegetarian_friendly: isLikelyVegetarian(place),
    ambiance: deriveRestaurantVibe(place),
    source: 'Google Places',
    link: buildGoogleMapsUrl(place),
    googleMapsUrl: buildGoogleMapsUrl(place),
    website: toText(place.website, ''),
    openingHours: getOpeningHoursText(place),
    coordinates: place.geometry || null,
  };
}

function mapGoogleAttraction(place, destination, index) {
  const rating = clampRating(place.rating, 4.4);

  return {
    id: `google-attraction-${index + 1}`,
    placeId: place.placeId,
    name: toText(place.name, `Place ${index + 1}`),
    type: deriveAttractionType(place),
    description: toText(place.formattedAddress, `Popular stop in ${destination}`),
    location: toText(place.formattedAddress, destination),
    rating,
    reviews: Math.max(0, Math.round(toNumber(place.userRatingsTotal, 0))),
    entry_fee: Number.isFinite(place.priceLevel)
      ? `Price level ${place.priceLevel}`
      : 'Check locally',
    best_time: '09:00 AM - 06:00 PM',
    duration: '1-2 hours',
    distance_from_city: toText(place.formattedAddress, `Near ${destination}`),
    source: 'Google Places',
    link: buildGoogleMapsUrl(place),
    googleMapsUrl: buildGoogleMapsUrl(place),
    website: toText(place.website, ''),
    openingHours: getOpeningHoursText(place),
    bestFor: deriveAttractionBestFor(place),
    coordinates: place.geometry || null,
  };
}

async function searchGooglePlaces(query, limit = 10, config = getGooglePlacesConfig()) {
  if (!isGooglePlacesConfigured(config)) {
    return [];
  }

  const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
    params: {
      query,
      key: config.apiKey,
      language: config.language,
      region: config.region,
    },
    timeout: 12000,
  });

  const status = toText(response.data?.status, '');

  if (status && status !== 'OK' && status !== 'ZERO_RESULTS') {
    const errorMessage = toText(response.data?.error_message, status);
    throw new Error(`Google Places search failed: ${errorMessage}`);
  }

  const results = Array.isArray(response.data?.results) ? response.data.results : [];

  return results.slice(0, limit).map((place, index) => ({
    placeId: toText(place.place_id, `google-place-${index + 1}`),
    name: toText(place.name, `Place ${index + 1}`),
    formattedAddress: toText(place.formatted_address, ''),
    rating: place.rating != null ? clampRating(place.rating, 4.4) : null,
    userRatingsTotal: Math.max(0, Math.round(toNumber(place.user_ratings_total, 0))),
    priceLevel: Number.isFinite(place.price_level) ? place.price_level : null,
    types: normalizeTypes(place.types),
    openingHours: place.opening_hours && typeof place.opening_hours === 'object'
      ? {
        open_now: place.opening_hours.open_now,
      }
      : null,
    geometry: place.geometry && place.geometry.location
      ? {
        lat: toNumber(place.geometry.location.lat, 0),
        lng: toNumber(place.geometry.location.lng, 0),
      }
      : null,
    businessStatus: toText(place.business_status, ''),
    source: 'Google Places',
    website: toText(place.website, ''),
    mapsUrl: buildGoogleMapsUrl(place),
  }));
}

async function searchGooglePlacesMultiple(queries, limit = 10, config = getGooglePlacesConfig()) {
  const queryList = (Array.isArray(queries) ? queries : [queries])
    .map((query) => toText(query, ''))
    .filter(Boolean);

  if (queryList.length === 0) {
    return [];
  }

  const resultGroups = await Promise.all(
    queryList.map(async (query) => {
      try {
        return await searchGooglePlaces(query, limit, config);
      } catch (error) {
        console.warn(`[GooglePlaces] Query failed for "${query}": ${error.message}`);
        return [];
      }
    })
  );

  const deduped = [];
  const seen = new Set();

  for (const group of resultGroups) {
    for (const place of group) {
      const key = place.placeId || `${place.name}|${place.formattedAddress}`.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(place);

      if (deduped.length >= limit) {
        return deduped;
      }
    }
  }

  return deduped;
}

async function getGoogleRestaurants(destination, limit = 8, config = getGooglePlacesConfig()) {
  if (!destination || !isGooglePlacesConfigured(config)) {
    return [];
  }

  const queries = [
    `restaurants in ${destination}`,
    `best restaurants in ${destination}`,
  ];

  const results = await searchGooglePlacesMultiple(queries, limit, config);
  return results.map((place, index) => mapGoogleRestaurant(place, destination, index));
}

async function getGoogleAttractions(destination, limit = 8, config = getGooglePlacesConfig()) {
  if (!destination || !isGooglePlacesConfigured(config)) {
    return [];
  }

  const queries = [
    `tourist attractions in ${destination}`,
    `things to do in ${destination}`,
  ];

  const results = await searchGooglePlacesMultiple(queries, limit, config);
  return results.map((place, index) => mapGoogleAttraction(place, destination, index));
}

function buildPlacesCategoriesFromAttractions(attractions, trip = {}) {
  const destination = toText(trip.toPlace, 'the destination');
  const sourceAttractions = Array.isArray(attractions) ? attractions : [];

  if (sourceAttractions.length === 0) {
    return [];
  }

  const categories = [
    { name: 'Beaches and Waterfronts', places: [] },
    { name: 'Heritage and Culture', places: [] },
    { name: 'Food and Markets', places: [] },
  ];

  sourceAttractions.slice(0, 9).forEach((place, index) => {
    const typeText = [place.type, place.name, place.description, place.location].join(' ').toLowerCase();
    let categoryIndex = index % categories.length;

    if (/beach|water|lake|river|view|sunset|park|garden|nature|scenic/.test(typeText)) {
      categoryIndex = 0;
    } else if (/museum|temple|church|mosque|fort|palace|heritage|historic|monument|gallery/.test(typeText)) {
      categoryIndex = 1;
    } else if (/market|restaurant|cafe|food|mall|shopping|night|bar/.test(typeText)) {
      categoryIndex = 2;
    }

    categories[categoryIndex].places.push({
      name: place.name,
      type: place.type || 'Attraction',
      description: place.description || `Recommended stop in ${destination}`,
      timeRequired: place.duration || '1-2 hours',
      entryFee: place.entry_fee || 'Check locally',
      rating: clampRating(place.rating, 4.4),
      distance: place.distance_from_city || place.location || `Near ${destination}`,
      openingHours: place.openingHours || place.best_time || 'Check live hours',
      bestFor: Array.isArray(place.bestFor) && place.bestFor.length > 0 ? place.bestFor : ['Sightseeing'],
      googleMapsUrl: place.googleMapsUrl || '',
      source: place.source || 'Google Places',
    });
  });

  return categories.filter((category) => category.places.length > 0);
}

function buildFoodSectionsFromRestaurants(restaurants, trip = {}) {
  const destination = toText(trip.toPlace, 'the destination');
  const sourceRestaurants = Array.isArray(restaurants) ? restaurants : [];

  if (sourceRestaurants.length === 0) {
    return {
      restaurants: [],
      localSpecialties: [],
      streetFood: [],
    };
  }

  const mappedRestaurants = sourceRestaurants.slice(0, 6).map((restaurant, index) => ({
    name: restaurant.name,
    cuisine: restaurant.cuisine || 'Local cuisine',
    area: restaurant.location || `Popular area in ${destination}`,
    specialties: [restaurant.speciality || restaurant.cuisine || 'Signature dish'],
    vibe: restaurant.ambiance || 'Casual',
    avgCost: toNumber(restaurant.avg_cost, 600),
    rating: clampRating(restaurant.rating, 4.4),
    description: restaurant.speciality || `Recommended dining option near ${destination}`,
    bestFor: restaurant.serves || (index === 0 ? 'Lunch' : 'Dinner'),
    timings: restaurant.openingHours || 'Check live hours',
    bookingRequired: false,
    googleMapsUrl: restaurant.googleMapsUrl || '',
    source: restaurant.source || 'Google Places',
  }));

  const localSpecialties = mappedRestaurants.slice(0, 3).map((restaurant, index) => ({
    name: `${restaurant.name} signature`,
    description: restaurant.description,
    whereToFind: restaurant.area,
    price: `Around ₹${Math.max(1, Math.round(restaurant.avgCost || 600)).toLocaleString('en-IN')}`,
    mustTry: true,
    bestTime: index === 0 ? 'Lunch' : 'Dinner',
  }));

  return {
    restaurants: mappedRestaurants,
    localSpecialties,
    streetFood: [],
  };
}

function buildGoogleTravelReferencePrompt(referenceData, trip = {}) {
  if (!referenceData) {
    return '';
  }

  const destination = toText(trip.toPlace, 'the destination');
  const restaurantLines = (referenceData.restaurants || [])
    .slice(0, 5)
    .map((restaurant, index) => `${index + 1}. ${restaurant.name} (${restaurant.cuisine || 'Local cuisine'}, ${restaurant.rating}/5, ${restaurant.area || destination})`);
  const attractionLines = (referenceData.attractions || [])
    .slice(0, 5)
    .map((place, index) => `${index + 1}. ${place.name} (${place.type || 'Attraction'}, ${place.rating}/5, ${place.location || destination})`);

  return `

Verified Google Places reference data for ${destination}:
Restaurants:
${restaurantLines.length > 0 ? restaurantLines.join('\n') : 'None found.'}

Attractions:
${attractionLines.length > 0 ? attractionLines.join('\n') : 'None found.'}

Use these real names where they fit the trip plan, and keep the final package realistic and budget aware.
`;
}

async function buildGoogleTravelReferenceData(trip = {}) {
  const config = getGooglePlacesConfig();
  if (!isGooglePlacesConfigured(config)) {
    return null;
  }

  const destination = toText(trip.toPlace, '').trim();
  if (!destination) {
    return null;
  }

  try {
    const [restaurants, attractions] = await Promise.all([
      getGoogleRestaurants(destination, 6, config),
      getGoogleAttractions(destination, 9, config),
    ]);

    return {
      enabled: true,
      restaurants,
      attractions,
      places: {
        categories: buildPlacesCategoriesFromAttractions(attractions, trip),
      },
      food: buildFoodSectionsFromRestaurants(restaurants, trip),
      summary: `Google Places found ${restaurants.length} restaurants and ${attractions.length} attractions in ${destination}.`,
    };
  } catch (error) {
    console.warn(`[GooglePlaces] Reference data failed for ${destination}: ${error.message}`);
    return null;
  }
}

module.exports = {
  getGooglePlacesConfig,
  isGooglePlacesConfigured,
  searchGooglePlaces,
  searchGooglePlacesMultiple,
  getGoogleRestaurants,
  getGoogleAttractions,
  buildPlacesCategoriesFromAttractions,
  buildFoodSectionsFromRestaurants,
  buildGoogleTravelReferencePrompt,
  buildGoogleTravelReferenceData,
  buildGoogleMapsUrl,
  buildDuckDuckGoSearchUrl,
};