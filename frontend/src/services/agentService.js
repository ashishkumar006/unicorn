/**
 * AGENT SERVICE
 * 
 * Service layer for agent API interactions (utility-only)
 * Provides centralized helper methods for response formatting and tool usage parsing
 */

class AgentService {
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
