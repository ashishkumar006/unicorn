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
 * - generateEmail() - Create email summary
 */

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

    if (newGroupSize < 2 || newGroupSize > 100) {
      return { error: 'Group size must be between 2 and 100' };
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
      new GenerateEmailTool()
    ];
  }
};
