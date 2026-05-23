const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi4-mini:latest';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-2-70b-chat';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

// Module-level fetch import (Node 18+ native or node-fetch package fallback)
let fetch;
try {
  fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
} catch (e) {
  fetch = globalThis.fetch;
}

// Helper: fetch with AbortController timeout (30 seconds)
async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 30000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout / 1000} seconds`);
    }
    throw error;
  }
}

/**
 * Generate a comprehensive travel plan using LLM with automatic fallback
 * Priority: OpenRouter → Gemini → Ollama
 * @param {Object} params - Travel plan parameters
 * @param {string} params.fromPlace - Starting location
 * @param {string} params.toPlace - Destination
 * @param {number} params.budget - Budget in rupees
 * @param {string} params.luxuryType - Luxury level (low, semi, full)
 * @param {number} params.days - Duration in days
 * @param {string} params.startDate - Start date (YYYY-MM-DD)
 * @param {string} params.endDate - End date (YYYY-MM-DD)
 * @param {number} params.travelers - Number of travelers
 * @param {string} params.provider - LLM Provider (openrouter, gemini, or ollama, default: 'auto')
 */
async function generateTravelPlan({ fromPlace, toPlace, budget, luxuryType, days, startDate, endDate, travelers = 1, provider = 'auto' }) {
  
  const luxuryLabels = {
    'low': 'Budget-friendly',
    'semi': 'Mid-range comfort',
    'full': 'Full luxury experience'
  };

  const prompt = `You are an expert travel planner. Create a detailed, personalized travel plan with the following parameters:

FROM: ${fromPlace}
TO: ${toPlace}
START DATE: ${startDate || 'Not specified'}
END DATE: ${endDate || 'Not specified'}
DURATION: ${days} days
NUMBER OF TRAVELERS: ${travelers}
TOTAL BUDGET: ₹${budget} INR
BUDGET PER PERSON: ₹${Math.floor(budget / travelers)} INR
LUXURY LEVEL: ${luxuryLabels[luxuryType] || luxuryType}

Please provide a comprehensive, day-by-day travel plan in JSON format with the following structure:

{
  "summary": {
    "destination": "string",
    "duration": "number of days",
    "totalBudget": "estimated total cost in ₹",
    "luxuryLevel": "luxury level description"
  },
  "transportation": {
    "toDestination": {
      "mode": "flight/train/bus",
      "details": "specific recommendations with approximate costs in ₹",
      "duration": "travel time",
      "cost": "estimated cost in ₹"
    },
    "localTransport": {
      "mode": "recommended local transport",
      "details": "how to get around",
      "dailyCost": "estimated daily cost in ₹"
    }
  },
  "accommodation": {
    "name": "recommended hotel/stay name",
    "type": "hotel/resort/hostel/etc",
    "location": "area/neighborhood",
    "pricePerNight": "cost per night in ₹",
    "totalCost": "total accommodation cost in ₹",
    "amenities": ["list of key amenities"],
    "description": "brief description of the stay"
  },
  "itinerary": [
    {
      "day": 1,
      "theme": "day theme/focus",
      "activities": [
        {
          "time": "morning/afternoon/evening",
          "place": "place name",
          "description": "what to do there",
          "estimatedCost": "entry/activity cost in ₹",
          "duration": "how long to spend"
        }
      ],
      "dining": [
        {
          "meal": "breakfast/lunch/dinner",
          "restaurant": "restaurant name",
          "cuisine": "type of cuisine",
          "estimatedCost": "meal cost in ₹",
          "description": "why this place is recommended"
        }
      ]
    }
  ],
  "budgetBreakdown": {
    "transportation": "total transport cost in ₹",
    "accommodation": "total stay cost in ₹",
    "activities": "total activities cost in ₹",
    "dining": "total food cost in ₹",
    "miscellaneous": "buffer/miscellaneous in ₹",
    "total": "grand total in ₹"
  },
  "tips": [
    "helpful travel tips specific to this destination"
  ]
}

Make the plan realistic, practical, and tailored to the budget and luxury level. Include specific place names, restaurants, and activities. Ensure the total stays within or close to the budget.

Return ONLY valid JSON, no markdown formatting or explanations.`;

  try {
    // Auto fallback: try OpenRouter first, then Gemini, then Ollama
    if (provider === 'auto' || provider === 'openrouter') {
      try {
        console.log('[LLM] Attempting OpenRouter...');
        return await generateWithOpenRouter(prompt);
      } catch (error) {
        console.warn('[LLM] OpenRouter failed:', error.message);
        console.log('[LLM] Falling back to Gemini...');
      }
    }
    
    if (provider === 'auto' || provider === 'gemini') {
      try {
        console.log('[LLM] Attempting Gemini...');
        return await generateWithGemini(prompt);
      } catch (error) {
        console.warn('[LLM] Gemini failed:', error.message);
        console.log('[LLM] Falling back to Ollama...');
      }
    }
    
    // Final fallback to Ollama
    console.log('[LLM] Attempting Ollama...');
    return await generateWithOllama(prompt);
    
  } catch (error) {
    throw new Error(`All LLM providers failed: ${error.message}`);
  }
}

/**
 * Generate travel plan using Gemini
 */
async function generateWithGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in environment variables');
  }
  
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const systemPrompt = 'You are a professional travel planner AI. You create detailed, practical, and budget-conscious travel plans. Always respond with valid JSON only.';
    
    const response = await fetchWithTimeout(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt },
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4000
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!content) {
      throw new Error('No content received from Gemini API');
    }
    
    // Simple JSON parsing with cleanup
    try {
      let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch (parseError) {
      try {
        // Remove trailing commas before } or ]
        let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
        // Replace newlines with spaces
        cleaned = cleaned.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
        return JSON.parse(cleaned);
      } catch (retryError) {
        throw parseError;
      }
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Generate travel plan using Ollama
 */
async function generateWithOllama(prompt) {
  try {
    const ollamaUrl = `${OLLAMA_URL}/api/generate`;
    
    const systemPrompt = 'You are a professional travel planner AI. You create detailed, practical, and budget-conscious travel plans. Always respond with valid JSON only.';
    const fullPrompt = `${systemPrompt}\\n\\n${prompt}`;
    
    const response = await fetchWithTimeout(ollamaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: fullPrompt,
        stream: false,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.response;
    
    // Simple JSON parsing with cleanup
    try {
      let cleaned = content.replaceAll('```json', '').replaceAll('```', '').trim();
      return JSON.parse(cleaned);
    } catch (parseError) {
      try {
        // Remove trailing commas before } or ]
        let cleaned = content.replaceAll('```json', '').replaceAll('```', '').trim();
        cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
        // Replace newlines with spaces
        cleaned = cleaned.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
        return JSON.parse(cleaned);
      } catch (retryError) {
        throw parseError;
      }
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Generate travel plan using OpenRouter
 */
async function generateWithOpenRouter(prompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set in environment variables');
  }
  
  try {
    const openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
    
    const systemPrompt = 'You are a professional travel planner AI. You create detailed, practical, and budget-conscious travel plans. Always respond with valid JSON only.';
    
    const response = await fetchWithTimeout(openrouterUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Travel Planner AI'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Simple JSON parsing with cleanup
    try {
      let cleaned = content.replaceAll('```json', '').replaceAll('```', '').trim();
      return JSON.parse(cleaned);
    } catch (parseError) {
      try {
        // Remove trailing commas before } or ]
        let cleaned = content.replaceAll('```json', '').replaceAll('```', '').trim();
        cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
        // Replace newlines with spaces
        cleaned = cleaned.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
        return JSON.parse(cleaned);
      } catch (retryError) {
        throw parseError;
      }
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Generate detailed data for specific tabs (Travel, Hotels, Places, Food)
 */
async function generateDetailedData({ fromPlace, toPlace, tabType, budget, luxuryType, days, startDate, endDate, travelers = 1, provider = 'auto' }) {
  const luxuryLabels = {
    'low': 'Budget-friendly',
    'semi': 'Mid-range comfort',
    'full': 'Full luxury experience'
  };

  let prompt = '';

  if (tabType === 'travel') {
    prompt = `Generate transportation options from ${fromPlace} to ${toPlace}.
Trip Details: ${days} days (${startDate} to ${endDate}), ${travelers} traveler(s), ${luxuryLabels[luxuryType]} concept.
Total Budget: ₹${budget} (per person: ₹${Math.floor(budget / travelers)})
Return JSON with this structure:
{
  "options": [
    {
      "name": "transport name with operator",
      "type": "flight/train/bus/car",
      "price": "cost in ₹ per person",
      "duration": "travel time with dates",
      "departure": "date and time",
      "arrival": "date and time",
      "comfort": "comfort level",
      "rating": "rating out of 5",
      "highlights": ["key features"],
      "bookingRequired": true/false
    }
  ]
}`;
  } else if (tabType === 'hotels') {
    prompt = `Recommend hotels/stays in ${toPlace}.
Trip Details: ${days} days (${startDate} to ${endDate}), ${travelers} traveler(s), ${luxuryLabels[luxuryType]} concept.
Budget: ₹${budget} total (per person: ₹${Math.floor(budget / travelers)})
Return JSON with this structure:
{
  "options": [
    {
      "name": "hotel/stay name",
      "location": "area in city",
      "distanceFromCenter": "distance with estimated travel time",
      "pricePerNight": "cost in ₹",
      "totalStayPrice": "total cost for ${days} nights",
      "perPersonPrice": "per person for stay",
      "rating": "rating out of 5",
      "amenities": ["wifi", "ac", "pool", "breakfast"],
      "roomType": "single/double/suite",
      "highlights": ["key feature 1", "key feature 2"],
      "checkIn": "${startDate}",
      "checkOut": "${endDate}",
      "availability": "confirmed/tentative"
    }
  ]
}`;
  } else if (tabType === 'places') {
    prompt = `Generate top attractions and places to visit in ${toPlace} for ${days} days (${startDate} to ${endDate}).
${travelers} traveler(s), ${luxuryLabels[luxuryType]} trip.
Return JSON with this structure:
{
  "categories": [
    {
      "name": "category name",
      "places": [
        {
          "name": "place name",
          "type": "beach/monument/temple/etc",
          "description": "brief description",
          "timeRequired": "time to spend",
          "entryFee": "fee in ₹ or free",
          "rating": "rating out of 5",
          "bestTime": "best time to visit"
        }
      ]
    }
  ]
}`;
  } else if (tabType === 'food') {
    prompt = `Recommend restaurants and local food specialties in ${toPlace}.
Trip Details: ${days} days (${startDate} to ${endDate}), ${travelers} traveler(s), ${luxuryLabels[luxuryType]} trip.
Budget per meal: ₹${Math.floor(budget / (travelers * days * 3))} per person (accounting for 3 meals daily)
Return JSON with this structure:
{
  "restaurants": [
    {
      "name": "restaurant name",
      "cuisine": "cuisine type / local specialty",
      "area": "location in city",
      "costPerPerson": "cost per person in ₹",
      "costForTravelers": "cost for ${travelers} people in ₹",
      "rating": "rating out of 5",
      "specialties": ["must-try dish 1", "must-try dish 2", "specialty 3"],
      "bestFor": "occasion/time",
      "timings": "opening hours",
      "vibe": "casual/fine dining/street food/rooftop/etc",
      "bookingRequired": true/false
    }
  ],
  "localSpecialties": [
    {
      "name": "dish name",
      "description": "brief description with cultural context",
      "mustTry": true,
      "estimatedCost": "cost in ₹",
      "whereToFind": "specific location/restaurant names",
      "bestTime": "best time to try"
    }
  ]
}`;
  }

  try {
    // Auto fallback: try OpenRouter first, then Gemini, then Ollama
    if (provider === 'auto' || provider === 'openrouter') {
      try {
        console.log('[LLM] Attempting OpenRouter for detailed data...');
        return await generateWithOpenRouter(prompt);
      } catch (error) {
        console.warn('[LLM] OpenRouter failed:', error.message);
        console.log('[LLM] Falling back to Gemini...');
      }
    }
    
    if (provider === 'auto' || provider === 'gemini') {
      try {
        console.log('[LLM] Attempting Gemini for detailed data...');
        return await generateWithGemini(prompt);
      } catch (error) {
        console.warn('[LLM] Gemini failed:', error.message);
        console.log('[LLM] Falling back to Ollama...');
      }
    }
    
    // Final fallback to Ollama
    console.log('[LLM] Attempting Ollama for detailed data...');
    return await generateWithOllama(prompt);
    
  } catch (error) {
    throw new Error(`All LLM providers failed: ${error.message}`);
  }
}

module.exports = { generateTravelPlan, generateDetailedData };
