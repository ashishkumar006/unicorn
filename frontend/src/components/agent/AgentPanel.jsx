/**
 * AGENT PANEL COMPONENT
 * 
 * Appears on the right side after user generates a plan
 * Allows user to chat with agent to modify/analyze plan
 * Shows agent responses and plan modifications
 */

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './agentPanel.css';

export default function AgentPanel({ userId, currentPlan, onPlanUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAgent, setShowAgent] = useState(false);
  const [agentCapabilities, setAgentCapabilities] = useState(null);
  const messagesEndRef = useRef(null);

  const destinationLabel = currentPlan?.destination || currentPlan?.toPlace || 'your trip';
  const travelerLabel = currentPlan?.groupSize
    ? `${currentPlan.groupSize} travelers`
    : currentPlan?.travelers
      ? `${currentPlan.travelers} travelers`
      : 'Flexible group';
  const durationValue = currentPlan?.duration || currentPlan?.totalDays;
  const budgetValue = currentPlan?.budget;
  const planStats = [
    { label: 'Destination', value: destinationLabel },
    { label: 'Group', value: travelerLabel },
    {
      label: 'Budget',
      value: budgetValue ? `₹${Number(budgetValue).toLocaleString()}` : 'Budget flexible'
    },
    {
      label: 'Duration',
      value: durationValue ? `${durationValue} days` : 'Timeline flexible'
    }
  ];

  const getCapabilityItems = (value, fallback) => {
    if (Array.isArray(value)) {
      return value;
    }

    if (value) {
      return fallback;
    }

    return [];
  };

  const formatToolName = (tool) => {
    if (typeof tool === 'string') {
      return tool;
    }

    return tool?.tool || tool?.toolName || tool?.name || 'Tool';
  };

  // Initialize agent when plan is set
  useEffect(() => {
    if (!currentPlan) return;

    const initAgent = async () => {
      try {
        // Set the plan for agent
        const response = await fetch('http://localhost:5000/api/agent/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, plan: currentPlan })
        });

        const data = await response.json();

        if (data.success) {
          // Get agent capabilities
          const capsResponse = await fetch(
            `http://localhost:5000/api/agent/capabilities?userId=${userId}`
          );
          const capsData = await capsResponse.json();
          setAgentCapabilities(capsData.capabilities);

          // Add welcome message
          setMessages([{
            role: 'agent',
            content: `👋 Hi! I can help you refine **${destinationLabel}** with cleaner options, sharper costs, and a polished summary. Ask for a breakdown, a change, or a better alternative.`,
            timestamp: new Date()
          }]);

          setShowAgent(true);
        }
      } catch (error) {
        console.error('Error initializing agent:', error);
        setMessages([{
          role: 'agent',
          content: '❌ Error initializing agent. Please try again.',
          timestamp: new Date()
        }]);
        setShowAgent(true);
      }
    };

    initAgent();
  }, [currentPlan, userId]);

  // Auto-scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message to agent
  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message to UI
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);

    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, message: userMessage })
      });

      if (!response.body) {
        throw new Error('Streaming not supported');
      }

      // We read the chunked server-sent events stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      let finalMessageReceived = false;
      
      // Temporary message holding state while streaming
      let streamMessage = {
        role: 'agent',
        content: '',
        timestamp: new Date(),
        toolsUsed: [],
        analysis: null
      };
      
      // Add the initial empty message
      setMessages(prev => {
        const next = [...prev];
        next.push(streamMessage);
        return next;
      });

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Handle chunks that might contain multiple data lines or partial data
        const messages = chunk.split('\n');

        for (const rawMessage of messages) {
          const trimmed = rawMessage.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          
          try {
            const dataStr = trimmed.substring(6).trim();
            if (!dataStr) continue;
            
            const data = JSON.parse(dataStr);
            
            setMessages(prev => {
              const updated = [...prev];
              // Target the last message
              const lastIdx = updated.length - 1;
              const lastMsg = { ...updated[lastIdx] };
              
              if (data.type === 'message') {
                const prefix = lastMsg.content ? lastMsg.content + '\n\n' : '';
                lastMsg.content = prefix + data.content;
              } else if (data.type === 'tool_start') {
                lastMsg.content += `\n\n⏳ *Calling tool: \`${data.tool}\`...*`;
              } else if (data.type === 'tool_result_chunk') {
                lastMsg.content += `\n\n${data.content}`;
              } else if (data.type === 'tool_result') {
                lastMsg.content += `\n✓ *Completed \`${data.tool}\`*`;
              } else if (data.type === 'tool_end') {
                lastMsg.content += `\n\n✓ *Completed \`${data.tool}\`*`;
              } else if (data.type === 'final') {
                finalMessageReceived = true;
                if (data.response) {
                  lastMsg.content = data.response.message;
                  lastMsg.toolsUsed = data.response.toolsUsed;
                  lastMsg.analysis = data.response.analysis;
                  
                  if (data.response.updatedPlan && onPlanUpdate) {
                    onPlanUpdate(data.response.updatedPlan);
                  }
                }
              } else if (data.type === 'error') {
                lastMsg.content += `\n\n❌ **Error:** ${data.error}`;
              }
              
              updated[lastIdx] = lastMsg;
              return updated;
            });
            
          } catch (e) {
            console.error('Error parsing SSE data:', e, trimmed);
          }
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'agent',
        content: `❌ Connection error: ${error.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick action buttons
  const quickActions = [
    { label: 'Analyze Costs', message: 'Analyze the costs of my current plan and give me a clean breakdown.' },
    { label: 'Show Options', message: 'Suggest alternatives or better options for my current plan.' },
    { label: 'Generate Email', message: 'Generate an email to send to my group about the current plan.' },
    { label: 'Plan Summary', message: 'Show me a polished summary of my current plan.' }
  ];

  const capabilitySections = [
    {
      title: 'Modify Plan',
      items: getCapabilityItems(agentCapabilities?.canModifyPlan, [
        'Change destination, dates, group size, and budget',
        'Adjust the trip length when plans need to shift',
      ]),
    },
    {
      title: 'Analyze',
      items: getCapabilityItems(agentCapabilities?.canAnalyze, [
        'Break down costs by travel, stay, food, and activities',
        'Estimate the per-person impact of changes',
      ]),
    },
  ].filter((section) => section.items.length > 0);

  if (!showAgent) {
    return null;
  }

  return (
    <div className="agent-panel agent-panel-legacy">
      <div className="agent-panel-hero">
        <div className="agent-panel-copy">
          <span className="agent-panel-kicker">AI travel assistant</span>
          <h3>🤖 Travel Assistant</h3>
          <p className="agent-subtitle">Modify, compare, and refine your plan in a cleaner workspace.</p>
        </div>
        <div className="agent-panel-status">
          <span className="status-pill status-pill-primary">Gemma Cloud</span>
          <span className="status-pill status-pill-soft">
            {messages.length > 1 ? `${messages.length - 1} replies` : 'Ready to chat'}
          </span>
        </div>
      </div>

      <div className="agent-plan-summary">
        {planStats.map((stat) => (
          <div key={stat.label} className="summary-card">
            <div className="summary-label">{stat.label}</div>
            <div className="summary-value">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Messages Area */}
      <div className="agent-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗺️</div>
            <h4>Ready to refine the trip</h4>
            <p>Ask for a cost breakdown, a better route, or a polished summary.</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`message message-${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                {msg.role === 'agent' ? (
                  <div className="message-markdown">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="message-text">{msg.content}</div>
                )}

                {/* Show tools used */}
                {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <div className="tools-used">
                    <span className="tools-label">Tools used</span>
                    <div className="tools-row">
                      {msg.toolsUsed.map((tool, toolIdx) => (
                        <span key={toolIdx} className="tool-badge">{formatToolName(tool)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show analysis results */}
                {msg.analysis && (
                  <div className="analysis-result">
                    <pre>{JSON.stringify(msg.analysis, null, 2)}</pre>
                  </div>
                )}

                <span className="message-time">
                  {msg.timestamp?.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length <= 1 && (
        <div className="quick-actions">
          <p className="actions-label">Quick prompts</p>
          <div className="actions-grid">
            {quickActions.map((action, idx) => (
              <button
                key={idx}
                className="action-btn"
                onClick={() => {
                  setInput(action.message);
                  // Optionally auto-send
                  // handleSendMessage(action.message);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="agent-input-area">
        <div className="agent-input-shell">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask for a change, summary, or comparison..."
            disabled={isLoading}
            className="agent-input"
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="send-btn"
            type="button"
          >
            {isLoading ? '⏳' : '📤'}
          </button>
        </div>
        <p className="input-hint">Press Enter to send. Ask for a summary, cost check, or itinerary tweak.</p>
      </div>

      {/* Agent Capabilities */}
      {agentCapabilities && capabilitySections.length > 0 && (
        <div className="agent-info">
          <details>
            <summary>What I can do</summary>
            <div className="capabilities">
              {capabilitySections.map((section) => (
                <div key={section.title} className="capability-section">
                  <h4>{section.title}</h4>
                  <ul>
                    {section.items.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
