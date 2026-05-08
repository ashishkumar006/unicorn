import React from 'react';
import AgentPanelV2 from '../agent/AgentPanelV2';

export default function InternalToolsRail({ userId, currentPlan, onPlanUpdate, agentModel = 'gemma-cloud' }) {
  return (
    <div className="dashboard-agent-section">
      <div className="dashboard-agent-intro">
        <h2 className="section-title-large">Travel Assistant</h2>
        <p className="footer-subtext">
          Ask for plan edits, live research, and a clean explanation of the itinerary.
        </p>
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