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

export function useAgent(userId, agentModel = 'gemma-cloud') {
  const [agentStatus, setAgentStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capabilities, setCapabilities] = useState(null);

  const API_URL = 'http://localhost:5000/api/agent';

  /**
   * Set the plan for agent to work with
   */
  const setPlan = useCallback(async (plan, customAgentModel = agentModel) => {
    if (!userId || !plan) return null;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, plan, agentModel: customAgentModel })
      });

      const data = await response.json();

      if (data.success) {
        setAgentStatus(data.agentStatus);
        return {
          success: true,
          planId: data.storedPlanId,
          context: data.agentContext
        };
      } else {
        setError(data.error);
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
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, message, agentModel })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) throw new Error('Streaming not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let finalData = null;
      let bufferedSse = '';
      let lastEvent = null;
      console.log('[useAgent] Starting to read SSE stream for userId:', userId);

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
        console.log('[useAgent] Parsed SSE data:', data.type);

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
          console.log('[useAgent] SSE stream ended');
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

      console.log('[useAgent] Final data received:', finalData ? 'yes' : 'no');

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
      const response = await fetch(`${API_URL}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, modification, agentModel })
      });

      const data = await response.json();

      if (data.success) {
        setAgentStatus(data.agentStatus);
        return {
          success: true,
          result: data.result
        };
      } else {
        setError(data.error);
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
      const response = await fetch(`${API_URL}/capabilities?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setCapabilities(data.capabilities);
        return data.capabilities;
      } else {
        setError(data.error);
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
      const response = await fetch(`${API_URL}/status?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setAgentStatus(data.status);
        return data;
      } else {
        setError(data.error);
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
      const response = await fetch(`${API_URL}/history/${userId}`);
      const data = await response.json();

      if (data.success) {
        return data.history;
      } else {
        setError(data.error);
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
      const response = await fetch(`${API_URL}/reset/${userId}`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setAgentStatus(data.agentStatus);
        return { success: true };
      } else {
        setError(data.error);
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
      const response = await fetch(
        `${API_URL}/rag/search?userId=${userId}&query=${encodeURIComponent(query)}`
      );

      const data = await response.json();

      if (data.success) {
        return data.results;
      } else {
        setError(data.error);
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
      const response = await fetch(`${API_URL}/rag/documents/${userId}`);
      const data = await response.json();

      if (data.success) {
        return data.documents;
      } else {
        setError(data.error);
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
