// In Node (tested via the monitor's own server) use monitorBridge.
// In the browser, fall back to fetch POST.
function emitEvt(layer, event, data, sid) {
  const payload = JSON.stringify({ layer, event, sessionId: sid || 'default', data });
  if (typeof fetch !== 'undefined') {
    return fetch('/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
  try { return require('./monitorBridge').emitEvent(layer, event, data, sid); } catch { return Promise.resolve(); }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runSimulation(sessionId) {
  async function POST(layer, event, data = {}) {
    await emitEvt(layer, event, data, sessionId);
  }

  // ── Stage 1: Router Decision ─────────────────────────────────────
  await POST('router', 'decision', {
    domain: 'places',
    complexity: 'moderate',
    executionMode: 'parallel',
    providerPriority: ['ola', 'google', 'openstreetmap'],
    browserEscalation: false,
    fallbackChain: [
      { source: 'api', provider: 'ola' },
      { source: 'api', provider: 'google' },
      { source: 'api', provider: 'openstreetmap' },
      { source: 'web-search' },
      { source: 'internal-knowledge' },
    ],
    dataRequirements: { restaurants: true, attractions: true },
    actions: [
      { tool: 'placesSearch', arguments: { destination: 'Goa', focus: 'all', constraints: [] } },
      { tool: 'restaurantSearch', arguments: { destination: 'Goa', cuisine: null } },
      { tool: 'hotelSearch', arguments: { destination: 'Goa', dates: '2026-06-20', nights: 5, groupSize: 2, constraints: [] } },
      { tool: 'generateTravelPackage', arguments: { fromPlace: 'Mumbai', toPlace: 'Goa', dates: '2026-06-20', duration: 5, travelers: 2, budget: 50000, constraints: [] } },
    ],
  });
  await delay(300);

  // ── Stage 2: Cache Lookup ────────────────────────────────────────
  await POST('cache', 'lookup_miss', {
    key: 'pkg:mumbai:goa:2:5:50000:semi',
    ttlRemaining: 0,
    reason: 'No cached package for this config',
  });
  await delay(200);

  // ── Stage 3: Orchestrator Perception ─────────────────────────────
  await POST('orchestrator', 'perception_completed', {
    intent: 'plan_trip',
    entities: { origin: 'Mumbai', destination: 'Goa', dates: '2026-06-20', duration: 5, groupSize: 2, budget: 50000 },
    constraints: [],
    steps: [
      'Find transport from Mumbai to Goa',
      'Find hotels in Goa',
      'Find restaurants and attractions in Goa',
    ],
    missingInfo: [],
    nextQuestion: null,
  });
  await delay(250);

  // ── Stage 3b: Browser Subagents ──────────────────────────────────
  await POST('browser', 'subagents_completed', {
    agents: ['AccommodationAgent', 'TransitAgent', 'FoodAgent', 'PlacesAgent'],
    mode: 'parallel',
    accommodation: { options: 18, verifiedRates: 5 },
    transit: { options: 6 },
    food: { restaurants: 32 },
    places: { categories: 14 },
  });
  await delay(500);

  // ── Stage 4: API Reference ───────────────────────────────────────
  await POST('api', 'reference_built', {
    primary: 'ola',
    secondary: 'google',
    destination: 'Goa',
    providers: [
      { name: 'ola_maps', restaurants: 28, attractions: 15 },
      { name: 'google_places', restaurants: 47, attractions: 32 },
    ],
  });
  await delay(200);

  await POST('api', 'places_fetched', {
    provider: 'ola',
    candidates: 43,
    used: 12,
  });
  await delay(300);

  // ── Stage 5: Data Fusion ────────────────────────────────────────
  await POST('fusion', 'normalize_started', {
    sources: 5,
    rawCount: 62,
  });
  await delay(300);

  await POST('fusion', 'dedup_complete', {
    duplicatesRemoved: 9,
    remaining: 53,
    breakdown: { hotels: 2, transit: 1, restaurants: 3, attractions: 3 },
  });
  await delay(250);

  await POST('fusion', 'score_rank', {
    hotels: 6,
    transit: 6,
    restaurants: 8,
    attractions: 10,
  });
  await delay(250);

  // ── Stage 6: LLM Synthesis ──────────────────────────────────────
  await POST('llm', 'synthesize_call', {
    model: 'gemma4:31b-cloud',
    promptSections: ['travel_prompt', 'budget_allocation', 'reference_data', 'fusion_normalized_data'],
    referenceProvider: 'ola',
    fusionInputCounts: {
      hotels: 6,
      transit: 6,
      restaurants: 8,
      attractions: 10,
    },
  });
  await delay(300);

  await POST('orchestrator', 'tools_executed', {
    count: 4,
    results: [
      { tool: 'placesSearch', success: true },
      { tool: 'restaurantSearch', success: true },
      { tool: 'hotelSearch', success: true },
      { tool: 'generateTravelPackage', success: true },
    ],
  });
  await delay(200);

  await POST('orchestrator', 'response_synthesized', {
    keys: ['summary', 'itinerary', 'travel', 'hotels', 'places', 'food', 'weather', 'budget', 'caveats', 'followUpQuestions'],
    summary: '5-day trip from Mumbai to Goa with curated hotels, transport, restaurants, and attractions.',
  });
  await delay(400);

  // ── Stage 7: Response Delivery ──────────────────────────────────
  await POST('response', 'package_ready', {
    requestId: 'req-' + Math.random().toString(36).slice(2, 9),
    elapsedMs: 14200,
    budget: {
      accommodation: { percentage: 35 },
      transportation: { percentage: 25 },
      food: { percentage: 18 },
      localTransport: { percentage: 8 },
      activities: { percentage: 10 },
      miscellaneous: { percentage: 4 },
    },
    itineraryDays: 5,
    hotels: 6,
    travel: 4,
    food: 8,
    places: 10,
    warnings: ['Prices verified as of request time — recheck before booking', 'Monsoon ferry advisory: Day 4'],
    packageSizeBytes: 28400,
  });
}

window.runSimulation = runSimulation;
