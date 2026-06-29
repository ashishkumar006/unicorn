import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  Send,
  Loader2,
  IndianRupee,
  RefreshCw,
  Mail,
  ClipboardList,
  AlertCircle,
  Lightbulb,
  ArrowLeft,
  Compass
} from 'lucide-react';
import useAgent from '../hooks/useAgent';
import ConversationSidebar from '../components/ConversationSidebar';
import { apiFetch } from '../lib/api';
import '../styles/agentPage.css';

const markdownComponents = {
  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
  img: ({ src, alt, ...props }) => (
    <span className="agent-markdown-image-wrapper">
      <img src={src} alt={alt || 'Travel Recommendation'} className="agent-markdown-image" {...props} loading="lazy" />
      {alt && <span className="agent-markdown-image-caption">{alt}</span>}
    </span>
  ),
};

/**
 * DEDICATED AGENT PAGE
 * 
 * Full-screen agent interface after plan creation
 * Features:
 * - Complete chat interface with history
 * - Quick action buttons
 * - Real-time tool execution display
 * - Plan modification tracking
 * - Thinking/loading indicators
 * - Error recovery
 */

const AgentPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get plan from location state
  const { currentPlan, userId, agentModel = 'gemma-cloud' } = location.state || {};

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showThinking, setShowThinking] = useState(false);
  const [plan, setPlan] = useState(currentPlan);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [latestSources, setLatestSources] = useState([]);
  const [liveSources, setLiveSources] = useState([]);
  const [liveThoughts, setLiveThoughts] = useState([]);
  const [lastMessageText, setLastMessageText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const historyLoadedRef = useRef(false);
  const sendLockRef = useRef(false);

  // Use custom hook for agent interaction
  const {
    isLoading: agentLoading,
    setPlan: initAgent,
    sendMessage
  } = useAgent(userId, agentModel);

  // Initialize agent with plan
  useEffect(() => {
    if (currentPlan && userId) {
      initializeAgent();
    } else {
      setError('No plan data. Redirecting...');
      setTimeout(() => navigate('/'), 2000);
    }
  }, [currentPlan, userId]);

  // Load conversation history AFTER agent is initialized
  useEffect(() => {
    const hasWelcome = messages.some(m => m.id === 'welcome');
    if (userId && hasWelcome && !historyLoadedRef.current) {
      historyLoadedRef.current = true;
      loadConversationHistory();
    }
  }, [userId, messages]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const initialSources = Array.isArray(currentPlan?.meta?.citations)
      ? currentPlan.meta.citations
      : Array.isArray(currentPlan?.meta?.sources)
        ? currentPlan.meta.sources
        : [];
    setLatestSources(initialSources);
    setLiveSources(initialSources);
  }, [currentPlan]);

  const loadConversationHistory = async () => {
    try {
      const data = await apiFetch(`/agent/conversation-history/${encodeURIComponent(userId)}?limit=50`);
      
      if (data.success && data.history && data.history.length > 0) {
          // Convert history to message format (exclude welcome message from here)
          const historyMessages = data.history.map((msg, idx) => ({
            id: `history-${idx}`,
            type: msg.sender === 'user' ? 'user' : 'agent',
            text: msg.message,
            timestamp: new Date(msg.timestamp)
          }));
          // Only show history if available
          if (historyMessages.length > 0) {
            setMessages(prev => {
              const welcomeMsg = prev.find(m => m.id === 'welcome');
              // Append history after welcome
              return [welcomeMsg, ...historyMessages].filter(m => m);
            });
          }
      }
    } catch (err) {
      setError('Conversation history is unavailable right now.');
    }
  };

  const initializeAgent = async () => {
    try {
      setIsLoading(true);
      const result = await initAgent(currentPlan, agentModel);

      if (result && result.success) {
        // Add welcome message
        setMessages([
          {
            id: 'welcome',
            type: 'agent',
            text: 'Welcome to your Travel Planning Assistant! I can help you with:\n\n• **Analyze Costs** - Get a clear breakdown\n• **Compare Options** - Review better fits for time, comfort, or value\n• **Modify Plan** - Change destination, dates, or budget\n• **Generate Email** - Create a summary for your group\n\nWhat would you like to do?',
            timestamp: new Date()
          }
        ]);
        setError(null);
      } else {
        setError('Failed to initialize agent');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleSelectConversation = (convId) => {
    // This would load the specific conversation
    // For now, just set the active ID for UI
    setCurrentConversationId(convId);
    // In a full implementation, fetch and display that specific conversation
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || agentLoading || isSending || sendLockRef.current) return;

    const messageText = input.trim();
    sendLockRef.current = true;
    setIsSending(true);
    
    // Add user message
    const userMessage = {
      id: `msg-${Date.now()}`,
      type: 'user',
      text: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);

    // Add placeholder agent message for streaming
    const agentMessageId = `msg-${Date.now()}-agent`;
    const placeholderMessage = {
      id: agentMessageId,
      type: 'agent',
      text: '',
      toolsUsed: [],
      timestamp: new Date(),
      isStreaming: true
    };

    setMessages(prev => [...prev, placeholderMessage]);
    setShowThinking(true);
    setIsLoading(true);
    setLiveThoughts([]);
    setLiveSources([]);
    setLastMessageText(messageText);

    try {
      // Define onProgress callback to update message as stream arrives
      const onProgress = (data) => {
        if (data.type === 'message') {
          // Append streamed text
          setMessages(prev => {
            const updated = [...prev];
            const msgIdx = updated.findIndex(m => m.id === agentMessageId);
            if (msgIdx !== -1) {
              updated[msgIdx].text += (updated[msgIdx].text ? '\n\n' : '') + data.content;
            }
            return updated;
          });
        } else if (data.type === 'tool_start') {
          // Update live thoughts dynamically
          let friendly = `Running search...`;
          if (data.tool === 'searchPlaces') friendly = `Searching Google Maps & local directories for recommendations...`;
          else if (data.tool === 'olaMaps') friendly = `Querying Ola Maps routes and local transit details...`;
          else if (data.tool === 'openStreetMap') friendly = `Geocoding location and resolving coordinates internally...`;
          else if (data.tool === 'searchWeb') friendly = `Browsing web databases for live pricing & schedules...`;
          else if (data.tool === 'readUrl') friendly = `Reading official websites & tourist references...`;
          else if (data.tool === 'analyzeCosts') friendly = `Analyzing plan cost breakdowns...`;
          else if (data.tool === 'suggestAlternatives') friendly = `Comparing lodging and route alternatives...`;
          else if (data.tool === 'generateEmail') friendly = `Creating shareable summary for your travel group...`;

          setLiveThoughts(prev => {
            const updated = prev.map(t => ({ ...t, status: 'complete' }));
            return [...updated, { id: `${data.tool}-${Date.now()}`, tool: data.tool, text: friendly, status: 'searching', elapsedMs: data.elapsedMs || null }];
          });
        } else if (data.type === 'tool_result_chunk') {
          // No-op for pristine bubble
        } else if (data.type === 'tool_end') {
          // Complete thought
          setLiveThoughts(prev => prev.map(t => t.tool === data.tool ? { ...t, status: 'complete', elapsedMs: data.elapsedMs || t.elapsedMs } : t));
          
          // Stream dynamic citations immediately!
          if (data.citations && data.citations.length > 0) {
            setLiveSources(prev => {
              const next = [...prev];
              data.citations.forEach(cit => {
                const key = (cit.url || cit.link || '').toLowerCase();
                if (key && !next.some(s => (s.url || s.link || '').toLowerCase() === key)) {
                  next.push(cit);
                }
              });
              return next;
            });
          }
        } else if (data.type === 'tool_result') {
          // No-op for pristine bubble
        } else if (data.type === 'final') {
          // Final message received
          setShowThinking(false);
          setLiveThoughts(prev => prev.map(t => ({ ...t, status: 'complete' })));
          
          setMessages(prev => {
            const updated = [...prev];
            const msgIdx = updated.findIndex(m => m.id === agentMessageId);
            if (msgIdx !== -1) {
              updated[msgIdx].isStreaming = false;
              if (data.response?.message) {
                updated[msgIdx].text = data.response.message;
              }
              if (data.response?.toolsUsed) {
                updated[msgIdx].toolsUsed = data.response.toolsUsed;
              }
              if (data.response?.confidence) {
                updated[msgIdx].confidence = data.response.confidence;
              }
              if (data.response?.updatedPlan) {
                setPlan(data.response.updatedPlan);
              }
              
              const finalCitations = data.response?.citations || data.response?.sources || [];
              setLiveSources(prev => {
                const next = [...prev];
                finalCitations.forEach(cit => {
                  const key = (cit.url || cit.link || '').toLowerCase();
                  if (key && !next.some(s => (s.url || s.link || '').toLowerCase() === key)) {
                    next.push(cit);
                  }
                });
                return next;
              });
            }
            return updated;
          });
        } else if (data.type === 'error') {
          setShowThinking(false);
          setLiveThoughts(prev => prev.map(t => ({ ...t, status: 'complete' })));
          setMessages(prev => {
            const updated = [...prev];
            const msgIdx = updated.findIndex(m => m.id === agentMessageId);
            if (msgIdx !== -1) {
              updated[msgIdx].text += `\n\n**Error:** ${data.error?.message || data.error}`;
              updated[msgIdx].isStreaming = false;
            }
            return updated;
          });
        }
      };

      // Send message with progress callback
      const result = await sendMessage(messageText, onProgress);

      setShowThinking(false);

      if (result && result.error) {
        setMessages(prev => {
          const updated = [...prev];
          const msgIdx = updated.findIndex(m => m.id === agentMessageId);
          if (msgIdx !== -1) {
            updated[msgIdx].text = `Error: ${result.error}`;
            updated[msgIdx].isStreaming = false;
          }
          return updated;
        });
        setError(result.error);
      }
    } catch (err) {
      setShowThinking(false);
      setMessages(prev => {
        const updated = [...prev];
        const msgIdx = updated.findIndex(m => m.id === agentMessageId);
        if (msgIdx !== -1) {
          updated[msgIdx].text = `Connection error: ${err.message}`;
          updated[msgIdx].isStreaming = false;
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      setIsSending(false);
      sendLockRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const handleQuickAction = (action) => {
    const actionMessages = {
      analyze: 'Analyze the costs for this trip. Show me the complete breakdown including transportation, accommodation, activities, dining, and miscellaneous costs. Also calculate the per-person cost.',
      alternatives: 'Show me alternative options for this trip that improve value, comfort, or timing. Consider different routes, stays, and schedule choices.',
      email: 'Generate a professional email summary of this entire trip plan that I can send to my group members. Include all details, costs, and schedule.',
      summary: 'Give me a comprehensive summary of the current travel plan including destination, duration, accommodation, transport, and total cost.'
    };

    setInput(actionMessages[action]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };


  if (!currentPlan || !userId) {
    return (
      <div className="agent-page-loading">
        <div className="spinner"></div>
        <p>Loading agent...</p>
      </div>
    );
  }

  return (
    <div className="agent-page-with-sidebar">
      <ConversationSidebar
        userId={userId}
        onSelectConversation={handleSelectConversation}
        currentConversationId={currentConversationId}
        sources={latestSources}
      />
      <div className="agent-page">
        {/* Header */}
        <div className="agent-page-header">
          <div className="agent-page-header-content">
            <div className="agent-page-title">
              <h1>
                <Bot size={24} className="agent-page-header-icon" />
                Travel Planning Assistant
              </h1>
              <p className="agent-page-subtitle">
                {currentPlan?.toPlace || currentPlan?.destination} • {(currentPlan?.travelers || currentPlan?.groupSize || 1)} people
              </p>
            </div>
            <button
              className="agent-page-back-btn"
              onClick={handleGoBack}
              title="Go back to home"
              aria-label="Go back to home"
            >
              <ArrowLeft size={16} className="header-back-icon" />
              Back
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="agent-page-container">
          {/* Dynamic Sources read list */}
          {liveSources.length > 0 && (
            <motion.div className="agent-page-sources-area" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
              <div className="sources-header">
                <Compass size={13} className="sources-compass" />
                Sources searched and read ({liveSources.length})
              </div>
              <div className="sources-horizontal-scroll">
                {liveSources.map((src, idx) => {
                  let domain = 'google.com';
                  try {
                    if (src.url || src.link) {
                      domain = new URL(src.url || src.link).hostname.replace('www.', '');
                    }
                  } catch (e) {
                    domain = src.url || src.link || 'google.com';
                  }
                  return (
                    <motion.a
                      key={idx}
                      href={src.url || src.link || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="source-card-item"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <span className="source-card-badge">{idx + 1}</span>
                      <div className="source-card-details">
                        <span className="source-card-title">{src.title || src.name || 'Travel Source'}</span>
                        <span className="source-card-domain">{domain}</span>
                      </div>
                    </motion.a>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Messages Area */}
          <div className="agent-page-messages">
            {messages.length === 0 && (
              <motion.div className="agent-page-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                <div className="agent-page-empty-icon">
                  <Compass size={48} className="agent-page-empty-compass" />
                </div>
                <p>Start planning! Ask me anything about your trip.</p>
              </motion.div>
            )}

            {messages.map((message, idx) => (
              <motion.div
                key={message.id}
                className={`agent-page-message agent-page-message-${message.type}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                {message.type === 'user' && (
                  <div className="agent-page-message-user-content">{message.text}</div>
                )}

                {message.type === 'agent' && (
                  <div className="agent-page-message-agent-content">
                    {message.isStreaming && !message.text ? (
                      <div className="agent-page-thinking-indicator-wrapper">
                        <div className="agent-page-thinking-comet" />
                        <span className="agent-page-thinking-label">Thinking...</span>
                      </div>
                    ) : null}

                    {message.text ? (
                      <div className="agent-page-message-text markdown-content">
                        <ReactMarkdown components={markdownComponents}>{message.text}</ReactMarkdown>
                      </div>
                    ) : null}

                    {message.toolsUsed && message.toolsUsed.length > 0 && (
                      <div className="agent-page-tools-used">
                        <div className="agent-page-tools-header">Tools used:</div>
                        <div className="agent-page-tools-list">
                          {message.toolsUsed.map((tool, idx) => (
                            <span key={idx} className="agent-page-tool-badge">{typeof tool === 'string' ? tool : tool.tool}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {message.action && (
                      <div className="agent-page-action-info">
                        Action: <code>{message.action}</code>
                        {message.confidence && <span className="agent-page-confidence">{message.confidence}% confidence</span>}
                      </div>
                    )}
                  </div>
                )}

                {message.type === 'error' && (
                  <div className="agent-page-message-error-content">{message.text}</div>
                )}

                <div className="agent-page-message-time">{message.timestamp?.toLocaleTimeString()}</div>
              </motion.div>
            ))}

            {messages.length === 1 && (
              <motion.div className="agent-page-welcome-prompts fade-in" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <p className="prompts-kicker">SUGGESTED ACTIONS</p>
                <div className="prompts-grid">
                  <motion.button type="button" className="prompt-card-btn" onClick={() => handleQuickAction('analyze')} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                    <div className="prompt-card-icon"><IndianRupee size={16} /></div>
                    <div className="prompt-card-info">
                      <h4>Analyze cost split</h4>
                      <p>Show me the complete breakdown including per-person splits</p>
                    </div>
                  </motion.button>
                  <motion.button type="button" className="prompt-card-btn" onClick={() => handleQuickAction('alternatives')} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                    <div className="prompt-card-icon"><RefreshCw size={16} /></div>
                    <div className="prompt-card-info">
                      <h4>Suggest alternatives</h4>
                      <p>Compare lodging and routes for better value or timing</p>
                    </div>
                  </motion.button>
                  <motion.button type="button" className="prompt-card-btn" onClick={() => handleQuickAction('email')} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                    <div className="prompt-card-icon"><Mail size={16} /></div>
                    <div className="prompt-card-info">
                      <h4>Draft email summary</h4>
                      <p>Generate a professional summary for my travel group</p>
                    </div>
                  </motion.button>
                  <motion.button type="button" className="prompt-card-btn" onClick={() => handleQuickAction('summary')} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
                    <div className="prompt-card-icon"><ClipboardList size={16} /></div>
                    <div className="prompt-card-info">
                      <h4>Review plan highlights</h4>
                      <p>Check route dates, best seasons, and key attractions</p>
                    </div>
                  </motion.button>
                </div>
              </motion.div>
            )}

            {isLoading && liveThoughts.length > 0 && (
              <motion.div className="agent-page-live-thoughts-box" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                <div className="live-thoughts-header">
                  <Loader2 size={12} className="spinner live-thoughts-header-spinner" />
                  Tool Activity
                </div>
                <div className="live-thoughts-list">
                  {liveThoughts.map((thought, idx) => (
                    <div key={idx} className={`live-thought-item ${thought.status}`}>
                      <span className="live-thought-status-icon">
                        {thought.status === 'complete' ? <span className="live-thought-status-check">✓</span> : <Loader2 size={12} className="spinner live-thought-status-spinner" />}
                      </span>
                      <span className="live-thought-text">
                        {thought.text}
                        {thought.elapsedMs ? ` (${thought.elapsedMs}ms)` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="agent-page-input-area">
            {error && (
              <motion.div className="agent-page-error-banner" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <span>
                  <AlertCircle size={16} className="error-alert-icon" />
                  {error}
                </span>
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
                {lastMessageText && (
                  <button type="button" onClick={() => setInput(lastMessageText)}>Retry</button>
                )}
              </motion.div>
            )}

            {/* Quick Actions */}
            <div className="agent-page-quick-actions">
              <button
                type="button"
                className="agent-page-quick-action-btn"
                onClick={() => handleQuickAction('analyze')}
                disabled={isLoading || agentLoading || isSending}
                title="Analyze trip costs"
            >
              <IndianRupee size={14} className="quick-action-icon" />
              Analyze Costs
            </button>
            <button
              type="button"
              className="agent-page-quick-action-btn"
              onClick={() => handleQuickAction('alternatives')}
              disabled={isLoading || agentLoading || isSending}
              title="Get alternative options"
            >
              <RefreshCw size={14} className="quick-action-icon" />
              Alternatives
            </button>
            <button
              type="button"
              className="agent-page-quick-action-btn"
              onClick={() => handleQuickAction('email')}
              disabled={isLoading || agentLoading || isSending}
              title="Generate email summary"
            >
              <Mail size={14} className="quick-action-icon" />
              Email Summary
            </button>
            <button
              type="button"
              className="agent-page-quick-action-btn"
              onClick={() => handleQuickAction('summary')}
              disabled={isLoading || agentLoading || isSending}
              title="Get plan summary"
            >
              <ClipboardList size={14} className="quick-action-icon" />
              Summary
            </button>
          </div>

          {/* Message Input */}
          <div className="agent-page-input-box">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask me anything about your trip... (Shift+Enter for new line)"
              disabled={isLoading || agentLoading || isSending}
              className="agent-page-input-field"
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={isLoading || agentLoading || isSending || !input.trim()}
              className="agent-page-send-btn"
              title={(isLoading || agentLoading || isSending) ? 'Processing...' : 'Send message'}
              aria-label={(isLoading || agentLoading || isSending) ? 'Processing message' : 'Send message'}
            >
              {(isLoading || agentLoading || isSending) ? (
                <Loader2 size={18} className="spinner input-loader" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>

          <div className="agent-page-input-hint">
            <Lightbulb size={13} className="tip-icon" />
            Tip: Ask me to analyze costs, compare options, modify dates, or generate an email!
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AgentPage;
