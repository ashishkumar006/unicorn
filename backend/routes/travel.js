const express = require('express');
const router = express.Router();
const { generateTravelPackage, getTravelDetails } = require('../services/travelPlanner');
const { createRouter } = require('../services/router');
const { createOrchestrator } = require('../services/orchestrator');
const { ragStore } = require('../rag/ragStore');

let _mon;
try {
  _mon = require('../services/monitorBridge');
} catch {
  _mon = { emitEvent: null, emitBatch: null };
}
const emitStep = _mon?.emitEvent;

const planningStatusStore = new Map();
const PLANNING_STATUS_TTL_MS = 1000 * 60 * 30; // 30 minutes
const MAX_PLANNING_STATUS_ENTRIES = 1000;
const MAX_PLACE_LENGTH = 80;
const MAX_PREFERENCES_LENGTH = 2000;

function prunePlanningStatusStore() {
  const now = Date.now();
  for (const [sessionId, entry] of planningStatusStore.entries()) {
    if (now - entry.createdAt > PLANNING_STATUS_TTL_MS) {
      planningStatusStore.delete(sessionId);
    }
  }
  if (planningStatusStore.size > MAX_PLANNING_STATUS_ENTRIES) {
    const entries = [...planningStatusStore.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toRemove = entries.slice(0, entries.length - MAX_PLANNING_STATUS_ENTRIES);
    for (const [sessionId] of toRemove) {
      planningStatusStore.delete(sessionId);
    }
  }
}
const routerDecision = createRouter({ enableBrowserEscalation: true });
const orchestrator = createOrchestrator({
  tools: [
    {
      name: 'generateTravelPackage',
      description: 'Run API layer + subagents + fusion to build a full trip package (travel, hotels, places, food, weather, budget).',
      execute: async (args = {}) => {
        delete args.requestId;
        delete args.message;
        delete args.routerDecision;
        const result = await generateTravelPackage(args);
        return { success: true, provider: 'travel-planner', data: result };
      },
    },
    {
      name: 'ragSearch',
      description: 'Search RAG store for similar past plans, preferences, and context before fetching live data.',
      execute: async (args = {}) => {
        const userId = toText(args.userId || args.sessionId || 'anonymous');
        const query = toText(args.query || args.message || `${args.fromPlace} to ${args.toPlace} trip`);
        const context = ragStore.buildAgentContext(userId, args.plan || { summary: { toPlace: args.toPlace } });
        const results = ragStore.searchPlans(userId, query);
        return { success: true, provider: 'rag', context, results };
      },
    },
    {
      name: 'browserEscalation',
      description: 'Fallback to browser automation when APIs return null, timeout, or low confidence for live data.',
      execute: async (args = {}) => {
        const { runBrowserWorkflow } = require('../services/browserRunner');
        const url = toText(args.url, '');
        if (!url) return { success: false, provider: 'browser', error: 'url required for browser escalation' };
        return runBrowserWorkflow({ url, goal: toText(args.goal, 'extract travel data'), actions: args.actions || [] });
      },
    },
  ],
});

function toText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function createRequestId(prefix = 'travel') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendError(res, status, code, message, details, requestId) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
    details: details || message,
    requestId,
  });
}

function parsePositiveNumber(value, field, errors, { integer = false, min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = integer ? Number.parseInt(value, 10) : Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    errors.push(`${field} must be a number between ${min} and ${max}.`);
    return null;
  }

  return integer ? Math.round(parsed) : parsed;
}

function validateTripPayload(body = {}, { requireTabType = false, requireTripFields = true } = {}) {
  const errors = [];
  const fromPlace = String(body.fromPlace || '').trim();
  const toPlace = String(body.toPlace || '').trim();
  const tabType = String(body.tabType || '').trim();
  const userPreferences = String(body.userPreferences || '').trim();

  if (!fromPlace) errors.push('fromPlace is required.');
  if (!toPlace) errors.push('toPlace is required.');
  if (fromPlace.length > MAX_PLACE_LENGTH) errors.push(`fromPlace must be ${MAX_PLACE_LENGTH} characters or less.`);
  if (toPlace.length > MAX_PLACE_LENGTH) errors.push(`toPlace must be ${MAX_PLACE_LENGTH} characters or less.`);
  if (fromPlace && toPlace && fromPlace.toLowerCase() === toPlace.toLowerCase()) {
    errors.push('fromPlace and toPlace cannot be the same.');
  }
  if (requireTabType && !tabType) errors.push('tabType is required.');
  if (userPreferences.length > MAX_PREFERENCES_LENGTH) {
    errors.push(`userPreferences must be ${MAX_PREFERENCES_LENGTH} characters or less.`);
  }

  const budget = requireTripFields ? parsePositiveNumber(body.budget, 'budget', errors, { min: 1, max: 100000000 }) : parsePositiveNumber(body.budget, 'budget', errors, { min: 1, max: 100000000 });
  const days = body.days == null ? null : parsePositiveNumber(body.days, 'days', errors, { integer: true, min: 1, max: 365 });
  const travelers = body.travelers == null ? 1 : parsePositiveNumber(body.travelers, 'travelers', errors, { integer: true, min: 1, max: 50 });

  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startDate && Number.isNaN(startDate.getTime())) errors.push('startDate must be a valid date.');
  if (body.endDate && Number.isNaN(endDate.getTime())) errors.push('endDate must be a valid date.');
  if (startDate && endDate && endDate < startDate) errors.push('endDate must be the same as or later than startDate.');

  const computedDays = days != null && Number.isFinite(days) && days > 0
    ? days
    : (startDate && endDate)
      ? Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1)
      : 3;

  return {
    errors,
    value: {
      ...body,
      fromPlace,
      toPlace,
      tabType,
      budget,
      days: computedDays,
      travelers,
      userPreferences,
    },
  };
}

global.updatePlanningStatus = (sessionId, agent, text, status, url = '') => {
  if (!sessionId) return;
  prunePlanningStatusStore();
  if (!planningStatusStore.has(sessionId)) {
    planningStatusStore.set(sessionId, { logs: [], createdAt: Date.now() });
  }
  const entry = planningStatusStore.get(sessionId);
  const logs = entry.logs;
  const existingLogIdx = logs.findIndex((log) => log.agent === agent);
  if (existingLogIdx !== -1) {
    logs[existingLogIdx].text = text;
    logs[existingLogIdx].status = status;
    if (url) logs[existingLogIdx].url = url;
    logs[existingLogIdx].timestamp = new Date();
  } else {
    logs.push({ agent, text, status, timestamp: new Date(), url });
  }
  planningStatusStore.set(sessionId, entry);
};

router.get('/status/:sessionId', (req, res) => {
  const requestId = createRequestId('status');
  const { sessionId } = req.params;
  const logs = planningStatusStore.get(sessionId) || [];

  res.json({
    success: true,
    logs,
    version: Date.now(),
    meta: { requestId, dataQuality: 'estimated', warnings: [] },
  });
});

router.post('/plan', async (req, res) => {
  const requestId = createRequestId();
  const startedAt = Date.now();
  let sessionId = null;

  try {
    const { errors, value } = validateTripPayload(req.body);

    if (errors.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid travel planning request.', errors, requestId);
    }

    sessionId = value.sessionId || `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const {
      fromPlace,
      toPlace,
      budget,
      luxuryType = 'semi',
      days,
      startDate,
      endDate,
      travelers,
      provider = 'auto',
      userPreferences,
    } = value;

    const travelRequest = {
      fromPlace,
      toPlace,
      budget,
      luxuryType,
      days,
      startDate,
      endDate,
      travelers,
      provider,
      sessionId,
      userPreferences,
      message: `Plan a trip from ${fromPlace} to ${toPlace} for ${travelers} traveler(s)`,
      requestId,
    };

    const decision = routerDecision.decide(travelRequest);

    // ── Emit Router decision to monitor ─────────────────────────────
    if (emitStep) {
      emitStep('router', 'decision', {
        domain: decision.domain,
        complexity: decision.complexity,
        executionMode: decision.executionMode,
        providerPriority: decision.providerPriority,
        browserEscalation: decision.browserEscalation,
        fallbackChain: decision.fallbackChain,
        dataRequirements: decision.dataRequirements,
      }, sessionId);
    }

    console.info('[TravelAPI] Planning request started', {
      requestId,
      fromPlace,
      toPlace,
      budget,
      luxuryType,
      days,
      travelers,
      provider,
      hasPreferences: Boolean(userPreferences),
      routerDecision: {
        domain: decision.domain,
        executionMode: decision.executionMode,
        providerPriority: decision.providerPriority,
        browserEscalation: decision.browserEscalation,
      },
    });

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'Router', 'Classified request and chose retrieval path', 'searching');
    }

    const orchestratorResult = await orchestrator.generate({
      ...travelRequest,
      routerDecision: decision,
      userId: `travel-${requestId}`,
    });

    console.log('[TravelAPI] orchestrator.generate completed', {
      requestId,
      perception: orchestratorResult?.perception || null,
      routerDecision: orchestratorResult?.routerDecision || null,
      toolResults: orchestratorResult?.toolResults || [],
      responseKeys: orchestratorResult?.response ? Object.keys(orchestratorResult.response) : [],
    });

    // ── Emit orchestrator result summary to monitor ──────────────────
    if (emitStep) {
      emitStep('orchestrator', 'generate_completed', {
        requestId,
        perception: orchestratorResult?.perception || null,
        routerDecision: orchestratorResult?.routerDecision || null,
        toolResultsCount: Array.isArray(orchestratorResult?.toolResults)
          ? orchestratorResult.toolResults.length : 0,
        toolPlan: orchestratorResult?.toolPlan?.toolCalls
          ?.map(t => t.toolName || t.name) || [],
        responseKeys: orchestratorResult?.response
          ? Object.keys(orchestratorResult.response) : [],
      }, sessionId);
    }

    const toolResults = Array.isArray(orchestratorResult?.toolResults) ? orchestratorResult.toolResults : [];
    const toolResult = toolResults.find((item) => item?.result?.success && item?.result?.data);
    const hasGenerateTravelPackage = toolResults.some((item) => item?.toolName === 'generateTravelPackage');

    const fallbackPackageData = toolResult?.result?.data || null;

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'Orchestrator', 'Synthesizing travel data through pipeline', 'complete');
    }

    // Only call fallback generateTravelPackage if no tool was executed at all
    const packageData = fallbackPackageData || (!toolResults.length ? await generateTravelPackage({
      ...value,
      routerDecision: decision,
      requestId,
    }) : null);

    if (!packageData) {
      throw new Error('Travel plan generation failed: orchestrator did not return package data and no fallback was available.');
    }

    console.log('[TravelAPI] package ready', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      itineraryDays: packageData?.plan?.itinerary?.length
        ?? (Array.isArray(packageData?.plan) ? packageData.plan.length : 0)
        ?? 0,
      hotels: packageData?.hotels?.options?.length || 0,
      travel: packageData?.travel?.options?.length || 0,
      food: packageData?.food?.restaurants?.length || 0,
      places: packageData?.places?.categories?.length || 0,
      success: true,
    });

    // ── Emit final package summary to monitor ────────────────────────
    if (emitStep) {
      emitStep('response', 'package_ready', {
        requestId,
        elapsedMs: Date.now() - startedAt,
        budget: packageData?.budget?.total || value?.budget,
        itineraryDays: packageData?.plan?.itinerary?.length
          ?? (Array.isArray(packageData?.plan) ? packageData.plan.length : 0)
          ?? 0,
        hotels: packageData?.hotels?.options?.length || 0,
        travel: packageData?.travel?.options?.length || 0,
        food: packageData?.food?.restaurants?.length || 0,
        places: packageData?.places?.categories?.length || 0,
        warnings: packageData?.meta?.warnings || [],
      }, sessionId);
    }

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', 'Travel package ready', 'complete');
    }

    res.json({
      success: true,
      data: packageData,
      meta: {
        ...(packageData.meta || {}),
        requestId,
        provider,
        elapsedMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    console.error('[TravelAPI] Planning request failed', {
      requestId,
      error: error.message,
      elapsedMs: Date.now() - startedAt,
    });
    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', `Planning failed: ${error.message}`, 'error');
    }
    sendError(res, 500, 'TRAVEL_PLAN_FAILED', 'Failed to generate travel plan.', error.message, requestId);
  }
});

router.post('/details', async (req, res) => {
  const requestId = createRequestId('details');
  const startedAt = Date.now();

  try {
    const { errors, value } = validateTripPayload(req.body, { requireTabType: true, requireTripFields: false });

    if (errors.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid travel details request.', errors, requestId);
    }

    const {
      fromPlace,
      toPlace,
      tabType,
      budget,
      luxuryType = 'semi',
      days,
      startDate,
      endDate,
      travelers,
      provider = 'auto',
      sessionId,
    } = value;

    console.info('[TravelAPI] Details request started', {
      requestId,
      tabType,
      fromPlace,
      toPlace,
      provider,
      hasSessionId: Boolean(sessionId),
    });

    const data = await getTravelDetails(
      { fromPlace, toPlace, budget, luxuryType, days, startDate, endDate, travelers, provider, sessionId },
      tabType
    );

    res.json({
      success: true,
      data,
      meta: {
        requestId,
        provider,
        elapsedMs: Date.now() - startedAt,
        dataQuality: data?.meta?.dataQuality || 'estimated',
        warnings: data?.meta?.warnings || [],
        sources: data?.meta?.sources || [],
      },
    });
  } catch (error) {
    console.error('[TravelAPI] Details request failed', {
      requestId,
      error: error.message,
      elapsedMs: Date.now() - startedAt,
    });
    sendError(res, 500, 'TRAVEL_DETAILS_FAILED', 'Failed to generate detailed data.', error.message, requestId);
  }
});

module.exports = router;
