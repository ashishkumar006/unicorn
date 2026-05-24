const TRAVEL_SYSTEM_PROMPT = 'You are a professional travel planner. Return only valid JSON. Build practical, realistic travel packages. Use a cost-first planning order, keep routes geographically tight, and do not include commentary. CRITICAL BUDGET CONSTRAINT — YOU MUST ADHERE TO THIS RULE FIRST: The total trip budget is provided by the user and must NEVER be exceeded. The sum of ALL sections (travel, accommodation, food, local transport, activities, miscellaneous) must equal EXACTLY the user-specified total budget in INR. If a user-suggested option listed by subagents would push the total over budget, replace it with a more affordable alternative — there is no exception to this rule. LINK RULES: (a) OSM raw search/map pages, bare Ola Maps static map tiles, Nominatim geocode URLs, and any IRCTC or train-schedule scheduler pages are background research inputs only — never include them in any output field. (b) The "link" field for hotels must be the hotel\'s official website URL or a direct booking page on a reputable travel site (Booking.com, Agoda, MakeMyTrip, Goibibo, Yatra, OYO). (c) The "link" field for restaurants and attractions should be the establishment\'s official or listing page (Zomato, Swiggy, TripAdvisor, Eazymytrip, MakeMyTrip local listings) — NOT a raw map-drive URL like "google.com/maps/search/?api=1…". (d) If you cannot find a verifiable public page for an option, use only the establishment name with no URL — never invent a URL.';

function sanitizeUserInput(text) {
  if (typeof text !== 'string') return '';
  
  // Strip control characters
  let clean = text.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
  
  // Limit length to 500 chars
  clean = clean.substring(0, 500);
  
  // Remove markdown injection attempts
  clean = clean.replace(/```/g, '');
  
  // Remove prompt injection patterns
  const injectionPatterns = [
    /ignore\s+all\s+instructions/gi,
    /ignore\s+previous\s+instructions/gi,
    /system\s*:/gi,
    /assistant\s*:/gi,
    /user\s*:/gi,
    /you\s+are\s+a/gi
  ];
  
  injectionPatterns.forEach(pattern => {
    clean = clean.replace(pattern, '');
  });
  
  return clean.trim();
}

function buildTravelPackagePrompt(trip) {
  let prompt = `Create a structured travel package for this trip.

Trip details:
- From: ${trip.fromPlace}
- To: ${trip.toPlace}
- Start date: ${trip.startDate || 'Not specified'}
- End date: ${trip.endDate || 'Not specified'}
- Days: ${trip.days}
- Travelers: ${trip.travelers}
- Budget: ${trip.budget}
- Luxury level: ${trip.luxuryType}
`;

  const cleanPreferences = trip.userPreferences ? sanitizeUserInput(trip.userPreferences) : '';
  if (cleanPreferences) {
    prompt += `\n- Strict Custom Preferences/Constraints specified by user: "${cleanPreferences}"
You MUST strictly satisfy and incorporate these custom constraints when planning the stays, itinerary, food, and activities. If the user asks for hotel hopping, plan multiple hotels and distribute them across the itinerary days. If the user specifies dietary preferences (like pure vegetarian) or sightseeing pacing (like only sightseeing on the first 3 days), strictly obey them.\n`;
  }

  prompt += `
Return a single JSON object with the top-level keys: plan, travel, hotels, places, food, weather, budget.

Rules:
- Return JSON only. No markdown, no code fences, no commentary.
- Keep the structure consistent and complete.
- Numeric fields must be numbers, not strings, for prices, ratings, and counts.
- Use realistic Indian travel suggestions for the destination and route.
- Plan should include exactly ${trip.days} itinerary days.
- Travel should include 3 options.
- Hotels should include 3 options.
- Places should include at least 3 categories.
- Food should include restaurants, localSpecialties, and streetFood.
- Weather should include a weatherInfo object and a forecast for ${trip.days} days.
- Budget should include accommodation, food, transportation, localTransport, activities, and miscellaneous.
- Use specific names and practical recommendations.
- Keep the total within or close to the input budget AT ALL COSTS. Never overbudget — if any top-level choice pushes the total over the input budget, downgrade it immediately rather than exceed the cap.

Planning algorithm:
1. Read the route, duration, travelers, luxury level, and budget as constraints, not as a fixed split.
2. Estimate the expensive must-have items first: intercity transport, stay nights, and daily local transport.
3. Use the live place list to cluster hotels, restaurants, and attractions by geography so each day stays compact.
4. Estimate food and activity costs after the route and stay choices are clear.
5. Add a buffer only after the essential costs are known.
6. If the budget is tight, reduce discretionary activities before cutting core travel or safe accommodation.

Local transport guidance:
- Include realistic bus, auto/rickshaw, and taxi/cab estimates for the destination.
- If exact fares are unavailable, use conservative planning estimates and label them as estimated in the details.
- Prefer short hops and clustered sightseeing over long cross-city transfers.

Output guidance:
- Make hotel, restaurant, and attraction names map-friendly and specific.
- Mention practical areas or neighborhoods instead of vague city-wide descriptions.
- Keep the itinerary balanced, performant, and easy to execute on the ground.`;

  return prompt;
}

function getTravelPromptPreview(trip) {
  return {
    systemPrompt: TRAVEL_SYSTEM_PROMPT,
    userPrompt: buildTravelPackagePrompt(trip),
  };
}

module.exports = {
  TRAVEL_SYSTEM_PROMPT,
  buildTravelPackagePrompt,
  getTravelPromptPreview,
};
