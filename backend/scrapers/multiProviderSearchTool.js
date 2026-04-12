/**
 * MULTI-PROVIDER WEB SEARCH TOOL
 * Switch between different LLM providers for web search
 * 
 * Currently implemented: Gemini
 * Can be extended with: Perplexity, OpenAI GPT-4o, Claude
 */

const axios = require('axios');

class MultiProviderSearchTool {
  constructor(provider = 'gemini') {
    this.provider = provider;
    this.apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    this.model = process.env[`${provider.toUpperCase()}_MODEL`];
    
    if (!this.apiKey) {
      console.warn(`⚠️  ${provider.toUpperCase()}_API_KEY not set in .env`);
    }
  }

  // ============================================================
  // GEMINI IMPLEMENTATION (Current - Working)
  // ============================================================
  async searchWithGemini(query, resultFormat = 'json') {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          contents: [{
            parts: [{
              text: `${query}\n\nReturn response in ${resultFormat} format.`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000
          }
        }
      );

      const content = response.data.candidates[0].content.parts[0].text;
      
      // Parse JSON if requested
      if (resultFormat === 'json') {
        const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                         content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1] || jsonMatch[0]);
        }
      }
      
      return content;
    } catch (error) {
      console.error('❌ Gemini Search Error:', error.message);
      return { error: error.message };
    }
  }

  // ============================================================
  // PERPLEXITY IMPLEMENTATION (Optional - Not yet implemented)
  // ============================================================
  async searchWithPerplexity(query) {
    if (!process.env.PERPLEXITY_API_KEY) {
      return {
        error: 'PERPLEXITY_API_KEY not set',
        howToGet: 'https://www.perplexity.ai/api'
      };
    }

    try {
      const response = await axios.post(
        'https://api.perplexity.ai/chat/completions',
        {
          model: process.env.PERPLEXITY_MODEL || 'pplx-7b-online',
          messages: [{
            role: 'user',
            content: query
          }],
          temperature: 0.3,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
          }
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('❌ Perplexity Error:', error.message);
      return { error: error.message };
    }
  }

  // ============================================================
  // OPENAI GPT-4O IMPLEMENTATION (Optional - Not yet implemented)
  // ============================================================
  async searchWithOpenAI(query) {
    if (!process.env.OPENAI_API_KEY) {
      return {
        error: 'OPENAI_API_KEY not set',
        howToGet: 'https://platform.openai.com/api-keys'
      };
    }

    try {
      // Note: GPT-4o doesn't have native web search in API
      // You'd need to use function calling with a search tool
      // This is a simplified example
      return {
        status: 'not_implemented',
        note: 'GPT-4o requires function calling setup for web search'
      };
    } catch (error) {
      console.error('❌ OpenAI Error:', error.message);
      return { error: error.message };
    }
  }

  // ============================================================
  // CLAUDE (ANTHROPIC) IMPLEMENTATION (Optional - Not yet implemented)
  // ============================================================
  async searchWithClaude(query) {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        error: 'ANTHROPIC_API_KEY not set',
        howToGet: 'https://console.anthropic.com/account/keys'
      };
    }

    try {
      // Claude uses "extended thinking" for web search capability
      // Implementation would go here
      return {
        status: 'not_implemented',
        note: 'Claude web search requires extended thinking setup'
      };
    } catch (error) {
      console.error('❌ Claude Error:', error.message);
      return { error: error.message };
    }
  }

  // ============================================================
  // UNIFIED SEARCH INTERFACE
  // ============================================================
  async search(query) {
    console.log(`🔍 Searching with ${this.provider.toUpperCase()}...`);

    switch (this.provider.toLowerCase()) {
      case 'gemini':
        return await this.searchWithGemini(query);
      case 'perplexity':
        return await this.searchWithPerplexity(query);
      case 'openai':
        return await this.searchWithOpenAI(query);
      case 'claude':
        return await this.searchWithClaude(query);
      default:
        return { error: `Unknown provider: ${this.provider}` };
    }
  }

  // ============================================================
  // TRAVEL-SPECIFIC SEARCH FUNCTIONS
  // ============================================================
  async searchHotels(destination, checkIn, nights, budget) {
    const query = `
Search the internet for hotels in ${destination} available on ${checkIn} for ${nights} nights.
Budget: ₹${budget} per night maximum.
Return as JSON with array of hotels: [{name, location, pricePerNight, rating, amenities, bookingUrl}]
    `;
    return this.search(query);
  }

  async searchFlights(from, to, date) {
    const query = `
Search the internet for flights from ${from} to ${to} on ${date}.
Return as JSON with array of flights: [{airline, price, departure, arrival, duration, stops}]
    `;
    return this.search(query);
  }

  async searchRestaurants(destination, cuisine, budget) {
    const query = `
Search the internet for ${cuisine} restaurants in ${destination}.
Budget: ₹${budget} average cost per person maximum.
Return as JSON with array of restaurants: [{name, cuisine, location, avgCost, rating, vegetarian}]
    `;
    return this.search(query);
  }

  async searchAttractions(destination) {
    const query = `
Search the internet for top tourist attractions in ${destination}.
Return as JSON with array of attractions: [{name, type, description, entryFee, timings, rating}]
    `;
    return this.search(query);
  }

  async getWeather(destination) {
    const query = `
Search the internet for current weather and forecast in ${destination}.
Return as JSON: {current: {temperature, condition, humidity, windSpeed}, forecast: {}, bestTime: ''}
    `;
    return this.search(query);
  }
}

module.exports = MultiProviderSearchTool;

// ============================================================
// USAGE EXAMPLE
// ============================================================

/*
// Use with Gemini (Current default)
const search = new MultiProviderSearchTool('gemini');
const hotels = await search.searchHotels('Bangalore', '2026-04-15', 3, 5000);

// Later: Switch to Perplexity (once API key is added to .env)
const searchPerplexity = new MultiProviderSearchTool('perplexity');
const hotels = await search.searchHotels('Bangalore', '2026-04-15', 3, 5000);

// Or use generic search
const results = await search.search("What are the best restaurants in Bangalore?");
*/
