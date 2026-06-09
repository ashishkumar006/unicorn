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
  // Node runtime
  try { return require('./monitorBridge').emitEvent(layer, event, data, sid); } catch { return Promise.resolve(); }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Run a realistic multi-iteration ReAct trace so the monitor shows
 * what the LLM is "thinking" at each stage of the planning loop.
 */
async function runSimulation(sessionId) {
  async function POST(layer, event, data = {}) {
    await emitEvt(layer, event, data, sessionId);
  }

  // ── Stage 1: Query understanding (orchestrator) ─────────────────
  await POST('orchestrator', 'generate_started', {
    query: 'Plan a 5-day trip from Mumbai to Goa for 2 adults, budget ₹45,000',
    provider: 'auto',
    complexity: 'moderate',
  });
  await delay(350);

  // ── Stage 1b: Cache layer ───────────────────────────────────────
  await POST('cache', 'lookup_miss', {
    key: 'pkg:mumbai:goa:2:5:45000:semi',
    ttlRemaining: 0,
    reason: 'No cached package for this config',
  });
  await delay(200);
  await delay(250);
  await POST('api', 'reference_built', {
    primary: 'google',
    secondary: 'osm',
    destination: 'Goa',
    providers: [
      { name: 'google_places', restaurants: 47, attractions: 32 },
      { name: 'ola_maps', restaurants: 28, attractions: 15 },
    ],
  });
  await delay(200);
  await POST('api', 'places_fetched', {
    provider: 'google',
    candidates: 79,
    used: 12,
  });
  await delay(300);

  // ── Stage 3b: Browser subagents ──────────────────────────────────
  await POST('browser', 'subagents_completed', {
    agents: ['AccommodationAgent', 'TransitAgent', 'FoodAgent', 'PlacesAgent'],
    mode: 'parallel',
    accommodation: { options: 18, verifiedRates: 5 },
    transit: { options: 6 },
    food: { restaurants: 32 },
    places: { categories: 14 },
  });
  await delay(500);

  // ── Stage 4: Data fusion ────────────────────────────────────────
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

  // ── Stage 5: LLM synthesis pass ────────────────────────────────
  await POST('llm', 'synthesize_call', {
    model: 'gemma4:31b-cloud',
    promptSections: ['travel_prompt', 'budget_allocation', 'reference_data', 'fusion_normalized_data'],
    referenceProvider: 'google',
    fusionInputCounts: {
      hotels: 6,
      transit: 6,
      restaurants: 8,
      attractions: 10,
    },
  });
  await delay(300);

  // ReAct-style thought trace from the main LLM after receiving fusion data
  await POST('llm', 'thought', {
    iteration: 1,
    thought: 'I now have a curated list of 6 hotels, 6 transit options, 8 restaurants, and 10 attractions — all scored, deduped, and with sanitized official links. The ₹45,000 budget needs to cover 5 days for 2 adults. I will now produce a day-wise itinerary frontloading the high-value experiences (Day 1: settle + beach sunset; Day 2: heritage walking; Day 3: excursion + local cuisine; Day 4: relax + markets; Day 5: checkout + departure). I should also surface the monsoon ferry caveat for Day 4.',
  }, sessionId);
  await delay(400);

  await POST('llm', 'tool_call', {
    iteration: 1,
    thought: 'All required tool calls complete — fusion data is ready. Now synthesizing the final package.',
    toolCalls: [
      { name: 'synthesizeResponse', args: { includeCaveats: true, includeBudgetBreakdown: true } },
    ],
  }, sessionId);
  await delay(350);

  await POST('llm', 'tool_result', {
    iteration: 1,
    tool: 'synthesizeResponse',
    success: true,
    toolResult: { keys: ['summary', 'itinerary', 'travel', 'hotels', 'places', 'food', 'weather', 'budget', 'caveats', 'followUpQuestions'] },
    observation: 'Final structured package assembled. Caveat for monsoon ferry added to Day 4.',
  }, sessionId);
  await delay(500);

  // Final LLM synthesis pass
  await POST('llm', 'final_synthesis', {
    iteration: 3,
    thought: 'Creative summary complete. The trip is balanced: heritage + beach, mid-range hotels with '
      + 'one skybar upgrade, Veg + seafood mix for meals, flight+train combo. No regulation conflicts '
      + 'detected. Recommend user recheck flight prices 72hrs before departure.',
    confidence: 0.94,
    model: 'gemma4:31b-cloud',
  }, sessionId);
  await delay(400);

  // ── Stage 6: Response delivery ────────────────────────────────
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