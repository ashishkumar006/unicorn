class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(toolDefinition) {
    if (!toolDefinition || !toolDefinition.name) {
      throw new Error('Tool definition requires a name.');
    }

    const normalizedTool = {
      name: toolDefinition.name,
      qualifiedName: toolDefinition.qualifiedName || toolDefinition.name,
      description: toolDefinition.description || '',
      inputSchema: toolDefinition.inputSchema || { type: 'object', properties: {} },
      serverId: toolDefinition.serverId || null,
      serverName: toolDefinition.serverName || null,
      source: toolDefinition.source || 'local',
      handler: toolDefinition.handler,
    };

    this.tools.set(normalizedTool.name, normalizedTool);
    return normalizedTool;
  }

  registerMany(toolDefinitions = []) {
    return toolDefinitions.map((toolDefinition) => this.register(toolDefinition));
  }

  registerProxyTool(toolDefinition) {
    return this.register({
      ...toolDefinition,
      source: toolDefinition.source || 'mcp',
    });
  }

  unregister(name) {
    return this.tools.delete(name);
  }

  has(name) {
    return this.tools.has(name);
  }

  get(name) {
    return this.tools.get(name) || null;
  }

  list() {
    return Array.from(this.tools.values()).map(({ handler, ...tool }) => tool);
  }

  toMcpToolCatalog() {
    return this.list().map((tool) => ({
      name: tool.qualifiedName || tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async call(name, args = {}, context = {}) {
    const tool = this.get(name);

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    if (typeof tool.handler !== 'function') {
      throw new Error(`Tool ${name} does not have a callable handler.`);
    }

    return tool.handler(args, context);
  }

  async callMany(toolCalls = [], context = {}) {
    const results = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.toolName || toolCall.name || toolCall.qualifiedName;

      if (!toolName) {
        continue;
      }

      const args = toolCall.arguments || toolCall.args || {};
      const result = await this.call(toolName, args, context);

      results.push({
        toolName,
        arguments: args,
        result,
      });
    }

    return results;
  }
}

module.exports = {
  ToolRegistry,
};
