/**
 * ROUTING & DECISION LAYER
 *
 * Pure routing logic:
 * - Maps request intent/domain to provider/source
 * - Selects execution mode (parallel vs sequential)
 * - Applies fallback rules and guardrails
 *
 * This module is additive only.
 */

let _emitEvt;
try {
  _emitEvt = require('./monitorBridge').emitEvent;
} catch {
  _emitEvt = null;
}

function emitRouter(label, decision, sessionId) {
  if (!_emitEvt) return;
  try {
    _emitEvt('router', label, decision, sessionId);
  } catch {}
}

function normalizeText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function normalizeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function isIndianDestination(text = '') {
  const normalized = normalizeText(text).toLowerCase();
  return /\b(goa|delhi|mumbai|bangalore|bengaluru|chennai|hyderabad|kolkata|jaipur|agra|varanasi|kerala|manali|shimla|udaipur|jodhpur|mysore|pune|cochin|kochi|thiruvananthapuram|coimbatore|madurai|vijayawada|visakhapatnam|bhubaneswar|ranchi|lucknow|amritsar|chandigarh|indore|ahmedabad|surat|nagpur)\b/.test(normalized);
}

function classifyDomain(request = {}) {
  const message = normalizeText(request.message || request.query || '', '').toLowerCase();
  const intent = normalizeText(request.intent || request.domain || '', '').toLowerCase();

  const placeKeywords = /\b(restaurants?|hotels?|stays?|attractions?|places?|sightseeing|cafes?|museums?|beaches?|markets?|resorts?)\b/i;
  const transitKeywords = /\b(flights?|trains?|buses?|cabs?|taxis?|autos?|transport|travel|reach|journey|commute)\b/i;
  const weatherKeywords = /\b(weather|temperature|rain|forecast|climate|sunny|monsoon)\b/i;
  const budgetKeywords = /\b(budget|cost|price|fare|expense|cheap|afford|savings|spend)\b/i;
  const itineraryKeywords = /\b(itinerary|schedule|day|plan|trip|tour|routine|agenda)\b/i;
  const researchKeywords = /\b(search|web|current|latest|live|source|news|status|availability|schedule)\b/i;

  let domain = 'general';

  if (placeKeywords.test(message) || placeKeywords.test(intent)) {
    domain = 'places';
  } else if (transitKeywords.test(message) || transitKeywords.test(intent)) {
    domain = 'transit';
  } else if (weatherKeywords.test(message) || weatherKeywords.test(intent)) {
    domain = 'weather';
  } else if (budgetKeywords.test(message) || budgetKeywords.test(intent)) {
    domain = 'budget';
  } else if (itineraryKeywords.test(message) || itineraryKeywords.test(intent)) {
    domain = 'itinerary';
  } else if (researchKeywords.test(message) || researchKeywords.test(intent)) {
    domain = 'research';
  }

  return domain;
}

function classifyModificationType(message = '') {
  const text = normalizeText(message).toLowerCase();

  if (/\b(destination|place|location|city|where)\b/.test(text)) return 'destination';
  if (/\b(date|dates|departure|when|arrive|leaving)\b/.test(text)) return 'dates';
  if (/\b(duration|days|nights|length|extend|shorten|longer|shorter)\b/.test(text)) return 'duration';
  if (/\b(group|people|travelers|friends|members|persons|size)\b/.test(text)) return 'groupSize';
  if (/\b(budget|cost|price|spend|cheap|afford|₹|rs\.?|inr)\b/.test(text)) return 'budget';
  if (/\b(vegetarian|veg|non-veg|food|diet|constraint|preference|ac|sleeper|budget hotel|luxury)\b/.test(text)) return 'constraint';

  return null;
}

function estimateComplexity(request = {}) {
  const message = normalizeText(request.message || '', '').toLowerCase();
  const domains = normalizeArray(request.domains || []);
  const toolsRequested = normalizeArray(request.tools || []);
  const hasBrowser = /browser|playwright|scrape|crawl/.test(message);
  const hasMultipleProviders = domains.length > 1;

  let score = 1;

  if (hasMultipleProviders) score += 1;
  if (toolsRequested.length > 2) score += 1;
  if (hasBrowser) score += 2;
  if (message.length > 300) score += 1;

  if (score <= 2) return 'simple';
  if (score <= 4) return 'moderate';
  return 'complex';
}

function buildProviderPriority(request = {}, options = {}) {
  const destination = normalizeText(
    request.toPlace || request.destination || request.place || options?.trip?.toPlace || '',
    ''
  );
  const provider = normalizeText(request.provider || options?.provider || 'auto', 'auto').toLowerCase();
  const configuredProviders = Array.isArray(options?.configuredProviders) ? options.configuredProviders : [];
  const prefersGoogle = /google|google_places|maps-google/.test(provider);
  const prefersOla = /ola|olamaps|ola_maps|maps-ola/.test(provider);

  if (provider === 'google') {
    return ['google', 'ola', 'openstreetmap'];
  }
  if (provider === 'ola') {
    return ['ola', 'google', 'openstreetmap'];
  }

  if (prefersOla || isIndianDestination(destination)) {
    return ['ola', 'google', 'openstreetmap'];
  }

  return ['google', 'ola', 'openstreetmap'];
}

function buildDataRequirements(domain, request = {}) {
  const base = {
    places: { restaurants: true, attractions: true },
    transit: { flights: true, hotels: true, buses: true },
    weather: { forecast: true },
    budget: { breakdown: true, signals: true },
    itinerary: { days: true, activities: true },
    research: { web: true, readUrl: true },
    general: { web: true },
  };

  const requirements = base[domain] || base.general;

  if (domain === 'places') {
    const focus = normalizeText(request.focus || request.category || 'all', 'all').toLowerCase();
    requirements.focus = focus;
  }

  if (domain === 'transit') {
    requirements.mode = normalizeText(request.mode || request.transportMode || 'driving', 'driving');
  }

  if (domain === 'weather') {
    requirements.days = Math.max(1, Math.min(Number(request.days) || 7, 14));
  }

  return requirements;
}

class Router {
  constructor(options = {}) {
    this.options = {
      defaultProvider: normalizeText(options.defaultProvider || 'auto', 'auto'),
      maxParallelSources: Number.isFinite(options.maxParallelSources) ? options.maxParallelSources : 2,
      allowedProviders: Array.isArray(options.allowedProviders) && options.allowedProviders.length > 0
        ? options.allowedProviders
        : ['google', 'ola', 'openstreetmap'],
      enableBrowserEscalation: options.enableBrowserEscalation !== false,
    };
  }

  decide(request = {}, context = {}) {
    const message = normalizeText(request.message || request.query || '', '');
    const domain = request.domain || classifyDomain(request);
    const intent = normalizeText(request.intent || '', '');
    const modificationType = classifyModificationType(message);
    const complexity = estimateComplexity(request);
    const providerPriority = buildProviderPriority(request, { ...context, provider: this.options.defaultProvider });
    const filteredPriority = providerPriority.filter((provider) => this.options.allowedProviders.includes(provider));
    const finalPriority = filteredPriority.length > 0 ? filteredPriority : ['google', 'ola', 'openstreetmap'];
    const executionMode = complexity === 'simple' ? 'sequential' : 'parallel';
    const dataRequirements = buildDataRequirements(domain, request);

    const decision = {
      domain,
      intent,
      modificationType,
      complexity,
      executionMode,
      providerPriority: finalPriority,
      dataRequirements,
      browserEscalation: Boolean(
        this.options.enableBrowserEscalation && /availability|booking|live price|current status|schedule/.test(message.toLowerCase())
      ),
      fallbackChain: [
        ...finalPriority.map((provider) => ({ source: 'api', provider })),
        ...(this.options.enableBrowserEscalation ? [{ source: 'browser' }] : []),
        { source: 'web-search' },
        { source: 'internal-knowledge' },
      ],
    };

    try { emitRouter('decision', decision, context?.sessionId || 'default'); } catch {}

    return decision;
  }

  decideModification(request = {}) {
    const modificationType = classifyModificationType(request.message || '');
    const decision = this.decide(request);

    decision.modificationType = modificationType;
    decision.dataRequirements = {
      ...decision.dataRequirements,
      requiresPlan: true,
      updateMode: 'patch',
    };

    if (!modificationType) {
      decision.error = 'Could not infer modification target from the request.';
      decision.suggestedClarification = 'Please mention what to change: destination, dates, duration, group size, budget, or constraints.';
    }

    return decision;
  }
}

function createRouter(options = {}) {
  return new Router(options);
}

module.exports = {
  Router,
  createRouter,
  classifyDomain,
  classifyModificationType,
  estimateComplexity,
  buildProviderPriority,
  buildDataRequirements,
};
