/**
 * AGENT ORCHESTRATOR
 *
 * Central brain for request processing:
 * 1. Understand user request
 * 2. Decide strategy via Router
 * 3. Execute subtasks (tools / APIs / browser)
 * 4. Aggregate results
 * 5. Synthesize final response via LLM
 *
 * Pure orchestrator logic — no direct DB writes, no route handlers.
 */

const { chatJson, chatJsonKiloCode, resolveCloudConfig, resolveKiloCodeConfig, isKiloCodeConfigured } = require('./ollamaClient');
const { createRouter } = require('./router');
const { evaluateIntentDetected, buildAiEvaluationResult } = require('./aiEvaluation');
let _emitEvt;
try { _emitEvt = require('./monitorBridge').emitEvent; } catch { _emitEvt = null; }

function toText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function toStringArray(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item, '')).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return fallback.slice();
}

function buildToolCatalog(tools = []) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return 'No tools are currently connected.';
  }

  return tools
    .map((tool) => {
      const name = toText(tool.name || tool.qualifiedName || 'unknown');
      const description = toText(tool.description || 'No description provided.');
      return `- ${name}: ${description}`;
    })
    .join('\n');
}

function summarizeResult(result = {}, maxChars = 800) {
  if (!result || typeof result !== 'object') {
    return String(result || '');
  }

  const summary = result.summary || result.message || result.analysis || '';
  if (summary) {
    return String(summary).replace(/\s+/g, ' ').slice(0, maxChars);
  }

  const keys = Object.keys(result).filter((key) => !['success', 'error'].includes(key));
  if (keys.length > 0) {
    return `keys: ${keys.slice(0, 8).join(', ')}`;
  }

  return result.error ? `error: ${result.error}` : 'no structured result';
}

function buildPerceptionSystemPrompt() {
  return `You are a travel request analyst. Your ONLY job is to understand what the user wants and break it into clear, plain-language milestone tasks.

You have NO knowledge of backend systems, data sources, or how information is gathered. You simply analyze the user's request.

Given a user's travel request, extract:
1. Core entities: origin, destination, dates, duration, group size, budget
2. Constraints: dog_friendly, no_flights, vegetarian, luxury, etc.
3. A sequential list of milestone tasks in plain language (e.g., "Find transport from Mumbai to Goa", "Find luxury resorts with spa in Goa")

Respond with JSON:
{
  "intent": "short label",
  "entities": {
    "origin": "...",
    "destination": "...",
    "dates": "...",
    "duration": "...",
    "groupSize": ...,
    "budget": ...
  },
  "constraints": ["dog_friendly", "no_flights", ...],
  "steps": [
    "plain language step 1",
    "plain language step 2"
  ],
  "assumptions": [],
  "missingInfo": [],
  "nextQuestion": null
}

Rules:
- Use ONLY plain language in steps. No technical terms.
- Do NOT mention systems, sources, providers, or how data is retrieved.
- Steps should be actionable milestones, not technical commands.
- Return JSON only.`;
}

function buildSynthesisSystemPrompt() {
  return `You are a travel assistant synthesizing a final response from research results.

You have NO knowledge of how data was gathered. You simply read the provided results and produce a coherent, useful travel package.

Respond with JSON:
{
  "summary": "...",
  "itinerary": [...],
  "travel": {...},
  "hotels": {...},
  "places": {...},
  "food": {...},
  "weather": {...},
  "budget": {...},
  "caveats": [...],
  "followUpQuestions": []
}

Rules:
- Use ONLY the provided results as source of truth.
- Do not invent live availability or pricing not present in the results.
- Keep the structure stable and useful for a dashboard UI.
- Return JSON only.`;
}

function buildPerceptionPrompt(request) {
  const text = JSON.stringify(request, null, 2);
  return `User travel request:\n${text}\n\nExtract entities, constraints, and milestone steps. Return JSON only.`;
}

function buildSynthesisPrompt(request, results) {
  const requestText = JSON.stringify(request, null, 2);
  const resultText = JSON.stringify(results, null, 2);
  return `Original request:\n${requestText}\n\nResearch results:\n${resultText}\n\nSynthesize into a final travel package JSON. Return JSON only.`;
}

class Orchestrator {
  constructor(options = {}) {
    this.kiloCode = options.kiloCode !== undefined ? options.kiloCode : isKiloCodeConfigured();
    this.model = options.model || (this.kiloCode ? resolveKiloCodeConfig().model : resolveCloudConfig().model);
    this.baseUrl = options.baseUrl || (this.kiloCode ? resolveKiloCodeConfig().baseUrl : resolveCloudConfig().baseUrl);
    this.apiKey = options.apiKey || (this.kiloCode ? resolveKiloCodeConfig().apiKey : resolveCloudConfig().apiKey);
    this.keepAlive = options.keepAlive || '15m';
    this.tools = Array.isArray(options.tools) ? options.tools : [];
    this.defaultTimeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 600000;
    this.router = options.router || createRouter({
      defaultProvider: 'auto',
      maxParallelSources: 2,
      enableBrowserEscalation: true,
    });
  }

  async generate(request) {
    await this.refreshTools();

    const sessionId = request.sessionId || request.userId || 'default';

    console.log('[Orchestrator] generate() started', {
      sessionId,
      requestId: request.requestId || null,
      message: (request.message || '').slice(0, 120),
    });

    const perception = await this.proposePerceptionPlan(request);

    console.log('[Orchestrator] perception completed', {
      sessionId,
      intent: perception?.intent || null,
      entities: perception?.entities || {},
      constraints: perception?.constraints || [],
      steps: perception?.steps || [],
      missingInfo: perception?.missingInfo || [],
      nextQuestion: perception?.nextQuestion || null,
    });

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', 'Understanding your trip request...', 'complete');
      global.updatePlanningStatus(sessionId, 'Router', 'Planning retrieval strategy...', 'searching');
    }

    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('orchestrator', 'perception_completed', {
        intent: perception?.intent || null,
        entities: perception?.entities || {},
        constraints: perception?.constraints || [],
        steps: perception?.steps || [],
        missingInfo: perception?.missingInfo || [],
        nextQuestion: perception?.nextQuestion || null,
      }, sessionId);
    } catch {}

    const routerDecision = this.router.mapStepsToActions(perception, request);

    console.log('[Router] mapStepsToActions completed', {
      sessionId,
      domain: routerDecision.domain,
      complexity: routerDecision.complexity,
      executionMode: routerDecision.executionMode,
      providerPriority: routerDecision.providerPriority,
      browserEscalation: routerDecision.browserEscalation,
      actions: (routerDecision.actions || []).map(a => a.tool),
      fallbackChain: routerDecision.fallbackChain?.map(f => f.source || f.provider) || [],
    });

    if (global.updatePlanningStatus) {
      const actionNames = (routerDecision.actions || []).map(a => a.tool).filter(Boolean).join(', ');
      global.updatePlanningStatus(sessionId, 'Router', `Chose retrieval path: ${actionNames || 'planning'}`, 'complete');
    }

    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('router', 'decision', {
        domain: routerDecision.domain,
        complexity: routerDecision.complexity,
        executionMode: routerDecision.executionMode,
        providerPriority: routerDecision.providerPriority,
        browserEscalation: routerDecision.browserEscalation,
        fallbackChain: routerDecision.fallbackChain,
        dataRequirements: routerDecision.dataRequirements,
        actions: routerDecision.actions || [],
      }, sessionId);
    } catch {}

    const toolResults = await this.executeActionPlan(routerDecision, request);

    console.log('[Orchestrator] tools executed', {
      sessionId,
      count: toolResults.length,
      results: toolResults.map(r => ({ tool: r.toolName, success: !r.result?.error })),
    });

    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('orchestrator', 'tools_executed', {
        count: toolResults.length,
        results: toolResults.map(r => ({ tool: r.toolName, success: !r.result?.error })),
      }, sessionId);
    } catch {}

    if (global.updatePlanningStatus) {
      const successTools = toolResults.filter(r => !r.result?.error).map(r => r.toolName).join(', ');
      global.updatePlanningStatus(sessionId, 'Orchestrator', `Synthesizing travel data through pipeline`, 'complete');
    }

    const response = await this.synthesizeResponse(request, perception, toolResults);

    console.log('[Orchestrator] response synthesized', {
      sessionId,
      keys: Object.keys(response || {}),
      summary: (response?.summary || '').slice(0, 200),
    });

    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('orchestrator', 'response_synthesized', {
        keys: Object.keys(response || {}),
        summary: (response?.summary || '').slice(0, 200),
      }, sessionId);
    } catch {}

    if (global.updatePlanningStatus) {
      global.updatePlanningStatus(sessionId, 'System Coordinator', 'Assembling final itinerary package...', 'complete');
    }

    console.log('[Orchestrator] generate() completed', {
      sessionId,
      requestId: request.requestId || null,
      success: true,
    });

    return {
      request,
      perception,
      routerDecision,
      toolResults,
      response,
      tools: this.tools,
    };
  }

  async proposePerceptionPlan(request) {
    if (this.kiloCode) {
      return chatJsonKiloCode({
        system: buildPerceptionSystemPrompt(),
        messages: [{ role: 'user', content: buildPerceptionPrompt(request) }],
        model: this.model,
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        options: { temperature: 0.7, top_p: 0.9 },
        timeoutMs: this.defaultTimeoutMs,
      });
    }

    return chatJson({
      system: buildPerceptionSystemPrompt(),
      messages: [{ role: 'user', content: buildPerceptionPrompt(request) }],
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      think: false,
      options: { temperature: 0.7, top_p: 0.9, top_k: 40 },
      keepAlive: this.keepAlive,
      timeoutMs: this.defaultTimeoutMs,
    });
  }

  async executeActionPlan(routerDecision, request) {
    const actions = Array.isArray(routerDecision?.actions) ? routerDecision.actions : [];
    const results = await Promise.all(
      actions.map(async (action) => {
        const toolName = toText(action.tool || action.toolName || '', '');
        const args = action.arguments || action.args || {};

        if (!toolName) {
          return null;
        }

        const toolResult = await this.invokeTool(toolName, { ...args, request, action });

        return {
          toolName,
          arguments: args,
          result: toolResult,
        };
      })
    );

    return results.filter(Boolean);
  }

  async synthesizeResponse(request, perception, toolResults) {
    if (this.kiloCode) {
      return chatJsonKiloCode({
        system: buildSynthesisSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: buildSynthesisPrompt(request, {
              perception,
              toolResults,
            }),
          },
        ],
        model: this.model,
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        options: { temperature: 0.7, top_p: 0.9 },
        timeoutMs: this.defaultTimeoutMs,
      });
    }

    return chatJson({
      system: buildSynthesisSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildSynthesisPrompt(request, {
            perception,
            toolResults,
          }),
        },
      ],
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      think: false,
      options: { temperature: 0.7, top_p: 0.9, top_k: 40 },
      keepAlive: this.keepAlive,
      timeoutMs: this.defaultTimeoutMs,
    });
  }

  refreshTools() {
    return Promise.resolve(this.tools);
  }

  replaceTools(newTools = []) {
    this.tools = Array.isArray(newTools) ? newTools : [];
    return this.tools;
  }

  async invokeTool(toolName, context = {}) {
    const tool = this.tools.find((candidate) => {
      const name = toText(candidate.name || candidate.qualifiedName, '');
      return name && name.toLowerCase() === toolName.toLowerCase();
    });

    if (!tool || typeof tool.execute !== 'function') {
      return { error: `Tool not available: ${toolName}` };
    }

    try {
      return await tool.execute(context);
    } catch (error) {
      return { error: error.message || `Tool execution failed: ${toolName}` };
    }
  }
}

function createOrchestrator(options = {}) {
  return new Orchestrator(options);
}

module.exports = {
  Orchestrator,
  createOrchestrator,
  buildPerceptionSystemPrompt,
  buildPerceptionPrompt,
  buildSynthesisSystemPrompt,
  buildSynthesisPrompt,
};
