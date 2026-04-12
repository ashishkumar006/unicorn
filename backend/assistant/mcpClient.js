let clientLibraryPromise;

async function loadMcpClientLibrary() {
  if (!clientLibraryPromise) {
    clientLibraryPromise = import('@modelcontextprotocol/client');
  }

  return clientLibraryPromise;
}

function toUrl(value) {
  if (value instanceof URL) {
    return value;
  }

  return new URL(value);
}

async function listAllTools(client) {
  const allTools = [];
  let cursor;

  do {
    const response = await client.listTools(cursor ? { cursor } : undefined);
    allTools.push(...(response.tools || []));
    cursor = response.nextCursor;
  } while (cursor);

  return allTools;
}

class McpServerConnection {
  constructor(config = {}) {
    this.config = {
      id: config.id || config.name || 'mcp-server',
      name: config.name || config.id || 'mcp-server',
      transport: config.transport || (config.url ? 'streamable-http' : 'stdio'),
      command: config.command,
      args: Array.isArray(config.args) ? config.args : [],
      url: config.url,
      env: config.env || {},
      transportOptions: config.transportOptions || {},
      clientOptions: config.clientOptions || {},
    };

    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async connect() {
    const { Client, SSEClientTransport, StdioClientTransport, StreamableHTTPClientTransport } = await loadMcpClientLibrary();

    this.client = new Client(
      {
        name: this.config.name,
        version: '1.0.0',
      },
      this.config.clientOptions
    );

    let transport;

    if (this.config.transport === 'stdio') {
      if (!this.config.command) {
        throw new Error(`MCP server ${this.config.id} is missing a stdio command.`);
      }

      transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.config.env,
      });
    } else if (this.config.transport === 'streamable-http') {
      if (!this.config.url) {
        throw new Error(`MCP server ${this.config.id} is missing a streamable HTTP URL.`);
      }

      transport = new StreamableHTTPClientTransport(toUrl(this.config.url), this.config.transportOptions);
    } else if (this.config.transport === 'sse') {
      if (!this.config.url) {
        throw new Error(`MCP server ${this.config.id} is missing an SSE URL.`);
      }

      transport = new SSEClientTransport(toUrl(this.config.url), this.config.transportOptions);
    } else {
      throw new Error(`Unsupported MCP transport type: ${this.config.transport}`);
    }

    await this.client.connect(transport);

    this.transport = transport;
    this.connected = true;
    return this;
  }

  async listTools() {
    if (!this.client) {
      throw new Error(`MCP server ${this.config.id} is not connected.`);
    }

    const tools = await listAllTools(this.client);

    return tools.map((tool) => ({
      ...tool,
      serverId: this.config.id,
      serverName: this.config.name,
      transport: this.config.transport,
    }));
  }

  async callTool(toolName, args = {}, options) {
    if (!this.client) {
      throw new Error(`MCP server ${this.config.id} is not connected.`);
    }

    return this.client.callTool({ name: toolName, arguments: args }, options);
  }

  async close() {
    if (this.transport && typeof this.transport.close === 'function') {
      await this.transport.close();
    }

    this.connected = false;
    this.client = null;
    this.transport = null;
  }
}

class McpClientPool {
  constructor(serverConfigs = []) {
    this.servers = new Map();
    serverConfigs.forEach((serverConfig) => {
      this.registerServer(serverConfig);
    });
  }

  registerServer(config) {
    const connection = new McpServerConnection(config);
    this.servers.set(connection.config.id, connection);
    return connection;
  }

  getServer(serverId) {
    return this.servers.get(serverId) || null;
  }

  listServers() {
    return Array.from(this.servers.values()).map((connection) => ({
      id: connection.config.id,
      name: connection.config.name,
      transport: connection.config.transport,
      connected: connection.connected,
    }));
  }

  async connectAll() {
    for (const connection of this.servers.values()) {
      if (!connection.connected) {
        await connection.connect();
      }
    }

    return this.listServers();
  }

  async closeAll() {
    for (const connection of this.servers.values()) {
      if (connection.connected) {
        await connection.close();
      }
    }
  }

  async listAllTools() {
    const tools = [];

    for (const connection of this.servers.values()) {
      if (!connection.connected) {
        continue;
      }

      const serverTools = await connection.listTools();
      tools.push(...serverTools);
    }

    return tools;
  }

  async callTool(serverId, toolName, args = {}, options) {
    const connection = this.getServer(serverId);

    if (!connection) {
      throw new Error(`Unknown MCP server: ${serverId}`);
    }

    return connection.callTool(toolName, args, options);
  }
}

module.exports = {
  McpServerConnection,
  McpClientPool,
  loadMcpClientLibrary,
};
