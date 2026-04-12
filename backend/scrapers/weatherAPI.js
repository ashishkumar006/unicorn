/**
 * Weather API - Uses OpenWeather (free tier)
 * Completely FREE with 1000 calls/day limit
 * No API key needed for basic usage
 * Alternative: Open-Meteo API (completely free, unlimited)
 */

const axios = require('axios');

/**
 * Get real-time weather using Open-Meteo API (100% FREE)
 * No authentication needed, unlimited requests
 * @param {string} destination - City name
 * @returns {Promise<Object>} Weather data
 */
async function getWeatherFromOpenMeteo(destination) {
  try {
    console.log(`🔍 Fetching weather from Open-Meteo API for ${destination}`);
    
    // First, get coordinates using Nominatim (free)
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${destination}&format=json&limit=1`;
    const geoResponse = await axios.get(geoUrl, {
      headers: { 'User-Agent': 'TravelPlannerAI' }
    });
    
    if (!geoResponse.data || geoResponse.data.length === 0) {
      console.warn(`⚠️ Location not found, using mock data for ${destination}`);
      return generateGenericWeather(destination);
    }
    
    const { lat, lon } = geoResponse.data[0];
    
    // Get weather from Open-Meteo (completely free)
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&temperature_unit=celsius`;
    
    const weatherResponse = await axios.get(weatherUrl);
    const current = weatherResponse.data.current;
    
    // Map WMO weather codes to descriptions
    const weatherDescriptions = {
      0: 'Clear Sky',
      1: 'Mainly Clear',
      2: 'Partly Cloudy',
      3: 'Overcast',
      45: 'Foggy',
      48: 'Foggy',
      51: 'Light Drizzle',
      61: 'Slight Rain',
      71: 'Slight Snow',
      80: 'Moderate Rain Showers',
      85: 'Moderate Snow Showers',
      95: 'Thunderstorm'
    };
    
    console.log(`✅ Weather data retrieved for ${destination}`);
    
    return {
      destination,
      temp: Math.round(current.temperature_2m),
      feels_like: Math.round(current.temperature_2m - 2), // Approximation
      humidity: current.relative_humidity_2m,
      condition: weatherDescriptions[current.weather_code] || 'Unknown',
      wind_speed: Math.round(current.wind_speed_10m),
      uvi: 'N/A',
      rainfall_mm: 0,
      best_time_to_visit: 'November to February',
      source: 'Open-Meteo API (FREE)',
      coordinates: { lat, lon }
    };
    
  } catch (error) {
    console.error('❌ Weather API error:', error.message);
    return generateGenericWeather(destination);
  }
}

/**
 * Get seasonal information
 */
async function getSeasonalInfo(destination) {
  try {
    const weather = await getWeatherFromOpenMeteo(destination);
    
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
        'Keep emergency numbers handy',
        'Respect local customs and traditions'
      ]
    };
    
  } catch (error) {
    console.error('❌ Error getting seasonal info:', error.message);
    return null;
  }
}

function generateGenericWeather(destination) {
  return {
    destination,
    temp: 28,
    feels_like: 30,
    humidity: 70,
    condition: 'Partly Cloudy',
    wind_speed: 10,
    uvi: 'N/A',
    rainfall_mm: 2,
    best_time_to_visit: 'October to March',
    source: 'Mock Data'
  };
}

module.exports = {
  getWeatherFromOpenMeteo,
  getSeasonalInfo
};
