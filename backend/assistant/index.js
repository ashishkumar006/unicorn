const { TravelAssistant, createTravelAssistant } = require('./travelAssistant');
const { McpClientPool, McpServerConnection } = require('./mcpClient');
const { ToolRegistry } = require('./toolRegistry');
const {
  TRAVEL_ASSISTANT_SYSTEM_PROMPT,
  buildToolSelectionPrompt,
  buildSynthesisPrompt,
  formatToolCatalog,
} = require('./assistantPrompts');

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
};
