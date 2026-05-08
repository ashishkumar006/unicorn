const TRAVEL_SYSTEM_PROMPT = 'You are a professional travel planner. Return only valid JSON. Build practical, realistic travel packages. Use a cost-first planning order, keep routes geographically tight, and do not include commentary.';

function buildTravelPackagePrompt(trip) {
  return `Create a structured travel package for this trip.

Trip details:
- From: ${trip.fromPlace}
- To: ${trip.toPlace}
- Start date: ${trip.startDate || 'Not specified'}
- End date: ${trip.endDate || 'Not specified'}
- Days: ${trip.days}
- Travelers: ${trip.travelers}
- Budget: ${trip.budget}
- Luxury level: ${trip.luxuryType}

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
- Keep the total within or close to the input budget.

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
