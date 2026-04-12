const { chatJson, resolveCloudConfig } = require('../services/ollamaClient');
const {
  TRAVEL_ASSISTANT_SYSTEM_PROMPT,
  buildToolSelectionPrompt,
  buildSynthesisPrompt,
} = require('./assistantPrompts');
const { McpClientPool } = require('./mcpClient');
const { ToolRegistry } = require('./toolRegistry');

function buildQualifiedToolName(tool) {
  return `${tool.serverId}:${tool.name}`;
}

class TravelAssistant {
  constructor(options = {}) {
    const config = resolveCloudConfig();

    this.model = options.model || config.model;
    this.baseUrl = options.baseUrl || config.baseUrl;
    this.apiKey = options.apiKey || config.apiKey;
    this.keepAlive = options.keepAlive || '15m';
    this.mcpPool = options.mcpPool || new McpClientPool();
    this.toolRegistry = options.toolRegistry || new ToolRegistry();
  }

  registerMcpServer(serverConfig) {
    return this.mcpPool.registerServer(serverConfig);
  }

  async connectMcpServers() {
    await this.mcpPool.connectAll();
    await this.refreshToolRegistry();
    return this.toolRegistry.list();
  }

  async refreshToolRegistry() {
    const remoteTools = await this.mcpPool.listAllTools();

    for (const tool of remoteTools) {
      const qualifiedName = buildQualifiedToolName(tool);

      this.toolRegistry.registerProxyTool({
        name: qualifiedName,
        qualifiedName,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        serverId: tool.serverId,
        serverName: tool.serverName,
        source: 'mcp',
        handler: (args, context) => this.mcpPool.callTool(tool.serverId, tool.name, args, context),
      });
    }

    return this.toolRegistry.list();
  }

  async proposeToolPlan(request) {
    const tools = this.toolRegistry.list();

    return chatJson({
      system: TRAVEL_ASSISTANT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildToolSelectionPrompt(request, tools),
        },
      ],
      model: this.model,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      think: false,
      options: {
        temperature: 1.0,
        top_p: 0.95,
        top_k: 64,
      },
      keepAlive: this.keepAlive,
    });
  }

  async executeToolPlan(toolPlan, request) {
    const toolCalls = Array.isArray(toolPlan?.toolCalls) ? toolPlan.toolCalls : [];

    return this.toolRegistry.callMany(toolCalls, {
      request,
      toolPlan,
    });
  }

  async synthesizeResponse(request, toolPlan, toolResults) {
    const tools = this.toolRegistry.list();

    return chatJson({
      system: TRAVEL_ASSISTANT_SYSTEM_PROMPT,
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
      options: {
        temperature: 1.0,
        top_p: 0.95,
        top_k: 64,
      },
      keepAlive: this.keepAlive,
    });
  }

  async generate(request) {
    await this.refreshToolRegistry();

    const toolPlan = await this.proposeToolPlan(request);
    const toolResults = await this.executeToolPlan(toolPlan, request);
    const response = await this.synthesizeResponse(request, toolPlan, toolResults);

    return {
      request,
      toolPlan,
      toolResults,
      response,
      tools: this.toolRegistry.list(),
    };
  }
}

function createTravelAssistant(options = {}) {
  return new TravelAssistant(options);
}

module.exports = {
  TravelAssistant,
  createTravelAssistant,
};
