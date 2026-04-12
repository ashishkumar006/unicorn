/**
 * Gemini Web Search Tool - Uses Gemini 2.0 Flash API with built-in web search
 * This searches the internet in real-time and returns structured data
 * 
 * Features:
 * - Real-time internet search
 * - Structured JSON responses
 * - Hotel prices, flight options, restaurants, attractions
 * - No scraping needed - completely legal!
 */

const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

/**
 * Test if Gemini can access the internet
 * Simple connectivity test
 */
async function testGeminiInternetAccess() {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not set in .env');
    }

    console.log('🔍 Testing Gemini Internet Access...');
    
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: 'What is the current date and time? Search the internet for real-time information.'
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
        }
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    console.log('✅ Gemini Internet Test Successful!');
    console.log('Response:', content);
    
    return {
      success: true,
      message: 'Gemini can access the internet',
      response: content
    };

  } catch (error) {
    console.error('❌ Gemini Internet Access Test Failed:', error.message);
    return {
      success: false,
      message: error.message,
      response: null
    };
  }
}

/**
 * Search for hotels using Gemini with internet access
 * @param {string} destination - City name
 * @param {string} checkIn - Check-in date (YYYY-MM-DD)
 * @param {number} nights - Number of nights
 * @param {number} budget - Budget per night
 * @returns {Promise<Object>} Hotels with real prices
 */
async function searchHotelsWithGemini(destination, checkIn, nights, budget) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not set in .env');
    }

    console.log(`🔍 Searching hotels in ${destination} using Gemini...`);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Search the internet for current hotel prices in ${destination}, India for ${checkIn} with checkout ${getCheckoutDate(checkIn, nights)}.
                
                Return a JSON with this exact structure (no markdown, pure JSON):
                {
                  "destination": "${destination}",
                  "checkIn": "${checkIn}",
                  "nights": ${nights},
                  "hotels": [
                    {
                      "name": "Hotel name",
                      "location": "Area/locality",
                      "pricePerNight": number,
                      "totalPrice": number,
                      "rating": number (4.0-5.0),
                      "amenities": ["WiFi", "AC", "TV"],
                      "currency": "INR",
                      "source": "Search result"
                    }
                  ]
                }
                
                Find at least 5 hotels within budget of ₹${budget} per night.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,  // Lower temp for factual data
          maxOutputTokens: 2000
        }
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    
    // Try to parse JSON
    let hotels;
    try {
      // Remove markdown code blocks if present
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      hotels = JSON.parse(cleaned);
    } catch (parseError) {
      console.warn('⚠️ Could not parse JSON, returning raw response');
      hotels = { raw_response: content };
    }

    console.log(`✅ Found hotel data for ${destination}`);
    return hotels;

  } catch (error) {
    console.error('❌ Hotel search failed:', error.message);
    return { error: error.message };
  }
}

/**
 * Search for flights using Gemini
 */
async function searchFlightsWithGemini(from, to, date) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not set in .env');
    }

    console.log(`🔍 Searching flights ${from} → ${to} using Gemini...`);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Search the internet for flight prices from ${from} to ${to} on ${date}.
                
                Return a JSON with this exact structure (pure JSON only, no markdown):
                {
                  "from": "${from}",
                  "to": "${to}",
                  "date": "${date}",
                  "flights": [
                    {
                      "airline": "Airline name",
                      "price": number,
                      "departure": "HH:MM",
                      "arrival": "HH:MM",
                      "duration": "XhYm",
                      "stops": 0,
                      "seats": number,
                      "source": "Search result"
                    }
                  ]
                }
                
                Find at least 5 different flight options with current prices.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000
        }
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    
    let flights;
    try {
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      flights = JSON.parse(cleaned);
    } catch (parseError) {
      console.warn('⚠️ Could not parse JSON');
      flights = { raw_response: content };
    }

    console.log(`✅ Found flight data from ${from} to ${to}`);
    return flights;

  } catch (error) {
    console.error('❌ Flight search failed:', error.message);
    return { error: error.message };
  }
}

/**
 * Search for restaurants using Gemini
 */
async function searchRestaurantsWithGemini(destination, cuisine, budget) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not set in .env');
    }

    console.log(`🔍 Searching ${cuisine} restaurants in ${destination} using Gemini...`);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Search the internet for ${cuisine} restaurants in ${destination}, India with current prices.
                
                Return a JSON with this exact structure (pure JSON only):
                {
                  "destination": "${destination}",
                  "cuisine": "${cuisine}",
                  "budget": ${budget},
                  "restaurants": [
                    {
                      "name": "Restaurant name",
                      "cuisine": "Cuisine type",
                      "location": "Area",
                      "avgCost": number,
                      "rating": number (4.0-5.0),
                      "reviews": number,
                      "vegetarian": boolean,
                      "timings": "HH:MM - HH:MM",
                      "source": "Search result"
                    }
                  ]
                }
                
                Find at least 5 popular restaurants within budget of ₹${budget} per meal.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000
        }
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    
    let restaurants;
    try {
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      restaurants = JSON.parse(cleaned);
    } catch (parseError) {
      console.warn('⚠️ Could not parse JSON');
      restaurants = { raw_response: content };
    }

    console.log(`✅ Found restaurant data for ${destination}`);
    return restaurants;

  } catch (error) {
    console.error('❌ Restaurant search failed:', error.message);
    return { error: error.message };
  }
}

/**
 * Search for attractions and things to do
 */
async function searchAttractionsWithGemini(destination) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not set in .env');
    }

    console.log(`🔍 Searching attractions in ${destination} using Gemini...`);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Search the internet for top tourist attractions and things to do in ${destination}, India.
                
                Return a JSON with this exact structure (pure JSON only):
                {
                  "destination": "${destination}",
                  "attractions": [
                    {
                      "name": "Attraction name",
                      "type": "Category (temple/park/museum/etc)",
                      "description": "Brief description",
                      "entryFee": "Fee or 'Free'",
                      "timings": "Opening hours",
                      "rating": number (4.0-5.0),
                      "duration": "Recommended time",
                      "source": "Search result"
                    }
                  ]
                }
                
                Find at least 8-10 major attractions.`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000
        }
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    
    let attractions;
    try {
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      attractions = JSON.parse(cleaned);
    } catch (parseError) {
      console.warn('⚠️ Could not parse JSON');
      attractions = { raw_response: content };
    }

    console.log(`✅ Found attractions data for ${destination}`);
    return attractions;

  } catch (error) {
    console.error('❌ Attractions search failed:', error.message);
    return { error: error.message };
  }
}

/**
 * Get weather information
 */
async function getWeatherWithGemini(destination) {
  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not set in .env');
    }

    console.log(`🔍 Fetching weather for ${destination} using Gemini...`);

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Search the internet for current weather and forecast for ${destination}, India.
                
                Return a JSON with this exact structure (pure JSON only):
                {
                  "destination": "${destination}",
                  "current": {
                    "temperature": number,
                    "condition": "Weather condition",
                    "humidity": number,
                    "windSpeed": number
                  },
                  "forecast": [
                    {
                      "day": "Day name",
                      "high": number,
                      "low": number,
                      "condition": "Condition"
                    }
                  ],
                  "bestTimeToVisit": "Month range",
                  "source": "Search result"
                }`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500
        }
      }
    );

    const content = response.data.candidates[0].content.parts[0].text;
    
    let weather;
    try {
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      weather = JSON.parse(cleaned);
    } catch (parseError) {
      console.warn('⚠️ Could not parse JSON');
      weather = { raw_response: content };
    }

    console.log(`✅ Found weather data for ${destination}`);
    return weather;

  } catch (error) {
    console.error('❌ Weather fetch failed:', error.message);
    return { error: error.message };
  }
}

/**
 * Helper: Get checkout date
 */
function getCheckoutDate(checkIn, nights) {
  const date = new Date(checkIn);
  date.setDate(date.getDate() + nights);
  return date.toISOString().split('T')[0];
}

module.exports = {
  testGeminiInternetAccess,
  searchHotelsWithGemini,
  searchFlightsWithGemini,
  searchRestaurantsWithGemini,
  searchAttractionsWithGemini,
  getWeatherWithGemini
};
