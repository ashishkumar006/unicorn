/**
 * DATA FUSION LAYER
 *
 * Additive helpers that normalize, dedupe, and shape data across providers.
 * Adds new behavior without changing existing route behavior.
 */

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
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    if (cleaned === '' || cleaned === '-') {
      return fallback;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toInteger(value, fallback = 0) {
  const parsed = Math.round(toNumber(value, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
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

function clampRating(value, fallback = 4.5) {
  const rating = toNumber(value, fallback);
  return Math.max(1, Math.min(5, Number(rating.toFixed(1))));
}

function normalizeKey(value = '') {
  return toText(value, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function makeId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function normalizePlaceEntry(entry = {}, context = {}, prefix = 'place') {
  const name = toText(entry.name || entry.title || '', `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${context.index + 1}`);
  const description = toText(entry.description || entry.summary || entry.type || '', '');
  const rating = clampRating(entry.rating || entry.googleRating || entry.olaRating, 4.5);
  const reviews = Math.max(0, Math.round(toNumber(entry.reviews || entry.userRatingsTotal || entry.reviewCount, 0)));
  const location = toText(entry.location || entry.area || entry.vicinity || `Near ${context.destination}`, context.destination);
  const source = toText(entry.source || context.defaultSource || 'unknown');
  const link = toText(entry.link || entry.googleMapsUrl || entry.website || entry.url || entry.olaMapsUrl || '', '');
  const openStreetMapUrl = toText(entry.openStreetMapUrl || entry.mapUrl || '', '');
  const coordinates = entry.coordinates || entry.geometry || entry.position || null;

  const base = {
    id: toText(entry.id, makeId(prefix, context.index)),
    name,
    description,
    rating,
    reviews,
    location,
    area: location,
    source,
    link,
    openStreetMapUrl,
    coordinates,
  };

  if (prefix === 'restaurant') {
    return {
      ...base,
      cuisine: toText(entry.cuisine || entry.primaryCuisine || 'Local cuisine', 'Local cuisine'),
      avgCost: toNumber(entry.avgCost || entry.priceLevel || entry.priceForTwo || 0, 0),
      avg_cost: toNumber(entry.avgCost || entry.priceLevel || entry.priceForTwo || 0, 0),
      speciality: toText(entry.speciality || entry.specialties || entry.cuisine || 'Local cuisine', 'Local cuisine'),
      specialties: toStringArray(entry.specialties || entry.dishes || []),
      vibe: toText(entry.vibe || entry.ambiance || '', 'Casual'),
      ambiance: toText(entry.ambiance || entry.vibe || '', 'Casual'),
      bestFor: toText(entry.bestFor || entry.goodFor || '', 'Lunch or dinner'),
      timings: toText(entry.timings || entry.openingHours || 'Check live hours', 'Check live hours'),
      openingHours: toText(entry.openingHours || entry.timings || 'Check live hours', 'Check live hours'),
      veg_options: Boolean(entry.vegOptions || entry.vegetarianOptions || false),
      vegetarian_friendly: Boolean(entry.vegetarianFriendly || entry.vegOptions || false),
      bookingRequired: Boolean(entry.bookingRequired || false),
    };
  }

  if (prefix === 'attraction') {
    return {
      ...base,
      type: toText(entry.type || entry.category || 'Attraction', 'Attraction'),
      entry_fee: toText(entry.entry_fee || entry.entryFee || 'Check locally', 'Check locally'),
      entryFee: toText(entry.entryFee || entry.entry_fee || 'Check locally', 'Check locally'),
      best_time: toText(entry.bestTime || entry.best_time || entry.recommendedTime || '09:00 AM - 06:00 PM', '09:00 AM - 06:00 PM'),
      bestTime: toText(entry.bestTime || entry.best_time || entry.recommendedTime || '09:00 AM - 06:00 PM', '09:00 AM - 06:00 PM'),
      duration: toText(entry.duration || entry.timeRequired || '1-2 hours', '1-2 hours'),
      bestFor: toStringArray(entry.bestFor || entry.goodFor || ['Sightseeing']),
      openingHours: toText(entry.openingHours || entry.timings || 'Check live hours', 'Check live hours'),
    };
  }

  return base;
}

function dedupeByKey(items, keySelector) {
  const seen = new Map();
  const output = [];

  for (const item of items) {
    const key = normalizeKey(keySelector(item));
    if (!key) {
      continue;
    }
    if (!seen.has(key)) {
      seen.set(key, true);
      output.push(item);
    }
  }

  return output;
}

function mergePlaceSets(primary = [], secondary = [], context = {}, kind = 'place') {
  const combined = [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])];
  const unique = dedupeByKey(combined, (item) => item.name || item.title || item.id || '');

  return unique.map((item, index) => normalizePlaceEntry(item, { ...context, index }, kind)).slice(0, context.limit || 12);
}

function buildRestaurantSections(restaurants = [], trip = {}) {
  const destination = toText(trip.toPlace || trip.destination || 'this destination', 'this destination');
  const localSpecialties = [];
  const streetFood = [];

  for (const restaurant of restaurants.slice(0, 6)) {
    const specialty = toText(restaurant.speciality || restaurant.specialties?.[0] || restaurant.cuisine || 'Local favorite');
    const price = toText(restaurant.avgCost ? `₹${restaurant.avgCost.toLocaleString?.('en-IN') || restaurant.avgCost}` : '', '');

    localSpecialties.push({
      name: specialty,
      description: toText(restaurant.description || `Popular option in ${destination}`, `Popular option in ${destination}`),
      whereToFind: restaurant.location || destination,
      price: price || '₹200-400',
      mustTry: true,
      bestTime: 'Anytime',
    });

    if (/street|quick|cheap|budget/i.test(specialty)) {
      streetFood.push({
        name: specialty,
        price: '₹100-200',
        location: restaurant.location || destination,
      });
    }
  }

  return {
    restaurants,
    localSpecialties: localSpecialties.slice(0, 5),
    streetFood: streetFood.slice(0, 5),
  };
}

function normalizeHotelOption(option = {}, index = 0, trip = {}) {
  const name = toText(option.name || option.title || `Stay option ${index + 1}`, `Stay option ${index + 1}`);
  const rating = clampRating(option.rating || option.googleRating || option.olaRating, 4.5);
  const stars = Math.max(1, Math.min(7, toInteger(option.stars || option.starRating || 4, 4)));
  const pricePerNight = toNumber(option.pricePerNight || option.price || option.avgCost || 0, 0);

  return {
    name,
    rating,
    stars,
    location: toText(option.location || option.area || trip.toPlace || 'City center', trip.toPlace || 'City center'),
    amenities: toStringArray(option.amenities || option.facilities || []),
    highlights: toStringArray(option.highlights || []),
    pricePerNight,
    checkIn: toText(option.checkIn || '2:00 PM', '2:00 PM'),
    checkOut: toText(option.checkOut || '11:00 AM', '11:00 AM'),
    link: toText(option.link || option.website || option.googleMapsUrl || '', ''),
    source: toText(option.source || 'unknown', 'unknown'),
  };
}

function normalizeHotels(rawHotels = [], trip = {}) {
  const options = Array.isArray(rawHotels.options) ? rawHotels.options : Array.isArray(rawHotels.topHotels) ? rawHotels.topHotels : [];

  return {
    options: options.map((hotel, index) => normalizeHotelOption(hotel, index, trip)),
  };
}

function normalizeTravelOption(option = {}, index = 0, trip = {}) {
  const type = toText(option.type || option.mode || option.category || 'Travel', 'Travel');
  const provider = toText(option.provider || option.source || option.via || 'Multiple providers', 'Multiple providers');
  const price = toNumber(option.price || option.fare || option.cost || 0, 0);
  const duration = toText(option.duration || option.travelTime || option.journeyTime || '', '');
  const departure = toText(option.departure || option.departureTime || option.departDateTime || '', '');
  const arrival = toText(option.arrival || option.arrivalTime || option.arrivalDateTime || '', '');
  const link = buildWorkingMapLink(option.link || option.website || option.bookingUrl || '', '');

  return {
    id: toText(option.id, `travel-${index + 1}`),
    type,
    provider,
    price,
    duration,
    departure,
    arrival,
    link,
    source: toText(option.source || 'unknown', 'unknown'),
    notes: toText(option.notes || option.description || '', ''),
    bookingUrl: link || toText(option.bookingUrl || option.website || '', ''),
  };
}

function normalizeTravel(rawTravel = [], trip = {}) {
  const options = Array.isArray(rawTravel) ? rawTravel : [];
  return {
    options: options.map((opt, index) => normalizeTravelOption(opt, index, trip)),
  };
}

function applyRatingCaps(items = { restaurants: [], attractions: [] }, maxRating = 4.4) {
  const cappedRestaurants = (Array.isArray(items.restaurants) ? items.restaurants : []).map((item) => ({
    ...item,
    rating: clampRating(item.rating, maxRating),
  }));

  const cappedAttractions = (Array.isArray(items.attractions) ? items.attractions : []).map((item) => ({
    ...item,
    rating: clampRating(item.rating, maxRating),
  }));

  return {
    restaurants: cappedRestaurants,
    attractions: cappedAttractions,
  };
}

function buildWorkingMapLink(link, fallbackQuery) {
  const candidate = toText(link || '', '');

  if (!candidate) {
    return '';
  }

  if (/^(https?:)?\/\//i.test(candidate)) {
    const hostname = new URL(candidate).hostname.toLowerCase();
    if (/maps\.(google|gstatic|olamaps|kratrim|ola)\.|openstreetmap|nominatim\.openstreetmap|kratrim\.ai/i.test(hostname)) {
      return '';
    }
    return candidate;
  }

  return '';
}

function sanitizeReferenceData(referenceData = {}) {
  if (!referenceData || typeof referenceData !== 'object') {
    return {};
  }

  const restaurants = Array.isArray(referenceData.restaurants)
    ? referenceData.restaurants.map((item) => ({ ...item, link: buildWorkingMapLink(item.link), openStreetMapUrl: '' }))
    : [];
  const attractions = Array.isArray(referenceData.attractions)
    ? referenceData.attractions.map((item) => ({ ...item, link: buildWorkingMapLink(item.link), openStreetMapUrl: '' }))
    : [];

  return {
    ...referenceData,
    restaurants,
    attractions,
    places: {
      categories: buildAttractionCategories(attractions, {}),
    },
    food: buildRestaurantSections(restaurants, {}),
  };
}

function mergeReferences(primary = {}, secondary = {}, trip = {}) {
  const restaurants = mergePlaceSets(primary.restaurants || [], secondary.restaurants || [], { destination: trip.toPlace, limit: 6, defaultSource: 'google' }, 'restaurant');
  const attractions = mergePlaceSets(primary.attractions || [], secondary.attractions || [], { destination: trip.toPlace, limit: 9, defaultSource: 'google' }, 'attraction');

  return {
    restaurants,
    attractions,
    places: {
      categories: buildAttractionCategories(attractions, trip),
    },
    food: buildRestaurantSections(restaurants, trip),
  };
}

function scoreCandidate(item, context = {}) {
  const ratingScore = clampRating(item.rating, 4.5) * 20;
  const reviewsScore = Math.min(100, Math.max(0, toNumber(item.reviews, 0) / 20));
  const completenessScore = [
    item.location || item.area,
    item.description || item.summary || item.speciality,
    item.link || item.website || item.olaMapsUrl || item.googleMapsUrl,
    item.openingHours || item.timings,
    item.duration || item.price || item.pricePerNight || item.entryFee,
  ].filter(Boolean).length * 10;

  const sourceBonus = (() => {
    const src = toText(item.source || '', '').toLowerCase();
    if (src === 'google' || src === 'google_places') return 5;
    if (src === 'ola' || src === 'ola_maps') return 3;
    if (src === 'openstreetmap' || src === 'osm') return 1;
    return 0;
  })();

  return ratingScore + reviewsScore + completenessScore + ((context && context.preferredSourceBonus != null) ? context.preferredSourceBonus : sourceBonus);
}

function pickBestCandidates(items, limit = 6, context = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items
    .map((item, index) => ({ item, originalIndex: index, score: scoreCandidate(item, context) }))
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function buildAttractionCategories(attractions = [], trip = {}) {
  const categories = [];

  for (const attraction of attractions) {
    const categoryName = toText(attraction.type || attraction.category || 'Attractions', 'Attractions');
    let category = categories.find((entry) => entry.name.toLowerCase() === categoryName.toLowerCase());

    if (!category) {
      category = { name: categoryName, places: [] };
      categories.push(category);
    }

    category.places.push(attraction);
  }

  return categories;
}

module.exports = {
  toText,
  toNumber,
  toInteger,
  toStringArray,
  clampRating,
  normalizeKey,
  makeId,
  normalizePlaceEntry,
  dedupeByKey,
  mergePlaceSets,
  buildRestaurantSections,
  normalizeHotelOption,
  normalizeHotels,
  normalizeTravelOption,
  normalizeTravel,
  applyRatingCaps,
  buildWorkingMapLink,
  sanitizeReferenceData,
  mergeReferences,
  scoreCandidate,
  pickBestCandidates,
  buildAttractionCategories,
};
