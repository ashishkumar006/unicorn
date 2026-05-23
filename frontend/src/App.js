import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import './styles/designSystem.css';
import './styles/cinematicOverrides.css';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import AgentPage from './pages/AgentPage';
import InternalLabPage from './pages/InternalLabPage';
import { isInternalToolsEnabled, getInternalView } from './config/runtimeFlags';
import { apiFetch } from './lib/api';

const DESTINATION_FACTS = {
  goa: [
    {
      title: 'Two-trip feel in one place',
      detail: 'Goa often works well as a split itinerary because beach time, food stops, and nightlife are all close enough for short hops.'
    },
    {
      title: 'Budget stays can still feel polished',
      detail: 'A lot of Goa plans stretch further by pairing one comfortable stay with more flexible transport and food choices.'
    },
    {
      title: 'Timing changes the vibe fast',
      detail: 'Midweek trips usually feel calmer than weekend-heavy plans, especially for beach routes and dinner reservations.'
    }
  ],
  jaipur: [
    {
      title: 'Heritage and pacing matter',
      detail: 'Jaipur plans usually work best when sightseeing is grouped geographically so the day does not feel like a transport marathon.'
    },
    {
      title: 'One slow evening helps',
      detail: 'Leaving room for a relaxed dinner or market walk gives the trip a better rhythm than packing every hour.'
    },
    {
      title: 'Photo stops are easy wins',
      detail: 'A good Jaipur itinerary often mixes a few headline monuments with one lighter local experience to keep energy up.'
    }
  ],
  manali: [
    {
      title: 'Mountain plans reward buffer time',
      detail: 'Manali itineraries benefit from a little slack because weather, road timing, and viewpoint stops can shift quickly.'
    },
    {
      title: 'Stay location changes the experience',
      detail: 'Picking a stay that matches your pace matters a lot here because the difference between a quiet and lively base is noticeable.'
    },
    {
      title: 'Comfort beats overpacking',
      detail: 'Warm layers and compact packing usually improve the trip more than trying to bring too many extras.'
    }
  ],
  kerala: [
    {
      title: 'The best plans stay slow',
      detail: 'Kerala trips feel better when they leave room for scenic transit and one or two genuinely relaxed days.'
    },
    {
      title: 'Different regions feel distinct',
      detail: 'Coastal, backwater, and hill-station stops can feel like separate mini-trips, which makes sequencing important.'
    },
    {
      title: 'Food is part of the itinerary',
      detail: 'A strong Kerala plan usually treats meals as an experience, not just a break between activities.'
    }
  ],
  singapore: [
    {
      title: 'Compact city planning pays off',
      detail: 'Singapore trips can cover a lot without long transfers, so the plan benefits from precise day-by-day grouping.'
    },
    {
      title: 'Transport is part of the efficiency',
      detail: 'Well-chosen metro or rail routing usually saves more time here than trying to improvise on the day.'
    },
    {
      title: 'Mix indoor and outdoor stops',
      detail: 'A balanced plan often alternates high-energy sightseeing with a calmer indoor stop to keep the pace pleasant.'
    }
  ],
  dubai: [
    {
      title: 'Heat-aware scheduling helps',
      detail: 'Dubai plans usually feel smoother when the most outdoor-heavy activities are placed earlier or later in the day.'
    },
    {
      title: 'Views change the whole budget feel',
      detail: 'Choosing one standout skyline or waterfront experience can make a trip feel premium without changing the entire budget.'
    },
    {
      title: 'Transit can be strategic',
      detail: 'A good route usually balances planned sightseeing with one or two efficient transport days to keep the trip from feeling rushed.'
    }
  ]
};

const DEFAULT_LOADING_FACTS = (tripMeta = {}) => {
  const destination = tripMeta?.toPlace || 'this destination';

  return [
    {
      title: `Getting a feel for ${destination}`,
      detail: `${destination} plans usually work best when the itinerary is built around a few anchor experiences, leaving enough room for relaxed exploration.`
    },
    {
      title: 'Pacing matters more than packing',
      detail: 'The strongest trip plans balance one marquee activity with slower time in between so the trip feels memorable instead of rushed.'
    },
    {
      title: 'The local rhythm shapes the day',
      detail: 'A good destination plan follows the place itself - transport, weather, food stops, and walking distance all influence how the day should flow.'
    }
  ];
};

const buildLoadingFacts = (tripMeta = {}) => {
  const destinationKey = String(tripMeta?.toPlace || '').trim().toLowerCase();
  const mappedFacts = DESTINATION_FACTS[destinationKey];

  if (mappedFacts && mappedFacts.length > 0) {
    return mappedFacts;
  }

  return DEFAULT_LOADING_FACTS(tripMeta);
};

const formatBudget = (value) => `₹${Number(value || 0).toLocaleString()}`;

function LoadingScreen({ error, tripMeta = {} }) {
  const destinationName = tripMeta?.toPlace || 'your destination';
  const budgetValue = tripMeta?.budget || '10000';
  const sessionId = tripMeta?.sessionId;

  const [logs, setLogs] = useState([
    { agent: 'System Coordinator', text: 'Initializing multi-agent planning network...', status: 'searching' }
  ]);

  useEffect(() => {
    if (error) return undefined;
    if (!sessionId) return undefined;

    const fetchStatus = async () => {
      try {
        const data = await apiFetch(`/travel/status/${encodeURIComponent(sessionId)}`);
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      } catch (e) {
        setLogs((previousLogs) => previousLogs.length > 0
          ? previousLogs
          : [{ agent: 'System Coordinator', text: 'Still preparing your trip details...', status: 'searching' }]
        );
      }
    };

    fetchStatus();

    const timer = window.setInterval(fetchStatus, 800);
    return () => window.clearInterval(timer);
  }, [error, sessionId]);

  if (error) {
    return (
      <div className="loading-screen error-screen">
        <div className="loading-content">
          <div className="error-icon">
            <AlertCircle size={64} color="#EF4444" />
          </div>
          <p className="loading-text error-text">{error}</p>
          <p className="loading-subtext">Please check your input and try again.</p>
        </div>
      </div>
    );
  }

  const totalLogs = logs.length || 1;
  const completedLogs = logs.filter(l => l.status === 'complete').length;
  const progressValue = Math.min(100, Math.max(10, Math.round((completedLogs / totalLogs) * 100)));

  return (
    <div className="loading-screen">
      <div className="loading-content" style={{ width: 'min(90vw, 560px)' }}>
        <div className="loading-wordmark">Wanderlust</div>
        
        <div className="loading-ring-container">
          <svg className="loading-ring" viewBox="0 0 120 120">
            <circle className="loading-ring-track" cx="60" cy="60" r="52" strokeWidth="2" fill="none" />
            <circle 
              className="loading-ring-progress" 
              cx="60" cy="60" r="52" strokeWidth="3" fill="none"
              strokeDasharray="327" 
              strokeDashoffset={327 - (327 * progressValue / 100)}
            />
          </svg>
          <div className="loading-dots">
            {[0, 1, 2, 3].map((_, index) => (
              <span key={index} className={`loading-dot ${index * 25 <= progressValue ? 'active' : ''}`} />
            ))}
          </div>
        </div>

        {/* Perplexity-style dynamic multi-agent search stream */}
        <div className="loading-perplexity-log" style={{
          marginTop: '1rem',
          background: 'var(--perplexity-log-bg)',
          border: '1px solid var(--border-glass)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          width: '100%',
          maxHeight: '280px',
          overflowY: 'auto',
          textAlign: 'left',
          backdropFilter: 'var(--glass-blur)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h4 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
            Multi-Agent Intelligence Network (Live)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {logs.map((log, idx) => {
              const getHostname = (urlStr) => {
                try {
                  return new URL(urlStr).hostname.replace('www.', '') || 'source';
                } catch (e) {
                  return 'source';
                }
              };

              return (
                <div key={idx} className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', animation: 'fadeIn 0.3s ease-out both' }}>
                  <span style={{ minWidth: '130px', fontWeight: 800, color: log.agent === 'System Coordinator' ? 'var(--primary-coral)' : 'var(--secondary-teal)' }}>
                    [{log.agent}]
                  </span>
                  <span style={{ color: log.status === 'searching' ? 'var(--text-primary)' : log.status === 'complete' ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontWeight: log.status === 'searching' ? '600' : '400', flex: 1 }}>
                    {log.text.replace('{destination}', destinationName).replace('{budget}', formatBudget(budgetValue))}
                    {log.url && (
                      <a 
                        href={log.url} 
                        target="_blank" 
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          marginLeft: '8px',
                          padding: '2px 6px',
                          background: 'rgba(255, 107, 74, 0.12)',
                          border: '1px solid rgba(255, 107, 74, 0.25)',
                          borderRadius: '4px',
                          color: 'var(--primary-coral)',
                          fontSize: '10px',
                          fontWeight: '600',
                          textDecoration: 'none'
                        }}
                      >
                        <span>{getHostname(log.url)}</span>
                        <span>↗</span>
                      </a>
                    )}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {log.status === 'complete' && <span style={{ color: 'var(--success)', fontWeight: 800 }}>✓</span>}
                    {log.status === 'searching' && <Loader2 size={12} className="spinner" style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-coral)' }} />}
                    {log.status === 'pending' && <span style={{ color: 'var(--text-tertiary)', fontSize: '8px' }}>•</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="loading-stage-info" style={{ marginTop: '0.5rem' }}>
          <div className="loading-stage-title">
            {logs.find(l => l.status === 'searching')?.text.replace('{destination}', destinationName).replace('{budget}', formatBudget(budgetValue)) || 'Synthesizing plan details...'}
          </div>
          <div className="loading-stage-detail">Dynamic multi-agents are resolving hotel official links, transport schedules, and local coordinates in the background.</div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [isPlanning, setIsPlanning] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [tripData, setTripData] = useState(null);
  const [error, setError] = useState(null);
  const showInternalTools = isInternalToolsEnabled();
  const internalView = getInternalView();

  const handlePlanUpdate = (updatedPlan) => {
    if (!updatedPlan) {
      return;
    }

    setTripData((previousTripData) => {
      if (!previousTripData) {
        return previousTripData;
      }

      const summary = updatedPlan.summary || {};
      const preservedPlanMeta = previousTripData.planMeta || previousTripData.plan?.meta || null;
      const nextTripData = {
        ...previousTripData,
        plan: updatedPlan,
        planMeta: preservedPlanMeta,
      };

      if (summary.fromPlace) {
        nextTripData.fromPlace = summary.fromPlace;
      }

      if (summary.toPlace) {
        nextTripData.toPlace = summary.toPlace;
      }

      if (summary.travelers) {
        nextTripData.travelers = String(summary.travelers);
      }

      if (summary.totalBudget) {
        const normalizedBudget = String(summary.totalBudget).replace(/[^0-9]/g, '');
        if (normalizedBudget) {
          nextTripData.budget = normalizedBudget;
        }
      }

      if (updatedPlan.travelWindow?.startDate) {
        nextTripData.startDate = updatedPlan.travelWindow.startDate;
      } else if (updatedPlan.departureDate) {
        nextTripData.startDate = updatedPlan.departureDate;
      }

      if (updatedPlan.travelWindow?.endDate) {
        nextTripData.endDate = updatedPlan.travelWindow.endDate;
      } else if (updatedPlan.endDate) {
        nextTripData.endDate = updatedPlan.endDate;
      }

      return nextTripData;
    });
  };

  const handlePlanTrip = async (formData) => {
    setIsPlanning(true);
    setError(null);
    
    const sessionId = `trip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const formDataWithSession = { ...formData, sessionId };
    setTripData(formDataWithSession);

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
          days: days,
          startDate: formData.startDate,
          endDate: formData.endDate,
          travelers: formData.travelers,
          provider: 'auto',
          sessionId,
          userPreferences: formData.userPreferences
        })
      });

      setTripData({ ...formDataWithSession, plan: result.data, planMeta: result.meta || null });
      setHasResults(true);
    } catch (err) {
      console.error('Error calling travel plan API:', err);
      setError(err.message || 'An error occurred while generating your trip plan');
      setHasResults(false);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleBackToHome = () => {
    setHasResults(false);
    setTripData(null);
    setError(null);
  };

  if (showInternalTools && internalView === 'lab') {
    return <InternalLabPage />;
  }

  return (
    <div className="app-container">
      <Routes>
        <Route path="/" element={
          <>
            {isPlanning && <LoadingScreen error={error} tripMeta={tripData} />}
            
            {!isPlanning && !hasResults && (
              <LandingPage onPlanTrip={handlePlanTrip} />
            )}
            
            {!isPlanning && hasResults && (
              <DashboardPage
                tripData={tripData}
                onBackToHome={handleBackToHome}
                onPlanAnother={handleBackToHome}
                onPlanUpdate={handlePlanUpdate}
                showInternalTools={showInternalTools}
              />
            )}
          </>
        } />
        <Route path="/agent" element={<AgentPage />} />
      </Routes>
    </div>
  );
}

export default App;
