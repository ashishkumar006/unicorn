const { chatJson, resolveCloudConfig } = require('./ollamaClient');
const { buildTravelPackagePrompt, TRAVEL_SYSTEM_PROMPT } = require('./travelPrompt');

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

function buildCacheKey(trip) {
  return [
    trip.fromPlace.toLowerCase(),
    trip.toPlace.toLowerCase(),
    trip.budget,
    trip.luxuryType,
    trip.days,
    trip.startDate,
    trip.endDate,
    trip.travelers,
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

  return list.map((activity, index) => ({
    time: toText(activity.time, ['Morning', 'Afternoon', 'Evening'][index] || 'Anytime'),
    activity: toText(
      activity.activity || activity.place || activity.description,
      `Enjoy ${trip.toPlace} throughout the day`
    ),
  }));
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
    })),
    localSpecialties: (rawSpecialties.length > 0 ? rawSpecialties : fallbackSpecialties).map((specialty, index) => ({
      name: toText(specialty.name, fallbackSpecialties[index]?.name || `Specialty ${index + 1}`),
      description: toText(specialty.description, fallbackSpecialties[index]?.description || 'Local specialty'),
      whereToFind: toText(specialty.whereToFind || specialty.whereToTry, fallbackSpecialties[index]?.whereToFind || trip.toPlace),
      price: toText(specialty.price, fallbackSpecialties[index]?.price || '₹200-400'),
      mustTry: specialty.mustTry !== false,
      bestTime: toText(specialty.bestTime, fallbackSpecialties[index]?.bestTime || 'Anytime'),
    })),
    streetFood: (rawStreetFood.length > 0 ? rawStreetFood : fallbackStreetFood).map((item, index) => ({
      name: toText(item.name, fallbackStreetFood[index]?.name || `Street food ${index + 1}`),
      price: toText(item.price, fallbackStreetFood[index]?.price || '₹100-200'),
      location: toText(item.location, fallbackStreetFood[index]?.location || trip.toPlace),
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

async function generateTravelPackage(input) {
  const trip = normalizeTripInput(input);
  const cacheKey = buildCacheKey(trip);
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
    const rawPackage = await chatJson({
      system: TRAVEL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildTravelPackagePrompt(trip),
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

    const packageData = normalizeTravelPackage(rawPackage, trip);

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
