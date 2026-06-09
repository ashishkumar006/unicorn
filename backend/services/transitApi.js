/**
 * TRANSIT API SERVICE
 *
 * Unified transit data source via AbhiBus/ixigo APIs.
 * Covers: buses, trains (IRCTC), flights
 *
 * All clients are optional and return null when API keys/configs are missing.
 * No mock data. No breaking changes to existing scrapers.
 */

function resolveTransitConfig() {
  return {
    provider: 'abhibus',
    apiKey: process.env.ABHIBUS_API_KEY || process.env.TRANSIT_API_KEY || '',
    baseUrl: process.env.ABHIBUS_BASE_URL || process.env.TRANSIT_BASE_URL || '',
    mode: process.env.ABHIBUS_MODE || 'bus', // bus | train | flight
  };
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) return fallback;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function buildFlightOption({ provider = 'abhibus', airline = '', price = 0, duration = '', departure = '', arrival = '', stops = 0, flightClass = 'Economy', seats = 0, link = '', bookingRequired = false, source = '' }) {
  return {
    id: `flight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'Flight',
    mode: 'flight',
    provider: toText(provider, 'abhibus'),
    airline: toText(airline, 'Flight'),
    price: toNumber(price, 0),
    duration: toText(duration, 'Flexible'),
    departure: toText(departure, 'Flexible'),
    arrival: toText(arrival, 'Flexible'),
    departureTime: toText(departure, 'Flexible'),
    arrivalTime: toText(arrival, 'Flexible'),
    stops: Number.isFinite(stops) ? stops : 0,
    class: toText(flightClass, 'Economy'),
    seats_available: toNumber(seats, 0),
    seatsAvailable: toNumber(seats, 0),
    highlights: [],
    details: `${toText(airline, 'Flight')} • ${toText(duration, 'Flexible')} • ${Number.isFinite(stops) ? stops : 0} stop(s)`,
    description: toText(airline, 'Flight option'),
    bookingRequired: Boolean(bookingRequired),
    link: toText(link, ''),
    url: toText(link, ''),
    source: toText(source, provider),
  };
}

function buildTrainOption({ provider = 'abhibus', name = '', number = '', price = 0, duration = '', departure = '', arrival = '', trainClass = 'General', seats = 0, link = '', bookingRequired = false, source = '' }) {
  return {
    id: `train-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'Train',
    mode: 'train',
    provider: toText(provider, 'abhibus'),
    name: toText(name, 'Train Service'),
    number: toText(number, ''),
    price: toNumber(price, 0),
    duration: toText(duration, 'Flexible'),
    departure: toText(departure, 'Flexible'),
    arrival: toText(arrival, 'Flexible'),
    departureTime: toText(departure, 'Flexible'),
    arrivalTime: toText(arrival, 'Flexible'),
    class: toText(trainClass, 'General'),
    seats_available: toNumber(seats, 0),
    seatsAvailable: toNumber(seats, 0),
    highlights: [],
    details: `${toText(name, 'Train')}${number ? ` (${number})` : ''} • ${toText(duration, 'Flexible')}`,
    description: toText(name, 'Train option'),
    bookingRequired: Boolean(bookingRequired),
    link: toText(link, ''),
    url: toText(link, ''),
    source: toText(source, provider),
  };
}

function buildBusOption({ provider = 'abhibus', operator = '', price = 0, duration = '', departure = '', arrival = '', busType = 'Sleeper', seats = 0, rating = 0, link = '', bookingRequired = false, source = '' }) {
  return {
    id: `bus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'Bus',
    mode: 'bus',
    provider: toText(provider, 'abhibus'),
    operator: toText(operator, 'Bus Service'),
    price: toNumber(price, 0),
    duration: toText(duration, 'Flexible'),
    departure: toText(departure, 'Flexible'),
    arrival: toText(arrival, 'Flexible'),
    departureTime: toText(departure, 'Flexible'),
    arrivalTime: toText(arrival, 'Flexible'),
    type: toText(busType, 'Sleeper'),
    busType: toText(busType, 'Sleeper'),
    seats_available: toNumber(seats, 0),
    seatsAvailable: toNumber(seats, 0),
    rating: toNumber(rating, 0),
    highlights: [],
    details: `${toText(operator, 'Bus')} • ${toText(busType, 'Sleeper')} • ${toText(duration, 'Flexible')}`,
    description: toText(operator, 'Bus option'),
    bookingRequired: Boolean(bookingRequired),
    link: toText(link, ''),
    url: toText(link, ''),
    source: toText(source, provider),
  };
}

async function searchFlights(from, to, date) {
  const config = resolveTransitConfig();

  if (!config.apiKey || !config.baseUrl) {
    return null;
  }

  try {
    console.log(`[TransitAPI] Searching flights: ${from} → ${to} on ${date} via ${config.provider}`);
    // TODO: replace with actual AbhiBus/ixigo flight API call
    // const response = await axios.get(`${config.baseUrl}/flights`, { params: { from, to, date, apiKey: config.apiKey } });
    // const data = response.data;
    // return (data.options || []).map(opt => buildFlightOption({ ...opt, provider: config.provider, source: config.provider }));
    return null;
  } catch (error) {
    console.warn(`[TransitAPI] Flight API failed: ${error.message}`);
    return null;
  }
}

async function searchTrains(from, to, date) {
  const config = resolveTransitConfig();

  if (!config.apiKey || !config.baseUrl) {
    return null;
  }

  try {
    console.log(`[TransitAPI] Searching trains: ${from} → ${to} on ${date} via ${config.provider}`);
    // TODO: replace with actual AbhiBus/ixigo train API call
    // const response = await axios.get(`${config.baseUrl}/trains`, { params: { from, to, date, apiKey: config.apiKey } });
    // const data = response.data;
    // return (data.options || []).map(opt => buildTrainOption({ ...opt, provider: config.provider, source: config.provider }));
    return null;
  } catch (error) {
    console.warn(`[TransitAPI] Train API failed: ${error.message}`);
    return null;
  }
}

async function searchBuses(from, to, date) {
  const config = resolveTransitConfig();

  if (!config.apiKey || !config.baseUrl) {
    return null;
  }

  try {
    console.log(`[TransitAPI] Searching buses: ${from} → ${to} on ${date} via ${config.provider}`);
    // TODO: replace with actual AbhiBus bus API call
    // const response = await axios.get(`${config.baseUrl}/buses`, { params: { from, to, date, apiKey: config.apiKey } });
    // const data = response.data;
    // return (data.options || []).map(opt => buildBusOption({ ...opt, provider: config.provider, source: config.provider }));
    return null;
  } catch (error) {
    console.warn(`[TransitAPI] Bus API failed: ${error.message}`);
    return null;
  }
}

async function searchAllTransit(from, to, date) {
  const [flights, trains, buses] = await Promise.all([
    searchFlights(from, to, date),
    searchTrains(from, to, date),
    searchBuses(from, to, date),
  ]);

  return {
    flights: flights || [],
    trains: trains || [],
    buses: buses || [],
    source: flights || trains || buses ? 'transit-api' : 'none',
  };
}

module.exports = {
  resolveTransitConfig,
  buildFlightOption,
  buildTrainOption,
  buildBusOption,
  searchFlights,
  searchTrains,
  searchBuses,
  searchAllTransit,
};
