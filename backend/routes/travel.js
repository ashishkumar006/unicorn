const express = require('express');
const router = express.Router();
const { generateTravelPackage, getTravelDetails } = require('../services/travelPlanner');

const planningStatusStore = new Map();
const MAX_PLACE_LENGTH = 80;
const MAX_PREFERENCES_LENGTH = 2000;

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

function validateTripPayload(body = {}, { requireTabType = false } = {}) {
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

  const budget = parsePositiveNumber(body.budget, 'budget', errors, { min: 1, max: 100000000 });
  const days = body.days == null ? null : parsePositiveNumber(body.days, 'days', errors, { integer: true, min: 1, max: 365 });
  const travelers = body.travelers == null ? 1 : parsePositiveNumber(body.travelers, 'travelers', errors, { integer: true, min: 1, max: 50 });

  const startDate = body.startDate ? new Date(body.startDate) : null;
  const endDate = body.endDate ? new Date(body.endDate) : null;
  if (body.startDate && Number.isNaN(startDate.getTime())) errors.push('startDate must be a valid date.');
  if (body.endDate && Number.isNaN(endDate.getTime())) errors.push('endDate must be a valid date.');
  if (startDate && endDate && endDate < startDate) errors.push('endDate must be the same as or later than startDate.');

  return {
    errors,
    value: {
      ...body,
      fromPlace,
      toPlace,
      tabType,
      budget,
      days,
      travelers,
      userPreferences,
    },
  };
}

global.updatePlanningStatus = (sessionId, agent, text, status, url = '') => {
  if (!sessionId) return;
  if (!planningStatusStore.has(sessionId)) {
    planningStatusStore.set(sessionId, []);
  }
  const logs = planningStatusStore.get(sessionId);
  const existingLogIdx = logs.findIndex((log) => log.agent === agent);
  if (existingLogIdx !== -1) {
    logs[existingLogIdx].text = text;
    logs[existingLogIdx].status = status;
    if (url) logs[existingLogIdx].url = url;
    logs[existingLogIdx].timestamp = new Date();
  } else {
    logs.push({ agent, text, status, timestamp: new Date(), url });
  }
  planningStatusStore.set(sessionId, logs);
};

router.get('/status/:sessionId', (req, res) => {
  const requestId = createRequestId('status');
  const { sessionId } = req.params;
  const logs = planningStatusStore.get(sessionId) || [
    { agent: 'System Coordinator', text: 'Initializing multi-agent planning network...', status: 'searching', timestamp: new Date() },
  ];

  res.json({
    success: true,
    logs,
    meta: { requestId, dataQuality: 'estimated', warnings: [] },
  });
});

router.post('/plan', async (req, res) => {
  const requestId = createRequestId();
  const startedAt = Date.now();

  try {
    const { errors, value } = validateTripPayload(req.body);

    if (errors.length > 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid travel planning request.', errors, requestId);
    }

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
      sessionId,
      userPreferences,
    } = value;

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
    });

    const packageData = await generateTravelPackage({
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
    });

    res.json({
      success: true,
      data: packageData.plan,
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
    sendError(res, 500, 'TRAVEL_PLAN_FAILED', 'Failed to generate travel plan.', error.message, requestId);
  }
});

router.post('/details', async (req, res) => {
  const requestId = createRequestId('details');
  const startedAt = Date.now();

  try {
    const { errors, value } = validateTripPayload(req.body, { requireTabType: true });

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
    } = value;

    console.info('[TravelAPI] Details request started', {
      requestId,
      tabType,
      fromPlace,
      toPlace,
      provider,
    });

    const data = await getTravelDetails(
      { fromPlace, toPlace, budget, luxuryType, days, startDate, endDate, travelers, provider },
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
