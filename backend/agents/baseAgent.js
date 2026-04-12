/**
 * BASE AGENT CLASS
 * 
 * All agents inherit from this
 * Provides common methods for:
 * - Tool calling
 * - Message processing
 * - State management
 * - Conversation tracking
 */

const { chatJson, resolveCloudConfig } = require('../services/ollamaClient');

class BaseAgent {
  constructor(options = {}) {
    this.name = options.name || 'BaseAgent';
    this.systemPrompt = options.systemPrompt || '';
    this.tools = options.tools || [];
    this.conversationHistory = [];
    this.state = {
      isProcessing: false,
      lastToolUsed: null,
      currentPlan: null,
      provider: options.provider || 'gemma-cloud'
    };
    this.maxHistory = options.maxHistory || 20;
  }

  /**
   * Main method: Process user message
   */
  async processMessage(userMessage, onProgress = () => {}) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${this.name}] Processing user message:`, userMessage);
    console.log(`[${this.name}] Provider: ${this.state.provider}`);
    console.log(`[${this.name}] Has plan:`, !!this.state.currentPlan);
    console.log(`[${this.name}] Available tools:`, this.tools.map((tool) => tool.name));

    if (this.state.isProcessing) {
      console.warn(`[${this.name}] Already processing, rejecting new request`);
      return {
        error: 'Agent is busy, please wait',
        status: 'ERROR'
      };
    }

    this.state.isProcessing = true;

    try {
      this.addToHistory('user', userMessage);
      console.log(`[${this.name}] Added message to history`);

      const response = await this.generateResponse(userMessage, onProgress);
      console.log(`[${this.name}] Got response:`, {
        message: response.message?.substring(0, 100),
        toolsUsedCount: response.toolsUsed?.length || 0,
        action: response.action
      });

      this.addToHistory('assistant', response.message);

      return {
        success: true,
        message: response.message,
        toolsUsed: response.toolsUsed || [],
        analysis: response.analysis || null,
        updatedPlan: response.updatedPlan || null,
        status: 'SUCCESS'
      };
    } catch (error) {
      console.error(`[${this.name}] Fatal error:`, error);
      return {
        error: error.message,
        status: 'ERROR'
      };
    } finally {
      this.state.isProcessing = false;
      console.log(`[${this.name}] Processing complete`);
      console.log(`${'='.repeat(60)}\n`);
    }
  }

  /**
   * Generate response using Gemma Cloud + tools
   * Implements agentic loop: LLM → Tools → LLM → ... until done
   */
  async generateResponse(userMessage, onProgress = () => {}) {
    console.log(`\n[${this.name}] === AGENTIC LOOP START ===`);
    console.log(`[${this.name}] User message: "${userMessage}"`);

    const cloudConfig = resolveCloudConfig();
    const toolDescriptions = this.tools.length > 0
      ? this.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')
      : 'No tools are currently registered.';

    console.log(`[${this.name}] Tools available: ${this.tools.length}`);

    let updatedPlan = this.state.currentPlan;
    const allToolResults = [];
    let loopIteration = 0;
    const maxIterations = 2;
    let finalResponse = null;
    let lastAgentResponse = null;
    let initialMessage = '';
    let toolsCalledList = [];

    while (loopIteration < maxIterations) {
      loopIteration++;
      console.log(`\n[${this.name}] ████████████████████████████████████ ITERATION ${loopIteration}/${maxIterations} ████████████████████████████████████`);

      const conversationContext = this.conversationHistory
        .slice(-6)
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

      let loopContext = '';
      if (allToolResults.length > 0) {
        loopContext += `\n\nYou have already executed these tools in this loop:\n`;

        for (let i = 0; i < allToolResults.length; i++) {
          const toolResult = allToolResults[i];
          const toolText =
            toolResult.result?.analysis ||
            toolResult.result?.message ||
            JSON.stringify(toolResult.result);

          loopContext += `\n[Tool ${i + 1}: ${toolResult.tool}]\n`;
          loopContext += `${String(toolText).substring(0, 2000)}\n`;
        }

        loopContext += `\nNow, analyze these results and decide: should you call MORE tools, or provide FINAL answer?`;
      }

      const currentPlanSnapshot = JSON.stringify(updatedPlan || this.state.currentPlan || {}, null, 2);
      const systemPrompt = `You are ${this.name}, a Gemma Cloud travel assistant for a production trip-planning product.

${this.systemPrompt}

Behavior rules:
- Use the smallest possible set of tools needed to answer the user.
- Do not invent trip facts, dates, availability, prices, or confirmations.
- If the user asks to shorten, extend, or otherwise change trip length, use the dedicated duration tool.
- If the user asks for a summary, answer from the current plan without unnecessary tool calls.
- When a tool changes the plan, explain the change clearly and mention the updated facts.
- Keep the user-facing message concise, informative, and explanatory.

Output contract:
- Return valid JSON only.
- The JSON must contain thought, message, toolsToCall, and confidence.
- toolsToCall must be an array of objects shaped like {"name": "toolName", "args": {}}.
- Use an empty toolsToCall array when no more tools are needed.

Available tools:
${toolDescriptions}`;

      const userPrompt = `Conversation history:
${conversationContext || 'No prior conversation.'}

Current plan snapshot:
${currentPlanSnapshot}

Tool results already collected in this loop:
${loopContext || 'None yet.'}

User request:
${userMessage}

Iteration guidance:
${loopIteration === 1
  ? 'This is the first pass. Call only the essential tools you need and explain your intent clearly.'
  : 'This is the final pass. Do not call any more tools. Synthesize a complete, useful answer from the tool results.'}`;

      console.log(`[${this.name}] Iteration ${loopIteration}: Calling Gemma cloud model ${cloudConfig.model}...`);

      let agentResponse = null;

      try {
        agentResponse = await chatJson({
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          model: cloudConfig.model,
          baseUrl: cloudConfig.baseUrl,
          apiKey: cloudConfig.apiKey,
          think: false,
          keepAlive: '15m',
          options: { temperature: 0.25, top_p: 0.9, top_k: 64 }
        });

        console.log(`[${this.name}] Gemma cloud SUCCESS`);
      } catch (error) {
        console.error(`[${this.name}] CRITICAL LLM ERROR:`, error.message);
        throw new Error(`Gemma cloud provider failed: ${error.message}`);
      }

      if (agentResponse && typeof agentResponse === 'object' && Array.isArray(agentResponse.toolCalls) && !agentResponse.toolsToCall) {
        agentResponse.toolsToCall = agentResponse.toolCalls;
      }

      if (!agentResponse.thought) {
        agentResponse.thought = 'Processing...';
      }

      if (!Array.isArray(agentResponse.toolsToCall)) {
        console.warn(`[${this.name}] toolsToCall is not an array, resetting to []`);
        agentResponse.toolsToCall = [];
      }

      if (!agentResponse.message && agentResponse.toolsToCall.length === 0) {
        agentResponse.message = 'Processing complete';
      }

      lastAgentResponse = agentResponse;

      if (agentResponse.thought) {
        onProgress({ type: 'message', content: `💭 **Agent Thinking:** ${agentResponse.thought}` });
      }

      if (loopIteration === 1 && agentResponse.message && agentResponse.toolsToCall.length > 0) {
        onProgress({ type: 'message', content: agentResponse.message });
        initialMessage = agentResponse.message;
      }

      const hasToolsToCall = agentResponse.toolsToCall.length > 0;

      if (hasToolsToCall) {
        if (loopIteration === 1) {
          toolsCalledList = agentResponse.toolsToCall.map((tool) => tool.name || tool.toolName || tool.qualifiedName).filter(Boolean);
        }

        for (const toolCall of agentResponse.toolsToCall) {
          const toolName = toolCall.name || toolCall.toolName || toolCall.qualifiedName;

          if (!toolName) {
            continue;
          }

          onProgress({ type: 'tool_start', tool: toolName });

          const toolArgs = {
            ...(toolCall.args || toolCall.arguments || {}),
            plan: (toolCall.args && toolCall.args.plan) || (toolCall.arguments && toolCall.arguments.plan) || this.state.currentPlan
          };

          try {
            const result = await this.callTool(toolName, toolArgs);

            allToolResults.push({ tool: toolName, result, iteration: loopIteration });

            const resultText = result.analysis || result.message || 'Data updated successfully.';
            const chunks = String(resultText).split('\n\n').filter((chunk) => chunk.trim());

            for (const chunk of chunks) {
              onProgress({
                type: 'tool_result_chunk',
                tool: toolName,
                content: chunk.trim()
              });
            }

            if (result.updatedPlan) {
              updatedPlan = result.updatedPlan;
              this.state.currentPlan = updatedPlan;
            }
          } catch (toolError) {
            allToolResults.push({
              tool: toolName,
              result: { error: toolError.message },
              iteration: loopIteration
            });
          }
        }

        if (agentResponse.toolsToCall.length > 0) {
          this.state.lastToolUsed = agentResponse.toolsToCall[0].name || agentResponse.toolsToCall[0].toolName || agentResponse.toolsToCall[0].qualifiedName || null;
        }

        continue;
      }

      finalResponse = agentResponse;
      break;
    }

    if (!finalResponse) {
      finalResponse = lastAgentResponse || {
        thought: 'Loop completed',
        toolsToCall: [],
        message: 'Processing complete.',
        confidence: 50
      };
    }

    let finalMessage = '';

    if (initialMessage) {
      finalMessage += `${initialMessage}\n`;
    }

    if (allToolResults.length > 0) {
      finalMessage += `\n📊 ${toolsCalledList.join(', ')}:\n`;

      for (const toolResult of allToolResults) {
        const result = toolResult.result;
        let resultText = '';

        if (result && !result.error) {
          if (result.analysis) {
            resultText = result.analysis;
          } else if (result.message) {
            resultText = result.message;
          } else if (typeof result === 'string') {
            resultText = result;
          } else {
            resultText = Object.entries(result)
              .filter(([key]) => !['error', 'success'].includes(key))
              .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
              .join('\n');
          }
        } else {
          resultText = `⚠ Error: ${result?.error || 'Unknown error'}`;
        }

        finalMessage += `\n${resultText}`;
      }
    }

    if (finalResponse.message) {
      finalMessage += finalResponse.message;
    }

    if (!finalMessage) {
      finalMessage = 'Processing complete.';
    }

    return {
      message: finalMessage,
      toolsUsed: allToolResults.map((toolResult) => ({ name: toolResult.tool, iteration: toolResult.iteration })),
      analysis: finalResponse.analysis,
      thought: finalResponse.thought,
      updatedPlan,
      systemPrompt: `You are ${this.name}.\n\n${this.systemPrompt}`
    };
  }

  /**
   * Call a specific tool
   */
  async callTool(toolName, args) {
    console.log(`[${this.name}] Calling tool: ${toolName}`);
    console.log(`[${this.name}] Tool args:`, Object.keys(args || {}));

    const tool = this.tools.find((candidate) => candidate.name === toolName);

    if (!tool) {
      console.error(`[${this.name}] Tool not found: ${toolName}`);
      return { error: `Tool not found: ${toolName}` };
    }

    try {
      const result = await tool.execute(args);
      console.log(`[${this.name}] Tool execution complete. Result keys:`, Object.keys(result || {}));
      return result;
    } catch (error) {
      console.error(`[${this.name}] Tool execution error:`, error.message);
      return { error: error.message };
    }
  }

  /**
   * Add message to conversation history
   */
  addToHistory(role, content) {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date()
    });

    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
    }
  }

  /**
   * Get conversation history
   */
  getHistory() {
    return this.conversationHistory;
  }

  /**
   * Set current plan (for agent to work with)
   */
  setPlan(plan) {
    this.state.currentPlan = plan;
  }

  /**
   * Get current plan
   */
  getPlan() {
    return this.state.currentPlan;
  }

  /**
   * Register a tool
   */
  registerTool(tool) {
    this.tools.push(tool);
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      name: this.name,
      isProcessing: this.state.isProcessing,
      lastToolUsed: this.state.lastToolUsed,
      historyLength: this.conversationHistory.length,
      hasPlan: !!this.state.currentPlan,
      provider: this.state.provider
    };
  }

  /**
   * Reset conversation (start fresh)
   */
  reset() {
    this.conversationHistory = [];
    this.state = {
      isProcessing: false,
      lastToolUsed: null,
      currentPlan: this.state.currentPlan,
      provider: this.state.provider
    };
  }
}

module.exports = BaseAgent;