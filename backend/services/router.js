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
    const decision = this.mapStepsToActions(request, request);

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

  mapStepsToActions(perceptionOrRequest, originalRequest = {}) {
    const request = perceptionOrRequest && typeof perceptionOrRequest === 'object' && Array.isArray(perceptionOrRequest.steps)
      ? perceptionOrRequest
      : originalRequest;

    const message = normalizeText(request.message || request.query || '', '');
    const entities = request.entities || {};
    const steps = Array.isArray(request.steps) ? request.steps : [];
    const constraints = Array.isArray(request.constraints) ? request.constraints : [];

    const domain = request.domain || classifyDomain(request);
    const complexity = estimateComplexity(request);
    const providerPriority = buildProviderPriority(request);
    const executionMode = complexity === 'simple' ? 'sequential' : 'parallel';
    const dataRequirements = buildDataRequirements(domain, request);

    const actions = [];

    const hasTransit = steps.some((step) => /\b(transport|flight|train|bus|cab|taxi|auto|reach|get there)s?\b/i.test(step));
    const hasAccommodation = steps.some((step) => /\b(stay|hotel|resort|lodging|accommodation|place to stay)s?\b/i.test(step));
    const hasPlaces = steps.some((step) => /\b(restaurant|attraction|places?|sightseeing|do|see|visit)s?\b/i.test(step));
    const hasFood = steps.some((step) => /\b(restaurant|food|eat|dining|cuisine)s?\b/i.test(step));
    const hasWeather = steps.some((step) => /\b(weather|forecast|temperature|rain)s?\b/i.test(step));
    const hasBudget = steps.some((step) => /\b(budget|cost|price|expense|afford)s?\b/i.test(step));

    if (hasTransit) {
      actions.push({
        tool: 'transitApi',
        arguments: {
          from: entities.origin,
          to: entities.destination,
          date: entities.dates,
          mode: dataRequirements.mode || 'driving',
          groupSize: entities.groupSize,
        },
      });
    }

    if (hasAccommodation) {
      actions.push({
        tool: 'hotelSearch',
        arguments: {
          destination: entities.destination,
          dates: entities.dates,
          nights: entities.duration,
          groupSize: entities.groupSize,
          constraints,
        },
      });
    }

    if (hasPlaces) {
      actions.push({
        tool: 'placesSearch',
        arguments: {
          destination: entities.destination,
          focus: dataRequirements.focus || 'all',
          constraints,
        },
      });
    }

    if (hasFood) {
      actions.push({
        tool: 'restaurantSearch',
        arguments: {
          destination: entities.destination,
          cuisine: constraints.includes('vegetarian') ? 'vegetarian' : null,
        },
      });
    }

    if (hasWeather) {
      actions.push({
        tool: 'weatherLookup',
        arguments: {
          destination: entities.destination,
          days: dataRequirements.days || 7,
        },
      });
    }

    if (hasBudget || (!hasTransit && !hasAccommodation && !hasPlaces && !hasFood && !hasWeather)) {
      actions.push({
        tool: 'generateTravelPackage',
        arguments: {
          fromPlace: entities.origin,
          toPlace: entities.destination,
          dates: entities.dates,
          duration: entities.duration,
          travelers: entities.groupSize,
          budget: entities.budget,
          constraints,
        },
      });
    }

    const browserEscalation = Boolean(
      this.options.enableBrowserEscalation && /availability|booking|live price|current status|schedule|exact rate/.test(message.toLowerCase())
    );

    const decision = {
      domain,
      complexity,
      executionMode,
      providerPriority,
      dataRequirements,
      constraints,
      actions,
      browserEscalation,
      fallbackChain: [
        ...providerPriority.map((provider) => ({ source: 'api', provider })),
        ...(browserEscalation ? [{ source: 'browser' }] : []),
        { source: 'web-search' },
        { source: 'internal-knowledge' },
      ],
    };

    try { emitRouter('decision', decision, originalRequest?.sessionId || 'default'); } catch {}

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
