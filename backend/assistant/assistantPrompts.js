const TRAVEL_ASSISTANT_SYSTEM_PROMPT = `You are an MCP-enabled travel operations assistant.

Your job is to help a user build a realistic trip by using live tools whenever they are available.

Rules:
- Prefer tool data over general knowledge when a relevant tool exists.
- Do not invent live fares, room inventory, seat availability, weather, or booking confirmations.
- If a tool is missing, unavailable, or returns partial data, say so clearly and mark the affected fields as estimated.
- Keep responses concise, operational, and structured.
- Return JSON only when the caller asks for structured output.
- When tool results are available, cite them implicitly by using the returned facts rather than guessing.
`;

function formatToolCatalog(tools = []) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return 'No tools are currently connected.';
  }

  return tools
    .map((tool) => {
      const qualifiedName = tool.qualifiedName || tool.name;
      const description = tool.description || 'No description provided.';
      return `- ${qualifiedName}: ${description}`;
    })
    .join('\n');
}

function buildToolSelectionPrompt(request, tools = []) {
  const requestText = JSON.stringify(request, null, 2);

  return `Travel request:
${requestText}

Available tools:
${formatToolCatalog(tools)}

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

function buildSynthesisPrompt(request, toolPlan, toolResults, tools = []) {
  const requestText = JSON.stringify(request, null, 2);
  const planText = JSON.stringify(toolPlan, null, 2);
  const resultText = JSON.stringify(toolResults, null, 2);
  const toolText = formatToolCatalog(tools);

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

module.exports = {
  TRAVEL_ASSISTANT_SYSTEM_PROMPT,
  buildToolSelectionPrompt,
  buildSynthesisPrompt,
  formatToolCatalog,
};
