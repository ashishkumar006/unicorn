/**
 * AI EVALUATION SERVICE
 *
 * Completion-phase contract enforcement.
 *
 * Ensures every phase transition still satisfies the spec:
 * - validate request shape
 * - confirm intent detected before save/mutate
 * - log blocked events
 *
 * This file is additive only and does not change current callers.
 */

const db = require('../db/database');

function toText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function classifyEventType({ event = '', userMessage = '', modifiedPlan = null }) {
  const normalized = toText(event, '').toLowerCase();
  const message = toText(userMessage, '').toLowerCase();

  if (!normalized && message) {
    return message.length > 3 ? 'intent_check' : 'noop';
  }

  return normalized || 'unknown';
}

function evaluateIntentDetected({ userMessage = '', toolPlan = null, toolResults = [], modifiedPlan = null } = {}) {
  const message = toText(userMessage, '').trim();

  if (!message || message.length < 3) {
    return {
      detected: false,
      reason: 'empty_or_short_message',
      action: 'BLOCK',
    };
  }

  if (isPlainObject(toolPlan) && Array.isArray(toolPlan.toolCalls) && toolPlan.toolCalls.length > 0) {
    return {
      detected: true,
      reason: 'tool_plan_selected',
      action: 'ALLOW',
    };
  }

  if (Array.isArray(toolResults) && toolResults.length > 0) {
    const hasSuccess = toolResults.some((entry) => entry && isPlainObject(entry.result) && entry.result.success !== false);
    const hasData = toolResults.some((entry) => entry && isPlainObject(entry.result) && Object.keys(entry.result).length > 0);

    if (hasSuccess && hasData) {
      return {
        detected: true,
        reason: 'tool_results_valid',
        action: 'ALLOW',
      };
    }
  }

  if (isPlainObject(modifiedPlan)) {
    return {
      detected: true,
      reason: 'plan_mutation_attempt',
      action: 'ALLOW',
    };
  }

  return {
    detected: false,
    reason: 'no_tool_signals',
    action: 'BLOCK',
  };
}

function isNonNegativeNumber(value) {
  if (typeof value !== 'number') return false;
  return Number.isFinite(value) && value >= 0;
}

function validateTravelPlanPayload(payload = {}) {
  const errors = [];
  const data = payload.data || payload;

  const fromPlace = toText(data.fromPlace, '');
  const toPlace = toText(data.toPlace, '');

  if (!fromPlace) errors.push('fromPlace is required');
  if (!toPlace) errors.push('toPlace is required');
  if (fromPlace && toPlace && fromPlace.toLowerCase() === toPlace.toLowerCase()) {
    errors.push('fromPlace and toPlace cannot be the same');
  }

  const budget = typeof data.budget === 'number' ? data.budget : Number(data.budget);
  if (!Number.isFinite(budget) || budget < 1) {
    errors.push('budget must be a positive number');
  }

  const days = typeof data.days === 'number' ? data.days : Number(data.days);
  if (!Number.isFinite(days) || days < 1) {
    errors.push('days must be a positive integer');
  }

  const travelers = typeof data.travelers === 'number' ? data.travelers : Number(data.travelers);
  if (!Number.isFinite(travelers) || travelers < 1) {
    errors.push('travelers must be a positive integer');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateCitationEntry(entry = {}) {
  if (!isPlainObject(entry)) {
    return { isValid: false, reason: 'not_an_object' };
  }

  const url = toText(entry.url || entry.link || '', '');
  const title = toText(entry.title || entry.name || '', '');

  if (!title) {
    return { isValid: false, reason: 'title_required' };
  }

  if (!url) {
    return { isValid: false, reason: 'url_required' };
  }

  return { isValid: true };
}

function validateCitations(citations = []) {
  if (!Array.isArray(citations) || citations.length === 0) {
    return { isValid: true, issues: [] };
  }

  const issues = [];
  const seen = new Set();

  for (const entry of citations) {
    const result = validateCitationEntry(entry);

    if (!result.isValid) {
      issues.push({ entry, reason: result.reason });
      continue;
    }

    const normalizedUrl = entry.url.toLowerCase();

    if (seen.has(normalizedUrl)) {
      issues.push({ entry, reason: 'duplicate_url' });
      continue;
    }

    seen.add(normalizedUrl);
  }

  return { isValid: issues.length === 0, issues };
}

async function logBlockedEvent({ userId = 'unknown', eventType = 'unknown', reason = '', context = {} }) {
  const trimmedUserId = toText(userId, 'unknown');
  const trimmedReason = toText(reason, 'unknown');

  try {
    await db.saveMessage(trimmedUserId, `AI_EVAL blocked event '${trimmedReason}'`, 'system');
  } catch (error) {
    console.error('[AI_EVAL] Log blocked event error:', error.message);
  }
}

function evaluateTravelSaveGate({ userId = '', planId = '', planData = null, previousEval = null } = {}) {
  if (!userId || !planId || !isPlainObject(planData)) {
    return {
      allowed: false,
      reason: 'invalid_save_parameters',
      action: 'BLOCK',
    };
  }

  const payloadValidation = validateTravelPlanPayload({ data: planData });
  if (!payloadValidation.isValid) {
    return {
      allowed: false,
      reason: 'invalid_plan_payload',
      errors: payloadValidation.errors,
      action: 'BLOCK',
    };
  }

  const intentResult = evaluateIntentDetected(previousEval || {});
  if (!intentResult.detected) {
    return {
      allowed: false,
      reason: 'intent_not_detected',
      action: 'BLOCK',
    };
  }

  return {
    allowed: true,
    reason: 'all_gates_passed',
    action: 'ALLOW',
  };
}

function evaluateBrowserOutputGate({ extractedData = null }) {
  if (!isPlainObject(extractedData)) {
    return { allowed: false, reason: 'empty_browser_output', action: 'BLOCK' };
  }

  const citations = Array.isArray(extractedData.citations) ? extractedData.citations : [];
  const validation = validateCitations(citations);

  if (!validation.isValid) {
    return {
      allowed: false,
      reason: 'invalid_browser_citations',
      issues: validation.issues,
      action: 'BLOCK',
    };
  }

  return { allowed: true, reason: 'browser_output_accepted', action: 'ALLOW' };
}

function buildAiEvaluationResult({ eventType = '', outcome = '', reason = '', action = '', context = {} } = {}) {
  return {
    timestamp: new Date().toISOString(),
    eventType: classifyEventType({ event: eventType, userMessage: context.userMessage, modifiedPlan: context.modifiedPlan }),
    outcome,
    reason,
    action,
    context: {
      userId: toText(context.userId, 'unknown'),
      requestId: toText(context.requestId, ''),
      domain: toText(context.domain, ''),
    },
  };
}

module.exports = {
  evaluateIntentDetected,
  validateTravelPlanPayload,
  validateCitations,
  validateCitationEntry,
  logBlockedEvent,
  evaluateTravelSaveGate,
  evaluateBrowserOutputGate,
  buildAiEvaluationResult,
  isPlainObject,
  toText,
};
