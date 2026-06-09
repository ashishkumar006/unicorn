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

const { chatJson, resolveCloudConfig } = require('./ollamaClient');
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

function buildSynthesisPrompt(request, toolPlan, toolResults, tools = []) {
  const requestText = JSON.stringify(request, null, 2);
  const planText = JSON.stringify(toolPlan, null, 2);
  const resultText = JSON.stringify(toolResults, null, 2);
  const toolText = buildToolCatalog(tools);

  return `You are synthesizing the final travel response.

Travel request:
${requestText}

Selected tool plan:
${planText}

Tool results:
${resultText}

Available tools:
${toolText}

Return a final JSON object with these keys:
- summary
- itinerary
- travel
- hotels
- places
- food
- weather
- budget
- caveats
- followUpQuestions

Rules:
- Use the tool results as the source of truth.
- Do not invent live availability or pricing when the tools do not provide it.
- Keep the structure stable and useful for a dashboard UI.
- Return JSON only.`;
}

function buildSelectionPrompt(request, tools = []) {
  const requestText = JSON.stringify(request, null, 2);

  return `Travel request:
${requestText}

Available tools:
${buildToolCatalog(tools)}

Return a JSON object with these keys:
- intent: a short label for the user goal
- needsTools: boolean
- toolCalls: an array of tool call objects in the form { "toolName": string, "arguments": object, "reason": string }
- assumptions: an array of short strings
- missingInfo: an array of short strings
- nextQuestion: null or a short follow-up question

Rules:
- Return JSON only.
- Prefer the smallest tool set that can answer the request.
- If no tool is needed, set needsTools to false and toolCalls to [] .
- Use qualified tool names when the catalog includes them.
- Keep arguments practical and specific.`;
}

function buildAgentSystemPrompt() {
  return `You are the travel operations assistant for a production trip-planning product.

Your job is to help a user build a realistic trip by using live tools whenever they are available.

SERVICES AVAILABLE (use these as your source of truth):
- API tools: Google Places (restaurants, attractions), Ola Maps (routes, places), OpenStreetMap (geocoding), live web search, URL reader, transit APIs (flights, trains, buses)
- RAG / Memory: past travel plans, user preferences, conversation history
- Browser automation: headless browser for sites that block APIs or need live dynamic data
- Budget analysis: cost breakdown, per-person spend, optimization tips

REASONING RULES:
1. Think step by step. First identify what data is missing or stale, then choose the minimum set of tools needed.
2. Prefer API tools over browser tools. Only escalate to browser when APIs return null, timeout, or low confidence.
3. Use RAG/memory first when the user references past trips or preferences.
4. Do not invent live fares, room inventory, seat availability, weather, or booking confirmations.
5. If a tool is missing or returns partial data, mark affected fields as "estimated" and say so clearly.
6. Keep responses concise, operational, and structured.

OUTPUT CONTRACT:
- Return JSON only when the caller asks for structured output.
- Otherwise return a helpful plain-text response.
- When tool results are available, cite them implicitly by using the returned facts.

LINK AND ADDRESS DISCIPLINE (non-negotiable):
- OSM, Google Maps, Ola Maps, and generic map-search URLs are internal research inputs only. Never include them in your response.
- Hotel links must be the official hotel website or a direct booking URL.
- Restaurant links must be the establishment's official page, Zomato, Swiggy, or a reputable listing URL.
- Attraction links must be the official attraction page, TripAdvisor, or a reputable listing URL.
- If no verified official or third-party listing link is available, leave the link field as an empty string — never use a generic map URL as a placeholder.`;
}

class Orchestrator {
  constructor(options = {}) {
    this.model = options.model || resolveCloudConfig().model;
    this.baseUrl = options.baseUrl || resolveCloudConfig().baseUrl;
    this.apiKey = options.apiKey || resolveCloudConfig().apiKey;
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

    const routerDecision = this.router.decide(request);
    const enrichedRequest = { ...request, routerDecision };
    const sessionId = enrichedRequest.userId || enrichedRequest.sessionId || enrichedRequest.sessionId || 'default';

    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('orchestrator', 'generate_started', {
        trip: enrichedRequest,
        decision: { domain: routerDecision.domain, mode: routerDecision.executionMode },
      }, sessionId);
    } catch {}

    const toolPlan = await this.proposeToolPlan(enrichedRequest);
    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('orchestrator', 'tool_plan_proposed', {
        toolCalls: toolPlan?.toolCalls?.map(t => t.toolName || t.name) || [],
        assumptions: toolPlan?.assumptions || [],
        missingInfo: toolPlan?.missingInfo || [],
        nextQuestion: toolPlan?.nextQuestion || null,
      }, sessionId);
    } catch {}

    const toolResults = await this.executeToolPlan(toolPlan, enrichedRequest);
    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('orchestrator', 'tools_executed', {
        count: toolResults.length,
        results: toolResults.map(r => ({ tool: r.toolName, success: !r.result?.error })),
      }, sessionId);
    } catch {}

    const response = await this.synthesizeResponse(enrichedRequest, toolPlan, toolResults);
    try {
      const { emitEvent } = require('./monitorBridge');
      emitEvent('orchestrator', 'response_synthesized', {
        keys: Object.keys(response || {}),
        summary: (response?.summary || '').slice(0, 200),
      }, sessionId);
    } catch {}

    return {
      request: enrichedRequest,
      routerDecision,
      toolPlan,
      toolResults,
      response,
      tools: this.tools,
    };
  }

  async proposeToolPlan(request) {
    return chatJson({
      system: buildAgentSystemPrompt(),
      messages: [{ role: 'user', content: buildSelectionPrompt(request, this.tools) }],
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      think: false,
      options: { temperature: 1.0, top_p: 0.95, top_k: 64 },
      keepAlive: this.keepAlive,
      timeoutMs: this.defaultTimeoutMs,
    });
  }

  async executeToolPlan(toolPlan, request) {
    const toolCalls = Array.isArray(toolPlan?.toolCalls) ? toolPlan.toolCalls : [];
    const results = [];

    for (const toolCall of toolCalls) {
      const toolName = toText(toolCall.toolName || toolCall.name || toolCall.qualifiedName, '');
      const args = toolCall.arguments || toolCall.args || {};

      if (!toolName) {
        continue;
      }

      const toolResult = await this.invokeTool(toolName, { ...args, request, toolPlan });

      results.push({
        toolName,
        arguments: args,
        result: toolResult,
      });
    }

    return results;
  }

  async synthesizeResponse(request, toolPlan, toolResults) {
    const tools = this.tools.map(({ handler, ...tool }) => tool);

    return chatJson({
      system: buildAgentSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildSynthesisPrompt(request, toolPlan, toolResults, tools),
        },
      ],
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      think: false,
      options: { temperature: 1.0, top_p: 0.95, top_k: 64 },
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
  buildAgentSystemPrompt,
};
