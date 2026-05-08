import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import useAgent from '../hooks/useAgent';
import ConversationSidebar from '../components/ConversationSidebar';
import '../styles/agentPage.css';

const markdownComponents = {
  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
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
    setLatestSources(Array.isArray(currentPlan?.meta?.citations)
      ? currentPlan.meta.citations
      : Array.isArray(currentPlan?.meta?.sources)
        ? currentPlan.meta.sources
        : []);
  }, [currentPlan]);

  const loadConversationHistory = async () => {
    try {
      console.log('[AgentPage] Loading conversation history for userId:', userId);
      const response = await fetch(`http://localhost:5000/api/agent/conversation-history/${userId}?limit=50`);
      const data = await response.json();
      console.log('[AgentPage] Conversation history response:', data);
      
      if (response.ok) {
        if (data.success && data.history && data.history.length > 0) {
          console.log('[AgentPage] Found', data.history.length, 'messages in history');
          // Convert history to message format (exclude welcome message from here)
          const historyMessages = data.history.map((msg, idx) => ({
            id: `history-${idx}`,
            type: msg.sender === 'user' ? 'user' : 'agent',
            text: msg.message,
            timestamp: new Date(msg.timestamp)
          }));
          // Only show history if available
          if (historyMessages.length > 0) {
            console.log('[AgentPage] Adding', historyMessages.length, 'messages to display');
            setMessages(prev => {
              const welcomeMsg = prev.find(m => m.id === 'welcome');
              // Append history after welcome
              const result = [welcomeMsg, ...historyMessages].filter(m => m);
              console.log('[AgentPage] Total messages after loading:', result.length);
              return result;
            });
          }
        } else {
          console.log('[AgentPage] No history found in database');
        }
      }
    } catch (err) {
      console.error('[AgentPage] Error loading conversation history:', err);
    }
  };

  const initializeAgent = async () => {
    try {
      console.log('[AgentPage] Initializing agent for userId:', userId);
      setIsLoading(true);
      const result = await initAgent(currentPlan, agentModel);

      if (result && result.success) {
        console.log('[AgentPage] Agent initialized successfully');
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
        console.error('[AgentPage] Agent initialization failed');
        setError('Failed to initialize agent');
      }
    } catch (err) {
      console.error('[AgentPage] Error initializing agent:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectConversation = (convId) => {
    // This would load the specific conversation
    // For now, just set the active ID for UI
    setCurrentConversationId(convId);
    // In a full implementation, fetch and display that specific conversation
    console.log('Loading conversation:', convId);
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
          // Show tool being called
          setMessages(prev => {
            const updated = [...prev];
            const msgIdx = updated.findIndex(m => m.id === agentMessageId);
            if (msgIdx !== -1) {
              updated[msgIdx].text += `\n\n⏳ *Calling tool: \`${data.tool}\`...*`;
            }
            return updated;
          });
        } else if (data.type === 'tool_result_chunk') {
          // Stream tool result chunks progressively
          setMessages(prev => {
            const updated = [...prev];
            const msgIdx = updated.findIndex(m => m.id === agentMessageId);
            if (msgIdx !== -1) {
              // Add chunk with proper formatting
              updated[msgIdx].text += `\n${data.content}`;
            }
            return updated;
          });
        } else if (data.type === 'tool_result') {
          // Show tool result (for backward compatibility)
          setMessages(prev => {
            const updated = [...prev];
            const msgIdx = updated.findIndex(m => m.id === agentMessageId);
            if (msgIdx !== -1) {
              updated[msgIdx].text += `\n✓ *Completed \`${data.tool}\`*`;
            }
            return updated;
          });
        } else if (data.type === 'final') {
          // Final message received
          setShowThinking(false);
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
              setLatestSources(Array.isArray(data.response?.citations)
                ? data.response.citations
                : Array.isArray(data.response?.sources)
                  ? data.response.sources
                  : []);
            }
            return updated;
          });
        } else if (data.type === 'error') {
          setShowThinking(false);
          setMessages(prev => {
            const updated = [...prev];
            const msgIdx = updated.findIndex(m => m.id === agentMessageId);
            if (msgIdx !== -1) {
              updated[msgIdx].text += `\n\n❌ **Error:** ${data.error}`;
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
            updated[msgIdx].text = `❌ Error: ${result.error}`;
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
          updated[msgIdx].text = `❌ Connection error: ${err.message}`;
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

  const handleGoBack = () => {
    if (window.confirm('Are you sure? Your chat history will be lost.')) {
      navigate('/');
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
            <h1>🤖 Travel Planning Assistant</h1>
            <p className="agent-page-subtitle">
              {currentPlan?.destination} • {currentPlan?.groupSize} people
            </p>
          </div>
          <button 
            className="agent-page-back-btn"
            onClick={handleGoBack}
            title="Go back to home"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="agent-page-container">
        {/* Messages Area */}
        <div className="agent-page-messages">
          {messages.length === 0 && (
            <div className="agent-page-empty">
              <div className="agent-page-empty-icon">🗺️</div>
              <p>Start planning! Ask me anything about your trip.</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`agent-page-message agent-page-message-${message.type}`}
            >
              {message.type === 'user' && (
                <div className="agent-page-message-user-content">
                  {message.text}
                </div>
              )}

              {message.type === 'agent' && (
                <div className="agent-page-message-agent-content">
                  {message.isStreaming && !message.text ? (
                    <div className="agent-page-thinking-indicator">
                      <span className="agent-page-thinking-dot"></span>
                      <span className="agent-page-thinking-dot"></span>
                      <span className="agent-page-thinking-dot"></span>
                    </div>
                  ) : null}
                  
                  {message.text ? (
                    <div className="agent-page-message-text markdown-content">
                      <ReactMarkdown components={markdownComponents}>{message.text}</ReactMarkdown>
                    </div>
                  ) : null}

                  {message.toolsUsed && message.toolsUsed.length > 0 && (
                    <div className="agent-page-tools-used">
                      <div className="agent-page-tools-header">
                        🔧 Tools used:
                      </div>
                      <div className="agent-page-tools-list">
                        {message.toolsUsed.map((tool, idx) => (
                          <span key={idx} className="agent-page-tool-badge">
                            {typeof tool === 'string' ? tool : tool.tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.action && (
                    <div className="agent-page-action-info">
                      Action: <code>{message.action}</code>
                      {message.confidence && (
                        <span className="agent-page-confidence">
                          {message.confidence}% confidence
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {message.type === 'error' && (
                <div className="agent-page-message-error-content">
                  {message.text}
                </div>
              )}

              <div className="agent-page-message-time">
                {message.timestamp?.toLocaleTimeString()}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="agent-page-input-area">
          {error && (
            <div className="agent-page-error-banner">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
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
              💰 Analyze Costs
            </button>
            <button
              type="button"
              className="agent-page-quick-action-btn"
              onClick={() => handleQuickAction('alternatives')}
              disabled={isLoading || agentLoading || isSending}
              title="Get alternative options"
            >
              🔄 Alternatives
            </button>
            <button
              type="button"
              className="agent-page-quick-action-btn"
              onClick={() => handleQuickAction('email')}
              disabled={isLoading || agentLoading || isSending}
              title="Generate email summary"
            >
              📧 Email Summary
            </button>
            <button
              type="button"
              className="agent-page-quick-action-btn"
              onClick={() => handleQuickAction('summary')}
              disabled={isLoading || agentLoading || isSending}
              title="Get plan summary"
            >
              📋 Summary
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
            >
              {(isLoading || agentLoading || isSending) ? '⏳' : '📤'}
            </button>
          </div>

          <div className="agent-page-input-hint">
            💡 Tip: Ask me to analyze costs, compare options, modify dates, or generate an email!
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default AgentPage;
