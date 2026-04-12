/**
 * EMAIL AGENT
 * 
 * Specialized agent for refining and modifying travel plans
 * Uses tools to access and modify plan, analyze costs, generate emails
 * 
 * Workflow:
 * 1. User generates travel plan
 * 2. Agent appears on the side
 * 3. User can chat with agent to modify plan
 * 4. Agent uses tools to make changes
 * 5. Agent can analyze costs and suggest alternatives
 * 6. Agent can generate email to send to group
 */

const BaseAgent = require('./baseAgent');
const {
  PlanAccessTool,
  ModifyDestinationTool,
  ModifyDatesTool,
  ModifyGroupSizeTool,
  ModifyDurationTool,
  ModifyBudgetTool,
  AddConstraintTool,
  AnalyzeCostTool,
  SuggestAlternativesTool,
  GenerateEmailTool,
  buildPlanSnapshot,
  createAllTools
} = require('./tools/planTools');

function isSummaryRequest(userMessage = '') {
  const text = String(userMessage).toLowerCase();
  const modificationWords = /\b(modif(y|ication)|change|adjust|update|edit|shorten|lengthen|extend|reduce|increase|remove|add|set)\b/i;

  if (modificationWords.test(text)) {
    return false;
  }

  return /\b(summary|summar(y|ize)|overview|current plan|show plan|plan summary|what(?:'s| is) my plan|show me the plan|trip summary|current itinerary|tell me about (?:my|the) trip)\b/i.test(text);
}

class EmailAgent extends BaseAgent {
  constructor(options = {}) {
    const systemPrompt = `You are the travel assistant for a production trip-planning app.

Your job is to help the user understand and refine the current travel plan in a clear, practical, and explanatory way.

What you should do:
1. Explain the current plan in plain language when the user asks for a summary or overview.
2. Use the right tool when the user explicitly asks to change something.
3. Recommend better options when the user asks for alternatives, savings, or trade-offs.
4. Generate a professional email when the user wants to share the plan with a group.

Current plan shape:
- plan.summary.fromPlace / plan.summary.toPlace
- plan.summary.duration / plan.summary.travelers / plan.summary.totalBudget
- plan.bestTime / plan.estimatedBudget
- plan.highlights / plan.packingEssentials / plan.itinerary[]

Tool rules:
- Only use analyzeCosts and suggestAlternatives unless the user gives a concrete modification request.
- Do not call modifyBudget unless the user provides a specific budget value.
- Do not call modifyGroupSize unless the user provides a specific number of people.
- Do not call modifyDestination unless the user gives a destination.
- Do not call modifyDates unless the user gives explicit dates.
- Do not call modifyDuration unless the user asks to shorten, extend, or set the trip length.
- Never guess missing values for a modify tool.

Response style:
- Be concise but informative.
- Explain the effect of any change you make.
- Mention the updated plan facts after a tool run.
- Keep the tone professional and helpful.
- Use minimal emoji, only when it improves readability.

Available tools:
- analyzeCosts: Break down trip cost components and per-person impact.
- suggestAlternatives: Offer cheaper or better travel, hotel, or activity options.
- generateEmail: Draft a shareable email summary for the group.

If the user asks to shorten, extend, or set the trip to a specific number of days, use modifyDuration.
If the user asks for a summary, answer directly from the current plan.
If the user asks for a specific change with values, use the matching modify tool and explain the result.`;

    super({
      name: 'EmailPlanAgent',
      systemPrompt,
      tools: createAllTools(),
      maxHistory: 30,
      ...options
    });

    this.email = options.email || 'group@example.com';
    this.groupId = options.groupId || null;
  }

  /**
   * Override: Set plan context with validation
   */
  setPlan(plan) {
    if (!plan) {
      console.warn('Invalid plan provided to agent');
      return;
    }

    // Store full plan for tools
    this.state.currentPlan = plan;
    
    // Store search results separately for suggestions
    this.state.searchResults = plan.searchResults || null;
    
    return this;
  }

  /**
   * Get plan context for tools (includes all needed data)
   */
  getPlanContext() {
    return JSON.parse(JSON.stringify(this.state.currentPlan || {}));
  }

  /**
   * Helper: Check if plan is 'complete' (all options selected)
   */
  isPlanComplete() {
    const plan = this.state.currentPlan;
    return Boolean(plan && plan.summary && Array.isArray(plan.itinerary) && plan.itinerary.length > 0);
  }

  /**
   * Helper: Get plan summary
   */
  getPlanSummary() {
    const plan = this.state.currentPlan;
    if (!plan) return 'No plan set';

    const snapshot = buildPlanSnapshot(plan);
    const firstHighlight = snapshot.highlights[0] || 'Curated trip plan';
    const firstDay = snapshot.itinerary[0]?.title || 'Itinerary ready';

    return `
📍 ${snapshot.route}
👥 ${snapshot.travelers} people
📅 ${snapshot.duration} days
💰 Budget: ${snapshot.budget}
✨ Best time: ${snapshot.bestTime}
🧭 Highlight: ${firstHighlight}
🗓️ First stop: ${firstDay}
✅ Complete: ${this.isPlanComplete() ? 'Yes ✓' : 'Needs more detail ✗'}
    `.trim();
  }

  /**
   * Enhanced: Process message with plan context
   */
  async processMessage(userMessage) {
    // If user asks for current plan, provide context
    if (isSummaryRequest(userMessage)) {
      this.addToHistory('user', userMessage);
      
      const summary = this.getPlanSummary();
      const response = `Here's your current plan:\n\n${summary}`;
      
      this.addToHistory('assistant', response);
      
      return {
        success: true,
        message: response,
        planSummary: summary,
        status: 'INFO'
      };
    }

    // Normal processing with tool calling
    return super.processMessage(userMessage);
  }

  /**
   * Delegate generation to BaseAgent's agentic loop implementation
   */
  async generateResponse(userMessage) {
    return super.generateResponse(userMessage);
  }

  /**
   * Get agent capabilities (for frontend)
   */
  getCapabilities() {
    return {
      canModifyPlan: ['destination', 'dates', 'duration', 'groupSize', 'budget', 'constraints', 'itinerary'],
      canAnalyze: ['costs', 'alternatives', 'savings'],
      canGenerate: ['email', 'summary', 'itinerary'],
      tools: this.tools.map(t => ({
        name: t.name,
        description: t.description
      }))
    };
  }

  /**
   * Quick modify (direct tool call without Gemini)
   */
  async quickModify(modification) {
    const { type, value } = modification;
    const plan = this.getPlanContext();

    switch (type) {
      case 'destination':
        const tool1 = new ModifyDestinationTool();
        return tool1.execute({ plan, newDestination: value });
      case 'dates':
        const tool2 = new ModifyDatesTool();
        return tool2.execute({ plan, ...value });
      case 'duration':
      case 'tripDuration':
      case 'days':
        const toolDuration = new ModifyDurationTool();
        return toolDuration.execute({ plan, durationDays: value });
      case 'groupSize':
        const tool3 = new ModifyGroupSizeTool();
        return tool3.execute({ plan, newGroupSize: value });
      case 'budget':
        const tool4 = new ModifyBudgetTool();
        return tool4.execute({ plan, newBudget: value });
      default:
        return { error: `Unknown modification type: ${type}` };
    }
  }
}

module.exports = EmailAgent;

/**
 * USAGE EXAMPLE:
 * 
 * const EmailAgent = require('./agents/emailAgent');
 * 
 * const agent = new EmailAgent({ groupId: 'group-123' });
 * 
 * // Set the trip plan
 * agent.setPlan(tripPlan);
 * 
 * // User asks agent to modify plan
 * const response = await agent.processMessage("Change destination to Bangalore");
 * 
 * // Agent will use tools to modify and return updated plan
 * console.log(response.updatedPlan);
 * 
 * // Get updated plan
 * const updatedPlan = agent.getPlan();
 */
