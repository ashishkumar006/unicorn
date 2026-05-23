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
 * 7. Agent can search Google Places, Ola Maps, or the live web and read source pages when the user needs current information
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
  const researchWords = /\b(search|web|research|browse|read url|source-backed|latest|current|live|weather|price|pricing|schedule|availability)\b/i;

  if (modificationWords.test(text)) {
    return false;
  }

  if (researchWords.test(text)) {
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

Map and Search Boundaries:
- OpenStreetMap (OSM) Rule: OpenStreetMap data must ONLY be used internally for locating places and measuring route distances. NEVER output OSM search links or map preview URLs directly to the user.
- Google Maps API Rule: Google Maps API must only be used to fetch visual photographs and direct official websites (official business websites are located deep in the place details). Do not output direct Google Maps search links to the user.
- Hotel Discovery Flow: When searching or planning stay options:
  1. Fetch details of all available hotels in the target destination from Google Maps API.
  2. Keeping the user's budget, luxury level, and geographic proximity in mind, pick the single most optimized hotel option.
  3. Query its detailed Google Maps profile to extract the official website URL, star rating, and guest reviews.
  4. Present the selected hotel alongside its official direct website URL to the user.

Multi-Agent System Architecture:
- You operate as the System Coordinator of a multi-agent travel planning network.
- When searching, you spawn specialized subagents in parallel to research specific components:
  * HotelFinderAgent: Scans stays on Google Maps and extracts rating/official website details.
  * TransitPlannerAgent: Searches rail schedules and flight fares from origin.
  * GastronomyAgent: Scan dining options and cafe cost splits on Ola Maps.
- You compile and synthesize these search inputs into a highly structured budget trade-off plan.

Tool rules:
- Only use analyzeCosts and suggestAlternatives unless the user gives a concrete modification request.
- Do not call modifyBudget unless the user provides a specific budget value.
- Do not call modifyGroupSize unless the user provides a specific number of people.
- Do not call modifyDestination unless the user gives a destination.
- Do not call modifyDates unless the user provides explicit dates.
- Do not call modifyDuration unless the user asks to shorten, extend, or set the trip length.
- Never guess missing values for a modify tool.
- Use searchPlaces when the user asks for restaurants, attractions, things to do, or destination-specific recommendations. Prefer provider=ola first for India-first searches, and use google when you need richer price-level or rating signals.
- Use olaMaps when the user asks for Ola Maps data, India-first place discovery, or route and distance lookups.
- Use openStreetMap when you need to resolve a destination location and coordinates internally (strictly follow the OSM data boundary rule above).
- Use searchWeb when the user asks for current travel information, live pricing, weather, schedules, or source-backed recommendations.
- Use readUrl when the user shares a link or when search results need deeper verification.

Research workflow:
- For destination-specific place data, use searchPlaces first with provider=ola. Fall back to google when Ola coverage is thin or you need price-level details.
- For Ola-specific or India-first place and route data, use olaMaps.
- For broader current information, use searchWeb so the assistant can collect sources.
- When the answer depends on specific facts, cite those facts inline with markdown links such as [Goa Tourism](https://...).
- Keep a compact Sources section at the end with the most relevant links (such as direct official websites found in Google Maps).
- Prefer source-backed phrasing over vague summaries.
- Do not expose raw tool traces or internal reasoning to the user.

Image Recommendation Rules:
- When recommending a hotel, attraction, dining spot, local beach, or travel option, you MUST include a stunning, specific image in standard markdown format: ![Caption](UnsplashURL).
- Only use high-quality Unsplash image URLs from this validated catalog, choosing distinct URLs to match the specific recommendation:
  * Stays / Hotels (Luxury & Cozy):
    - Stay Option A: https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80 (Elegant facade)
    - Stay Option B: https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=600&q=80 (Resort suite)
    - Stay Option C: https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=80 (Poolside villa)
    - Stay Option D: https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80 (Cozy hotel room)
  * Food / Dining / Restaurants:
    - Dining A (Gourmet): https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80
    - Dining B (Cozy Cafe): https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=600&q=80
    - Dining C (Bar/Lounge): https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=600&q=80
    - Dining D (Gourmet Chef): https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80
  * Transit / Flights / Trains / Cars:
    - Flight window: https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=600&q=80
    - Scenic train: https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=600&q=80
    - Tour bus: https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80
    - Road trip car: https://images.unsplash.com/photo-1506012787146-f92b2d7d6d96?auto=format&fit=crop&w=600&q=80
  * Goa / Beaches / Coastline:
    - Goa Beach A: https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80 (Sunset beach)
    - Goa Beach B: https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=600&q=80 (Sandy coast)
    - Goa Beach C: https://images.unsplash.com/photo-1473116763269-255ea7b0b5f6?auto=format&fit=crop&w=600&q=80 (Palms view)
  * Jaipur / Palaces / Monuments / Heritage:
    - Jaipur Monument A: https://images.unsplash.com/photo-1477587458883-47135fb1a0ee?auto=format&fit=crop&w=600&q=80 (Indian palace)
    - Jaipur Monument B: https://images.unsplash.com/photo-1585135497273-1a86b09fe70e?auto=format&fit=crop&w=600&q=80 (Jaipur street front)
  * Manali / Mountains / Valleys / Snowy Peaks:
    - Manali Snow A: https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=600&q=80 (Evergreens & snow)
    - Manali Scenic B: https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=600&q=80 (Misty green peaks)
  * Kerala / Backwaters / Houseboats:
    - Kerala Houseboat: https://images.unsplash.com/photo-1593693397690-362cb9666fc2?auto=format&fit=crop&w=600&q=80
  * Singapore / Modern gardens / Cityscape:
    - Singapore Skyline: https://images.unsplash.com/photo-1525625293386-3fb8a4013271?auto=format&fit=crop&w=600&q=80
  * Dubai / Skyscrapers / Desert:
    - Dubai Desert / Skyline: https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=600&q=80
- Ensure every travel suggestion has a visual, non-duplicative image context by distributing these options.

Response style:
- Be concise but informative.
- Explain the effect of any change you make.
- Mention the updated plan facts after a tool run.
- Keep the tone professional and helpful.
- Use minimal emoji, only when it improves readability.

Available tools:
- analyzeCosts: Break down trip cost components and per-person impact.
- suggestAlternatives: Offer cheaper or better travel, hotel, or activity options.
- searchPlaces: Look up Ola Maps or Google Places restaurants and attractions with map links.
- olaMaps: Look up Ola Maps places, routes, and distance information for India-first coverage.
- openStreetMap: Resolve a destination into an embedded OpenStreetMap preview and shareable map link.
- searchWeb: Search the live web for current travel information and summarize sources.
- readUrl: Read a specific page and extract the most useful facts.
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
      canResearch: ['google places', 'ola maps', 'web search', 'page reading'],
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
