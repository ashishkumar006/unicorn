import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import './styles/designSystem.css';
import './styles/cinematicOverrides.css';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import AgentPage from './pages/AgentPage';
import InternalLabPage from './pages/InternalLabPage';
import { isInternalToolsEnabled, getInternalView } from './config/runtimeFlags';
import { apiFetch } from './lib/api';
import { useGuestIdentity } from './hooks/useGuestIdentity';

const tripFacts = {
  goa: [
    { title: 'Goa works well as a relaxed trip with beaches, food stops, and short hops.', detail: 'Goa works best with a mix of beach time, food stops, and flexible timing.' },
    { title: 'Plan a calmer midweek trip', detail: 'Midweek trips usually feel calmer than weekend-heavy plans.' },
    { title: 'Use one comfortable base stay', detail: 'Pair one comfortable stay with flexible transport and food choices.' }
  ],
  jaipur: [
    { title: 'Group sightseeing geographically', detail: 'Jaipur plans work best when sightseeing is grouped geographically.' },
    { title: 'Leave room for a relaxed evening', detail: 'Leaving room for a relaxed dinner or market walk improves the trip rhythm.' },
    { title: 'Mix headline and local experiences', detail: 'Mix headline monuments with a lighter local experience.' }
  ],
  manali: [
    { title: 'Mountain plans reward buffer time', detail: 'Manali itineraries benefit from buffer time and flexibility.' },
    { title: 'Pick a stay that matches your pace', detail: 'Choose a stay that matches your pace for better comfort.' },
    { title: 'Pack warmly and compactly', detail: 'Warm layers and compact packing improve the trip.' }
  ],
  kerala: [
    { title: 'Keep the trip slow', detail: 'Kerala trips feel better when they stay slow and relaxed.' },
    { title: 'Coastal and backwater stops feel different', detail: 'Coastal, backwater, and hill-station stops feel distinct.' },
    { title: 'Treat meals as an experience', detail: 'A strong Kerala plan treats meals as an experience.' }
  ],
  singapore: [
    { title: 'Compact city planning pays off', detail: 'Singapore trips benefit from precise day-by-day grouping.' },
    { title: 'Metro or rail routing saves time', detail: 'Well-chosen metro or rail routing can save more time.' },
    { title: 'Alternate indoor and outdoor stops', detail: 'Balance indoor and outdoor stops to keep the trip pleasant.' }
  ],
  dubai: [
    { title: 'Heat-aware scheduling helps', detail: 'Dubai plans feel smoother when major outdoor activities are early or late.' },
    { title: 'One standout experience lifts the feel', detail: 'One standout skyline or waterfront experience can make a trip feel premium.' },
    { title: 'Mix planned sightseeing with transport days', detail: 'A good route balances planned sightseeing with efficient transport days.' }
  ]
};

const defaultFacts = (tripMeta = {}) => {
  const destination = tripMeta?.toPlace || 'this destination';
  return [
    { title: `Getting a feel for ${destination}`, detail: `${destination} plans work best when built around anchor experiences and relaxed time.` },
    { title: 'Pacing matters more than packing', detail: 'Strongest plans balance marquee activities with slower time in between.' },
    { title: 'The local rhythm shapes the day', detail: 'Transport, weather, food stops, and walking distance influence the day flow.' }
  ];
};

const buildFacts = (tripMeta = {}) => {
  const key = String(tripMeta?.toPlace || '').trim().toLowerCase();
  return tripFacts[key]?.length ? tripFacts[key] : defaultFacts(tripMeta);
};

const formatBudget = (value) => `?${Number(value || 0).toLocaleString()}`;

const AGENT_ICONS = {
  'System Coordinator': { initials: 'SC', color: '#FF6B46' },
  'AccommodationAgent': { initials: 'AA', color: '#45B7A0' },
  'TransitPlannerAgent': { initials: 'TP', color: '#6C8EEF' },
  'GastronomyAgent': { initials: 'GA', color: '#F5A142' },
  'PlacesAgent': { initials: 'PA', color: '#A78BFA' },
  'Browser': { initials: 'BR', color: '#94A3B8' },
  default: { initials: 'AI', color: '#CBD5E1' },
};

function getAgentIcon(agentName) {
  const key = Object.keys(AGENT_ICONS).find((k) => agentName?.includes(k)) || 'default';
  return AGENT_ICONS[key];
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function inferStage(logs = []) {
  const normalized = (logs || [])
    .map((log) => ({
      ...log,
      text: String(log.text || '').toLowerCase(),
      agent: String(log.agent || '').toLowerCase(),
    }))
    .filter((log) => log.text || log.agent);

  const hasRouter = normalized.some((log) => log.agent.includes('router') || log.text.includes('retrieval path') || log.text.includes('classified request'));
  const hasAccommodation = normalized.some((log) => log.agent.includes('accommodation') || log.text.includes('stay') || log.text.includes('hotel'));
  const hasTransit = normalized.some((log) => log.agent.includes('transit') || log.text.includes('transport') || log.text.includes('travel option'));
  const hasFood = normalized.some((log) => log.agent.includes('gastronomy') || log.text.includes('food') || log.text.includes('restaurant'));
  const hasPlaces = normalized.some((log) => log.agent.includes('places') || log.text.includes('attraction') || log.text.includes('sightseeing'));
  const hasSynthesizing = normalized.some((log) => log.text.includes('synthesiz') || log.text.includes('assembling') || log.text.includes('finaliz') || log.text.includes('polishing'));
  const hasSearching = normalized.some((log) => log.status === 'searching');
  const hasComplete = normalized.some((log) => log.status === 'complete');

  if (!hasSearching && hasComplete && hasSynthesizing) return 'finalizing';
  if (hasSynthesizing) return 'finalizing';
  if (hasAccommodation || hasTransit || hasFood || hasPlaces) return 'researching';
  if (hasRouter) return 'planning';
  if (hasSearching) return 'researching';
  if (hasComplete) return 'finalizing';
  return 'planning';
}

function getStageFromLogs(logs = []) {
  const normalized = (logs || [])
    .map((log) => ({
      ...log,
      text: String(log.text || '').toLowerCase(),
      agent: String(log.agent || '').toLowerCase(),
    }))
    .filter((log) => log.text || log.agent);

  const hasRouter = normalized.some((log) => log.agent.includes('router') || log.text.includes('retrieval path') || log.text.includes('classified request'));
  const hasAccommodation = normalized.some((log) => log.agent.includes('accommodation') || log.text.includes('stay') || log.text.includes('hotel'));
  const hasTransit = normalized.some((log) => log.agent.includes('transit') || log.text.includes('transport') || log.text.includes('travel option'));
  const hasFood = normalized.some((log) => log.agent.includes('gastronomy') || log.text.includes('food') || log.text.includes('restaurant'));
  const hasPlaces = normalized.some((log) => log.agent.includes('places') || log.text.includes('attraction') || log.text.includes('sightseeing'));
  const hasSynthesizing = normalized.some((log) => log.text.includes('synthesiz') || log.text.includes('assembling') || log.text.includes('finaliz') || log.text.includes('polishing'));
  const hasSearching = normalized.some((log) => log.status === 'searching');
  const hasComplete = normalized.some((log) => log.status === 'complete');

  if (!hasSearching && hasComplete && hasSynthesizing) return 'finalizing';
  if (hasSynthesizing) return 'finalizing';
  if (hasAccommodation || hasTransit || hasFood || hasPlaces) return 'researching';
  if (hasRouter) return 'planning';
  if (hasSearching) return 'researching';
  if (hasComplete) return 'finalizing';
  return 'planning';
}

function LoadingScreen({ error, tripMeta, onComplete }) {
  const destinationName = tripMeta?.toPlace || 'your destination';
  const budgetValue = tripMeta?.budget || '10000';
  const sessionId = tripMeta?.sessionId;
  const [logs, setLogs] = useState([]);
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [hasNotifiedComplete, setHasNotifiedComplete] = useState(false);

  useEffect(() => {
    if (error || !sessionId) return undefined;
    let cancelled = false;

    const fetchStatus = async () => {
      try {
        const data = await apiFetch(`/travel/status/${encodeURIComponent(sessionId)}`);
        if (data.success && Array.isArray(data.logs)) {
          setLogs((prev) => {
            const merged = [...prev];
            for (const log of data.logs) {
              const key = `${log.agent}:${log.text}`;
              const idx = merged.findIndex((existing) => `${existing.agent}:${existing.text}` === key);
              if (idx !== -1) {
                merged[idx] = { ...merged[idx], ...log };
              } else {
                merged.push(log);
              }
            }
            return merged;
          });
        }
      } catch {
        // keep previous logs on transient fetch failure
      }
    };

    fetchStatus();
    const pollTimer = window.setInterval(fetchStatus, 1000);
    const tickTimer = window.setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearInterval(tickTimer);
    };
  }, [error, sessionId, startTime]);

  const stage = getStageFromLogs(logs);
  const allComplete = logs.length > 0 && logs.every((log) => log.status === 'complete');
  const isFinalizing = stage === 'finalizing';

  useEffect(() => {
    if (isFinalizing && allComplete && !hasNotifiedComplete && typeof onComplete === 'function') {
      setHasNotifiedComplete(true);
      onComplete();
    }
  }, [isFinalizing, allComplete, hasNotifiedComplete, onComplete]);

  const progress = (() => {
    if (!logs.length) return 8;
    const completed = logs.filter((log) => log.status === 'complete').length;
    const ratio = completed / logs.length;
    if (stage === 'finalizing') return 92;
    return Math.min(85, Math.max(8, Math.round(ratio * 100)));
  })();

  const stageTitle = (() => {
    if (stage === 'finalizing') return 'Finalizing your itinerary...';
    const activeLog = logs.find((log) => log.status === 'searching');
    if (activeLog) return activeLog.text.replace('{destination}', destinationName).replace('{budget}', formatBudget(budgetValue));
    return 'Preparing your trip details...';
  })();

  const stageDetail = (() => {
    if (stage === 'finalizing') return 'Assembling day-by-day plan, hotels, transport, and local experiences.';
    if (stage === 'planning') return 'Structuring your trip from the research we just gathered.';
    return 'Dynamic multi-agents are resolving hotel official links, transport schedules, and local coordinates.';
  })();

  const journeySteps = [
    { key: 'researching', label: 'Researching' },
    { key: 'planning', label: 'Planning' },
    { key: 'finalizing', label: 'Finalizing' },
    { key: 'ready', label: 'Ready' },
  ];

  const stageIndex = journeySteps.findIndex((step) => step.key === stage);
  const normalizedStageIndex = stageIndex === -1 ? 0 : stageIndex;

  return (
    <div className="loading-screen">
      <div className="loading-content" style={{ width: 'min(94vw, 720px)' }}>
        <div className="loading-wordmark">
          <span className="loading-wordmark-text">Wanderlust</span>
          <span className="loading-wordmark-shimmer" aria-hidden="true" />
        </div>

        <div className="loading-journey-track">
          {journeySteps.map((step, idx) => {
            const isActive = idx === normalizedStageIndex;
            const isDone = idx < normalizedStageIndex;
            return (
              <React.Fragment key={step.key}>
                <div className={`loading-journey-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
                  <div className="loading-journey-pill">{step.label}</div>
                </div>
                {idx < journeySteps.length - 1 ? (
                  <div className={`loading-journey-connector ${idx < normalizedStageIndex ? 'filled' : ''}`}>
                    <div className="loading-journey-connector-fill" />
                  </div>
                ) : null}
              </React.Fragment>
            );
          })}
        </div>

        <div className="loading-main-grid">
          <div className="loading-ring-panel">
            <div className="loading-ring-container">
              <div className="loading-ring-glow" />
              <svg className="loading-ring" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="loadingGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--primary-coral)" />
                    <stop offset="100%" stopColor="var(--accent-amber)" />
                  </linearGradient>
                </defs>
                <circle className="loading-ring-track" cx="60" cy="60" r="52" strokeWidth="2" fill="none" />
                <circle className="loading-ring-progress" cx="60" cy="60" r="52" strokeWidth="3" fill="none" strokeDasharray="327" strokeDashoffset={327 - (327 * progress / 100)} />
              </svg>
              <div className="loading-progress-text">{Math.round(progress)}%</div>
            </div>
            <div className="loading-elapsed">{formatElapsed(elapsed)}</div>
          </div>

          <div className="loading-status-card">
            <div className="loading-status-header">
              <div className="loading-status-title">Multi-Agent Intelligence Network (Live)</div>
              <div className="loading-elapsed">{formatElapsed(elapsed)}</div>
            </div>
            <div className="loading-status-body">
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Initializing agents…</div>
              ) : (
                logs.map((log, idx) => {
                  const icon = getAgentIcon(log.agent);
                  const isSearching = log.status === 'searching';
                  const isComplete = log.status === 'complete';
                  const isPending = log.status === 'pending';

                  return (
                    <div
                      key={`${log.agent}-${idx}-${log.text}`}
                      className={`loading-agent-status-row ${isSearching ? 'loading-agent-status-row--active' : ''}`}
                      style={{
                        animationDelay: `${idx * 40}ms`,
                      }}
                    >
                      <span
                        className="loading-agent-icon"
                        style={{
                          background: isComplete ? 'rgba(69, 183, 160, 0.14)' : isSearching ? 'rgba(255, 107, 74, 0.14)' : 'rgba(148, 163, 184, 0.12)',
                          color: icon.color,
                        }}
                      >
                        {icon.initials}
                      </span>
                      <span className="loading-agent-name">{log.agent}</span>
                      <span style={{ color: isSearching ? 'var(--text-primary)' : isComplete ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontWeight: isSearching ? '600' : '400', flex: 1, fontSize: '12px' }}>
                        {log.text.replace('{destination}', destinationName).replace('{budget}', formatBudget(budgetValue))}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px' }}>
                        {isComplete && <span style={{ color: 'var(--success)', fontWeight: 800 }}>✓</span>}
                        {isSearching && <Loader2 size={14} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-coral)' }} />}
                        {isPending && <span style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>○</span>}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {error ? (
          <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '16px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={20} style={{ color: '#f87171' }} />
              <span style={{ color: '#fecdd3', fontWeight: 700 }}>Planning could not finish</span>
            </div>
            <p style={{ color: '#fecdd3', marginTop: '8px' }}>{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(248,113,113,0.45)',
                background: 'rgba(248,113,113,0.18)',
                color: '#fecdd3',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <RotateCcw size={14} /> Retry
            </button>
          </div>
        ) : (
          <div className="loading-stage-info" style={{ marginTop: '1rem' }}>
            <div className="loading-stage-title">{stageTitle}</div>
            <div className="loading-stage-detail">{stageDetail}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  const [tripData, setTripData] = useState(null);
  const [tripState, setTripState] = useState('idle');
  const [planError, setPlanError] = useState(null);
  const identity = useGuestIdentity();
  const showInternalTools = isInternalToolsEnabled();
  const internalView = getInternalView();

  const handlePlanUpdate = useCallback((updatedPlan) => {
    if (!updatedPlan || !tripData) return;
    const summary = updatedPlan.summary || {};
    const preservedMeta = tripData.planMeta || updatedPlan.meta || tripData.plan?.meta || null;
    setTripData((prev) => {
      if (!prev) return prev;
      const next = { ...prev, plan: updatedPlan, planMeta: preservedMeta };
      if (summary.fromPlace) next.fromPlace = summary.fromPlace;
      if (summary.toPlace) next.toPlace = summary.toPlace;
      if (summary.travelers) next.travelers = String(summary.travelers);
      if (summary.totalBudget) {
        const normalized = String(summary.totalBudget).replace(/[^0-9]/g, '');
        if (normalized) next.budget = normalized;
      }
      if (updatedPlan.travelWindow?.startDate) next.startDate = updatedPlan.travelWindow.startDate;
      else if (updatedPlan.departureDate) next.startDate = updatedPlan.departureDate;
      if (updatedPlan.travelWindow?.endDate) next.endDate = updatedPlan.travelWindow.endDate;
      else if (updatedPlan.endDate) next.endDate = updatedPlan.endDate;
      return next;
    });
  }, [tripData]);

  const handlePlanTrip = useCallback(async (formData) => {
    setTripState('planning');
    setPlanError(null);
    const sessionId = `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = { ...formData, sessionId, userId: identity.userId, planStartedAt: Date.now() };
    setTripData(payload);

    try {
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      const result = await apiFetch('/travel/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPlace: formData.fromPlace,
          toPlace: formData.toPlace,
          budget: formData.budget,
          luxuryType: 'semi',
          days,
          startDate: formData.startDate,
          endDate: formData.endDate,
          travelers: formData.travelers,
          provider: 'auto',
          sessionId,
          userPreferences: formData.userPreferences
        })
      });

      setTripData({ ...payload, plan: result.data, planMeta: result.meta || null, planStartedAt: payload.planStartedAt });
      // Stay in planning state; LoadingScreen will call onComplete when backend finishes
    } catch (error) {
      console.error('Trip planning failed:', error);
      setPlanError(error.message || 'Something went wrong while planning your trip.');
      setTripState('error');
    }
  }, [identity.userId]);

  const handleLoadingComplete = useCallback(() => {
    setTripState('results');
  }, []);

  const handleBackToHome = useCallback(() => {
    setTripState('idle');
    setTripData(null);
    setPlanError(null);
  }, []);

  const handleOpenAgent = useCallback((currentPlan) => {
    setTripState('agent');
    setTripData((prev) => ({ ...prev, agentPlan: currentPlan || prev?.plan || null }));
  }, []);

  const handleAgentReturn = useCallback(() => {
    setTripState('results');
  }, []);

  if (showInternalTools && internalView === 'lab') {
    return <InternalLabPage />;
  }

  return (
    <div className="app-container">
      <Routes>
        <Route
          path="/"
          element={
            <>
              {(tripState === 'planning' || tripState === 'error' || tripState === 'finalizing') && <LoadingScreen error={planError} tripMeta={tripData} onComplete={handleLoadingComplete} />}
              {tripState === 'idle' && <LandingPage onPlanTrip={handlePlanTrip} />}
              {tripState === 'results' && (
                <DashboardPage
                  tripData={tripData}
                  onBackToHome={handleBackToHome}
                  onPlanAnother={handleBackToHome}
                  onPlanUpdate={handlePlanUpdate}
                  onOpenAgent={handleOpenAgent}
                  showInternalTools={showInternalTools}
                />
              )}
            </>
          }
        />
        <Route path="/agent" element={<AgentPage onReturn={handleAgentReturn} />} />
      </Routes>
    </div>
  );
}

export default App;
