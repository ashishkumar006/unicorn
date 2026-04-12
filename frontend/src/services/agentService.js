/**
 * AGENT SERVICE
 * 
 * Service layer for agent API interactions
 * Provides centralized API calls with error handling and response formatting
 */

const API_URL = 'http://localhost:5000/api';

/**
 * Class: AgentService
 * Handles all agent-related API interactions
 */
class AgentService {
  /**
   * Initialize agent with a plan
   * @param {string} userId - User identifier
   * @param {object} plan - Trip plan object
   * @returns {Promise<object>} - {success, planId, context, error}
   */
  static async initializePlan(userId, plan) {
    if (!userId || !plan) {
      return { success: false, error: 'userId and plan required' };
    }

    try {
      const response = await fetch(`${API_URL}/agent/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, plan })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to initialize plan: ${error.message}`
      };
    }
  }

  /**
   * Send message to agent
   * @param {string} userId - User identifier
   * @param {string} message - User message
   * @returns {Promise<object>} - {success, response, updatedPlan, error}
   */
  static async sendMessage(userId, message) {
    if (!userId || !message) {
      return { success: false, error: 'userId and message required' };
    }

    try {
      const response = await fetch(`${API_URL}/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, message })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to send message: ${error.message}`
      };
    }
  }

  /**
   * Quick modify plan without chat
   * @param {string} userId - User identifier
   * @param {string} toolName - Tool to execute
   * @param {object} args - Tool arguments
   * @returns {Promise<object>} - {success, result, error}
   */
  static async quickModify(userId, toolName, args) {
    if (!userId || !toolName) {
      return { success: false, error: 'userId and toolName required' };
    }

    try {
      const response = await fetch(`${API_URL}/agent/modify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          modification: { toolName, args }
        })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to modify plan: ${error.message}`
      };
    }
  }

  /**
   * Get agent capabilities
   * @param {string} userId - User identifier
   * @returns {Promise<object>} - {success, capabilities, error}
   */
  static async getCapabilities(userId) {
    if (!userId) {
      return { success: false, error: 'userId required' };
    }

    try {
      const response = await fetch(`${API_URL}/agent/capabilities?userId=${userId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to get capabilities: ${error.message}`
      };
    }
  }

  /**
   * Get agent status
   * @param {string} userId - User identifier
   * @returns {Promise<object>} - {success, status, error}
   */
  static async getStatus(userId) {
    if (!userId) {
      return { success: false, error: 'userId required' };
    }

    try {
      const response = await fetch(`${API_URL}/agent/status?userId=${userId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to get status: ${error.message}`
      };
    }
  }

  /**
   * Get chat history
   * @param {string} userId - User identifier
   * @returns {Promise<object>} - {success, history, error}
   */
  static async getHistory(userId) {
    if (!userId) {
      return { success: false, error: 'userId required' };
    }

    try {
      const response = await fetch(`${API_URL}/agent/history/${userId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to get history: ${error.message}`
      };
    }
  }

  /**
   * Reset agent conversation
   * @param {string} userId - User identifier
   * @returns {Promise<object>} - {success, error}
   */
  static async resetConversation(userId) {
    if (!userId) {
      return { success: false, error: 'userId required' };
    }

    try {
      const response = await fetch(`${API_URL}/agent/reset/${userId}`, {
        method: 'POST'
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to reset conversation: ${error.message}`
      };
    }
  }

  // =======================================
  // RAG METHODS
  // =======================================

  /**
   * Search for similar plans
   * @param {string} userId - User identifier
   * @param {string} query - Search query
   * @returns {Promise<object>} - {success, results, error}
   */
  static async searchPlans(userId, query) {
    if (!userId || !query) {
      return { success: false, error: 'userId and query required' };
    }

    try {
      const response = await fetch(
        `${API_URL}/rag/search?userId=${userId}&query=${encodeURIComponent(query)}`
      );

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to search plans: ${error.message}`
      };
    }
  }

  /**
   * Get all user's stored plans
   * @param {string} userId - User identifier
   * @returns {Promise<object>} - {success, documents, error}
   */
  static async getStoredPlans(userId) {
    if (!userId) {
      return { success: false, error: 'userId required' };
    }

    try {
      const response = await fetch(`${API_URL}/rag/documents/${userId}`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to get stored plans: ${error.message}`
      };
    }
  }

  /**
   * Get RAG system statistics
   * @returns {Promise<object>} - {success, stats, error}
   */
  static async getRAGStats() {
    try {
      const response = await fetch(`${API_URL}/rag/stats`);
      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        error: `Failed to get RAG stats: ${error.message}`
      };
    }
  }

  // =======================================
  // HELPER METHODS
  // =======================================

  /**
   * Format agent response for display
   * @param {object} response - Raw API response
   * @returns {string} - Formatted response text
   */
  static formatResponse(response) {
    if (!response) return '';

    if (typeof response === 'string') {
      return response;
    }

    if (response.message) {
      return response.message;
    }

    if (response.analysis) {
      return response.analysis;
    }

    if (response.text) {
      return response.text;
    }

    return JSON.stringify(response);
  }

  /**
   * Parse tool usage from agent response
   * @param {object} response - Raw API response
   * @returns {array} - Array of tool names used
   */
  static getToolsUsed(response) {
    if (!response) return [];

    if (Array.isArray(response.toolsUsed)) {
      return response.toolsUsed
        .map((tool) => {
          if (typeof tool === 'string') {
            return tool;
          }

          return tool.name || tool.tool || tool.toolName;
        })
        .filter(Boolean);
    }

    if (response.toolsCalled) {
      return response.toolsCalled;
    }

    return [];
  }
}

export default AgentService;
