import React, { useState, useEffect } from 'react';
import { Menu, X, Trash2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import '../styles/conversationSidebar.css';

const ConversationSidebar = ({ userId, onSelectConversation, currentConversationId, sources = [] }) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedSidebar, setExpandedSidebar] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  useEffect(() => {
    if (userId) {
      loadConversations();
    }
  }, [userId]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/agent/conversation-history/${encodeURIComponent(userId)}?limit=100`);
      if (data.success && data.history) {
        // Group messages by conversation (simple: group every N messages or by user intent)
        const grouped = groupConversations(data.history);
        setConversations(grouped);
      }
    } catch (err) {
      setConversations([]);
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

  const toggleSidebar = () => {
    setExpandedSidebar(!expandedSidebar);
  };

  const confirmDeleteConversation = (convId, e) => {
    e.stopPropagation();
    setPendingDeleteId(convId);
    setShowDeleteConfirm(true);
  };

  const executeDelete = () => {
    if (pendingDeleteId) {
      setConversations(prev => prev.filter(c => c.id !== pendingDeleteId));
    }
    setShowDeleteConfirm(false);
    setPendingDeleteId(null);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPendingDeleteId(null);
  };

  const normalizedSources = Array.isArray(sources)
    ? sources
        .map((source, index) => {
          if (!source) {
            return null;
          }

          if (typeof source === 'string') {
            return {
              title: source,
              url: source,
              snippet: '',
              index: index + 1,
            };
          }

          return {
            title: source.title || source.name || source.label || `Source ${index + 1}`,
            url: source.url || source.link || source.href || '',
            snippet: source.snippet || source.summary || '',
            index: source.index || index + 1,
          };
        })
        .filter((source) => source && source.url)
    : [];

  if (!expandedSidebar) {
    return (
      <button type="button" className="sidebar-toggle-btn collapsed" onClick={toggleSidebar} title="Show conversations" aria-label="Show conversations">
        <Menu size={18} />
      </button>
    );
  }

  return (
    <div className="conversation-sidebar">
      <div className="sidebar-spine"></div>
      <div className="sidebar-header">
        <h3>Conversations</h3>
        <button type="button" className="sidebar-toggle-btn" onClick={toggleSidebar} title="Hide sidebar" aria-label="Hide conversations">
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-source-card">
        <div className="sidebar-source-header">
          <div>
            <div className="sidebar-source-kicker">Perplexity-style reading</div>
            <h4>Sources read</h4>
          </div>
          <span className="sidebar-source-count">{normalizedSources.length}</span>
        </div>

        {normalizedSources.length > 0 ? (
          <div className="sidebar-source-list">
            {normalizedSources.slice(0, 5).map((source, idx) => (
              <article key={`${source.url}-${idx}`} className="sidebar-source-item">
                <a className="sidebar-source-link" href={source.url} target="_blank" rel="noreferrer">
                  <span className="sidebar-source-index">{source.index || idx + 1}</span>
                  <span className="sidebar-source-title">{source.title}</span>
                </a>
                {source.snippet && <p className="sidebar-source-snippet">{source.snippet}</p>}
              </article>
            ))}
          </div>
        ) : (
          <p className="sidebar-source-empty">Ask the agent to search the web and the sources it reads will appear here.</p>
        )}
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
                onClick={(e) => confirmDeleteConversation(conv.id, e)}
                title="Delete"
                aria-label="Remove conversation from list"
              >
                <Trash2 size={14} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="sidebar-refresh-btn" onClick={loadConversations}>
        <RefreshCw size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'text-bottom' }} /> Refresh
      </button>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="sidebar-delete-confirm-overlay" onClick={cancelDelete}>
          <div className="sidebar-delete-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="delete-confirm-text">Remove this conversation?</p>
            <div className="delete-confirm-actions">
              <button type="button" className="delete-confirm-btn cancel" onClick={cancelDelete}>Cancel</button>
              <button type="button" className="delete-confirm-btn confirm" onClick={executeDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationSidebar;