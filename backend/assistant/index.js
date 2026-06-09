const { TravelAssistant, createTravelAssistant } = require('./travelAssistant');
const { McpClientPool, McpServerConnection } = require('./mcpClient');
const { ToolRegistry } = require('./toolRegistry');
const {
  TRAVEL_ASSISTANT_SYSTEM_PROMPT,
  buildToolSelectionPrompt,
  buildSynthesisPrompt,
  formatToolCatalog,
} = require('./assistantPrompts');
const { Router, createRouter, classifyDomain, classifyModificationType, estimateComplexity } = require('../services/router');
const { Orchestrator, createOrchestrator, buildAgentSystemPrompt } = require('../services/orchestrator');

module.exports = {
  TravelAssistant,
  createTravelAssistant,
  McpClientPool,
  McpServerConnection,
  ToolRegistry,
  TRAVEL_ASSISTANT_SYSTEM_PROMPT,
  buildToolSelectionPrompt,
  buildSynthesisPrompt,
  formatToolCatalog,
  Router,
  createRouter,
  classifyDomain,
  classifyModificationType,
  estimateComplexity,
  Orchestrator,
  createOrchestrator,
  buildAgentSystemPrompt,
};
