/**
 * AI_EVAL GATE HOOKS FOR /api/travel/plan
 *
 * This example shows how to enforce AI_EVAL contract enforcement
 * on the travel planning success path in `routes/travel.js`.
 *
 * It is provided as a reference implementation.
 * Integrate it into `routes/travel.js` if contract enforcement is desired.
 */

const { buildAiEvaluationResult, evaluateIntentDetected, evaluateTravelSaveGate } = require('../services/aiEvaluation');

function withAiEvaluation(saveHandler) {
  return async function wrappedSaveHandler(requestContext) {
    const { requestId = '', userId = 'anonymous', plan = null, planId = null, toolPlan = null, toolResults = [], userMessage = '' } = requestContext;

    const evaluation = evaluateTravelSaveGate({
      userId,
      planId,
      planData: plan,
      previousEval: {
        userMessage,
        toolPlan,
        toolResults,
        modifiedPlan: plan,
      },
    });

    const result = buildAiEvaluationResult({
      eventType: 'plan_save_gate',
      outcome: evaluation.allowed ? 'allowed' : 'blocked',
      reason: evaluation.reason,
      action: evaluation.action,
      context: { userId, requestId },
    });

    if (!evaluation.allowed) {
      return {
        blocked: true,
        evaluation: result,
        reason: evaluation.reason,
        errors: evaluation.errors || [],
      };
    }

    const saveResult = await saveHandler(requestContext);
    return {
      blocked: false,
      evaluation: result,
      saveResult,
    };
  };
}

module.exports = { withAiEvaluation, buildAiEvaluationResult, evaluateIntentDetected, evaluateTravelSaveGate };
