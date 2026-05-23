/**
 * USE_AGENT HOOK
 * 
 * Custom React hook for managing agent interaction
 * Handles:
 * - Sending messages to agent
 * - Getting agent status
 * - Managing agent state
 * - RAG context retrieval
 */

import { useState, useCallback } from 'react';
import { apiFetch, apiUrl } from '../lib/api';

export function useAgent(userId, agentModel = 'gemma-cloud') {
  const [agentStatus, setAgentStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capabilities, setCapabilities] = useState(null);

  /**
   * Set the plan for agent to work with
   */
  const setPlan = useCallback(async (plan, customAgentModel = agentModel) => {
    if (!userId || !plan) return null;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch('/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan, agentModel: customAgentModel })
      });

      if (data.success) {
        setAgentStatus(data.agentStatus);
        return {
          success: true,
          planId: data.storedPlanId,
          context: data.agentContext
        };
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, agentModel]);

  /**
   * Send a message to the agent (Supports Streaming)
   */
  const sendMessage = useCallback(async (message, onProgress = null) => {
    if (!userId || !message) return null;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/agent/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, message, agentModel })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) throw new Error('Streaming not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let finalData = null;
      let bufferedSse = '';
      let lastEvent = null;
      const processSseBlock = (block) => {
        const dataLines = block
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.substring(6).trim())
          .filter(Boolean);

        if (dataLines.length === 0) {
          return;
        }

        const dataStr = dataLines.join('\n');
        if (!dataStr || dataStr === '[DONE]') {
          return;
        }

        const data = JSON.parse(dataStr);
        lastEvent = data;

        if (data.type === 'final') {
          finalData = data;
          setAgentStatus(data.agentStatus);
        } else if (data.type === 'error') {
          setError(data.error);
        }

        if (onProgress) {
          onProgress(data);
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        bufferedSse += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let eventBoundaryIndex = bufferedSse.indexOf('\n\n');
        while (eventBoundaryIndex !== -1) {
          const eventBlock = bufferedSse.slice(0, eventBoundaryIndex).trim();
          bufferedSse = bufferedSse.slice(eventBoundaryIndex + 2);

          if (eventBlock) {
            try {
              processSseBlock(eventBlock);
            } catch (e) {
              console.error('[useAgent] Error parsing SSE data:', e, eventBlock);
            }
          }

          eventBoundaryIndex = bufferedSse.indexOf('\n\n');
        }
      }

      if (bufferedSse.trim()) {
        try {
          processSseBlock(bufferedSse.trim());
        } catch (e) {
          console.error('[useAgent] Error parsing trailing SSE data:', e, bufferedSse);
        }
      }

      if (finalData && finalData.success) {
        return {
          success: true,
          response: finalData.response,
          updatedPlan: finalData.response?.updatedPlan || null,
          toolsUsed: finalData.response?.toolsUsed || [],
          ragContext: finalData.ragContext
        };
      }

      if (lastEvent && lastEvent.type === 'final' && lastEvent.success) {
        return {
          success: true,
          response: lastEvent.response,
          updatedPlan: lastEvent.response?.updatedPlan || null,
          toolsUsed: lastEvent.response?.toolsUsed || [],
          ragContext: lastEvent.ragContext
        };
      } else {
        return { error: finalData?.error || lastEvent?.error || 'Failed to process message' };
      }
    } catch (err) {
      setError(err.message);
      return { error: err.message };
    } finally {
      setIsLoading(false);
    }
  }, [userId, agentModel]);

  /**
   * Quick modify plan without chat
   */
  const quickModify = useCallback(async (modification) => {
    if (!userId) return null;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch('/agent/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, modification, agentModel })
      });

      if (data.success) {
        setAgentStatus(data.agentStatus);
        return {
          success: true,
          result: data.result
        };
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, agentModel]);

  /**
   * Get agent capabilities
   */
  const getCapabilities = useCallback(async () => {
    if (!userId) return null;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch(`/agent/capabilities?userId=${encodeURIComponent(userId)}`);

      if (data.success) {
        setCapabilities(data.capabilities);
        return data.capabilities;
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  /**
   * Get agent status
   */
  const getStatus = useCallback(async () => {
    if (!userId) return null;

    try {
      const data = await apiFetch(`/agent/status?userId=${encodeURIComponent(userId)}`);

      if (data.success) {
        setAgentStatus(data.status);
        return data;
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  /**
   * Get chat history
   */
  const getHistory = useCallback(async () => {
    if (!userId) return null;

    try {
      const data = await apiFetch(`/agent/history/${encodeURIComponent(userId)}`);

      if (data.success) {
        return data.history;
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  /**
   * Reset agent conversation
   */
  const reset = useCallback(async () => {
    if (!userId) return null;

    setIsLoading(true);
    setError(null);

    try {
      const data = await apiFetch(`/agent/reset/${encodeURIComponent(userId)}`, {
        method: 'POST'
      });

      if (data.success) {
        setAgentStatus(data.agentStatus);
        return { success: true };
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  /**
   * Search RAG for similar plans
   */
  const searchPlans = useCallback(async (query) => {
    if (!userId || !query) return null;

    try {
      const data = await apiFetch(
        `/agent/rag/search?userId=${encodeURIComponent(userId)}&query=${encodeURIComponent(query)}`
      );

      if (data.success) {
        return data.results;
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  /**
   * Get all user's plans from RAG
   */
  const getPlans = useCallback(async () => {
    if (!userId) return null;

    try {
      const data = await apiFetch(`/agent/rag/documents/${encodeURIComponent(userId)}`);

      if (data.success) {
        return data.documents;
      } else {
        setError(data.error?.message || data.error);
        return null;
      }
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [userId]);

  return {
    // State
    agentStatus,
    isLoading,
    error,
    capabilities,

    // Methods
    setPlan,
    sendMessage,
    quickModify,
    getCapabilities,
    getStatus,
    getHistory,
    reset,
    searchPlans,
    getPlans,

    // Helpers
    clearError: () => setError(null)
  };
}

export default useAgent;
