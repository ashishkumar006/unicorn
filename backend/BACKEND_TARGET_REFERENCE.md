# Backend Target Reference
Wanderlust AI Travel Planner — canonical backend blueprint.

## 1. Target Architecture (from design reference)

```
User
  │
  ▼
[ API Gateway / Backend Entry ]  ← server.js
  │   • request validation
  │   • CORS / helmet / rate limit
  │   • auth boundary (stub)
  │
  ├─► /api/travel/*  ──►  Travel Routes
  │       • POST /plan        → generate full package
  │       • POST /details     → tabType breakdown
  │       • GET /status/:sid  → planning logs
  │
  ├─► /api/agent/*  ──►  Agent Routes
  │       • POST /chat        → SSE agent chat
  │       • POST /plan        → init agent plan
  │       • POST /modify      → quick plan edit
  │       • GET  /status      → agent status
  │       • GET  /history/:id → chat history
  │       • POST /reset/:id   → reset agent
  │       • GET  /capabilities→ what agent can do
  │
  ├─► /api/internal/*  ──►  Internal Routes
  │       • GET  /status           → lab status
  │       • POST /research/search  → web search
  │       • POST /research/read-url→ fetch + summarize URL
  │       • POST /browser/run      → headless browser (legacy)
  │       • GET/POST/DEL /memory/* → memory notes
  │       • GET  /summary/:id      → session summary
  │
  ├─► /api/browser/*  ──►  Browser Routes (NEW)
  │       • POST /run         → unified browser run
  │       • POST /screenshot  → capture screenshot
  │       • POST /extract     → extract structured data
  │
  └─► /api/health  ──►  Health Check
          • service availability
```

---

## 1.1 Request Flow (Orchestrator + Router + Tools)

```
Incoming Request
  │
  ▼
[ Router.decide() ]  ← services/router.js
  │   • classifyDomain()      → places | transit | weather | budget | itinerary | research
  │   • classifyModificationType() → destination | dates | duration | groupSize | budget | constraint
  │   • estimateComplexity()  → simple | moderate | complex
  │   • buildProviderPriority() → [google, ola, openstreetmap] (India-first fallback)
  │   • executionMode         → sequential | parallel
  │   • browserEscalation     → true | false
  │   • fallbackChain         → [api google, api ola, browser, web-search, internal-knowledge]
  │
  ▼
[ Orchestrator.generate() ]  ← services/orchestrator.js
  │   Receives: request + routerDecision
  │
  ├─► Phase 1: proposeToolPlan(request)
  │       • LLM: buildSelectionPrompt(request, tools)
  │       • Returns: { intent, needsTools, toolCalls[], assumptions[], missingInfo[], nextQuestion }
  │
  ├─► Phase 2: executeToolPlan(toolPlan, request)
  │       • For each toolCall in toolCalls:
  │           ├─► invokeTool(toolName, args)
  │           │     • PlanAccessTool          → read current plan
  │           │     • ModifyDestinationTool   → change destination
  │           │     • ModifyDatesTool         → change dates
  │           │     • ModifyDurationTool      → change trip length
  │           │     • ModifyGroupSizeTool     → change travelers
  │           │     • ModifyBudgetTool        → change budget
  │           │     • AddConstraintTool       → add preferences
  │           │     • AnalyzeCostTool         → cost breakdown
  │           │     • SuggestAlternativesTool → optimization tips
  │           │     • SearchPlacesTool        → Google/Ola places
  │           │     • OlaMapsTool             → Ola directions/distance/places
  │           │     • OpenStreetMapTool       → OSM geocode
  │           │     • SearchWebTool           → live web search
  │           │     • ReadUrlTool             → fetch + summarize URL
  │           │     • GenerateEmailTool       → draft group email
  │           │
  │           └─► Collects: { toolName, arguments, result }
  │
  ├─► Phase 3: synthesizeResponse(request, toolPlan, toolResults)
  │       • LLM: buildSynthesisPrompt(request, toolPlan, toolResults, tools)
  │       • Returns: { summary, itinerary, travel, hotels, places, food, weather, budget, caveats, followUpQuestions }
  │
  └─► Returns:
        { request, routerDecision, toolPlan, toolResults, response, tools }

```

---

## 1.2 Data Flow Through Services

```
User Input
  │
  ▼
[ Router ]  ← services/router.js
  │   Output: routerDecision (domain, complexity, providerPriority, executionMode, fallbackChain)
  │
  ▼
[ Orchestrator ]  ← services/orchestrator.js
  │   Uses: routerDecision to inform LLM prompts
  │   Output: toolPlan + toolResults + response
  │
  ├─► [ AI_EVAL Gate ]  ← services/aiEvaluation.js (NEW)
  │       • evaluateIntentDetected() → confirm INTENT_DETECTED
  │       • validateTravelPlanPayload() → check bounds
  │       • validateCitations() → check URLs
  │       • evaluateTravelSaveGate() → allow/block save
  │       • evaluateBrowserOutputGate() → validate browser data
  │       • logBlockedEvent() → log to SQLite if blocked
  │
  ├─► [ Fusion Layer ]  ← services/fusion.js (NEW)
  │       • normalizePlaceEntry()  → canonical shape
  │       • dedupeByKey()          → remove duplicates
  │       • mergePlaceSets()       → merge primary + secondary
  │       • scoreCandidate()       → rank by rating + reviews + completeness
  │       • pickBestCandidates()   → top N by score
  │       • buildWorkingMapLink()  → strip map URLs, keep official links
  │       • sanitizeReferenceData() → purge internal URLs
  │
  ├─► [ Browser Runner ]  ← services/browserRunner.js (NEW)
  │       • runBrowserWorkflow()  → execute actions on URL
  │       • takeScreenshot()      → capture page
  │       • extractPageData()    → structured extraction
  │
  ├─► [ Cache ]  ← services/cache.js (NEW)
  │       • get(key)  → read with TTL
  │       • set(key, value, ttl) → write with TTL
  │       • del(key)  → invalidate
  │       • Backend: Map (default) → Redis (when REDIS_URL set)
  │
  ├─► [ Jobs ]  ← services/jobs.js (NEW)
  │       • scheduleJob() → register recurring task
  │       • runJobNow()   → trigger manual run
  │       • getJobStatus() → inspect state
  │       • Default: noop; ready for BullMQ / node-cron
  │
  ├─► [ Auth ]  ← services/auth.js (NEW)
  │       • authMiddleware()  → extract token
  │       • requireAuth()     → gate protected routes
  │       • Default: allows anonymous
  │
  ├─► [ Supporting Stubs ]  (NEW)
  │       • payment.js   → initiatePayment / verifyPayment / getPaymentMethods
  │       • notifier.js  → sendEmail / sendGroupInvite / sendBookingConfirmation
  │       • media.js     → uploadFile / getSignedUrl / deleteFile
  │       • monitoring.js → recordEvent / trackMetric / getServiceHealth
  │
  └─► [ Persistence ]
          • SQLite (db/database.js)
              ├─ conversations  → chat history
              ├─ plans          → saved trip plans
              ├─ rag_documents  → RAG index entries
              └─ internal_memory_notes → lab notes
          • RAG Store (rag/ragStore.js)
              ├─ storePlan()    → index + DB write
              ├─ updatePlan()   → update existing
              ├─ searchPlans()  → keyword search
              └─ getRecentPlans() → recent user plans
```

---

## 2. Current Implementation Status

| Layer | Location | Status | Notes |
|---|---|---|---|
| API Gateway / Entry | `server.js` | Partial | Express + CORS + helmet + rate limiting. No auth boundary. |
| Travel Planner API | `routes/travel.js` | Implemented | `/plan`, `/details`, `/status/:sessionId` |
| Agent API | `routes/agent.js` | Implemented | SSE chat, plan init, modify, RAG endpoints |
| Internal / Browser API | `routes/internal.js`, `routes/browser.js` | Implemented | Legacy `/internal/browser/run` kept; new `/api/browser/*` added |
| Agent Orchestrator | `services/orchestrator.js` | Scaffolded | New central orchestrator module added |
| Routing & Decision Layer | `services/router.js` | Scaffolded | New routing/decision module added |
| API Layer | `scrapers/*`, `services/ollamaClient.js`, `services/internalLab.js`, `services/subagentRunner.js`, `services/olaMaps.js`, `services/openStreetMap.js`, `services/googlePlaces.js` | Implemented | Multiple providers with fallback; Ola + Google + OSM + mock + web |
| Browser Automation Layer | `services/browserRunner.js`, `routes/browser.js`, `test-browser-agent/server.js` | Implemented | Unified API surface at `/api/browser`; legacy service preserved |
| Data Aggregation & Fusion Layer | `services/fusion.js` | Scaffolded | New fusion module added; integration pending |
| LLM Reasoning Layer | `services/ollamaClient.js`, `assistant/travelAssistant.js`, `agents/baseAgent.js`, `agents/emailAgent.js` | Implemented | Gemma cloud; prompt + tool-use loop |
| Cache & Memory | `services/cache.js`, `rag/ragStore.js` + in-memory maps in route files | Scaffolded | New in-memory/Redis-ready cache module added |
| User & Auth | `services/auth.js` | Stub | Placeholder module in place |
| Payment | `services/payment.js` | Stub | Placeholder module in place |
| Notification | `services/notifier.js` | Stub | Placeholder module in place |
| File & Media | `services/media.js` | Stub | Placeholder module in place |
| Monitoring & Analytics | `services/monitoring.js` | Stub | Placeholder module in place |
| Background Jobs | `services/jobs.js` | Stub | No-op scheduler interface in place |

---

## 3. Key Differences vs Target Image

1. **No central Agent Orchestrator service**
   - Intent understanding, strategy, subtask delegation are spread across `EmailAgent`, `BaseAgent`, `travelAssistant.js`, and route handlers.
   - Target image shows this as the prime routing brain.

2. **No Routing & Decision Layer**
   - Provider selection is handled inline.
   - Target image wants a single strategy router deciding API vs browser vs LLM per subtask and execution order.

3. **Browser automation is isolated**
   - `test-browser-agent` runs as its own service.
   - Target image expects browser automation to be a backend layer invoked by the orchestrator.

4. **Cache & Memory is not production-grade**
   - No Redis for hot cache.
   - No vector DB (Qdrant / pgvector) for semantic memory.
   - RAG is keyword-match over JSON docs.

5. **No background job system**
   - No Celery / RQ equivalent.
   - No scheduled crawls, price refreshes, or indexing jobs.

6. **Missing supporting systems**
   - Auth, payment, notifications, file/media, monitoring, analytics are absent.

---

## 4. Reference File Locations

- **Main API server**: `backend/server.js`
- **Travel routes**: `backend/routes/travel.js`
- **Agent routes**: `backend/routes/agent.js`
- **Internal routes**: `backend/routes/internal.js`
- **Browser routes**: `backend/routes/browser.js`
- **Travel planner / fusion**: `backend/services/travelPlanner.js`
- **Transit API service**: `backend/services/transitApi.js` (optional RedBus/AbhiBus/flight APIs; returns null when keys missing)
- **LLM client**: `backend/services/ollamaClient.js`
- **Browser agent service**: `backend/../test-browser-agent/`
- **RAG store**: `backend/rag/ragStore.js`
- **Database**: `backend/db/database.js`
- **Agent framework**: `backend/assistant/*`, `backend/agents/*`

---

## 5. Target Backend To-Do Map

Use this as the canonical target checklist.

### 5.1 Agent Orchestrator
- Add `services/orchestrator.js`
- Responsibilities:
  - Receive user request
  - Decide subtasks
  - Select data source: API / browser / web / internal memory
  - Choose execution mode: parallel or sequential
  - Aggregate tool outputs
  - Call LLM synthesis
  - Append citations / caveats metadata

### 5.2 Routing & Decision Layer
- Add `services/router.js`
- Table-driven or rules-based routing for:
  - flights, hotels, attractions, food, weather, budget, itinerary
  - provider priority: google vs ola vs osm vs browser
  - confidence thresholds

### 5.3 Cache & Memory
- Introduce Redis for:
  - provider response caching
  - rate-limit counters
  - hot agent memory
- Introduce vector DB for:
  - plan embeddings
  - semantic RAG search
- Keep SQLite as durable store

### 5.4 Browser Automation Integration
- Merge `test-browser-agent` into main backend:
  - new route `POST /api/browser/run`
  - new service `services/browserRunner.js`
  - Playwright pool / session reuse
  - Unified result schema

### 5.5 Data Aggregation & Fusion
- Centralize in `services/fusion.js`:
  - normalize provider outputs
  - dedupe by normalized identity
  - compute composite rating / cost
  - produce canonical package format

### 5.6 Supporting Systems
- Auth: `services/auth.js` + middleware
- Payment: `services/payment.js` + webhook routes
- Notification: `services/notifier.js`
- File & Media: `services/media.js`
- Monitoring: structured logs + metrics endpoint
- Background Jobs: queue + scheduler for crawls, indexing, cache refresh

---

## 6. Current Endpoint Map

```
/api/travel/status/:sessionId   GET   planning status logs
/api/travel/plan                POST  generate full travel package
/api/travel/details             POST  detailed breakdown for tabType
/api/agent/chat                 POST  SSE chat with agent
/api/agent/plan                 POST  init / set plan for agent
/api/agent/modify               POST  quick plan modification
/api/agent/status               GET   agent status
/api/agent/capabilities         GET   agent capabilities
/api/agent/history/:userId      GET   chat history
/api/agent/reset/:userId        POST  reset agent
/api/rag/search                 GET   search plans
/api/rag/documents/:userId      GET   list stored plans
/api/rag/stats                  GET   RAG stats
/api/internal/status            GET   internal lab status
/api/internal/research/search   POST  web search
/api/internal/research/read-url POST  fetch + summarize URL
/api/internal/browser/run       POST  headless browser workflow
/api/internal/memory/:userId    GET   memory notes
/api/internal/memory/:userId    POST  save memory note
/api/internal/memory/:userId/:noteId DELETE delete note
/api/internal/summary/:userId   GET   session summary
/api/browser/run                POST  unified browser run
/api/browser/screenshot         POST  capture page screenshot
/api/browser/extract            POST  extract structured page data
/api/health                     GET   health check
```

---

## 7. Canonical Data Contracts

### 7.1 Travel Plan
```json
{
  "summary": {
    "fromPlace": "",
    "toPlace": "",
    "duration": 0,
    "totalBudget": "",
    "travelers": 0,
    "luxuryLevel": ""
  },
  "bestTime": "",
  "estimatedBudget": "",
  "highlights": [],
  "packingEssentials": [],
  "itinerary": [
    {
      "day": 1,
      "date": "",
      "title": "",
      "activities": [
        {
          "time": "Morning",
          "activity": ""
        }
      ]
    }
  ],
  "travel": {
    "description": "",
    "options": []
  },
  "hotels": {
    "options": []
  },
  "places": {
    "categories": []
  },
  "food": {
    "restaurants": [],
    "localSpecialties": [],
    "streetFood": []
  },
  "weather": {},
  "budget": {},
  "searchResults": {},
  "routeInsights": {}
}
```

### 7.2 Agent Chat Response (SSE)
```json
{
  "type": "message | tool_start | tool_end | tool_result_chunk | final | error | done",
  "requestId": "",
  "elapsedMs": 0,
  "content": "",
  "tool": "",
  "source": "",
  "citations": [],
  "sources": [],
  "response": {
    "success": true,
    "message": "",
    "toolsUsed": [],
    "updatedPlan": null,
    "citations": [],
    "sources": [],
    "confidence": null
  },
  "agentStatus": {}
}
```

---

## 8. Recommended Layered Node Structure

```
backend/
  server.js                  # entrypoint, middleware, mounts
  routes/
    travel.js
    travelRoutes.js
    agent.js
    internal.js
  services/
    orchestrator.js           # TARGET: add
    router.js                 # TARGET: add
    travelPlanner.js
    fusion.js                 # TARGET: add
    ollamaClient.js
    internalLab.js
    subagentRunner.js
    travelPrompt.js
    googlePlaces.js
    olaMaps.js
    openStreetMap.js
    llm.js
    browserRunner.js          # TARGET: add
    auth.js                   # TARGET: add
    payment.js                # TARGET: add
    notifier.js               # TARGET: add
    media.js                  # TARGET: add
  agents/
    baseAgent.js
    emailAgent.js
    groupTravelAgent.js
    tools/
      planTools.js
  assistant/
    assistantPrompts.js
    index.js
    mcpClient.js
    toolRegistry.js
    travelAssistant.js
  rag/
    ragStore.js
  db/
    database.js
  scrapers/
    flightScraper.js
    hotelScraper.js
    attractionScraper.js
    restaurantScraper.js
    weatherAPI.js
    weatherData.js
    restaurantsAPI.js
    attractionsAPI.js
    mockDataGenerator.js
    geminiSearchTool.js
    multiProviderSearchTool.js
```

---

## 9. Implementation Priority

1. **Orchestrator + Router** — unifies intent + tool + provider decisions
2. **Fusion Layer** — single normalization + dedup + scoring path
3. **Browser Integration** — merge `test-browser-agent` into routes/services
4. **Cache + Memory Upgrade** — Redis + vector DB interfaces
5. **Background Jobs** — price refresh, crawl scheduler, index maintenance
6. **Supporting Systems** — auth → payments → notifications → monitoring

---

## 10. Non-Negotiable Data Boundaries
- OSM / Google Maps / Ola Maps / map-search URLs are **internal inputs only**.
- Official hotel/restaurant/attraction links only; never generic map placeholders.
- Internal notes, raw tool traces, and routing logic are **not surfaced** to users.

---

## 11. Unified Product User Journeys

For the completion phase, every new or revised backend behavior must support these exact journeys, in this exact flow.

### 11.1 New User Discovery Journey
**Goal:** A brand-new visitor becomes a trip planner with the least friction.

1. Visit site → landing page renders
2. Reads value prop + examples
3. Enters trip parameters:
   - origin, destination, budget, dates, group size
4. Submits plan request
5. Sees structured plan:
   - summary, itinerary, travel options, hotels, places, food, weather, budget breakdown
6. Can save the plan or ask the agent for changes
7. **Gating:**
   - Step 4 block condition: fromPlace + toPlace required; budget must be >= 1; dates validated
   - Step 5 block condition: provider returns data or fusion layer produces estimated values with `estimated` flag
   - Step 6 block condition: AI_EVAL confirms `INTENT_DETECTED` before agent response

### 11.2 Existing User Plan Refinement Journey
**Goal:** A returning user opens a saved plan and modifies it.

1. Authenticated session opens
2. Sees saved plans list
3. Selects an existing plan
4. Agent loads plan into RAG context
5. User asks for modification:
   - "Change destination to Bangalore"
   - "Make it 5 days"
   - "Reduce budget to ₹15,000"
6. Router classifies intent as modificationType
7. Orchestrator calls relevant modification tool
8. Fusion layer re-normalizes affected sections
9. Plan is saved to SQLite + RAG store
10. User sees updated plan with citation-validated fields
11. **Gating:**
   - Step 1 block condition: `authMiddleware` stub allows anonymous for now; later: valid JWT/session
   - Step 6 block condition: `classifyModificationType` returns non-null
   - Step 10 block condition: `INTENT_DETECTED` confirmed by AI_EVAL

### 11.3 AI Agent Deep-Research Journey
**Goal:** User asks complex "current information" questions that require live web research.

1. User types: "What's the best time to visit Goa right now and any travel advisories?"
2. Orchestrator receives message
3. Router classifies domain = research, complexity = moderate
4. Orchestrator proposes tool plan: `searchWeb` then `readUrl` if source looks authoritative
5. Orchestrator executes plan:
   - searchWeb(query)
   - readUrl(top source URL)
6. Fusion layer ingests result; sources are validated
7. Synthesis prompt asks LLM for:
   - summary of findings
   - citations
   - follow-up question
8. Backend returns streamed SSE response with tool-call metadata
9. **Gating:**
   - Step 3 must return `needsTools: true` before execution proceeds
   - Step 6 block condition: only official or reputable URLs kept; map URLs discarded
   - Step 8 block condition: AI_EVAL confirms `INTENT_DETECTED`

### 11.4 Browser Automation Fallback Journey
**Goal:** When APIs fail or live data is needed, backend falls back to browser automation.

1. User asks: "Show me current flight prices from Delhi to Mumbai tomorrow"
2. Router evaluates domain = transit, complexity = moderate
3. Router fallbackChain: [google-API, ola-API, browser, web-search, internal-knowledge]
4. Google API returns partial/no data
5. Orchestrator detects low-confidence API result
6. Router escalates to browser mode
7. Orchestrator requests browser run via `browserRunner.runBrowserWorkflow`
8. Playwright session opens target URL, captures extraction
9. Fusion layer normalizes browser extraction into canonical flight option schema
10. Plan is updated with real-time prices
11. **Gating:**
   - Step 6 block condition: `browserEscalation: true` in router decision
   - Step 9 block condition: output validated against TRAVEL_PLAN_YAML schema
   - Step 10 block condition: AI_EVAL confirms `INTENT_DETECTED`

### 11.5 Group Booking Save-and-Share Journey
**Goal:** Finalize plan and generate shareable output.

1. User finalizes trip plan
2. System assigns planId + userId
3. Save to SQLite plans table
4. Save to RAG store as `plan-{timestamp}-{hex}`
5. Agent generates email draft via `generateEmail` tool
6. Email draft rendered in agent UI for copy
7. User copies or sends externally
8. **Gating:**
   - Step 3 block condition: userId and planData required; planData passes JSON Schema validation
   - Step 4 block condition: RAG index updated; keywords extracted
   - Step 6 block condition: AI_EVAL confirms `INTENT_DETECTED`

---

## 12. Prompt Schedule

The orchestrator and agents follow a strict prompt schedule. Any custom prompt must be inserted at the correct phase.

### 12.1 Orchestrator Phases

| Phase | Name | Prompt | Purpose |
|---|---|---|---|
| 1 | System Prompt | `buildAgentSystemPrompt()` | Policy rules + data boundaries + service catalog + output contract |
| 2 | Selection Prompt | `buildSelectionPrompt(request, tools)` | Decide which tools to call and with what args |
| 3 | Execution | Tool calls with no additional LLM prompt | Execute each tool in sequence |
| 4 | Synthesis Prompt | `buildSynthesisPrompt(request, toolPlan, toolResults, tools)` | Build final structured response from tool outputs |

### 12.2 Agent Phases (EmailAgent / BaseAgent)

| Phase | Name | When |
|---|---|---|
| A | `systemPrompt` injected at agent construction | Always loaded once at startup |
| B | User message + context prompt | At `processMessage()` call |
| C | Tool loop continuation prompt | After each tool result when more tools are needed |
| D | Final response assembly | When `toolsToCall` is empty |
| E | Sources appendix append | If citations exist and message lacks Sources section |

### 12.3 Prompt Contents (authoritative)

**System prompt contract:**
- List available services: API tools (Google Places, Ola Maps, OSM, live web search, URL reader, transit APIs), RAG/Memory, Browser automation, Budget analysis
- Think step by step; identify missing/stale data first, then choose minimum tool set
- Prefer API tools over browser; only escalate to browser on null/timeout/low confidence
- Use RAG/memory first when user references past trips or preferences
- Never invent live values; mark missing/partial fields as `estimated`
- Keep responses concise, operational, structured
- Return JSON only when structured output is requested
- Cite tool facts implicitly
- LINK AND ADDRESS DISCIPLINE rules: no map URLs; official/third-party listing links only; empty string if no verified link

**Selection prompt contract:**
- Output JSON with: `intent`, `needsTools`, `toolCalls[]`, `assumptions[]`, `missingInfo[]`, `nextQuestion`
- Use smallest tool set that answers the request
- Use qualified tool names

**Synthesis prompt contract:**
- Output JSON with: `summary`, `itinerary`, `travel`, `hotels`, `places`, `food`, `weather`, `budget`, `caveats`, `followUpQuestions`
- Treat tool results as source of truth

**Summary request detection (EmailAgent):**
- Trigger on: "summary", "plan summary", "current plan", "what's my plan", "trip summary"
- Bypass tool loop; respond from `buildPlanSnapshot(plan)`

---

## 13. Gateway Conditions, Gating Conditions, and Transition Conditions

Use these exact conditions to decide which phase/journey step executes and when to block.

### 13.1 Gateway Conditions (entry conditions to a phase)

| Phase | Must be true to enter |
|---|---|
| Planning Start | fromPlace, toPlace, budget, dates, groupSize all present |
| Refinement Start | existing plan loaded; `agent.isPlanComplete()` |
| Research Start | `Router.decide().domain` is one of: places, transit, weather, budget, research, or `complexity` >= moderate |
| Browser Fallback | API provider returned null or confidence < threshold OR explicit user request |
| Agent Chat | `userId` present; previous plan state loaded if `planId` or `plan` in context |
| Saving Plan | userId + planId + planData pass schema validation |
| RAG Index | `ragStore.storePlan()` completes without error |

### 13.2 Gating Conditions (block/deny conditions)

| Condition | Effect |
|---|---|
| `validateTripPayload` returns errors array | Return 400 with field-level error list |
| `Budget < 1` or `Travelers > 50` | Reject request at validation layer |
| `pid > limit` per window (rate limiter) | Reject with 429 |
| `activeChatRequests.has(userId)` | Reject new chat request with 429 + queue hint |
| `isEmptyString(response.message)` | Throw CHAT_FAILED |
| `provider returns null` and `browserEscalation is false` | Return partial plan with `estimated` flags |
| `isOfficialBusinessUrl(url) is false` | Omit link field; return empty string |
| `MAP_DOMAIN_PATTERN matches url` | Drop url entirely from output |
| `modificationType is null` | Return SUGGESTION_ERROR + askUserToClarify |
| `aiEvaluationService confirms INTENT_NOT_DETECTED` | Block plan save; return validation error |

### 13.3 Transition Conditions (permitted moves)

| From | To | Trigger |
|---|---|---|
| Landing form submit | Dashboard/Plan view | `POST /api/travel/plan` returns success |
| Plan view | Agent chat | User clicks "Modify plan with AI" |
| Agent chat | Planning Start | `POST /api/agent/chat` completes |
| Any research phase | Browser fallback | API returns null OR confidence low |
| Browser fallback | Output processing | Browser returns structured extraction JSON |
| Output processing | Plan save | `fusion.normalize()` completes |
| Plan save | RAG index | SQLite save succeeds |
| Agent chat | Plan refinement | Router decides `modificationType` is non-null |

---

## 14. Prompt Schedule Details

### 14.1 Travel Prompt Schedule
1. `buildTravelPackagePrompt(trip)` — used by `travelPlanner.js` for main itinerary generation
2. `TRAVEL_SYSTEM_PROMPT` — system prefix for LLM calls
3. `buildTravelReferencePrompt(referenceData, trip)` — injected when sources are present
4. `buildBudgetAllocationPrompt(referenceData, trip)` — injected after data sources return
5. `buildRouteInsights(...)` — post-fusion enrichment step

### 14.2 Agent Prompt Schedule
1. `TRAVEL_ASSISTANT_SYSTEM_PROMPT` — loaded at `EmailAgent` construction
2. `buildToolSelectionPrompt(request, tools)` — Phase 2 of orchestrator
3. `buildSynthesisPrompt(request, toolPlan, toolResults, tools)` — Phase 4 of orchestrator
4. Summary shortcut prompt: inline string interpolation from `buildPlanSnapshot(plan)` when `isSummaryRequest()`

### 14.3 Browser Runner Prompt Schedule
1. Goal statement: user-provided `goal` parameter
2. Action transcript: rendered from `actions` array
3. Extraction validation: schema-mapped to expected result shape

---

## 15. Unified Output Schema

Every phase produces outputs that conform to these schemas.

### 15.1 Travel Plan
```json
{
  "success": true,
  "data": {
    "summary": { ... },
    "itinerary": [ ... ],
    "travel": { "options": [ ... ] },
    "hotels": { "options": [ ... ] },
    "places": { "categories": [ ... ] },
    "food": { "restaurants": [], "localSpecialties": [], "streetFood": [] },
    "weather": {},
    "budget": {},
    "metadata": {
      "primaryProvider": "ola | google",
      "secondaryProvider": "ola | google | null",
      "dataQuality": "estimated | live | mixed",
      "warnings": [],
      "sources": []
    }
  }
}
```

### 15.2 Agent Chat Response
```json
{
  "success": true,
  "message": "",
  "toolsUsed": [],
  "citations": [{ "index": 1, "title": "", "url": "", "snippet": "" }],
  "updatedPlan": null,
  "confidence": 0,
  "agentStatus": {}
}
```

### 15.3 Tool Result Contract
```json
{
  "success": true,
  "provider": "google | ola | openstreetmap | browser | web",
  "summary": "",
  "results": [],
  "citations": [],
  "sources": [],
  "message": "",
  "analysis": ""
}
```

### 15.4 Synthesis Response Contract
```json
{
  "summary": "",
  "itinerary": [],
  "travel": { "options": [] },
  "hotels": { "options": [] },
  "places": { "categories": [] },
  "food": { "restaurants": [], "localSpecialties": [], "streetFood": [] },
  "weather": {},
  "budget": {},
  "caveats": [],
  "followUpQuestions": []
}
```

---

## 16. Validation and Compliance Rules (AI_EVAL embedded)

These rules are enforced server-side **before** data reaches the LLM or the user.

### 16.1 Travel Plan Validation
- `validateTripPayload(body)` must return no errors before proceeding
- Budget, days, travelers must be positive integers within bounds
- Dates must be valid and `endDate >= startDate`
- `fromPlace !== toPlace`

### 16.2 Agent Response Validation
- After `chatJson()` returns JSON, validate:
  - `typeof response === 'object'`
  - `response.toolCalls` is array if present
  - `response.message` is a non-empty string when `toolsToCall.length === 0`
- If validation fails, return `CHAT_FAILED` error to frontend

### 16.3 Citation and Link Validation
- `collectCitationEntries()` must only keep URLs that pass `isOfficialBusinessUrl()`
- `buildWorkingMapLink()` must return empty string for map/search domains
- `formatSourcesSection()` must only include URLs with `isOfficialBusinessUrl(url) === true`

### 16.4 Browser Output Validation
- Browser extraction JSON must be parsed into a normalized plan structure via `fusion.normalizePlaceEntry()`
- Any browser-extracted link must pass `isOfficialBusinessUrl()` before inclusion

### 16.5 AI Evaluation Gate (AI_EVAL)
Every phase transition that modifies or creates plan data must pass:
- `aiEvaluationService.confirmIntentDetected(context)` returns true
- If `INTENT_NOT_DETECTED`:
  - Return validation error
  - Do not modify plan state
  - Log to `conversations` table with `sender = 'system'` and event = `intent_not_detected`

### 16.6 Behavior Rules (non-negotiable)
1. Never expose raw tool calls, error traces, or internal URLs to user-facing output.
2. Never persist partial or malformed plans to SQLite.
3. Never write to RAG unless `storePlan()` or `updatePlan()` confirms DB write.
4. On any 5xx: return 500 with `{ "error": "message" }`, do not leak stack traces.
5. On any LLM timeout: continue with existing tool results or raise opaque error, never retry silently.
6. On browser fallback: purge any intermediate `searchUrl`, `mapUrl`, `embedUrl` from user-facing schema.

---

## 18. Verified Runtime Status

Backend started successfully on `localhost:5000` with:
- `/api/travel`, `/api/agent`, `/api/internal`, `/api/browser`, `/api/health` mounted
- SQLite initialized (`travel.db` tables ready`)
- Legacy `test-browser-agent` service still available as fallback

Verified end-to-end plan generation for `Mumbai → Goa`:
- Deep subagents ran concurrently (accommodation, transit, places, gastronomy)
- Merge pipeline produced: `2 hotels, 3 travel options, 2 place categories, 6 restaurants`
- Browser scraper timeouts and blocked sites handled gracefully via fallback providers

No breaking changes to existing routes. New `/api/browser/*` endpoints scaffolded and mounted.
