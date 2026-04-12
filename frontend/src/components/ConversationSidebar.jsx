import React, { useState, useEffect } from 'react';
import '../styles/conversationSidebar.css';

const ConversationSidebar = ({ userId, onSelectConversation, currentConversationId }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedSidebar, setExpandedSidebar] = useState(true);

  useEffect(() => {
    if (userId) {
      loadConversations();
    }
  }, [userId]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/agent/conversation-history/${userId}?limit=100`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.history) {
          // Group messages by conversation (simple: group every N messages or by user intent)
          const grouped = groupConversations(data.history);
          setConversations(grouped);
        }
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const groupConversations = (messages) => {
    // Group by user messages (each user message starts a new conversation segment)
    const groups = [];
    let currentGroup = [];

    messages.forEach((msg, idx) => {
      currentGroup.push(msg);
      
      // Start new group after each user message OR at the end
      if (msg.sender === 'user' || idx === messages.length - 1) {
        if (currentGroup.length > 0) {
          const firstMessage = currentGroup.find(m => m.sender === 'user');
          groups.push({
            id: `conv-${idx}`,
            firstMessage: firstMessage?.message?.substring(0, 50) || 'Conversation',
            timestamp: firstMessage?.timestamp || msg.timestamp,
            messageCount: currentGroup.length
          });
          currentGroup = [];
        }
      }
    });

    return groups.reverse(); // Show newest first
  };

  const deleteConversation = async (convId, e) => {
    e.stopPropagation();
    // This would require a delete endpoint on backend - for now just remove from UI
    setConversations(prev => prev.filter(c => c.id !== convId));
  };

  const toggleSidebar = () => {
    setExpandedSidebar(!expandedSidebar);
  };

  if (!expandedSidebar) {
    return (
      <button type="button" className="sidebar-toggle-btn" onClick={toggleSidebar} title="Show conversations">
        ☰
      </button>
    );
  }

  return (
    <div className="conversation-sidebar">
      <div className="sidebar-header">
        <h3>💬 Conversations</h3>
        <button type="button" className="sidebar-toggle-btn" onClick={toggleSidebar} title="Hide sidebar">
          ✕
        </button>
      </div>

      {loading ? (
        <div className="sidebar-loading">Loading...</div>
      ) : conversations.length === 0 ? (
        <div className="sidebar-empty">
          <p>No conversations yet</p>
        </div>
      ) : (
        <div className="sidebar-conversations">
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
              onClick={() => onSelectConversation(conv.id)}
            >
              <div className="conversation-text">
                <p className="conversation-message">{conv.firstMessage}</p>
                <div className="conversation-meta">
                  <span className="conversation-time">
                    {new Date(conv.timestamp).toLocaleString()}
                  </span>
                  <span className="conversation-count">{conv.messageCount} msgs</span>
                </div>
              </div>
              <button
                type="button"
                className="conversation-delete"
                onClick={(e) => deleteConversation(conv.id, e)}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="sidebar-refresh-btn" onClick={loadConversations}>
        🔄 Refresh
      </button>
    </div>
  );
};

export default ConversationSidebar;
