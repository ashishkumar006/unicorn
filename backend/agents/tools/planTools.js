/**
 * AGENT TOOLS
 * 
 * Tools that the Email Agent can use:
 * - accessPlan() - Read current plan
 * - modifyDestination() - Change destination
 * - modifyDates() - Change dates
 * - modifyGroupSize() - Change number of people
 * - modifyBudget() - Change budget
 * - addConstraint() - Add travel preferences
 * - analyzePlanCost() - Break down costs
 * - suggestAlternatives() - Suggest different options
 * - searchPlaces() - Search Google Places or Ola Maps for restaurants and attractions
 * - searchWeb() - Search live web sources for current information
 * - readUrl() - Read a specific URL and extract key facts
 * - generateEmail() - Create email summary
 */

const {
  searchWeb: searchTravelWeb,
  readUrlContent: readTravelUrlContent,
} = require('../../services/internalLab');

const {
  getGooglePlacesConfig,
  isGooglePlacesConfigured,
  getGoogleRestaurants,
  getGoogleAttractions,
  buildPlacesCategoriesFromAttractions,
  buildFoodSectionsFromRestaurants,
} = require('../../services/googlePlaces');
const {
  getOlaMapsConfig,
  isOlaMapsConfigured,
  searchOlaPlaces,
  getOlaDirections,
  getOlaDistanceMatrix,
} = require('../../services/olaMaps');
const {
  buildOpenStreetMapSearchUrl,
  resolveOpenStreetMapLocation,
} = require('../../services/openStreetMap');

function clonePlan(plan) {
  return JSON.parse(JSON.stringify(plan || {}));
}

function toText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) {
      return fallback;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toInteger(value, fallback = 0) {
  return Math.max(0, Math.round(toNumber(value, fallback)));
}

function normalizePlacesFocus(value = 'all') {
  const normalized = toText(value, 'all').toLowerCase();

  if (/(food|restaurant|restaurants|dining|eat|meal)/.test(normalized)) {
    return 'restaurants';
  }

  if (/(place|places|attraction|attractions|things to do|sightseeing|landmark|visit)/.test(normalized)) {
    return 'attractions';
  }

  return 'all';
}

function normalizePlacesProvider(value = 'auto') {
  const normalized = toText(value, 'auto').toLowerCase();

  if (/(google|google_places|googleplaces|maps-google)/.test(normalized)) {
    return 'google';
  }

  if (/(ola|olamaps|ola_maps|maps-ola)/.test(normalized)) {
    return 'ola';
  }

  return 'auto';
}

function formatOlaPlaceLine(place, fallbackLabel) {
  const name = toText(place?.name, fallbackLabel);
  const description = toText(place?.description || place?.location || '', '');
  const type = toText(place?.type, '');
  const rawLink = toText(place?.link || place?.olaMapsUrl || place?.googleMapsUrl || '', '');
  const link = rawLink && !/olamaps?/i.test(rawLink)
    ? rawLink
    : buildOpenStreetMapSearchUrl(name);
  const label = link ? `[${name}](${link})` : name;
  return `- ${label}${type ? ` [${type}]` : ''}${description ? ` — ${description}` : ''}`;
}

function formatGooglePlacesLine(place, fallbackLabel) {
  const name = toText(place?.name, fallbackLabel);
  const url = toText(place?.googleMapsUrl, '');
  const label = url ? `[${name}](${url})` : name;
  const rating = toNumber(place?.rating, 0);
  const details = [
    toText(place?.cuisine || place?.type || '', ''),
    rating > 0 ? `${rating.toFixed(1).replace(/\.0$/, '')}/5` : '',
    toText(place?.location || place?.area || place?.description || '', ''),
  ].filter(Boolean).join(', ');

  return `- ${label}${details ? ` — ${details}` : ''}`;
}

function buildGooglePlacesCitation(place, fallbackLabel) {
  const url = toText(place?.googleMapsUrl, '');

  if (!url) {
    return null;
  }

  const rating = toNumber(place?.rating, 0);
  const snippetParts = [
    toText(place?.cuisine || place?.type || '', ''),
    rating > 0 ? `${rating.toFixed(1).replace(/\.0$/, '')}/5` : '',
    toText(place?.location || place?.area || place?.description || '', ''),
  ].filter(Boolean);

  return {
    title: toText(place?.name, fallbackLabel),
    url,
    snippet: snippetParts.join(' • '),
  };
}

function formatCurrency(value) {
  return `₹${toNumber(value, 0).toLocaleString('en-IN')}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceText(value, searchValue, replacementValue) {
  if (typeof value !== 'string' || !searchValue) {
    return value;
  }

  return value.replace(new RegExp(escapeRegExp(searchValue), 'gi'), replacementValue);
}

function replaceDeep(value, searchValue, replacementValue) {
  if (typeof value === 'string') {
    return replaceText(value, searchValue, replacementValue);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceDeep(item, searchValue, replacementValue));
  }

  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entryValue] of Object.entries(value)) {
      next[key] = replaceDeep(entryValue, searchValue, replacementValue);
    }
    return next;
  }

  return value;
}

function addDays(dateValue, offset) {
  const baseDate = new Date(dateValue);

  if (Number.isNaN(baseDate.getTime())) {
    return dateValue || `Day ${offset + 1}`;
  }

  baseDate.setDate(baseDate.getDate() + offset);
  return baseDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getPlanSummary(plan = {}) {
  return plan.summary && typeof plan.summary === 'object' ? plan.summary : {};
}

function getPlanRoute(plan = {}) {
  const summary = getPlanSummary(plan);

  return {
    fromPlace: summary.fromPlace || plan.origin || plan.fromPlace || 'Not set',
    toPlace: summary.toPlace || plan.destination || plan.toPlace || 'Not set',
  };
}

function buildPlanSnapshot(plan = {}) {
  const summary = getPlanSummary(plan);
  const route = getPlanRoute(plan);
  const itinerary = Array.isArray(plan.itinerary) ? plan.itinerary : [];

  return {
    route: `${route.fromPlace} → ${route.toPlace}`,
    fromPlace: route.fromPlace,
    toPlace: route.toPlace,
    duration: toInteger(summary.duration || plan.totalDays || itinerary.length, itinerary.length || 1),
    travelers: toInteger(summary.travelers || plan.groupSize || 1, 1),
    budget: summary.totalBudget || plan.estimatedBudget || plan.budget || 'Not set',
    estimatedBudget: plan.estimatedBudget || summary.totalBudget || 'Not set',
    bestTime: plan.bestTime || plan.bestTimeToVisit || 'Year-round',
    highlights: Array.isArray(plan.highlights) ? plan.highlights : [],
    packingEssentials: Array.isArray(plan.packingEssentials) ? plan.packingEssentials : [],
    itinerary,
    constraints: Array.isArray(plan.constraints) ? plan.constraints : [],
    travelWindow: plan.travelWindow || null,
    rawPlan: plan,
  };
}

function applyDestinationChange(plan, newDestination) {
  const updatedPlan = replaceDeep(clonePlan(plan), getPlanRoute(plan).toPlace, newDestination);
  const summary = getPlanSummary(updatedPlan);
  const route = getPlanRoute(updatedPlan);

  updatedPlan.summary = {
    ...summary,
    toPlace: newDestination,
    route: `${route.fromPlace} → ${newDestination}`,
  };
  updatedPlan.destination = newDestination;

  if (updatedPlan.trip && typeof updatedPlan.trip === 'object') {
    updatedPlan.trip = {
      ...updatedPlan.trip,
      toPlace: newDestination,
    };
  }

  return updatedPlan;
}

function applyDateChange(plan, departureDate, nights) {
  const updatedPlan = clonePlan(plan);
  const summary = getPlanSummary(updatedPlan);
  const itinerary = Array.isArray(updatedPlan.itinerary) ? updatedPlan.itinerary : [];
  const currentStartDate = toText(departureDate || updatedPlan.travelWindow?.startDate || updatedPlan.departureDate || summary.departureDate, '');
  const requestedNights = toInteger(nights, 0);
  const duration = requestedNights > 0
    ? requestedNights + 1
    : toInteger(summary.duration || updatedPlan.totalDays || itinerary.length, itinerary.length || 1);

  updatedPlan.totalDays = duration;
  updatedPlan.departureDate = currentStartDate || updatedPlan.departureDate || null;

  if (currentStartDate) {
    const endDate = addDays(currentStartDate, Math.max(0, duration - 1));
    updatedPlan.endDate = endDate;
    updatedPlan.travelWindow = {
      startDate: currentStartDate,
      endDate,
    };

    updatedPlan.itinerary = itinerary.map((day, index) => ({
      ...day,
      date: addDays(currentStartDate, index),
    }));
  }

  updatedPlan.summary = {
    ...summary,
    duration,
    nights: requestedNights || Math.max(0, duration - 1),
    departureDate: currentStartDate || summary.departureDate,
    endDate: updatedPlan.endDate || summary.endDate,
  };

  return updatedPlan;
}

function applyGroupSizeChange(plan, newGroupSize) {
  const updatedPlan = clonePlan(plan);
  const summary = getPlanSummary(updatedPlan);
  const travelers = Math.max(1, toInteger(newGroupSize, toInteger(summary.travelers || 1, 1)));

  updatedPlan.summary = {
    ...summary,
    travelers,
  };

  updatedPlan.groupSize = travelers;
  return updatedPlan;
}

function applyDurationChange(plan, newDuration) {
  const updatedPlan = clonePlan(plan);
  const summary = getPlanSummary(updatedPlan);
  const itinerary = Array.isArray(updatedPlan.itinerary) ? updatedPlan.itinerary.slice() : [];
  const duration = Math.max(
    1,
    toInteger(newDuration, toInteger(summary.duration || updatedPlan.totalDays || itinerary.length, itinerary.length || 1))
  );
  const startDate = toText(
    updatedPlan.travelWindow?.startDate || updatedPlan.departureDate || summary.departureDate,
    ''
  );

  let nextItinerary = itinerary.slice(0, duration).map((day, index) => ({
    ...day,
    day: index + 1,
    ...(startDate ? { date: addDays(startDate, index) } : {}),
  }));

  if (nextItinerary.length < duration) {
    const fallbackTemplate = itinerary[itinerary.length - 1] || {};

    while (nextItinerary.length < duration) {
      const dayNumber = nextItinerary.length + 1;
      nextItinerary.push({
        ...clonePlan(fallbackTemplate),
        day: dayNumber,
        date: startDate ? addDays(startDate, dayNumber - 1) : fallbackTemplate.date || `Day ${dayNumber}`,
        title: fallbackTemplate.title || `Flexible exploration day ${dayNumber}`,
      });
    }
  }

  updatedPlan.itinerary = nextItinerary;
  updatedPlan.totalDays = duration;
  updatedPlan.summary = {
    ...summary,
    duration,
    nights: Math.max(0, duration - 1),
  };

  if (startDate) {
    const endDate = addDays(startDate, duration - 1);
    updatedPlan.departureDate = startDate;
    updatedPlan.endDate = endDate;
    updatedPlan.travelWindow = {
      startDate,
      endDate,
    };
    updatedPlan.summary = {
      ...updatedPlan.summary,
      departureDate: startDate,
      endDate,
    };
  }

  return updatedPlan;
}

function applyBudgetChange(plan, newBudget) {
  const updatedPlan = clonePlan(plan);
  const summary = getPlanSummary(updatedPlan);
  const budgetValue = Math.max(1, toNumber(newBudget, toNumber(summary.totalBudget, toNumber(updatedPlan.budget, 10000))));

  updatedPlan.summary = {
    ...summary,
    totalBudget: formatCurrency(budgetValue),
  };

  updatedPlan.estimatedBudget = formatCurrency(budgetValue);
  updatedPlan.budget = budgetValue;
  return updatedPlan;
}

function addConstraint(plan, constraint) {
  const updatedPlan = clonePlan(plan);
  const trimmedConstraint = toText(constraint, '');

  if (!trimmedConstraint) {
    return updatedPlan;
  }

  const constraints = Array.isArray(updatedPlan.constraints) ? updatedPlan.constraints.slice() : [];
  if (!constraints.includes(trimmedConstraint)) {
    constraints.push(trimmedConstraint);
  }

  updatedPlan.constraints = constraints;

  const packingEssentials = Array.isArray(updatedPlan.packingEssentials) ? updatedPlan.packingEssentials.slice() : [];
  if (!packingEssentials.includes(trimmedConstraint)) {
    packingEssentials.push(trimmedConstraint);
  }
  updatedPlan.packingEssentials = packingEssentials;

  return updatedPlan;
}

function estimateCostBreakdown(plan) {
  const snapshot = buildPlanSnapshot(plan);
  const budgetValue = Math.max(1, toNumber(snapshot.budget, toNumber(snapshot.estimatedBudget, 10000)));
  const duration = Math.max(1, snapshot.duration || 1);
  const travelers = Math.max(1, snapshot.travelers || 1);

  const transportation = Math.round(budgetValue * 0.3);
  const accommodation = Math.round(budgetValue * 0.34);
  const activities = Math.round(budgetValue * 0.16);
  const dining = Math.round(budgetValue * 0.15);
  const miscellaneous = Math.max(0, budgetValue - (transportation + accommodation + activities + dining));

  return {
    budgetValue,
    duration,
    travelers,
    transportation,
    accommodation,
    activities,
    dining,
    miscellaneous,
    perDay: Math.round(budgetValue / duration),
    perPerson: Math.round(budgetValue / travelers),
  };
}

function buildEmailContent(plan) {
  const snapshot = buildPlanSnapshot(plan);
  const itineraryLines = snapshot.itinerary.length > 0
    ? snapshot.itinerary.map((day, index) => {
      const title = toText(day.title || day.theme, `Day ${index + 1}`);
      return `Day ${index + 1}: ${title}`;
    }).join('\n')
    : 'Detailed itinerary will be shared once the plan is finalized.';

  const highlightLines = snapshot.highlights.length > 0
    ? snapshot.highlights.map((highlight) => `• ${highlight}`).join('\n')
    : '• Curated trip plan';

  return `
Subject: Trip Plan Update - ${snapshot.route}

Hi everyone! 👋

Here is the latest version of our trip plan:

📍 Route: ${snapshot.route}
📅 Duration: ${snapshot.duration} days
👥 Travelers: ${snapshot.travelers}
💰 Budget: ${snapshot.budget}
✨ Best time: ${snapshot.bestTime}

Highlights:
${highlightLines}

Itinerary:
${itineraryLines}

Please review and let me know if you want any more changes.

Best regards,
TripOptimizer Assistant
  `.trim();
}

function formatWebSource(source) {
  if (!source) {
    return '';
  }

  if (typeof source === 'string') {
    return source.trim();
  }

  if (typeof source === 'object') {
    const title = toText(source.title || source.name || source.label, '');
    const url = toText(source.url || source.link, '');

    if (title && url) {
      return `${title} (${url})`;
    }

    return title || url || '';
  }

  return String(source);
}

class PlanAccessTool {
  constructor(name = 'accessPlan') {
    this.name = name;
    this.description = 'Access and read the current travel plan details';
  }

  async execute(args) {
    const plan = args.plan;
    
    if (!plan) {
      return {
        error: 'No plan provided'
      };
    }

    const snapshot = buildPlanSnapshot(plan);

    return {
      success: true,
      planDetails: {
        route: snapshot.route,
        origin: snapshot.fromPlace,
        destination: snapshot.toPlace,
        duration: snapshot.duration,
        travelers: snapshot.travelers,
        budget: snapshot.budget,
        estimatedBudget: snapshot.estimatedBudget,
        bestTime: snapshot.bestTime,
        highlights: snapshot.highlights,
        packingEssentials: snapshot.packingEssentials,
        itinerary: snapshot.itinerary,
        travelWindow: snapshot.travelWindow,
        constraints: snapshot.constraints,
        rawPlan: snapshot.rawPlan,
      },
      message: 'Plan accessed successfully'
    };
  }
}

class ModifyDestinationTool {
  constructor(name = 'modifyDestination') {
    this.name = name;
    this.description = 'Change the travel destination';
  }

  async execute(args) {
    const { plan, newDestination } = args;

    if (!plan || !newDestination) {
      return { error: 'Plan and newDestination required' };
    }

    const updatedPlan = applyDestinationChange(plan, newDestination);

    return {
      success: true,
      updatedPlan,
      message: `Destination changed to ${newDestination}. The plan summary and itinerary were updated.`
    };
  }
}

class ModifyDatesTool {
  constructor(name = 'modifyDates') {
    this.name = name;
    this.description = 'Change departure date and/or number of nights';
  }

  async execute(args) {
    const { plan, departureDate, nights } = args;

    if (!plan) {
      return { error: 'Plan required' };
    }

    const updatedPlan = applyDateChange(plan, departureDate, nights);

    return {
      success: true,
      updatedPlan,
      message: `Dates updated: start ${departureDate || updatedPlan.departureDate || 'unchanged'}, duration ${updatedPlan.totalDays} days`
    };
  }
}

class ModifyGroupSizeTool {
  constructor(name = 'modifyGroupSize') {
    this.name = name;
    this.description = 'Change the number of people in the group';
  }

  async execute(args) {
    const { plan, newGroupSize } = args;

    if (!plan || !newGroupSize) {
      return { error: 'Plan and newGroupSize required' };
    }

    if (newGroupSize < 1 || newGroupSize > 100) {
      return { error: 'Group size must be between 1 and 100' };
    }

    const updatedPlan = applyGroupSizeChange(plan, newGroupSize);

    return {
      success: true,
      updatedPlan,
      message: `Group size updated to ${newGroupSize} people. The plan summary now reflects the new party size.`
    };
  }
}

class ModifyDurationTool {
  constructor(name = 'modifyDuration') {
    this.name = name;
    this.description = 'Change the total trip length in days and align the itinerary';
  }

  async execute(args) {
    const { plan, durationDays, days, duration } = args;

    if (!plan) {
      return { error: 'Plan required' };
    }

    const requestedDuration = durationDays ?? days ?? duration;

    if (requestedDuration == null || requestedDuration === '') {
      return { error: 'Duration required' };
    }

    const updatedPlan = applyDurationChange(plan, requestedDuration);

    return {
      success: true,
      updatedPlan,
      message: `Trip duration updated to ${updatedPlan.totalDays} days. The itinerary now matches the new trip length.`
    };
  }
}

class ModifyBudgetTool {
  constructor(name = 'modifyBudget') {
    this.name = name;
    this.description = 'Change the budget per person';
  }

  async execute(args) {
    const { plan, newBudget } = args;

    if (!plan || !newBudget) {
      return { error: 'Plan and newBudget required' };
    }

    const updatedPlan = applyBudgetChange(plan, newBudget);

    return {
      success: true,
      updatedPlan,
      message: `Budget updated to ${formatCurrency(newBudget)}.`
    };
  }
}

class AddConstraintTool {
  constructor(name = 'addConstraint') {
    this.name = name;
    this.description = 'Add travel preferences or constraints (e.g., "AC sleeper", "vegetarian food")';
  }

  async execute(args) {
    const { plan, constraint } = args;

    if (!plan || !constraint) {
      return { error: 'Plan and constraint required' };
    }

    const updatedPlan = addConstraint(plan, constraint);

    return {
      success: true,
      updatedPlan,
      message: `Added preference: "${constraint}"`,
      currentConstraints: updatedPlan.constraints
    };
  }
}

class AnalyzeCostTool {
  constructor(name = 'analyzeCosts') {
    this.name = name;
    this.description = 'Analyze and break down all costs in the plan';
  }

  async execute(args) {
    const { plan } = args;

    if (!plan) {
      return { error: 'Plan required' };
    }

    const breakdown = estimateCostBreakdown(plan);

    return {
      success: true,
      analysis: `📊 **Cost Breakdown Analysis**\n\n` +
        `🚗 Transportation: ${formatCurrency(breakdown.transportation)}\n` +
        `🏨 Accommodation: ${formatCurrency(breakdown.accommodation)}\n` +
        `📸 Activities: ${formatCurrency(breakdown.activities)}\n` +
        `🍽️ Dining: ${formatCurrency(breakdown.dining)}\n` +
        `💰 Miscellaneous: ${formatCurrency(breakdown.miscellaneous)}\n\n` +
        `**Total Trip Cost: ${formatCurrency(breakdown.budgetValue)}**\n` +
        `Daily average: ${formatCurrency(breakdown.perDay)}\n` +
        `Per person: ${formatCurrency(breakdown.perPerson)}`,
      message: `Cost analysis complete! Total: ${formatCurrency(breakdown.budgetValue)} | Daily average: ${formatCurrency(breakdown.perDay)}`
    };
  }
}

class SuggestAlternativesTool {
  constructor(name = 'suggestAlternatives') {
    this.name = name;
    this.description = 'Suggest alternative options (cheaper, better hotels, faster routes)';
  }

  async execute(args) {
    const { plan } = args;

    if (!plan) {
      return { error: 'Plan required' };
    }

    const snapshot = buildPlanSnapshot(plan);
    const breakdown = estimateCostBreakdown(plan);
    const suggestions = [];

    if (breakdown.perDay < 1800) {
      suggestions.push(`✅ **Budget-friendly trip**: ${formatCurrency(breakdown.perDay)} per day is tight, so prioritize rail or road transport and a compact stay.`);
      suggestions.push('💡 **Best savings move**: Reduce one night or keep only the highest-value sightseeing stops.');
    } else if (breakdown.perDay < 3500) {
      suggestions.push(`✅ **Balanced trip**: ${formatCurrency(breakdown.perDay)} per day gives room for a comfortable stay and one premium activity.`);
      suggestions.push('💡 **Best upgrade**: Keep the current route, but upgrade either the hotel or one activity, not both.');
    } else {
      suggestions.push(`✨ **Comfort-first trip**: ${formatCurrency(breakdown.perDay)} per day allows for flexibility and better hotels.`);
      suggestions.push('💡 **Best value**: Lock in the main itinerary first, then add optional experiences only if they fit the budget.');
    }

    if (snapshot.duration > 5) {
      suggestions.push(`\n🗓️ **Duration note**: ${snapshot.duration} days can be expensive on lodging. Cutting one day may save the most.`);
    }

    if (snapshot.highlights.length > 0) {
      suggestions.push(`\n✨ **Focus areas**: Keep the top ${Math.min(3, snapshot.highlights.length)} highlights and postpone lower-priority items if the user wants to reduce cost.`);
    }

    return {
      success: true,
      analysis: suggestions.join('\n'),
      message: `Generated ${suggestions.length} helpful suggestions for optimizing your trip!`
    };
  }
}

class SearchPlacesTool {
  constructor(name = 'searchPlaces') {
    this.name = name;
    this.description = 'Search Google Places or Ola Maps for destination-specific restaurants and attractions';
  }

  async execute(args) {
    const destination = toText(args.destination || args.query || args.place || args.location, '');

    if (!destination) {
      return { error: 'Destination required' };
    }

    const config = getGooglePlacesConfig();
    const olaConfig = getOlaMapsConfig();
    if (!isGooglePlacesConfigured(config)) {
      if (!isOlaMapsConfigured(olaConfig)) {
        return { error: 'Neither Google Places nor Ola Maps is configured' };
      }
    }

    const focus = normalizePlacesFocus(args.focus || args.category || args.type || 'all');
    const providerRequested = normalizePlacesProvider(args.provider || args.source || args.mapProvider || 'auto');
    const normalizedLimit = Math.max(1, Math.min(toInteger(args.limit, 6), 12));
    const wantsRestaurants = focus === 'all' || focus === 'restaurants';
    const wantsAttractions = focus === 'all' || focus === 'attractions';
    let providerUsed = providerRequested;

    if (providerRequested === 'auto') {
      providerUsed = isOlaMapsConfigured(olaConfig)
        ? 'ola'
        : (isGooglePlacesConfigured(config) ? 'google' : 'ola');
    } else if (providerRequested === 'google' && !isGooglePlacesConfigured(config) && isOlaMapsConfigured(olaConfig)) {
      providerUsed = 'ola';
    } else if (providerRequested === 'ola' && !isOlaMapsConfigured(olaConfig) && isGooglePlacesConfigured(config)) {
      providerUsed = 'google';
    }

    const providerLabel = providerUsed === 'ola' ? 'Ola Maps' : 'Google Places';

    console.log(`[searchPlaces] Starting ${providerLabel} lookup for ${destination}`);
    console.log(`[searchPlaces] Focus=${focus} limit=${normalizedLimit} provider=${providerUsed}`);

    if (providerUsed === 'ola') {
      const results = await searchOlaPlaces(destination, normalizedLimit, focus, olaConfig);
      const finalResults = results.map((place, index) => {
        const name = toText(place?.name, `Place ${index + 1}`);
        const rawLink = toText(place?.link || place?.olaMapsUrl || place?.googleMapsUrl || '', '');
        const workingLink = rawLink && !/olamaps?/i.test(rawLink)
          ? rawLink
          : buildOpenStreetMapSearchUrl(name);

        return {
          ...place,
          link: workingLink,
          openStreetMapUrl: workingLink,
          olaMapsUrl: toText(place?.olaMapsUrl, ''),
          googleMapsUrl: toText(place?.googleMapsUrl, ''),
        };
      });

      const summary = `Ola Maps autocomplete returned ${finalResults.length} suggestion(s) for ${destination}.`;
      const analysisParts = [
        'Provider: Ola Maps',
        `Autocomplete query for "${destination}"`,
        `Focus: ${focus === 'all' ? 'restaurants and attractions' : focus}`,
        finalResults.length > 0
          ? `Suggestions:\n${finalResults.map((place, index) => formatOlaPlaceLine(place, `Place ${index + 1}`)).join('\n')}`
          : 'No suggestions found.',
      ].filter(Boolean);

      console.log(`[searchPlaces] Completed Ola Maps lookup for ${destination}: results=${finalResults.length}`);

      return {
        success: true,
        provider: 'ola',
        providerLabel,
        providerRequested,
        destination,
        focus,
        limit: normalizedLimit,
        summary,
        results: finalResults,
        suggestions: finalResults,
        citations: [],
        sources: [],
        analysis: analysisParts.join('\n\n'),
        message: summary,
      };
    }

    const [restaurants, attractions] = await Promise.all([
      wantsRestaurants ? getGoogleRestaurants(destination, normalizedLimit, config) : Promise.resolve([]),
      wantsAttractions ? getGoogleAttractions(destination, normalizedLimit, config) : Promise.resolve([]),
    ]);

    const places = wantsAttractions
      ? { categories: buildPlacesCategoriesFromAttractions(attractions, { toPlace: destination }) }
      : { categories: [] };

    const food = wantsRestaurants
      ? buildFoodSectionsFromRestaurants(restaurants, { toPlace: destination })
      : { restaurants: [], localSpecialties: [], streetFood: [] };

    const citations = [];
    const seenUrls = new Set();
    const addCitation = (entry, fallbackLabel) => {
      const citation = buildGooglePlacesCitation(entry, fallbackLabel);
      if (!citation || !citation.url) {
        return;
      }

      const key = citation.url.toLowerCase();
      if (seenUrls.has(key)) {
        return;
      }

      seenUrls.add(key);
      citations.push({
        index: citations.length + 1,
        ...citation,
      });
    };

    restaurants.slice(0, 3).forEach((restaurant) => addCitation(restaurant, 'Restaurant'));
    attractions.slice(0, 3).forEach((attraction) => addCitation(attraction, 'Attraction'));

    const analysisParts = [
      'Provider: Google Places',
      `Google Places results for "${destination}"`,
      `Focus: ${focus === 'all' ? 'restaurants and attractions' : focus}`,
      restaurants.length > 0
        ? `Restaurants:\n${restaurants.slice(0, normalizedLimit).map((restaurant) => formatGooglePlacesLine(restaurant, 'Restaurant')).join('\n')}`
        : '',
      attractions.length > 0
        ? `Attractions:\n${attractions.slice(0, normalizedLimit).map((attraction) => formatGooglePlacesLine(attraction, 'Attraction')).join('\n')}`
        : '',
    ].filter(Boolean);

    const summary = `Google Places found ${restaurants.length} restaurants and ${attractions.length} attractions in ${destination}.`;

    console.log(`[searchPlaces] Completed lookup for ${destination}: restaurants=${restaurants.length}, attractions=${attractions.length}, citations=${citations.length}`);

    return {
      success: true,
      provider: 'google',
      providerLabel,
      providerRequested,
      destination,
      focus,
      limit: normalizedLimit,
      summary,
      restaurants,
      attractions,
      places,
      food,
      citations,
      sources: citations,
      analysis: analysisParts.join('\n\n'),
      message: summary,
    };
  }
}

class OlaMapsTool {
  constructor(name = 'olaMaps') {
    this.name = name;
    this.description = 'Use Ola Maps for India-first place discovery, route directions, and distance matrix lookups';
  }

  async execute(args) {
    const config = getOlaMapsConfig();

    if (!isOlaMapsConfigured(config)) {
      return { error: 'Ola Maps is not configured. Set OLA_MAPS_API_KEY or OLA_MAPS_CLIENT_ID and OLA_MAPS_CLIENT_SECRET.' };
    }

    const mode = toText(args.mode || args.type || '', '').toLowerCase();
    const normalizedFocus = normalizePlacesFocus(args.focus || args.category || args.queryType || 'all');
    const normalizedLimit = Math.max(1, Math.min(toInteger(args.limit, 6), 12));
    const placeQuery = toText(args.destination || args.query || args.place || args.location, '');

    if (mode === 'directions' || mode === 'route' || mode === 'navigation') {
      const origin = toText(args.origin, '');
      const destination = toText(args.destination, '');

      if (!origin || !destination) {
        return { error: 'Origin and destination are required for Ola Maps directions' };
      }

      const directions = await getOlaDirections({
        origin,
        destination,
        waypoints: args.waypoints,
        mode: args.travelMode || args.transportMode || 'driving',
        alternatives: args.alternatives,
        steps: args.steps,
        overview: args.overview,
        language: args.language,
        trafficMetadata: args.trafficMetadata,
        routePreference: args.routePreference || args.route_preference || 'fastest',
        auth: args.auth || 'auto',
      }, config);

      const route = directions?.route || null;
      const routeSummary = route?.summary || directions?.summary || `Directions ready for ${origin} to ${destination}.`;

      return {
        success: true,
        provider: 'ola',
        providerLabel: 'Ola Maps',
        mode: 'directions',
        origin,
        destination,
        summary: routeSummary,
        route,
        routes: directions?.routes || [],
        analysis: [
          'Provider: Ola Maps',
          `🗺️ Directions for ${origin} → ${destination}`,
          routeSummary ? `Summary: ${routeSummary}` : '',
          route?.legs?.[0]?.readable_distance ? `First leg distance: ${route.legs[0].readable_distance}` : '',
          route?.legs?.[0]?.readable_duration ? `First leg duration: ${route.legs[0].readable_duration}` : '',
        ].filter(Boolean).join('\n\n'),
        message: `Ola Maps directions complete for ${origin} to ${destination}.`,
      };
    }

    if (mode === 'distance' || mode === 'matrix' || mode === 'distancematrix') {
      const origins = args.origins || args.origin || [];
      const destinations = args.destinations || args.destination || [];

      const matrix = await getOlaDistanceMatrix({
        origins,
        destinations,
        mode: args.travelMode || args.transportMode || 'driving',
        routePreference: args.routePreference || args.route_preference || 'fastest',
        auth: args.auth || 'auto',
      }, config);

      return {
        success: true,
        provider: 'ola',
        providerLabel: 'Ola Maps',
        mode: 'distanceMatrix',
        origins: matrix?.origins,
        destinations: matrix?.destinations,
        rowCount: matrix?.rowCount || 0,
        matrix: matrix?.matrix || [],
        summary: matrix?.summary || 'Distance matrix ready.',
        analysis: [
          'Provider: Ola Maps',
          matrix?.summary || 'Distance matrix ready.',
        ].filter(Boolean).join('\n\n'),
        message: 'Ola Maps distance matrix complete.',
      };
    }

    if (!placeQuery) {
      return { error: 'A destination or query is required for Ola Maps place search' };
    }

    const results = await searchOlaPlaces(placeQuery, normalizedLimit, normalizedFocus, config);
    const normalizedResults = results.map((place, index) => {
      const name = toText(place?.name, `Place ${index + 1}`);
      const rawLink = toText(place?.link || place?.olaMapsUrl || place?.googleMapsUrl || '', '');
      const workingLink = rawLink && !/olamaps?/i.test(rawLink)
        ? rawLink
        : buildOpenStreetMapSearchUrl(name);

      return {
        ...place,
        link: workingLink,
        openStreetMapUrl: workingLink,
        olaMapsUrl: toText(place?.olaMapsUrl, ''),
        googleMapsUrl: toText(place?.googleMapsUrl, ''),
      };
    });

    const analysisParts = [
      'Provider: Ola Maps',
      `🗺️ Ola Maps place search for "${placeQuery}"`,
      normalizedResults.length > 0
        ? `Suggestions:\n${normalizedResults.map((place, index) => formatOlaPlaceLine(place, `Place ${index + 1}`)).join('\n')}`
        : 'No suggestions found.',
    ];

    return {
      success: true,
      provider: 'ola',
      providerLabel: 'Ola Maps',
      destination: placeQuery,
      focus: normalizedFocus,
      limit: normalizedLimit,
      summary: `Ola Maps found ${normalizedResults.length} place suggestion(s) for ${placeQuery}.`,
      results: normalizedResults,
      suggestions: normalizedResults,
      citations: [],
      sources: [],
      analysis: analysisParts.join('\n\n'),
      message: `Ola Maps search complete for "${placeQuery}".`,
    };
  }
}

class OpenStreetMapTool {
  constructor(name = 'openStreetMap') {
    this.name = name;
    this.description = 'Resolve a destination into an embedded OpenStreetMap preview with a shareable map link';
  }

  async execute(args) {
    const destination = toText(args.destination || args.query || args.place || args.location, '');

    if (!destination) {
      return { error: 'Destination required' };
    }

    const zoom = Math.max(4, Math.min(19, toInteger(args.zoom, 13)));
    const location = await resolveOpenStreetMapLocation(destination, { zoom, limit: 1 });

    if (!location) {
      return {
        success: true,
        provider: 'openstreetmap',
        providerLabel: 'OpenStreetMap',
        destination,
        summary: `OpenStreetMap search ready for ${destination}.`,
        searchUrl: buildOpenStreetMapSearchUrl(destination),
        mapUrl: buildOpenStreetMapSearchUrl(destination),
        embedUrl: '',
        coordinates: null,
        citations: [{
          index: 1,
          title: destination,
          url: buildOpenStreetMapSearchUrl(destination),
          snippet: destination,
        }],
        sources: [{
          title: destination,
          url: buildOpenStreetMapSearchUrl(destination),
        }],
        analysis: [
          'Provider: OpenStreetMap',
          `OpenStreetMap search for "${destination}"`,
          `Search link: [${destination}](${buildOpenStreetMapSearchUrl(destination)})`,
        ].join('\n\n'),
        message: `OpenStreetMap search ready for "${destination}".`,
      };
    }

    return {
      success: true,
      provider: 'openstreetmap',
      providerLabel: 'OpenStreetMap',
      destination,
      summary: `OpenStreetMap preview ready for ${location.displayName || destination}.`,
      location,
      searchUrl: location.searchUrl,
      mapUrl: location.mapUrl,
      embedUrl: location.embedUrl,
      coordinates: location.coordinates,
      citations: [{
        index: 1,
        title: location.displayName || destination,
        url: location.mapUrl,
        snippet: location.displayName || destination,
      }],
      sources: [{
        title: location.displayName || destination,
        url: location.mapUrl,
      }],
      analysis: [
        'Provider: OpenStreetMap',
        `OpenStreetMap preview for "${destination}"`,
        `Location: ${location.displayName || destination}`,
        `Map link: [${location.displayName || destination}](${location.mapUrl})`,
      ].join('\n\n'),
      message: `OpenStreetMap preview ready for "${destination}".`,
    };
  }
}

class SearchWebTool {
  constructor(name = 'searchWeb') {
    this.name = name;
    this.description = 'Search the live web, read source pages, and summarize current travel information with citations';
  }

  async execute(args) {
    const { query, limit = 5 } = args;
    const normalizedQuery = toText(query, '');

    if (!normalizedQuery) {
      return { error: 'Query required' };
    }

    const normalizedLimit = Math.max(1, Math.min(toInteger(limit, 5), 10));
    const result = await searchTravelWeb(normalizedQuery, normalizedLimit);
    const summary = toText(result.summary || result.synthesis?.summary, '');
    const sourcePages = Array.isArray(result.sourcePages) ? result.sourcePages.slice(0, 3) : [];
    const citations = Array.isArray(result.citations) && result.citations.length > 0
      ? result.citations.slice(0, 3)
      : sourcePages.map((source, index) => ({
        index: index + 1,
        title: toText(source?.title, `Source ${index + 1}`),
        url: toText(source?.url, ''),
        snippet: toText(source?.snippet || source?.content || '', ''),
      }));
    const topResults = Array.isArray(result.results) ? result.results.slice(0, normalizedLimit) : [];
    const providerLabel = toText(result.providerLabel || result.provider, 'DuckDuckGo HTML');

    const keyPointLines = Array.isArray(result.keyPoints)
      ? result.keyPoints.map((point) => {
        if (typeof point === 'string') {
          return `- ${point}`;
        }

        const pointText = toText(point?.point || point?.text || '', '');
        const sourceIndexes = Array.isArray(point?.sourceIndexes)
          ? point.sourceIndexes
          : Array.isArray(point?.sources)
            ? point.sources
            : [];
        const citationSuffix = sourceIndexes.length > 0 ? ` [${sourceIndexes.join(', ')}]` : '';
        return pointText ? `- ${pointText}${citationSuffix}` : '';
      }).filter(Boolean)
      : [];

    const resultLines = topResults.map((item) => {
      const title = toText(item?.title, 'Untitled result');
      const url = toText(item?.url, '');
      const snippet = toText(item?.snippet, '');
      return `- ${title}${url ? ` (${url})` : ''}${snippet ? ` — ${snippet}` : ''}`;
    });

    const recommendedSourceLines = Array.isArray(result.recommendedSources)
      ? result.recommendedSources
      : [];

    const sourceLines = recommendedSourceLines
      .map((source) => formatWebSource(source))
      .filter(Boolean)
      .map((source) => `- ${source}`);

    const analysisParts = [
      `Provider: ${providerLabel}`,
      `🌐 Live web research for "${normalizedQuery}"`,
      summary ? `Summary: ${summary}` : '',
      keyPointLines.length > 0 ? `Key points:\n${keyPointLines.join('\n')}` : '',
      sourcePages.length > 0 ? `Source pages read:\n${sourcePages.map((source, index) => {
        const title = toText(source?.title, `Source ${index + 1}`);
        const url = toText(source?.url, '');
        const preview = toText(source?.snippet || source?.content || '', '').slice(0, 180);
        const link = url ? `[${title}](${url})` : title;
        return `- ${link}${preview ? ` — ${preview}` : ''}`;
      }).join('\n')}` : '',
      resultLines.length > 0 ? `Top results:\n${resultLines.join('\n')}` : '',
      sourceLines.length > 0 ? `Recommended sources:\n${sourceLines.join('\n')}` : '',
    ].filter(Boolean);

    return {
      success: true,
      query: normalizedQuery,
      count: result.count || topResults.length,
      provider: result.provider || 'duckduckgo',
      providerLabel,
      summary,
      sources: sourcePages,
      citations,
      results: topResults,
      recommendedSources: result.recommendedSources || [],
      followUpQuery: result.followUpQuery || normalizedQuery,
      ollamaTimedOut: Boolean(result.ollamaTimedOut),
      analysis: analysisParts.join('\n\n'),
      message: `Live web search complete for "${normalizedQuery}".`,
    };
  }
}

class ReadUrlTool {
  constructor(name = 'readUrl') {
    this.name = name;
    this.description = 'Read a specific URL and extract the most useful facts for the trip';
  }

  async execute(args) {
    const { url } = args;
    const normalizedUrl = toText(url, '');

    if (!normalizedUrl) {
      return { error: 'URL required' };
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return { error: 'A valid URL is required' };
    }

    const result = await readTravelUrlContent(parsedUrl.toString());
    const summary = toText(result.summary || result.insight?.summary, '');
    const keyFacts = Array.isArray(result.keyFacts) ? result.keyFacts : Array.isArray(result.insight?.keyFacts) ? result.insight.keyFacts : [];
    const risks = Array.isArray(result.risks) ? result.risks : Array.isArray(result.insight?.risks) ? result.insight.risks : [];
    const recommendedAction = toText(result.recommendedAction || result.insight?.recommendedAction, '');
    const title = result.title || parsedUrl.hostname;
    const sourceLink = `[${title}](${parsedUrl.toString()})`;

    const analysisParts = [
      `📄 Read URL: ${sourceLink}`,
      `URL: ${parsedUrl.toString()}`,
      summary ? `Summary: ${summary}` : '',
      keyFacts.length > 0 ? `Key facts:\n${keyFacts.map((fact) => `- ${fact}`).join('\n')}` : '',
      risks.length > 0 ? `Risks:\n${risks.map((risk) => `- ${risk}`).join('\n')}` : '',
      recommendedAction ? `Recommended action: ${recommendedAction}` : '',
    ].filter(Boolean);

    return {
      success: true,
      url: parsedUrl.toString(),
      title,
      summary,
      keyFacts,
      risks,
      recommendedAction,
      contentType: result.contentType,
      ollamaTimedOut: Boolean(result.ollamaTimedOut),
      pageInsight: result.insight || null,
      source: {
        title,
        url: parsedUrl.toString(),
        summary,
      },
      citation: {
        title,
        url: parsedUrl.toString(),
        snippet: summary || keyFacts[0] || '',
      },
      citations: [{
        index: 1,
        title,
        url: parsedUrl.toString(),
        snippet: summary || keyFacts[0] || '',
      }],
      analysis: analysisParts.join('\n\n'),
      message: `Read and summarized ${result.title || parsedUrl.hostname}.`,
    };
  }
}

class GenerateEmailTool {
  constructor(name = 'generateEmail') {
    this.name = name;
    this.description = 'Generate an email summary of the travel plan to send to group members';
  }

  async execute(args) {
    const { plan } = args;

    if (!plan) {
      return { error: 'Plan required' };
    }

    const emailContent = buildEmailContent(plan);

    return {
      success: true,
      emailContent,
      analysis: emailContent,
      message: 'Professional email generated successfully'
    };
  }
}

// Export all tools
module.exports = {
  PlanAccessTool,
  ModifyDestinationTool,
  ModifyDatesTool,
  ModifyGroupSizeTool,
  ModifyDurationTool,
  ModifyBudgetTool,
  AddConstraintTool,
  AnalyzeCostTool,
  SuggestAlternativesTool,
  SearchPlacesTool,
  OlaMapsTool,
  OpenStreetMapTool,
  SearchWebTool,
  ReadUrlTool,
  GenerateEmailTool,
  buildPlanSnapshot,
  
  // Helper to create all tools
  createAllTools() {
    return [
      new PlanAccessTool(),
      new ModifyDestinationTool(),
      new ModifyDatesTool(),
      new ModifyGroupSizeTool(),
      new ModifyDurationTool(),
      new ModifyBudgetTool(),
      new AddConstraintTool(),
      new AnalyzeCostTool(),
      new SuggestAlternativesTool(),
      new SearchPlacesTool(),
      new OlaMapsTool(),
      new OpenStreetMapTool(),
      new SearchWebTool(),
      new ReadUrlTool(),
      new GenerateEmailTool()
    ];
  }
};
