import React, { useState, useEffect, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import useAgent from '../../hooks/useAgent';
import AgentService from '../../services/agentService';
import './agentPanel.css';

const markdownComponents = {
  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
};

const LOADING_MESSAGE = 'Checking live sources and shaping the answer...';

function getToolProgressMessage(toolName) {
  const normalizedTool = String(toolName || '').toLowerCase();

  if (normalizedTool.includes('searchplaces') || normalizedTool.includes('olamaps') || normalizedTool.includes('google')) {
    return '🔎 Searching live places and map data...';
  }

  if (normalizedTool.includes('searchweb') || normalizedTool.includes('readurl')) {
    return '🌐 Reading live sources...';
  }

  if (normalizedTool.includes('modify') || normalizedTool.includes('analyze')) {
    return '🧩 Updating your trip plan...';
  }

  return `⏳ Working on ${toolName}...`;
}

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
  const activeMessageIdRef = useRef(null);

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
      key: 'research',
      label: 'Live research',
      prompt: 'Search the web for current travel information relevant to this trip and summarize the best sources.',
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

  const handleClearChat = async () => {
    const result = await reset();

    if (!result || !result.success) {
      setError('Failed to reset agent conversation');
      return;
    }

    activeMessageIdRef.current = null;
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
    sendMessage,
    reset,
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
    const assistantMessageId = `msg-${Date.now()}-assistant`;

    sendLockRef.current = true;
    const messageText = input;
    setInput('');

    flushSync(() => {
      setIsSending(true);
      activeMessageIdRef.current = assistantMessageId;
      setMessages(prev => [...prev, userMessage, {
        id: assistantMessageId,
        type: 'agent',
        text: LOADING_MESSAGE,
        toolsUsed: [],
      }]);
    });

    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const appendProgress = (text) => {
      if (!text || !activeMessageIdRef.current) {
        return;
      }

      setMessages((prev) => prev.map((message) => {
        if (message.id !== activeMessageIdRef.current) {
          return message;
        }

        const currentText = message.text || '';
        const nextText = currentText && currentText !== LOADING_MESSAGE
          ? `${currentText}\n\n${text}`
          : text;

        return {
          ...message,
          text: nextText,
        };
      }));
    };

    try {
      const result = await sendMessage(messageText, (event) => {
        if (!event) {
          return;
        }

        if (event.type === 'tool_start' && event.tool) {
          appendProgress(getToolProgressMessage(event.tool));
        } else if (event.type === 'tool_result_chunk' && event.content) {
          appendProgress(event.content);
        } else if (event.type === 'tool_end' && event.tool) {
          appendProgress(`✓ ${event.tool} finished.`);
        } else if (event.type === 'message' && event.content) {
          appendProgress(event.content);
        } else if (event.type === 'error' && event.error) {
          appendProgress(`❌ Error: ${event.error}`);
        }
      });

      if (result && result.success) {
        const responseText = AgentService.formatResponse(result.response);
        const updatedPlan = result.updatedPlan || result.response?.updatedPlan || null;
        const toolsUsed = AgentService.getToolsUsed(result.response) || [];
        setMessages(prev => prev.map((message) => (
          message.id === assistantMessageId
            ? {
              ...message,
              text: message.text && message.text !== LOADING_MESSAGE ? message.text : responseText,
              toolsUsed,
            }
            : message
        )));
        setError(null);

        // If plan was modified, notify parent
        if (updatedPlan && onPlanUpdate) {
          onPlanUpdate(updatedPlan);
        }
      } else {
        const errorText = result?.error || 'Failed to process message';
        setMessages(prev => prev.map((message) => (
          message.id === assistantMessageId
            ? {
              ...message,
              text: `Error: ${errorText}`,
            }
            : message
        )));
        setError(errorText);
      }
    } catch (err) {
      setMessages(prev => prev.map((message) => (
        message.id === assistantMessageId
          ? {
            ...message,
            text: `Connection error: ${err.message}`,
          }
          : message
      )));
      setError(err.message);
      console.error(err);
    } finally {
      setIsSending(false);
      sendLockRef.current = false;
      activeMessageIdRef.current = null;
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
                    <ReactMarkdown components={markdownComponents}>{msg.text}</ReactMarkdown>
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
            placeholder="Ask about routes, budget, live research, itinerary changes, or a message for your group..."
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
