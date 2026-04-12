import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import useAgent from '../../hooks/useAgent';
import AgentService from '../../services/agentService';
import './agentPanel.css';

/**
 * AGENT PANEL V2 - IMPROVED VERSION
 * 
 * Shows AI travel assistant sidebar after plan generation
 * Uses custom hook for state management
 * Features:
 * - Real-time chat with agent (uses useAgent hook)
 * - Quick action buttons
 * - Plan modification tracking
 * - Capabilities display
 * - Error handling with recovery
 */

const AgentPanelV2 = ({ userId, currentPlan, onPlanUpdate, agentModel = 'gemma-cloud' }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showAgent, setShowAgent] = useState(false);
  const [error, setError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const hasInitializedRef = useRef(false);
  const sendLockRef = useRef(false);

  const destinationLabel = currentPlan?.destination || currentPlan?.toPlace || 'your trip';
  const formatCurrency = (value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }

    return `₹${numericValue.toLocaleString()}`;
  };

  const budgetLabel = formatCurrency(currentPlan?.budget);
  const durationLabel = currentPlan?.totalDays || currentPlan?.duration
    ? `${currentPlan.totalDays || currentPlan.duration} days`
    : null;
  const headerSummary = [destinationLabel, budgetLabel, durationLabel].filter(Boolean).join(' • ');

  const buildWelcomeMessage = () => ({
    id: 'welcome',
    type: 'agent',
    text: `I can help you refine **${destinationLabel}** with route options, itinerary tweaks, and a clean summary.\n\nAsk for one change at a time and I’ll keep it focused.`
  });

  const suggestionActions = [
    {
      key: 'analyze',
      label: 'Analyze costs',
      prompt: 'Analyze the trip costs and keep the answer concise.',
    },
    {
      key: 'compare',
      label: 'Compare options',
      prompt: 'Compare a few better route, stay, or timing options for this trip.',
    },
    {
      key: 'email',
      label: 'Draft message',
      prompt: 'Draft a polished message I can send to my group.',
    },
  ];

  const handleQuickAction = (prompt) => {
    setInput(prompt);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleClearChat = () => {
    setMessages([buildWelcomeMessage()]);
    setInput('');
    setError(null);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  // Use custom hook for agent interaction
  const {
    isLoading,
    setPlan,
    sendMessage
  } = useAgent(userId, agentModel);

  // Keep the backend agent synced with the latest plan.
  useEffect(() => {
    if (!currentPlan || !userId) {
      return undefined;
    }

    let cancelled = false;

    const syncAgent = async () => {
      try {
        const result = await setPlan(currentPlan, agentModel);

        if (!result || !result.success || cancelled) {
          if (!hasInitializedRef.current && !cancelled) {
            setError('Failed to initialize agent');
          }
          return;
        }

        if (!hasInitializedRef.current) {
          if (!cancelled) {
            setMessages([buildWelcomeMessage()]);
            setShowAgent(true);
            setError(null);
            hasInitializedRef.current = true;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Error initializing agent: ${err.message}`);
          console.error(err);
        }
      }
    };

    syncAgent();

    return () => {
      cancelled = true;
    };
  }, [currentPlan, userId, agentModel, setPlan]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    if (!isExpanded) {
      document.body.classList.remove('agent-panel-locked');
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsExpanded(false);
      }
    };

    document.body.classList.add('agent-panel-locked');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('agent-panel-locked');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || isSending || sendLockRef.current) return;

    const userMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      text: input
    };

    sendLockRef.current = true;
    setIsSending(true);
    setMessages(prev => [...prev, userMessage]);
    const messageText = input;
    setInput('');

    try {
      const result = await sendMessage(messageText);

      if (result && result.success) {
        const responseText = AgentService.formatResponse(result.response);
        const updatedPlan = result.updatedPlan || result.response?.updatedPlan || null;
        const agentMessage = {
          id: `msg-${Date.now()}`,
          type: 'agent',
          text: responseText,
          toolsUsed: AgentService.getToolsUsed(result.response) || []
        };

        setMessages(prev => [...prev, agentMessage]);
        setError(null);

        // If plan was modified, notify parent
        if (updatedPlan && onPlanUpdate) {
          onPlanUpdate(updatedPlan);
        }
      } else {
        const errorMessage = {
          id: `msg-${Date.now()}`,
          type: 'error',
          text: `Error: ${result?.error || 'Failed to process message'}`
        };
        setMessages(prev => [...prev, errorMessage]);
        setError(result?.error || 'Failed to process message');
      }
    } catch (err) {
      const errorMessage = {
        id: `msg-${Date.now()}`,
        type: 'error',
        text: `Connection error: ${err.message}`
      };
      setMessages(prev => [...prev, errorMessage]);
      setError(err.message);
      console.error(err);
    } finally {
      setIsSending(false);
      sendLockRef.current = false;
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const toggleExpanded = () => {
    setIsExpanded((previous) => !previous);
  };

  const panelContent = (
    <div className={`agent-panel ${isExpanded ? 'agent-panel-expanded' : ''}`}>
      <div className="agent-header">
        <div className="agent-header-title">
          <h3>🤖 Travel Assistant</h3>
          <p className="agent-header-subtitle">{headerSummary || 'Chat with your travel plan'}</p>
        </div>
        <div className="agent-header-actions">
          {error && <div className="agent-error-badge" title={error}>⚠️</div>}
          <button
            type="button"
            className="agent-expand-btn"
            onClick={toggleExpanded}
            title={isExpanded ? 'Restore side panel' : 'Expand to full page'}
            aria-label={isExpanded ? 'Restore side panel' : 'Expand to full page'}
          >
            {isExpanded ? (
              <>
                <Minimize2 size={16} />
                <span>Restore</span>
              </>
            ) : (
              <>
                <Maximize2 size={16} />
                <span>Full page</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="agent-panel-body">
        <div className="agent-panel-toolbar">
          <div className="agent-panel-suggested-actions">
            {suggestionActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className="agent-panel-suggested-action"
                onClick={() => handleQuickAction(action.prompt)}
                disabled={isLoading || isSending}
              >
                {action.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="agent-panel-clear-btn"
            onClick={handleClearChat}
            disabled={isLoading || isSending}
          >
            Clear chat
          </button>
        </div>

        {/* Messages Area */}
        <div className="agent-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.type}`}>
              <div className="message-content">
                {msg.type === 'agent' ? (
                  <div className="message-markdown">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                ) : (
                  msg.text
                )}
              </div>
              {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                <div className="message-tools">
                  {msg.toolsUsed.map((tool) => (
                    <span key={tool} className="tool-badge">{tool}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="agent-input-area">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask about routes, budget, itinerary changes, or a message for your group..."
            disabled={isLoading || isSending}
            className="agent-input"
          />
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={isLoading || isSending || !input.trim()}
            className="agent-send-btn"
            title={(isLoading || isSending) ? 'Processing...' : 'Send message'}
          >
            {(isLoading || isSending) ? '⏳' : '→'}
          </button>
        </div>
      </div>
    </div>
  );

  if (!showAgent) return null;

  if (isExpanded && typeof document !== 'undefined') {
    return createPortal(panelContent, document.body);
  }

  return panelContent;
};

export default AgentPanelV2;
