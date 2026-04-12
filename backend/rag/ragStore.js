/**
 * RAG SYSTEM - RETRIEVAL AUGMENTED GENERATION
 * 
 * Stores travel plans as documents and retrieves relevant context
 * for the agent to make informed decisions
 * 
 * How it works:
 * 1. User creates a travel plan → Stored in RAG + Database
 * 2. User chats with agent → Agent retrieves relevant context
 * 3. Agent makes modifications → RAG + Database updated
 * 4. Future plans reference past plans
 */

const crypto = require('crypto');
const db = require('../db/database');

function getPlanSummary(plan = {}) {
  return plan.summary && typeof plan.summary === 'object' ? plan.summary : {};
}

function getPlanOrigin(plan = {}) {
  const summary = getPlanSummary(plan);
  return summary.fromPlace || plan.origin || plan.fromPlace || null;
}

function getPlanDestination(plan = {}) {
  const summary = getPlanSummary(plan);
  return summary.toPlace || plan.destination || plan.toPlace || null;
}

function getPlanBudget(plan = {}) {
  const summary = getPlanSummary(plan);
  const value = summary.totalBudget || plan.estimatedBudget || plan.budget || 0;

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPlanTravelers(plan = {}) {
  const summary = getPlanSummary(plan);
  const value = summary.travelers || plan.groupSize || 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getPlanDuration(plan = {}) {
  const summary = getPlanSummary(plan);
  const value = summary.duration || plan.totalDays || plan.nights || (Array.isArray(plan.itinerary) ? plan.itinerary.length : 0);
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

class RAGStore {
  constructor() {
    this.documents = new Map(); // In-memory cache
    this.index = new Map();
    this.userDocuments = new Map();
  }

  /**
   * Store a plan as a document (in memory + database)
   */
  async storePlan(userId, plan, metadata = {}) {
    const docId = `plan-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const destination = getPlanDestination(plan);
    const origin = getPlanOrigin(plan);
    const budget = getPlanBudget(plan);
    const travelers = getPlanTravelers(plan);
    const duration = getPlanDuration(plan);
    
    const document = {
      id: docId,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: JSON.parse(JSON.stringify(plan)),
      metadata: {
        destination,
        origin,
        groupSize: travelers,
        startDate: plan.travelWindow?.startDate || plan.departureDate || getPlanSummary(plan).departureDate,
        nights: getPlanSummary(plan).nights || duration,
        duration,
        budget,
        ...metadata
      },
      keywords: this.extractKeywords(plan)
    };

    // Store in memory
    this.documents.set(docId, document);

    if (!this.userDocuments.has(userId)) {
      this.userDocuments.set(userId, []);
    }
    this.userDocuments.get(userId).push(docId);

    this.indexDocument(docId, document);

    // Store in database
    try {
      await db.savePlan(userId, docId, plan, metadata);
      await db.saveRAGDocument(userId, docId, document, document.keywords);
    } catch (err) {
      console.error('Error saving to database:', err);
    }

    return docId;
  }

  /**
   * Extract keywords from plan for search
   */
  extractKeywords(plan) {
    const keywords = [];
    const summary = getPlanSummary(plan);
    
    if (summary.fromPlace) keywords.push(String(summary.fromPlace).toLowerCase());
    if (summary.toPlace) keywords.push(String(summary.toPlace).toLowerCase());
    if (plan.origin) keywords.push(String(plan.origin).toLowerCase());
    if (plan.destination) keywords.push(String(plan.destination).toLowerCase());
    if (Array.isArray(plan.highlights)) plan.highlights.forEach((item) => keywords.push(String(item).toLowerCase()));
    if (Array.isArray(plan.packingEssentials)) plan.packingEssentials.forEach((item) => keywords.push(String(item).toLowerCase()));
    if (Array.isArray(plan.itinerary)) plan.itinerary.forEach((day) => {
      if (day?.title) keywords.push(String(day.title).toLowerCase());
      if (Array.isArray(day?.activities)) {
        day.activities.forEach((activity) => {
          if (activity?.activity) keywords.push(String(activity.activity).toLowerCase());
        });
      }
    });
    if (Array.isArray(plan.constraints)) plan.constraints.forEach((constraint) => keywords.push(String(constraint).toLowerCase()));

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Index document for fast retrieval
   */
  indexDocument(docId, document) {
    document.keywords.forEach(keyword => {
      if (!this.index.has(keyword)) {
        this.index.set(keyword, []);
      }
      if (!this.index.get(keyword).includes(docId)) {
        this.index.get(keyword).push(docId);
      }
    });
  }

  /**
   * Search for similar plans
   */
  searchPlans(userId, query, limit = 3) {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const results = new Map();

    // Find documents matching search terms
    queryTerms.forEach(term => {
      const docIds = this.index.get(term) || [];
      docIds.forEach(docId => {
        const doc = this.documents.get(docId);
        
        // Only return user's own documents
        if (doc.userId === userId) {
          results.set(docId, (results.get(docId) || 0) + 1);
        }
      });
    });

    // Sort by relevance and return top results
    return Array.from(results.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docId]) => this.documents.get(docId));
  }

  /**
   * Retrieve recent plans for user
   */
  getRecentPlans(userId, limit = 5) {
    const userDocs = this.userDocuments.get(userId) || [];
    return userDocs
      .map(docId => this.documents.get(docId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  /**
   * Get a specific plan
   */
  getPlan(userId, planId) {
    const doc = this.documents.get(planId);
    if (!doc || doc.userId !== userId) {
      return null;
    }
    return doc;
  }

  /**
   * Update a plan
   */
  async updatePlan(userId, planId, updates) {
    const doc = this.documents.get(planId);
    if (!doc || doc.userId !== userId) {
      return null;
    }

    doc.plan = { ...doc.plan, ...updates };
    doc.updatedAt = new Date();
    doc.keywords = this.extractKeywords(doc.plan);

    // Re-index
    this.index.clear();
    this.documents.forEach((d, id) => {
      this.indexDocument(id, d);
    });

    // Update database
    try {
      await db.savePlan(userId, planId, doc.plan, doc.metadata);
    } catch (err) {
      console.error('Error updating database:', err);
    }

    return doc;
  }

  /**
   * Build context for agent (RAG retrieval)
   */
  buildAgentContext(userId, currentPlan) {
    const recentPlans = this.getRecentPlans(userId, 3);
    const currentDestination = getPlanDestination(currentPlan);
    const currentBudget = getPlanBudget(currentPlan);
    const currentGroupSize = getPlanTravelers(currentPlan);
    
    const context = {
      currentPlan,
      similarPastPlans: recentPlans.filter(p => 
        getPlanDestination(p.plan) && getPlanDestination(p.plan) === currentDestination
      ),
      budgetContext: {
        averageBudgetPerPerson: recentPlans.length > 0
          ? Math.round(recentPlans.reduce((sum, p) => {
            const budget = getPlanBudget(p.plan);
            const travelers = Math.max(1, getPlanTravelers(p.plan) || 1);
            return sum + Math.round(budget / travelers);
          }, 0) / recentPlans.length)
          : null,
        typicalGroupSize: recentPlans.length > 0
          ? Math.round(recentPlans.reduce((sum, p) => sum + getPlanTravelers(p.plan), 0) / recentPlans.length)
          : null
      },
      currentTrip: {
        destination: currentDestination,
        origin: getPlanOrigin(currentPlan),
        budget: currentBudget,
        travelers: currentGroupSize,
        duration: getPlanDuration(currentPlan)
      },
      commonPreferences: this.extractCommonPreferences(recentPlans)
    };

    return context;
  }

  /**
   * Extract common preferences from past plans
   */
  extractCommonPreferences(recentPlans) {
    const preferences = {};
    
    recentPlans.forEach(p => {
      if (p.plan.constraints) {
        p.plan.constraints.forEach(constraint => {
          preferences[constraint] = (preferences[constraint] || 0) + 1;
        });
      }
    });

    return Object.entries(preferences)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pref]) => pref);
  }

  /**
   * Get all documents for a user
   */
  getUserDocuments(userId) {
    const docIds = this.userDocuments.get(userId) || [];
    return docIds.map(id => this.documents.get(id));
  }

  /**
   * Delete a plan
   */
  deletePlan(userId, planId) {
    const doc = this.documents.get(planId);
    if (!doc || doc.userId !== userId) {
      return false;
    }

    this.documents.delete(planId);
    const userDocs = this.userDocuments.get(userId);
    if (userDocs) {
      const index = userDocs.indexOf(planId);
      if (index > -1) {
        userDocs.splice(index, 1);
      }
    }

    return true;
  }

  /**
   * Clear all index for rebuilt (optimization)
   */
  rebuildIndex() {
    this.index.clear();
    this.documents.forEach((doc, docId) => {
      this.indexDocument(docId, doc);
    });
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalDocuments: this.documents.size,
      totalUsers: this.userDocuments.size,
      indexSize: this.index.size
    };
  }
}

// Create a singleton instance
const ragStore = new RAGStore();

module.exports = { RAGStore, ragStore };

/**
 * USAGE EXAMPLE:
 * 
 * const { ragStore } = require('./rag/ragStore');
 * 
 * // User creates a plan
 * const planId = ragStore.storePlan(userId, tripPlan);
 * 
 * // Agent retrieves context
 * const context = ragStore.buildAgentContext(userId, tripPlan);
 * 
 * // Agent can see similar past plans, preferences, budgets
 * console.log(context.similarPastPlans);
 * console.log(context.commonPreferences);
 * 
 * // Update plan
 * ragStore.updatePlan(userId, planId, { destination: 'Bangalore' });
 */
