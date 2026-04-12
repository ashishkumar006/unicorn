const TRAVEL_SYSTEM_PROMPT = 'You are a professional travel planner. Return only valid JSON. Build practical, realistic travel packages. Do not include commentary.';

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
- Budget should include accommodation, food, transportation, activities, and miscellaneous.
- Use specific names and practical recommendations.
- Keep the total within or close to the input budget.`;
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
