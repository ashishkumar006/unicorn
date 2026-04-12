/**
 * Flight Scraper - Scrapes flight data for route
 * Sources: RedBus, Skyscanner (via web scraping)
 */

const axios = require('axios');
const cheerio = require('cheerio');

// Mock flight data for testing (in production, replace with actual scraping)
const mockFlights = {
  'chennai-vijayawada': [
    {
      id: 'fl-001',
      airline: 'IndiGo',
      price: 4500,
      duration: '1h 15m',
      departure: '08:00 AM',
      arrival: '09:15 AM',
      stops: 0,
      class: 'Economy',
      seats_available: 12
    },
    {
      id: 'fl-002',
      airline: 'SpiceJet',
      price: 3800,
      duration: '1h 20m',
      departure: '02:30 PM',
      arrival: '03:50 PM',
      stops: 0,
      class: 'Economy',
      seats_available: 8
    },
    {
      id: 'fl-003',
      airline: 'Air India',
      price: 5200,
      duration: '1h 10m',
      departure: '11:00 AM',
      arrival: '12:10 PM',
      stops: 0,
      class: 'Economy',
      seats_available: 15
    }
  ]
};

/**
 * Scrape flights for a route
 * @param {string} from - Departure city (lowercase)
 * @param {string} to - Arrival city (lowercase)
 * @param {string} date - Travel date (YYYY-MM-DD format)
 * @returns {Promise<Array>} Flight options
 */
async function scrapeFlights(from, to, date) {
  try {
    console.log(`🔍 Scraping flights: ${from} → ${to} on ${date}`);
    
    const routeKey = `${from.toLowerCase()}-${to.toLowerCase()}`;
    
    // For now, return mock data
    // In production, replace with actual scraping logic
    if (mockFlights[routeKey]) {
      console.log(`✅ Found ${mockFlights[routeKey].length} flight options`);
      return mockFlights[routeKey];
    }
    
    // Return generic flights if route not in mock data
    return generateFlightData(from, to);
    
  } catch (error) {
    console.error('❌ Flight scraping error:', error.message);
    return [];
  }
}

/**
 * Generate flight data based on popular routes
 */
function generateFlightData(from, to) {
  const airlines = ['IndiGo', 'SpiceJet', 'Air India', 'Vistara', 'GoAir'];
  const filters = [
    { price: 3500, duration: '1h 20m', seats: 10 },
    { price: 4200, duration: '1h 15m', seats: 12 },
    { price: 5000, duration: '1h 10m', seats: 15 }
  ];
  
  return airlines.slice(0, 3).map((airline, idx) => ({
    id: `fl-${idx + 1}`,
    airline,
    price: filters[idx].price,
    duration: filters[idx].duration,
    departure: `${8 + idx * 2}:00 AM`,
    arrival: `${9 + idx * 2}:20 AM`,
    stops: 0,
    class: 'Economy',
    seats_available: filters[idx].seats
  }));
}

/**
 * Scrape trains (alternative transport)
 * @param {string} from - Departure station
 * @param {string} to - Arrival station
 * @param {string} date - Travel date
 * @returns {Promise<Array>} Train options
 */
async function scrapeTrains(from, to, date) {
  try {
    console.log(`🔍 Scraping trains: ${from} → ${to} on ${date}`);
    
    // Mock train data
    const trains = [
      {
        id: 'tr-001',
        name: 'Express Passenger',
        number: '12345',
        departure: '06:00 AM',
        arrival: '02:00 PM',
        duration: '8h',
        price: 500,
        class: 'General',
        seats: 40
      },
      {
        id: 'tr-002',
        name: 'Intercity Express',
        number: '12346',
        departure: '10:30 AM',
        arrival: '06:30 PM',
        duration: '8h',
        price: 800,
        class: 'Second Class',
        seats: 25
      },
      {
        id: 'tr-003',
        name: 'Premium Express',
        number: '12347',
        departure: '03:00 PM',
        arrival: '11:00 PM',
        duration: '8h',
        price: 1200,
        class: 'AC First Class',
        seats: 30
      }
    ];
    
    console.log(`✅ Found ${trains.length} train options`);
    return trains;
    
  } catch (error) {
    console.error('❌ Train scraping error:', error.message);
    return [];
  }
}

/**
 * Scrape buses (budget option)
 * @param {string} from - Departure city
 * @param {string} to - Arrival city
 * @param {string} date - Travel date
 * @returns {Promise<Array>} Bus options
 */
async function scrapeBuses(from, to, date) {
  try {
    console.log(`🔍 Scraping buses: ${from} → ${to} on ${date}`);
    
    // Mock bus data
    const buses = [
      {
        id: 'bus-001',
        operator: 'RedBus Express',
        departure: '05:00 AM',
        arrival: '11:00 AM',
        duration: '6h',
        price: 400,
        type: 'Sleeper',
        seats: 50,
        rating: 4.2
      },
      {
        id: 'bus-002',
        operator: 'SRS Travels',
        departure: '08:00 AM',
        arrival: '02:00 PM',
        duration: '6h',
        price: 500,
        type: 'AC Volvo',
        seats: 40,
        rating: 4.5
      },
      {
        id: 'bus-003',
        operator: 'Kallada Travels',
        departure: '10:00 PM',
        arrival: '04:00 AM',
        duration: '6h',
        price: 350,
        type: 'Sleeper',
        seats: 45,
        rating: 4.1
      }
    ];
    
    console.log(`✅ Found ${buses.length} bus options`);
    return buses;
    
  } catch (error) {
    console.error('❌ Bus scraping error:', error.message);
    return [];
  }
}

/**
 * Get all transport options
 */
async function getAllTransport(from, to, date) {
  try {
    const [flights, trains, buses] = await Promise.all([
      scrapeFlights(from, to, date),
      scrapeTrains(from, to, date),
      scrapeBuses(from, to, date)
    ]);
    
    return { flights, trains, buses };
  } catch (error) {
    console.error('❌ Error fetching transport:', error.message);
    return { flights: [], trains: [], buses: [] };
  }
}

module.exports = {
  scrapeFlights,
  scrapeTrains,
  scrapeBuses,
  getAllTransport
};
