import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Sparkles } from 'lucide-react';
import AgentPanelV2 from '../agent/AgentPanelV2';

export default function InternalToolsRail({ userId, currentPlan, onPlanUpdate, agentModel = 'gemma-cloud' }) {
  const navigate = useNavigate();

  const handleTalkToAgent = () => {
    navigate('/agent', {
      state: {
        currentPlan,
        userId,
        agentModel
      }
    });
  };

  return (
    <div className="dashboard-agent-section">
      <div className="dashboard-agent-intro">
        <h2 className="section-title-large" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Sparkles size={18} style={{ color: 'var(--primary-coral)' }} />
          AI Co-Pilot
        </h2>
        <p className="footer-subtext">
          Optimize your route, compare local transport rates, and adjust budgets instantly.
        </p>

        <div className="co-pilot-suggestions">
          <button 
            type="button" 
            className="suggestion-chip"
            onClick={handleTalkToAgent}
          >
            Optimize routes
          </button>
          <button 
            type="button" 
            className="suggestion-chip"
            onClick={handleTalkToAgent}
          >
            Find food spots
          </button>
          <button 
            type="button" 
            className="suggestion-chip"
            onClick={handleTalkToAgent}
          >
            Upgrade hotel
          </button>
        </div>

        <button
          onClick={handleTalkToAgent}
          className="btn btn-primary talk-to-agent-btn"
          style={{ width: '100%', marginTop: '16px', gap: '8px' }}
        >
          <MessageSquare size={16} />
          Talk to Agent
        </button>
      </div>

      <AgentPanelV2
        userId={userId}
        currentPlan={currentPlan}
        onPlanUpdate={onPlanUpdate}
        agentModel={agentModel}
      />
    </div>
  );
}