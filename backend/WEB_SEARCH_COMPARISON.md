/**
 * WEB SEARCH CAPABILITY COMPARISON
 * Which LLM APIs can search the internet?
 * 
 * Updated: April 2026
 */

// ============================================================
// TABLE 1: LLMs WITH WEB SEARCH CAPABILITY
// ============================================================

const webSearchCapable = [
  {
    model: "Google Gemini 2.0 Flash",
    provider: "Google",
    apiEndpoint: "generativelanguage.googleapis.com",
    cost: "FREE (60 requests/min free tier)",
    webSearch: "✅ Native - Built-in",
    realTime: true,
    latency: "Fast (1-3 seconds)",
    accuracy: "Excellent (Google index)",
    setup: "Easy - Single API key",
    recommendation: "⭐⭐⭐⭐⭐ BEST FOR YOU"
  },
  {
    model: "Claude 3.5 Sonnet (with browsing)",
    provider: "Anthropic",
    apiEndpoint: "api.anthropic.com",
    cost: "$3-20 per 1M tokens",
    webSearch: "✅ Extended thinking + Web search",
    realTime: true,
    latency: "Moderate (2-5 seconds)",
    accuracy: "Excellent",
    setup: "Moderate - Need API key",
    recommendation: "⭐⭐⭐⭐"
  },
  {
    model: "GPT-4o with browsing",
    provider: "OpenAI",
    apiEndpoint: "api.openai.com",
    cost: "$0.03-0.06 per 1K tokens",
    webSearch: "✅ Via function calling",
    realTime: true,
    latency: "Fast (1-2 seconds)",
    accuracy: "Excellent",
    setup: "Easy - API key + function definition",
    recommendation: "⭐⭐⭐⭐⭐ Also very good"
  },
  {
    model: "Perplexity API",
    provider: "Perplexity AI",
    apiEndpoint: "api.perplexity.ai",
    cost: "FREE tier available",
    webSearch: "✅ Primary purpose - Real-time search",
    realTime: true,
    latency: "Fast",
    accuracy: "Excellent",
    setup: "Easy",
    recommendation: "⭐⭐⭐⭐⭐ Dedicated for search"
  }
];

// ============================================================
// TABLE 2: LLMs WITHOUT WEB SEARCH (Limited to training data)
// ============================================================

const noWebSearch = [
  {
    model: "Ollama (phi4-mini locally)",
    provider: "Local",
    limitation: "No internet access - local model only",
    recommendation: "❌ Cannot search internet"
  },
  {
    model: "Qwen (via OpenRouter)",
    provider: "Alibaba/OpenRouter",
    limitation: "No native web search",
    recommendation: "❌ Cannot search internet directly"
  },
  {
    model: "Llama 2/3",
    provider: "Meta",
    limitation: "No web search capability",
    recommendation: "❌ Knowledge cutoff limited"
  },
  {
    model: "Mistral",
    provider: "Mistral AI",
    limitation: "No web search (but has agents)",
    recommendation: "⚠️  Limited - needs external tool"
  }
];

// ============================================================
// QUICK COMPARISON
// ============================================================

console.log(`
╔════════════════════════════════════════════════════════════╗
║     WEB SEARCH CAPABILITY - WHICH LLM TO USE?              ║
╚════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────┐
│ RECOMMENDATION FOR YOUR PROJECT: GEMINI 2.0 FLASH           │
├─────────────────────────────────────────────────────────────┤
│ ✅ BEST:   Free tier with unlimited queries after initial  │
│ ✅ SIMPLE: Just add API key to .env, done!                 │
│ ✅ FAST:    1-3 second response time                        │
│ ✅ LEGAL:  100% legal - Google is doing the searching      │
│ ✅ REAL:   Gets real-time data (hotels, flights, etc)      │
│ ✅ JSON:   Returns structured JSON format                  │
│ ✅ NATIVE: Built-in web search, no extra tools needed      │
└─────────────────────────────────────────────────────────────┘

GET YOUR KEY: https://aistudio.google.com/app/apikey

┌─────────────────────────────────────────────────────────────┐
│ SECOND BEST: PERPLEXITY API                                 │
├─────────────────────────────────────────────────────────────┤
│ ✅ Built specifically for web search                        │
│ ✅ Very accurate real-time results                         │
│ ✅ Has free tier                                           │
│ ❌ Slightly slower response                                │
└─────────────────────────────────────────────────────────────┘

GET YOUR KEY: https://www.perplexity.ai/api

┌─────────────────────────────────────────────────────────────┐
│ WHY NOT YOUR CURRENT MODELS?                                │
├─────────────────────────────────────────────────────────────┤
│ 🚫 Ollama (phi4-mini):   Local only, no internet           │
│ 🚫 Qwen (OpenRouter):    No web search capability          │
│ ❌ Older data (training cutoff)                            │
│ ❌ Can't get real-time hotel/flight prices                │
└─────────────────────────────────────────────────────────────┘

╔════════════════════════════════════════════════════════════╗
║              IMPLEMENTATION PATH                            ║
╚════════════════════════════════════════════════════════════╝

1️⃣  Get API Key (2 minutes):
    → Go to: https://aistudio.google.com/app/apikey
    → Copy your key
    → Add to .env: GEMINI_API_KEY=your-key-here

2️⃣  Run test (1 minute):
    → node backend/scrapers/testGemini.js
    → Should see: "✅ Gemini can access internet!"

3️⃣  Use in your chat agent:
    → Gemini searches web for hotels, flights, restaurants
    → Returns real-time data
    → Agent parses and uses it

4️⃣  Multi-turn conversation:
    → User: "Find cheap hotels in Bangalore"
    → Gemini: Searches and returns 5 options
    → User: "Show only under ₹2000"
    → Gemini: Filters previous results
    → User: "Book the first one"
    → Agent: Can execute booking

╔════════════════════════════════════════════════════════════╗
║           WHICH APIs SUPPORT WEB SEARCH?                   ║
╚════════════════════════════════════════════════════════════╝

NATIVE WEB SEARCH (Built-in):
├─ Google Gemini 2.0 Flash ✅ RECOMMENDED
├─ Perplexity API ✅
├─ OpenAI GPT-4o (via function calling) ✅
└─ Claude 3.5 (extended thinking) ✅

NO WEB SEARCH:
├─ Ollama (local only)
├─ Qwen
├─ Llama 2/3
├─ Mistral
└─ Your current setup

╔════════════════════════════════════════════════════════════╗
║            COST ANALYSIS FOR YOUR USE CASE                 ║
╚════════════════════════════════════════════════════════════╝

Gemini 2.0 Flash (WINNER 🏆):
  → FREE TIER: 60 requests/minute
  → Paid: $0.075 per 1M input tokens
  → Your usage: ~100 requests/day = FREE

Perplexity API:
  → Free tier available
  → Paid: ~$20/month for regular use

GPT-4o:
  → $0.03 per 1K input tokens
  → ~₹2-3 per search
  → ~₹200/month if 100 searches/day

Claude 3.5:
  → More expensive than GPT-4o
  → Good for complex reasoning

WINNER: Gemini (Free + No payment card needed)

╔════════════════════════════════════════════════════════════╗
║                 YOUR ACTION ITEMS                          ║
╚════════════════════════════════════════════════════════════╝

✅ IMMEDIATE (5 minutes):
   1. Get Gemini API key
   2. Add GEMINI_API_KEY to .env
   3. Run: node backend/scrapers/testGemini.js

✅ NEXT (15 minutes):
   1. Integrate geminiSearchTool into your agent
   2. Replace old scrapers with Gemini calls
   3. Test with real data

✅ OPTIONAL (30 minutes):
   1. Add Perplexity as fallback
   2. Create tool selection logic
   3. Cache results for performance
`);

// ============================================================
// CODE EXAMPLES FOR EACH API
// ============================================================

const examples = {
  gemini: `
// GEMINI EXAMPLE (You've got this already!)
const response = await axios.post(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  {
    contents: [{ parts: [{ text: "Search for hotels in Bangalore" }] }]
  }
);
// Returns: Real-time hotel data ✅
  `,
  
  perplexity: `
// PERPLEXITY EXAMPLE
const response = await axios.post(
  'https://api.perplexity.ai/chat/completions',
  {
    model: 'pplx-7b-online',
    messages: [{ role: 'user', content: 'Find hotels in Bangalore' }]
  }
);
// Returns: Real-time search results with sources ✅
  `,
  
  openai: `
// OPENAI GPT-4O EXAMPLE (with tools for search)
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Search for hotels in Bangalore' }],
  tools: [{ type: 'function', function: { name: 'search_web' } }]
});
// Calls search function, returns results ✅
  `
};

console.log('CODE EXAMPLES:\n');
console.log('Gemini:', examples.gemini);
console.log('Perplexity:', examples.perplexity);
console.log('OpenAI:', examples.openai);

module.exports = {
  webSearchCapable,
  noWebSearch,
  examples
};
