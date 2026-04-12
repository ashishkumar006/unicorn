/**
 * GROUP TRAVEL BOOKING AGENT
 * 
 * This is the brain of the app
 * - Understands user intent (what are they looking for?)
 * - Extracts parameters (where, when, how many people, budget)
 * - Searches appropriate APIs (flights, hotels, buses)
 * - Presents options
 * - Refines based on feedback
 * - Finally books
 * 
 * Built for Student Group Trips (5-20 people)
 */

const axios = require('axios');
const MockTravelDataGenerator = require('./mockDataGenerator');

class GroupTravelAgent {
  constructor() {
    this.conversationHistory = [];
    this.currentTrip = {
      origin: null,
      destination: null,
      departureDate: null,
      nights: null,
      groupSize: null,
      budget: null,
      travelers: [],
      selectedFlight: null,
      selectedHotel: null,
      selectedBus: null
    };
    this.geminiApiKey = process.env.GEMINI_API_KEY;
  }

  // ============================================================
  // MAIN AGENT LOOP - This is what the user talks to
  // ============================================================
  async chat(userMessage) {
    console.log(`\n👤 User: ${userMessage}`);
    
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });

    // Step 1: Use Gemini to understand what the user wants
    const intent = await this.extractIntent(userMessage);
    console.log(`🤖 Agent understood: ${intent.action}`);
    console.log(`📍 Extracted data: ${JSON.stringify(intent.data)}`);

    // Step 2: Update trip details
    this.updateTripDetails(intent.data);

    // Step 3: Determine what to search
    let response;
    
    if (intent.action === 'SEARCH_TRIPS') {
      response = await this.searchTrips();
    } else if (intent.action === 'REFINE_SEARCH') {
      response = await this.refineSearch(intent.data);
    } else if (intent.action === 'SELECT_OPTION') {
      response = await this.selectOption(intent.data);
    } else if (intent.action === 'BOOK_TRIP') {
      response = await this.bookTrip(intent.data);
    } else if (intent.action === 'GET_HELP') {
      response = this.getHelp();
    } else {
      response = this.getHelp();
    }

    console.log(`\n🤖 Agent: ${response.message}`);
    
    this.conversationHistory.push({
      role: 'assistant',
      content: response,
      timestamp: new Date()
    });

    return response;
  }

  // ============================================================
  // STEP 1: USE GEMINI TO UNDERSTAND USER INTENT
  // ============================================================
  async extractIntent(userMessage) {
    if (!this.geminiApiKey) {
      // Fallback without Gemini - simple keyword matching
      return this.extractIntentLocal(userMessage);
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{
            parts: [{
              text: `You are a travel agent assistant. Analyze this user message and extract their intent.

User message: "${userMessage}"

Current trip details: ${JSON.stringify(this.currentTrip)}

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "action": "SEARCH_TRIPS|REFINE_SEARCH|SELECT_OPTION|BOOK_TRIP|GET_HELP",
  "data": {
    "origin": "city code or null",
    "destination": "city code or null",
    "departureDate": "YYYY-MM-DD or null",
    "nights": "number or null",
    "groupSize": "number or null",
    "budget": "number or null",
    "prefers": "AC_SLEEPER|AC|NON_AC or null"
  },
  "confidence": 0-100
}

Rules:
- If user wants to search: action = SEARCH_TRIPS
- If user wants to filter/refine: action = REFINE_SEARCH
- If user selects one: action = SELECT_OPTION
- If user wants to book: action = BOOK_TRIP
- If confused: action = GET_HELP
- Use Indian city codes: MAA (Chennai), BLR (Bangalore), DEL (Delhi), MYS (Mysore), VJA (Vijayawada), HYD (Hyderabad)
- Extract numbers from text: "7 friends" = groupSize: 7`
            }]
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 }
        }
      );

      const content = response.data.candidates[0].content.parts[0].text;
      
      // Parse JSON (might be wrapped in backticks)
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || 
                       content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      
      return JSON.parse(jsonStr);
    } catch (error) {
      console.warn('⚠️  Gemini down, using fallback intent extraction');
      return this.extractIntentLocal(userMessage);
    }
  }

  // Fallback without Gemini
  extractIntentLocal(userMessage) {
    const lower = userMessage.toLowerCase();

    // Extract numbers
    const groupSizeMatch = userMessage.match(/(\d+)\s*(people|person|friends|members|students)/i);
    const groupSize = groupSizeMatch ? parseInt(groupSizeMatch[1]) : null;

    const budgetMatch = userMessage.match(/₹?(\d+[0-9,]*)/);
    const budget = budgetMatch ? parseInt(budgetMatch[1].replace(/,/g, '')) : null;

    const nightsMatch = userMessage.match(/(\d+)\s*(night|day)/i);
    const nights = nightsMatch ? parseInt(nightsMatch[1]) : null;

    // Extract locations (can improve this)
    const locations = {
      'bangalore': 'BLR', 'blr': 'BLR', 'bengaluru': 'BLR',
      'Chennai': 'MAA', 'madras': 'MAA', 'maa': 'MAA',
      'delhi': 'DEL', 'new delhi': 'DEL', 'del': 'DEL',
      'mysore': 'MYS', 'mysuru': 'MYS',
      'vijayawada': 'VJA', 'vijay': 'VJA',
      'hyderabad': 'HYD'
    };

    let origin = null;
    let destination = null;

    for (const [key, code] of Object.entries(locations)) {
      if (lower.includes(key)) {
        if (!destination) destination = code;
        else if (!origin) origin = code;
      }
    }

    // Determine action
    let action = 'GET_HELP';
    if (lower.includes('search') || lower.includes('find') || lower.includes('look for')) {
      action = 'SEARCH_TRIPS';
    } else if (lower.includes('refine') || lower.includes('filter') || lower.includes('cheaper')) {
      action = 'REFINE_SEARCH';
    } else if (lower.includes('select') || lower.includes('choose') || lower.includes('book')) {
      action = 'BOOK_TRIP';
    }

    return {
      action,
      data: { origin, destination, nights, groupSize, budget },
      confidence: 80
    };
  }

  // ============================================================
  // STEP 2: SEARCH TRIPS
  // ============================================================
  async searchTrips() {
    if (!this.currentTrip.destination || !this.currentTrip.groupSize) {
      return {
        message: `I need a bit more info to search:\n
- Where are you going? (e.g., Bangalore, Delhi, Mysore)
- How many people in your group? (5-20)
- When? (departure date)
- How many nights?

Example: "Find trips to Bangalore for 7 of us, leaving April 20 for 3 nights"`,
        state: 'AWAITING_DETAILS'
      };
    }

    console.log(`\n🔍 Searching for trips...`);
    const trips = MockTravelDataGenerator.generateCompleteTrips(
      this.currentTrip.origin || 'BLR',
      this.currentTrip.destination,
      this.currentTrip.departureDate || new Date().toISOString().split('T')[0],
      this.currentTrip.nights || 3,
      this.currentTrip.groupSize
    );

    const tripOptions = trips.recommendations.map((rec, idx) => `
${idx + 1}. **${rec.name}**
   Total: ₹${Math.round(rec.totalCost).toLocaleString('en-IN')}
   Per person: ₹${rec.perPerson}
   - Flight: ${rec.flight.airline} (${rec.flight.duration})
   - Hotel: ${rec.hotel.name} ⭐ ${rec.hotel.stars}
   - Bus: ${rec.bus.operator} (${rec.bus.type})`).join('\n');

    this.currentTrip.searchResults = trips;

    return {
      message: `✈️ Found amazing options for your group of ${this.currentTrip.groupSize}!\n\n${tripOptions}\n\nWhich one interests you? Just say "Option 1" or "Budget Trip"`,
      trips: tripOptions,
      state: 'SHOWING_OPTIONS'
    };
  }

  // ============================================================
  // STEP 3: REFINE SEARCH
  // ============================================================
  async refineSearch(filters) {
    return {
      message: 'Refining search based on your preferences... This feature coming soon!',
      state: 'REFINING'
    };
  }

  // ============================================================
  // STEP 4: SELECT OPTION
  // ============================================================
  async selectOption(data) {
    const optionNum = data.optionNumber || 0;
    if (!this.currentTrip.searchResults) {
      return { message: 'Please search first by saying "I want to book a trip"' };
    }

    const selected = this.currentTrip.searchResults.recommendations[optionNum];
    if (!selected) {
      return { message: 'Invalid option. Please select 1 or 2.' };
    }

    this.currentTrip.selectedFlight = selected.flight;
    this.currentTrip.selectedHotel = selected.hotel;
    this.currentTrip.selectedBus = selected.bus;

    return {
      message: `Perfect! You've selected the ${selected.name} option.\n
      Total cost: ₹${Math.round(selected.totalCost).toLocaleString('en-IN')}
      Per person: ₹${selected.perPerson}
      
      Now I need traveler details to complete the booking:
      - Names
      - Email addresses
      - Phone numbers
      
      Send me: "Name, email, phone | Name2, email2, phone2" (one per line)`,
      state: 'COLLECTING_TRAVELERS'
    };
  }

  // ============================================================
  // STEP 5: BOOK TRIP
  // ============================================================
  async bookTrip(data) {
    if (!this.currentTrip.selectedFlight) {
      return { message: 'Please select a trip option first' };
    }

    // Generate booking confirmation
    const bookingId = `BOOK-${Date.now()}`;
    const totalCost = 
      this.currentTrip.selectedFlight.priceAfterDiscount +
      this.currentTrip.selectedHotel.priceAfterDiscount +
      this.currentTrip.selectedBus.priceAfterDiscount;

    return {
      message: `🎉 Booking confirmed!\n
Booking ID: ${bookingId}
Total: ₹${Math.round(totalCost).toLocaleString('en-IN')}
Per person: ₹${Math.round(totalCost / this.currentTrip.groupSize).toLocaleString('en-IN')}

✈️ Flight: ${this.currentTrip.selectedFlight.airline}
   ${this.currentTrip.selectedFlight.departure} → ${this.currentTrip.selectedFlight.arrival}

🏨 Hotel: ${this.currentTrip.selectedHotel.name}
   ${this.currentTrip.selectedHotel.nights} nights

🚌 Bus: ${this.currentTrip.selectedBus.operator}

Pay now: https://pay.yourapp.com/${bookingId}`,
      bookingId,
      state: 'BOOKING_CONFIRMED'
    };
  }

  // ============================================================
  // HELPER: UPDATE TRIP DETAILS
  // ============================================================
  updateTripDetails(extractedData) {
    if (extractedData.origin) this.currentTrip.origin = extractedData.origin;
    if (extractedData.destination) this.currentTrip.destination = extractedData.destination;
    if (extractedData.departureDate) this.currentTrip.departureDate = extractedData.departureDate;
    if (extractedData.nights) this.currentTrip.nights = extractedData.nights;
    if (extractedData.groupSize) this.currentTrip.groupSize = extractedData.groupSize;
    if (extractedData.budget) this.currentTrip.budget = extractedData.budget;
  }

  // ============================================================
  // HELPER: GET HELP
  // ============================================================
  getHelp() {
    return {
      message: `Hi! 👋 I'm your group travel booking assistant.\n
I can help you book trips for your friends/classmates!\n
Try saying things like:\n
- "I want to book a trip to Bangalore for 7 of us"
- "Find me flights from Chennai to Delhi for 5 people next week"
- "What's the cheapest option for 10 students?"
- "Show me 3-night trip packages"\n
What would you like to do?`,
      state: 'AWAITING_INPUT'
    };
  }

  // ============================================================
  // GET CONVERSATION HISTORY
  // ============================================================
  getHistory() {
    return this.conversationHistory;
  }

  // ============================================================
  // GET CURRENT TRIP STATE
  // ============================================================
  getTrip() {
    return this.currentTrip;
  }
}

module.exports = GroupTravelAgent;

// ============================================================
// USAGE EXAMPLE
// ============================================================

/*
const agent = new GroupTravelAgent();

// Multi-turn conversation
const response1 = await agent.chat("I want to book a trip with my friends");
console.log(response1.message);

const response2 = await agent.chat("We're 7 people, going to Bangalore from Chennai");
console.log(response2.message);

const response3 = await agent.chat("We need 3 nights, budget around 5000 per person");
console.log(response3.message);

const response4 = await agent.chat("Show me the budget option");
console.log(response4.message);

const response5 = await agent.chat("Book it!");
console.log(response5.message);
*/
