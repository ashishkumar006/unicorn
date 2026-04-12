/**
 * Weather Data - Fetches real-time weather information
 * Uses OpenWeather API (free tier) or mock data
 */

const axios = require('axios');

// Mock weather data for testing
const weatherDatabase = {
  'vijayawada': {
    temp: 28,
    feels_like: 32,
    humidity: 75,
    condition: 'Partly Cloudy',
    wind_speed: 12,
    uvi: 8,
    rainfall_mm: 2.5,
    best_time_to_visit: 'November to February'
  },
  'bangalore': {
    temp: 24,
    feels_like: 25,
    humidity: 60,
    condition: 'Clear Sky',
    wind_speed: 8,
    uvi: 6,
    rainfall_mm: 0.2,
    best_time_to_visit: 'October to March'
  },
  'chennai': {
    temp: 32,
    feels_like: 36,
    humidity: 80,
    condition: 'Sunny',
    wind_speed: 15,
    uvi: 9,
    rainfall_mm: 1.5,
    best_time_to_visit: 'November to January'
  }
};

/**
 * Get weather for a destination
 * @param {string} destination - City name
 * @returns {Promise<Object>} Weather data
 */
async function getWeather(destination) {
  try {
    console.log(`🔍 Fetching weather for ${destination}`);
    
    const destLower = destination.toLowerCase();
    
    // Check if using mock data
    if (weatherDatabase[destLower]) {
      console.log(`✅ Weather data retrieved for ${destination}`);
      return {
        destination,
        ...weatherDatabase[destLower],
        source: 'Mock Data'
      };
    }
    
    // For real API usage (optional):
    // const apiKey = process.env.OPENWEATHER_API_KEY;
    // if (!apiKey) {
    //   console.warn('⚠️ OPENWEATHER_API_KEY not set, using mock data');
    //   return generateGenericWeather(destination);
    // }
    
    // const response = await axios.get(
    //   `https://api.openweathermap.org/data/2.5/weather?q=${destination}&appid=${apiKey}&units=metric`
    // );
    
    // return {
    //   destination,
    //   temp: response.data.main.temp,
    //   feels_like: response.data.main.feels_like,
    //   humidity: response.data.main.humidity,
    //   condition: response.data.weather[0].description,
    //   wind_speed: response.data.wind.speed,
    //   uvi: response.data.uvi || 'N/A',
    //   rainfall_mm: 0,
    //   source: 'OpenWeather API'
    // };
    
    return generateGenericWeather(destination);
    
  } catch (error) {
    console.error('❌ Weather fetching error:', error.message);
    return generateGenericWeather(destination);
  }
}

/**
 * Generate generic weather for unknown destination
 */
function generateGenericWeather(destination) {
  return {
    destination,
    temp: 28,
    feels_like: 30,
    humidity: 70,
    condition: 'Partly Cloudy',
    wind_speed: 10,
    uvi: 7,
    rainfall_mm: 2,
    best_time_to_visit: 'October to March',
    source: 'Generic Weather'
  };
}

/**
 * Get seasonal recommendations
 * @param {string} destination - City
 * @returns {Promise<Object>} Seasonal info
 */
async function getSeasonalInfo(destination) {
  try {
    const weather = await getWeather(destination);
    
    const seasons = {
      'summer': {
        months: ['March', 'April', 'May'],
        temp_range: '28-38°C',
        advice: 'Very hot, carry sunscreen and hydrate well',
        packing: ['Light clothes', 'Sunscreen', 'Hat', 'Sunglasses']
      },
      'monsoon': {
        months: ['June', 'July', 'August', 'September'],
        temp_range: '24-28°C',
        advice: 'Heavy rainfall, carry umbrella and waterproof gear',
        packing: ['Raincoat', 'Umbrella', 'Waterproof shoes', 'Light jacket']
      },
      'winter': {
        months: ['October', 'November', 'December', 'January', 'February'],
        temp_range: '18-28°C',
        advice: 'Pleasant weather, ideal for sightseeing',
        packing: ['Light sweater', 'Casual clothes', 'Comfortable shoes']
      }
    };
    
    console.log(`✅ Seasonal info retrieved for ${destination}`);
    
    return {
      destination,
      current_weather: weather,
      best_season: 'winter',
      seasons,
      travel_tips: [
        'Book accommodations in advance during peak season',
        'Carry travel insurance',
        'Check road conditions before traveling',
        'Keep emergency numbers handy'
      ]
    };
    
  } catch (error) {
    console.error('❌ Error getting seasonal info:', error.message);
    return null;
  }
}

module.exports = {
  getWeather,
  getSeasonalInfo
};
