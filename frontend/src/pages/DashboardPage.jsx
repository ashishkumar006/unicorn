import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Calendar,
  Copy,
  RefreshCw,
  Users,
  IndianRupee,
  Sparkles,
  MapPin,
  TrendingUp,
  TrainFront,
  Hotel,
  Loader2,
  Star,
  MapPinIcon,
  Clock,
  Utensils,
  BookOpen,
  ExternalLink,
  X,
  Bot
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import InternalToolsRail from '../components/internal/InternalToolsRail';
import '../styles/designSystem.css';

const BUDGET_SPLITS = [
  { name: 'Travel', percentage: 30, color: '#DE6B48' },
  { name: 'Accommodation', percentage: 35, color: '#45B7A0' },
  { name: 'Food', percentage: 20, color: '#F0B342' },
  { name: 'Activities', percentage: 15, color: '#2A3C4B' },
];

const tabContentVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: { duration: 0.2 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: 'easeOut' }
  })
};

const buildBudgetData = (budgetAmount) => BUDGET_SPLITS.map((item) => ({
  ...item,
  value: Math.max(1, Math.round((budgetAmount * item.percentage) / 100)),
}));

const formatBudget = (value) => `₹${Number(value || 0).toLocaleString()}`;

const getBudgetSectionValue = (section, fallback = 0) => {
  if (section == null) {
    return fallback;
  }

  if (typeof section === 'number') {
    return Number.isFinite(section) ? section : fallback;
  }

  if (typeof section === 'string') {
    const parsed = Number(section);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  if (typeof section === 'object') {
    const rawValue = section.value ?? section.amount ?? section.total ?? section.budget ?? section.allocated;
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const getTimelineIcon = (activityText) => {
  const text = String(activityText || '').toLowerCase();
  if (text.includes('eat') || text.includes('food') || text.includes('lunch') || text.includes('dinner') || text.includes('restaurant') || text.includes('breakfast') || text.includes('cafe') || text.includes('dining') || text.includes('gastronomy') || text.includes('snack') || text.includes('tea') || text.includes('coffee') || text.includes('meal')) {
    return <Utensils size={13} />;
  }
  if (text.includes('hotel') || text.includes('stay') || text.includes('resort') || text.includes('inn') || text.includes('checkin') || text.includes('check-in') || text.includes('accommodation') || text.includes('hostel') || text.includes('lodge') || text.includes('room')) {
    return <Hotel size={13} />;
  }
  if (text.includes('train') || text.includes('bus') || text.includes('flight') || text.includes('taxi') || text.includes('drive') || text.includes('transit') || text.includes('travel') || text.includes('cab') || text.includes('airport') || text.includes('station') || text.includes('car') || text.includes('transport') || text.includes('road')) {
    return <TrainFront size={13} />;
  }
  if (text.includes('beach') || text.includes('visit') || text.includes('explore') || text.includes('sightseeing') || text.includes('fort') || text.includes('temple') || text.includes('museum') || text.includes('park') || text.includes('palace') || text.includes('monument') || text.includes('view') || text.includes('sunset') || text.includes('market') || text.includes('sight') || text.includes('walk') || text.includes('scenic')) {
    return <MapPinIcon size={13} />;
  }
  return <Sparkles size={13} />;
};

const getOptionImage = (name, type = 'hotel') => {
  const text = String(name || '').toLowerCase();
  
  if (type === 'travel' || text.includes('flight') || text.includes('air') || text.includes('fly')) {
    return 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('train') || text.includes('rail') || text.includes('express') || text.includes('scenic')) {
    return 'https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('car') || text.includes('cab') || text.includes('road') || text.includes('bus') || text.includes('transfer')) {
    return 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80';
  }

  if (type === 'food' || text.includes('dine') || text.includes('restaurant') || text.includes('cafe') || text.includes('kitchen') || text.includes('table') || text.includes('flavour') || text.includes('eat')) {
    if (text.includes('coastal') || text.includes('beach') || text.includes('sea') || text.includes('sunset')) {
      return 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80';
    }
    if (text.includes('cafe') || text.includes('coffee') || text.includes('bakery')) {
      return 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80';
    }
    return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80';
  }

  if (text.includes('resort') || text.includes('beach') || text.includes('holiday') || text.includes('villa') || text.includes('village')) {
    return 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=600&q=80';
  }
  if (text.includes('boutique') || text.includes('heritage') || text.includes('palace') || text.includes('stay') || text.includes('taj')) {
    return 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=80';
};

export default function DashboardPage({
  tripData,
  onBackToHome,
  onPlanAnother,
  onPlanUpdate,
}) {
  const [activeTab, setActiveTab] = useState('Itinerary');
  const [tabData, setTabData] = useState({});
  const [loadingTab, setLoadingTab] = useState(null);
  const [notice, setNotice] = useState('');
  const [showResearchDrawer, setShowResearchDrawer] = useState(false);
  const [activeResearchTab, setActiveResearchTab] = useState('accommodation');
  const [showCoPilot, setShowCoPilot] = useState(false);
  const [showPlanAnotherConfirm, setShowPlanAnotherConfirm] = useState(false);
  const [selectedTravelIdx, setSelectedTravelIdx] = useState(0);
  const [selectedHotelIdx, setSelectedHotelIdx] = useState(0);
  const [selectedFoodIdx, setSelectedFoodIdx] = useState(0);
  const actionTimerRef = useRef(null);
  const tabs = ['Itinerary', 'Travel', 'Hotels', 'Places', 'Food'];

  const plan = tripData?.plan || {};
  const planMeta = tripData?.planMeta || plan.meta || null;
  const budgetAllocation = planMeta?.budgetAllocation || null;
  const routeInsights = planMeta?.routeInsights || null;
  const googlePlacesMeta = planMeta?.googlePlaces || null;
  const olaPlacesMeta = planMeta?.olaPlaces || null;
  const hasGooglePlacesMeta = Boolean(googlePlacesMeta?.enabled);
  const hasOlaPlacesMeta = Boolean(olaPlacesMeta?.enabled);
  const referenceProviderLabel = planMeta?.referenceProvider === 'ola'
    ? 'Ola Maps'
    : planMeta?.referenceProvider === 'google'
      ? 'Google Places'
      : null;
  const activeReferenceProviderLabel = hasOlaPlacesMeta
    ? 'Ola Maps'
    : hasGooglePlacesMeta
      ? 'Google Places'
      : referenceProviderLabel;
  const itinerary = plan.itinerary || [];
  const startDate = tripData?.startDate || '2026-03-31';
  const endDate = tripData?.endDate || '2026-04-04';
  const fromPlace = tripData?.fromPlace || 'Mumbai';
  const toPlace = tripData?.toPlace || 'Goa';
  const openStreetMapMeta = planMeta?.openStreetMap || null;
  const openStreetMapLabel = openStreetMapMeta?.displayName || toPlace;
  const openStreetMapSearchUrl = openStreetMapMeta?.searchUrl || `https://www.openstreetmap.org/search?query=${encodeURIComponent(toPlace)}`;
  const openStreetMapMapUrl = openStreetMapMeta?.mapUrl || openStreetMapSearchUrl;
  const openStreetMapEmbedUrl = openStreetMapMeta?.embedUrl || '';
  const budget = tripData?.budget || '10000';
  const budgetAmount = Number.parseInt(budget, 10) || 10000;
  const travelersCount = parseInt(tripData?.travelers) || 2;
  const travelersText = travelersCount === 1 ? '1 Person' : `${travelersCount} People`;
  const tripDays = plan.totalDays || itinerary.length || 7;
  const selectedTravel = tabData.Travel?.options?.[selectedTravelIdx] || null;
  const selectedHotel = tabData.Hotels?.options?.[selectedHotelIdx] || null;
  const selectedFood = tabData.Food?.restaurants?.[selectedFoodIdx] || null;

  const getBudgetValue = (key, fallbackPct) => {
    if (key === 'accommodation') {
      return selectedHotel ? (selectedHotel.pricePerNight || selectedHotel.price || 0) * Math.max(1, tripDays - 1) : Math.max(1, Math.round((budgetAmount * fallbackPct) / 100));
    }
    if (key === 'transportation') {
      return selectedTravel ? (selectedTravel.price || 0) : Math.max(1, Math.round((budgetAmount * fallbackPct) / 100));
    }
    if (key === 'food') {
      return selectedFood ? (selectedFood.avgCost || 0) * Math.max(1, tripDays) : Math.max(1, Math.round((budgetAmount * fallbackPct) / 100));
    }
    if (budgetAllocation && budgetAllocation[key]) {
      return getBudgetSectionValue(budgetAllocation[key]);
    }
    return Math.max(1, Math.round((budgetAmount * fallbackPct) / 100));
  };

  const rawBudgetData = [
    { name: 'Accommodation', value: getBudgetValue('accommodation', 35), color: '#45B7A0' },
    { name: 'Travel', value: getBudgetValue('transportation', 25), color: '#DE6B48' },
    { name: 'Food', value: getBudgetValue('food', 20), color: '#F0B342' },
    { name: 'Local Transport', value: getBudgetValue('localTransport', 8), color: '#2A3C4B' },
    { name: 'Activities', value: getBudgetValue('activities', 12), color: '#A78BFA' },
  ];

  const totalSpent = rawBudgetData.reduce((sum, item) => sum + item.value, 0);
  const bufferValue = getBudgetValue('miscellaneous', 0) || Math.max(0, budgetAmount - totalSpent);
  
  if (bufferValue > 0) {
    rawBudgetData.push({ name: 'Buffer', value: bufferValue, color: '#64748B' });
  }

  const finalTotal = totalSpent + bufferValue;
  const budgetData = rawBudgetData.map(item => ({
    ...item,
    percentage: Math.max(1, Math.round((item.value / (finalTotal || 1)) * 100))
  }));
  const planningHighlights = plan.highlights || [];
  const agentUserId = tripData?.sessionId || `${fromPlace}-${toPlace}-${startDate}`;

  const detailTabs = ['Travel', 'Hotels', 'Places', 'Food'];

  const flashNotice = (message) => {
    setNotice(message);

    if (actionTimerRef.current) {
      window.clearTimeout(actionTimerRef.current);
    }

    actionTimerRef.current = window.setTimeout(() => {
      setNotice('');
    }, 2500);
  };

  const openTab = (tabName) => {
    setActiveTab(tabName);
    flashNotice(`${tabName} opened`);
  };

  const copyTripSummary = async () => {
    const summaryLines = [
      `${fromPlace} to ${toPlace}`,
      `${startDate} to ${endDate} | ${tripDays} days | ${travelersText}`,
      `Budget: ${formatBudget(budgetAmount)}`,
      `Travel: ${selectedTravel?.name || 'TBD'}`,
      `Stay: ${selectedHotel?.name || 'TBD'}`,
      `Highlights: ${(planningHighlights.slice(0, 3).join(' | ')) || 'Curated trip plan'}`,
    ];

    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      flashNotice('Trip summary copied to clipboard');
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      flashNotice('Trip summary is ready in the page');
    }
  };

  const handleAgentPlanUpdate = (updatedPlan) => {
    if (updatedPlan && onPlanUpdate) {
      onPlanUpdate(updatedPlan);
    }

    flashNotice('Travel assistant updated the plan');
               toast.success('Plan updated successfully', { position: 'top-center' });
   };

  // Load tab data when the active tab changes
  useEffect(() => {
    if (activeTab !== 'Itinerary' && !tabData[activeTab] && loadingTab !== activeTab) {
      fetchTabData(activeTab);
    }
  }, [activeTab]);

  useEffect(() => () => {
    if (actionTimerRef.current) {
      window.clearTimeout(actionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    setTabData({});

    detailTabs.forEach((tabType) => {
      fetchTabData(tabType, { silent: true });
    });
    // Prefetching removes the first-click loading flash for detail tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromPlace, toPlace, budget, startDate, endDate, travelersCount, tripDays]);

  const fetchTabData = async (tabType, options = {}) => {
    const { silent = false } = options;

    if (!silent) {
      setLoadingTab(tabType);
    }

    try {
      const response = await fetch('/api/travel/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPlace,
          toPlace,
          tabType: tabType.toLowerCase(),
          budget,
          luxuryType: 'semi',
          days: tripDays,
          startDate,
          endDate,
          travelers: travelersCount,
          provider: 'auto'
        })
      });

      if (response.ok) {
        const result = await response.json();
        setTabData(prev => ({ ...prev, [tabType]: result.data }));
      }
    } catch (error) {
      console.error('Error fetching tab data:', error);
    } finally {
      if (!silent) {
        setLoadingTab(null);
      }
    }
  };

  return (
    <div className="page-wrapper dashboard page-shell">
      {/* Top Navbar */}
      <div className="dash-nav">
        <button className="back-link" onClick={onBackToHome}>
          <ArrowLeft size={16} />
          Back to planner
        </button>
        <div className="brand-header nav-brand">
          <Sparkles className="brand-icon" size={20} />
          <span className="brand-name">Wanderlust</span>
        </div>
      </div>

      {/* Hero Section with Watercolor Background */}
      <div className="dash-hero-container">
        <div className="watercolor-bg"></div>
        <div className="dash-hero">
          <p className="dash-hero-label">
            <MapPin size={12} /> YOUR ITINERARY
          </p>
          <h1 className="dash-hero-title">
            {fromPlace} <span className="arrow">→</span> {toPlace}
          </h1>
          
          <div className="dash-hero-meta">
            <span className="meta-item"><Calendar size={14} /> {startDate} to {endDate}</span>
            <span className="meta-item"><Users size={14} /> {travelersText}</span>
            <span className="meta-item"><IndianRupee size={14} /> Budget {formatBudget(budgetAmount)}</span>
          </div>

          <div className="hero-actions">
            <button type="button" className="btn btn-secondary hero-action" onClick={copyTripSummary}>
              <Copy size={14} /> Copy summary
            </button>
            <button type="button" className="btn btn-secondary hero-action" onClick={() => openTab('Hotels')}>
              <Hotel size={14} /> View hotels
            </button>
            <button type="button" className="btn btn-secondary hero-action" onClick={() => openTab('Food')}>
              <Utensils size={14} /> View food
            </button>
            <button
              type="button"
              className="btn btn-secondary hero-action"
              onClick={() => (activeTab !== 'Itinerary' ? fetchTabData(activeTab) : flashNotice('The itinerary is already loaded'))}
            >
              <RefreshCw size={14} /> Refresh tab
            </button>
          </div>

          {notice && <div className="action-banner">{notice}</div>}
        </div>
      </div>

      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          {/* Budget Breakdown Chart */}
          <div className="content-section budget-section">
        <h2 className="section-title">
          <TrendingUp size={16} /> Budget Breakdown
        </h2>
        
        <div className="budget-flex">
          <div className="chart-container">
            <ResponsiveContainer width={240} height={240}>
              <PieChart>
                <Pie
                  data={budgetData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  stroke="none"
                  dataKey="value"
                >
                  {budgetData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="legend-container">
            {budgetData.map((item, idx) => (
              <div key={idx} className="legend-item" style={{ animationDelay: `${idx * 100}ms` }}>
                <div className="legend-marker-box">
                  <div className="legend-color-box" style={{ backgroundColor: item.color }} />
                  <span className="legend-label">{item.name}</span>
                </div>
                <span className="legend-value">₹{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
          </div>

          {planMeta && (
            <div className="content-section plan-intelligence-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="section-title" style={{ margin: 0 }}>
                  <Sparkles size={16} /> Plan Intelligence
                </h2>
                {planMeta?.researchArtifacts && (
                  <button
                    onClick={() => setShowResearchDrawer(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      background: 'rgba(255, 107, 74, 0.15)',
                      border: '1px solid rgba(255, 107, 74, 0.3)',
                      borderRadius: '8px',
                      color: 'var(--primary-coral)',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    className="research-drawer-btn hover-glow"
                  >
                    <BookOpen size={13} />
                    View Subagent Research Reports
                  </button>
                )}
              </div>

              <div className="plan-intelligence-grid">
                <div className="plan-intelligence-card">
                  <h3>Budget split</h3>
                  {budgetAllocation ? (
                    <div className="plan-intelligence-chip-row">
                      <span className="plan-intelligence-chip">Travel ₹{getBudgetSectionValue(budgetAllocation.transportation, budgetData[0]?.value || 0).toLocaleString()}</span>
                      <span className="plan-intelligence-chip">Stay ₹{getBudgetSectionValue(budgetAllocation.accommodation, budgetData[1]?.value || 0).toLocaleString()}</span>
                      <span className="plan-intelligence-chip">Food ₹{getBudgetSectionValue(budgetAllocation.food, budgetData[2]?.value || 0).toLocaleString()}</span>
                      <span className="plan-intelligence-chip">Local transport ₹{getBudgetSectionValue(budgetAllocation.localTransport, Math.round(budgetAmount * 0.08)).toLocaleString()}</span>
                      <span className="plan-intelligence-chip">Activities ₹{getBudgetSectionValue(budgetAllocation.activities, budgetData[3]?.value || 0).toLocaleString()}</span>
                      <span className="plan-intelligence-chip">Buffer ₹{getBudgetSectionValue(budgetAllocation.miscellaneous, Math.max(0, budgetAmount - (budgetData[0].value + budgetData[1].value + budgetData[2].value + budgetData[3].value))).toLocaleString()}</span>
                    </div>
                  ) : (
                    <p className="plan-intelligence-muted">Budget allocation not available.</p>
                  )}
                </div>

                <div className="plan-intelligence-card">
                  <h3>Real-time Places</h3>
                  {hasOlaPlacesMeta ? (
                    <>
                      <p className="plan-intelligence-summary">
                        {olaPlacesMeta.enabled
                          ? `Ola Maps returned ${olaPlacesMeta.restaurants || 0} restaurants and ${olaPlacesMeta.attractions || 0} attractions.`
                          : 'Ola Maps was not used for this plan.'}
                      </p>
                      {activeReferenceProviderLabel && (
                        <p className="plan-intelligence-muted">Primary source: {activeReferenceProviderLabel}</p>
                      )}
                      {googlePlacesMeta?.enabled && googlePlacesMeta.summary && (
                        <p className="plan-intelligence-muted">
                          Google enrichment: {googlePlacesMeta.restaurants || 0} restaurants and {googlePlacesMeta.attractions || 0} attractions.
                        </p>
                      )}
                      {olaPlacesMeta.summary && (
                        <p className="plan-intelligence-muted">{olaPlacesMeta.summary}</p>
                      )}
                    </>
                  ) : hasGooglePlacesMeta ? (
                    <>
                      <p className="plan-intelligence-summary">
                        {googlePlacesMeta.enabled
                          ? `Google Places returned ${googlePlacesMeta.restaurants || 0} restaurants and ${googlePlacesMeta.attractions || 0} attractions.`
                          : 'Google Places was not used for this plan.'}
                      </p>
                      {activeReferenceProviderLabel && (
                        <p className="plan-intelligence-muted">Primary source: {activeReferenceProviderLabel}</p>
                      )}
                      {googlePlacesMeta.summary && (
                        <p className="plan-intelligence-muted">{googlePlacesMeta.summary}</p>
                      )}
                    </>
                  ) : (
                    <p className="plan-intelligence-muted">No Places metadata available.</p>
                  )}
                </div>

                <div className="plan-intelligence-card">
                  <h3>Route & transport</h3>
                  {routeInsights?.enabled ? (
                    <>
                      <p className="plan-intelligence-summary">{routeInsights.summary}</p>
                      <div className="plan-intelligence-chip-row">
                        <span className="plan-intelligence-chip">Stay base {routeInsights.hotel?.name || selectedHotel?.name || 'Base'}</span>
                        <span className="plan-intelligence-chip">Bus ₹{routeInsights.localTransport?.bus?.toLocaleString?.() || '0'}</span>
                        <span className="plan-intelligence-chip">Auto ₹{routeInsights.localTransport?.auto?.toLocaleString?.() || '0'}</span>
                        <span className="plan-intelligence-chip">Taxi ₹{routeInsights.localTransport?.taxi?.toLocaleString?.() || '0'}</span>
                      </div>
                      {routeInsights.nearbyRestaurants?.[0] && (
                        <p className="plan-intelligence-muted">
                          Nearest restaurant: {routeInsights.nearbyRestaurants[0].name} at {routeInsights.nearbyRestaurants[0].distanceLabel}
                        </p>
                      )}
                      {routeInsights.nearbyAttractions?.[0] && (
                        <p className="plan-intelligence-muted">
                          Nearest attraction: {routeInsights.nearbyAttractions[0].name} at {routeInsights.nearbyAttractions[0].distanceLabel}
                        </p>
                      )}
                      {routeInsights.hotel?.mapUrl && (
                        <a
                          className="openstreetmap-link"
                          href={routeInsights.hotel.mapUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open stay-area map <ExternalLink size={14} />
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="plan-intelligence-muted">Distance insights will appear once the stay and place coordinates are available.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {openStreetMapEmbedUrl || openStreetMapMapUrl ? (
            <div className="content-section openstreetmap-section">
              <div className="openstreetmap-header">
                <h2 className="section-title">
                  <MapPin size={16} /> OpenStreetMap Preview
                </h2>
                {openStreetMapMapUrl ? (
                  <a
                    className="openstreetmap-link"
                    href={openStreetMapMapUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in OpenStreetMap <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>

              <div className="openstreetmap-card">
                {openStreetMapEmbedUrl ? (
                  <iframe
                    className="openstreetmap-frame"
                    title={`OpenStreetMap preview for ${openStreetMapLabel}`}
                    src={openStreetMapEmbedUrl}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : null}

                {(openStreetMapMeta?.lat != null && openStreetMapMeta?.lon != null) || openStreetMapMeta?.summary ? (
                  <div className="openstreetmap-meta">
                    {openStreetMapMeta?.displayName && (
                      <span className="openstreetmap-pill">{openStreetMapMeta.displayName}</span>
                    )}
                    {openStreetMapMeta?.lat != null && openStreetMapMeta?.lon != null && (
                      <span className="openstreetmap-coordinates">
                        {Number(openStreetMapMeta.lat).toFixed(4)}, {Number(openStreetMapMeta.lon).toFixed(4)}
                      </span>
                    )}
                    {openStreetMapMeta?.summary && (
                      <span className="openstreetmap-summary">{openStreetMapMeta.summary}</span>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Trip Summary Block */}
          <div className="content-section summary-block">
        <h2 className="section-title-large">Trip Summary</h2>
        
        <div className="summary-list">
          <div className="summary-item">
            <div className="summary-label">DURATION</div>
            <div className="summary-value">{tripDays} Days</div>
            <div className="summary-subtext">{startDate} to {endDate}</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-label">
              <TrainFront size={14} className="summary-icon"/> SELECTED TRAVEL
            </div>
            <div className="summary-value">{selectedTravel?.name || 'Select travel option'}</div>
            <div className="summary-subtext">{selectedTravel ? `${formatBudget(selectedTravel.price)} · ${selectedTravel.duration}` : 'Waiting for options'}</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-label">
              <Hotel size={14} className="summary-icon"/> SELECTED HOTEL
            </div>
            <div className="summary-value">{selectedHotel?.name || 'Select accommodation'}</div>
            <div className="summary-subtext">{selectedHotel ? `${formatBudget(selectedHotel.pricePerNight)}/night · ⭐ ${selectedHotel.rating}` : 'Waiting for options'}</div>
          </div>

          <div className="summary-item">
            <div className="summary-label">
              <BookOpen size={14} className="summary-icon"/> BEST TIME
            </div>
            <div className="summary-value">{plan.bestTime || 'Year-round beach escape'}</div>
            <div className="summary-subtext">{plan.estimatedBudget || formatBudget(budgetAmount)}</div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="tabs-bar">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => openTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
          </div>

{/* Tab Content */}
            <div className="tab-content-container">
              <AnimatePresence mode="wait">
                {/* Itinerary Tab */}
               {activeTab === 'Itinerary' && (
                 <motion.div 
                   className="tab-content fade-in"
                   variants={tabContentVariants}
                   initial="hidden"
                   animate="visible"
                   exit="exit"
                   key="itinerary"
                 >
                   <motion.div 
                     className="itinerary-grid"
                     initial="hidden"
                     animate="visible"
                     variants={{
                       visible: {
                         transition: { staggerChildren: 0.1 }
                       }
                     }}
                   >
              {(itinerary.length > 0 ? itinerary : [{ day: 1, date: startDate, title: `${fromPlace} to ${toPlace} - Arrival`, activities: [] }]).map((day) => (
<motion.article 
                   key={day.day}
                   className="day-card"
                   variants={cardVariants}
                   custom={day.day}
                   whileHover={{ y: -2 }}
                 >
                   <div className="day-header">
                     <div className="day-circle">{day.day}</div>
                     <div className="day-title-group">
                       <h3>Day {day.day}</h3>
                       {day.date && <span className="day-date">{day.date}</span>}
                     </div>
                   </div>

                   <h4 className="day-theme">{day.title}</h4>

<div>
                       {(day.activities || []).map((activity, index) => (
                         <motion.div 
                           key={`${day.day}-${index}`} 
                           className="timeline-item"
                           initial={{ opacity: 0, x: -10 }}
                           animate={{ opacity: 1, x: 0 }}
                           transition={{ delay: index * 0.05 }}
                         >
                           <div className="timeline-icon-wrapper">
                             {getTimelineIcon(activity.activity)}
                           </div>
                           <div className="timeline-content">
                             <span className="timeline-time">{activity.time}</span>
                             <span className="timeline-desc">{activity.activity}</span>
                            {activity.link && (
                              <div style={{ marginTop: '6px' }}>
                                <a
                                  className="card-link-badge"
                                  href={activity.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open <ExternalLink size={12} />
                                </a>
                              </div>
                            )}
                           </div>
                         </motion.div>
                       ))}
                     </div>
                   </motion.article>
                                ))}
                          </motion.div>
                        </motion.div>
                      )}

                        {/* Travel Tab */}
                 {activeTab === 'Travel' && (
                  <motion.div 
                className="tab-content fade-in"
                variants={tabContentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                key="travel"
              >
                {loadingTab === 'Travel' ? (
                  <div className="loading-spinner">
                    <Loader2 size={32} className="spinner" />
                    <p>Finding best transport options...</p>
                  </div>
                ) : tabData['Travel']?.options ? (
                  <div className="options-grid">
                    {tabData['Travel'].options.map((option, idx) => (
                      <motion.div 
                        key={idx} 
                        className={`option-card travel-card ${selectedTravelIdx === idx ? 'card-selected-coral' : idx === 0 ? 'card-preferred-gold' : ''}`}
                        onClick={() => setSelectedTravelIdx(idx)}
                        style={{ cursor: 'pointer' }}
                        variants={cardVariants}
                        custom={idx}
                        whileHover={{ y: -3 }}
                      >
                    <div className="option-card-image-box">
                      <img 
                        src={option.image || option.photoUrl || getOptionImage(option.name, 'travel')} 
                        alt={option.name} 
                        className="option-card-image" 
                        loading="lazy" 
                      />
                    </div>
                    <div className="option-header">
                      <div className="card-title-group">
                        <h3>{option.name}</h3>
                        {option.link && (
                          <a 
                            className="card-link-badge" 
                            href={option.link} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <span className="option-price">₹{option.price}</span>
                    </div>
                    <div className="option-meta">
                      <span className="badge">{option.type}</span>
                      <span className="rating">
                        <Star size={14} className="star-filled" /> {option.rating}
                      </span>
                    </div>
                      <div className="highlights">
                        {option.highlights?.map((h, i) => (
                          <span key={i} className="highlight-tag">{h}</span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="no-data">No transport options available</div>
              )}
            </motion.div>
          )}

          {/* Hotels Tab */}
          {activeTab === 'Hotels' && (
                  <motion.div 
                    className="tab-content fade-in"
                    variants={tabContentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    key="hotels"
                  >
{loadingTab === 'Hotels' ? (
                 <div className="loading-spinner">
                   <Loader2 size={32} className="spinner" />
                   <p>Finding best hotels...</p>
                 </div>
               ) : tabData['Hotels']?.options ? (
                 <div className="options-grid">
                   {tabData['Hotels'].options.map((hotel, idx) => (
                     <motion.div 
                       key={idx} 
                       className={`option-card hotel-card ${selectedHotelIdx === idx ? 'card-selected-coral' : idx === 0 ? 'card-preferred-gold' : ''}`}
                       onClick={() => setSelectedHotelIdx(idx)}
                       style={{ cursor: 'pointer' }}
                       variants={cardVariants}
                       custom={idx}
                       whileHover={{ y: -3 }}
                     >
                    <div className="option-card-image-box">
                      <img 
                        src={hotel.image || hotel.photoUrl || getOptionImage(hotel.name, 'hotel')} 
                        alt={hotel.name} 
                        className="option-card-image" 
                        loading="lazy" 
                      />
                    </div>
                    <div className="option-header">
                      <div className="card-title-group">
                        <h3>{hotel.name}</h3>
                        {hotel.link && (
                          <a 
                            className="card-link-badge" 
                            href={hotel.link} 
                            target="_blank" 
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Open <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <span className="rating">
                        <Star size={14} className="star-filled" /> {hotel.rating}
                      </span>
                    </div>
                    <p className="location"><MapPinIcon size={12} /> {hotel.location}</p>
                    <div className="amenities-list">
                      {hotel.amenities?.slice(0, 3).map((amenity, i) => (
                        <span key={i} className="amenity-badge">{amenity}</span>
                      ))}
                    </div>
                    <p className="description">{hotel.highlights?.[0]}</p>
                    <div className="price-section">
                       <span className="price-label">₹{hotel.pricePerNight}/night</span>
                       <span className="highlight-tag">Best Value</span>
                     </div>
                   </motion.div>
                 ))}
               </div>
             ) : (
               <div className="no-data">No hotels available</div>
             )}
           </motion.div>
         )}

         {/* Places Tab */}
         {activeTab === 'Places' && (
                 <motion.div 
                   className="tab-content fade-in"
                   variants={tabContentVariants}
                   initial="hidden"
                   animate="visible"
                   exit="exit"
                   key="places"
                 >
            {loadingTab === 'Places' ? (
              <div className="loading-spinner">
                <Loader2 size={32} className="spinner" />
                <p>Loading attractions...</p>
              </div>
            ) : tabData['Places']?.categories ? (
              <div className="places-container">
                {tabData['Places'].categories.map((category, cidx) => (
                  <div key={cidx} className="places-category" style={{ animationDelay: `${cidx * 100}ms` }}>
                    <h3 className="category-title">{category.name}</h3>
                    <div className="places-grid">
                      {category.places?.map((place, pidx) => (
                        <div key={pidx} className="place-card" style={{ animationDelay: `${pidx * 50}ms` }}>
                          <div className="place-header">
                            <div className="card-title-group">
                              <h4>{place.name}</h4>
                              {place.link && (
                                <a className="card-link-badge" href={place.link} target="_blank" rel="noreferrer">
                                  Open <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            <span className="place-type">{place.type}</span>
                          </div>
                          <p className="place-desc">{place.description}</p>
                          <div className="place-info">
                            <span><Clock size={12} /> {place.timeRequired}</span>
                            <span><IndianRupee size={12} /> {place.entryFee}</span>
                          </div>
                          <div className="place-rating">
                            <Star size={13} className="star-filled" /> {place.rating}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No places available</div>
            )}
          </motion.div>
        )}

{/* Food Tab */}
               {activeTab === 'Food' && (
                 <motion.div 
                   className="tab-content fade-in"
                   variants={tabContentVariants}
                   initial="hidden"
                   animate="visible"
                   exit="exit"
                   key="food"
                 >
            {loadingTab === 'Food' ? (
              <div className="loading-spinner">
                <Loader2 size={32} className="spinner" />
                <p>Finding great food spots...</p>
              </div>
            ) : tabData['Food']?.restaurants ? (
              <div className="food-container">
                <div className="restaurants-grid">
                  {tabData['Food'].restaurants.map((restaurant, idx) => (
                    <div 
                      key={idx} 
                      className={`restaurant-card ${selectedFoodIdx === idx ? 'card-selected-coral' : idx === 0 ? 'card-preferred-gold' : ''}`}
                      onClick={() => setSelectedFoodIdx(idx)}
                      style={{ animationDelay: `${idx * 100}ms`, cursor: 'pointer' }}
                    >
                      <div className="option-card-image-box">
                        <img 
                          src={restaurant.image || restaurant.photoUrl || getOptionImage(restaurant.name, 'food')} 
                          alt={restaurant.name} 
                          className="option-card-image" 
                          loading="lazy" 
                        />
                      </div>
                      <div className="restaurant-header">
                        <div className="card-title-group">
                          <h3>{restaurant.name}</h3>
                          {restaurant.link && (
                            <a 
                              className="card-link-badge" 
                              href={restaurant.link} 
                              target="_blank" 
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Open <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                        <span className="rating">
                          <Star size={14} className="star-filled" /> {restaurant.rating}
                        </span>
                      </div>
                      <p className="cuisine"><Utensils size={12} /> {restaurant.cuisine}</p>
                      <p className="location"><MapPinIcon size={12} /> {restaurant.area}</p>
                      <div className="specialties">
                        {restaurant.specialties?.slice(0, 2).map((spec, i) => (
                          <span key={i} className="spec-tag">{spec}</span>
                        ))}
                      </div>
                      <div className="restaurant-footer">
                        <span className="vibe-badge">{restaurant.vibe}</span>
                        <span className="price">₹{restaurant.avgCost}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {tabData['Food'].localSpecialties && (
                  <div className="specialties-section">
                    <h3>Local Specialties</h3>
                    <div className="specialties-list">
                      {tabData['Food'].localSpecialties.map((specialty, idx) => (
                        <div key={idx} className="specialty-item" style={{ animationDelay: `${idx * 100}ms` }}>
                          <div className="specialty-title">
                            {specialty.mustTry && <span className="must-try">Must Try</span>}
                            <div className="card-title-group">
                              <h4>{specialty.name}</h4>
                              {specialty.link && (
                                <a className="card-link-badge" href={specialty.link} target="_blank" rel="noreferrer">
                                  Open <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          </div>
                          <p>{specialty.description}</p>
                          <p className="where"><MapPinIcon size={12} /> {specialty.whereToFind}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
) : (
                 <div className="no-data">No restaurants available</div>
               )}
               </motion.div>
             )}
             </AnimatePresence>
           </div>
         </div>

        {/* Floating Co-Pilot FAB & Drawer Widget */}
        <div className="floating-co-pilot-widget">
          {/* FAB Button */}
          <button 
            className="co-pilot-fab"
            onClick={() => setShowCoPilot(!showCoPilot)}
            title="Ask Travel Assistant"
          >
            <Bot size={24} />
            <span className="fab-pulse"></span>
          </button>

          {/* Co-Pilot Drawer */}
          {showCoPilot && (
            <div className="co-pilot-drawer-card">
              <div className="co-pilot-drawer-header">
                <div className="co-pilot-header-title">
                  <Bot size={20} className="co-pilot-icon" />
                  <h3>Wanderlust Co-Pilot</h3>
                </div>
                <button 
                  className="co-pilot-drawer-close"
                  onClick={() => setShowCoPilot(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="co-pilot-drawer-body">
                <InternalToolsRail
                  userId={agentUserId}
                  currentPlan={plan}
                  onPlanUpdate={handleAgentPlanUpdate}
                  agentModel="gemma-cloud"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plan Another Confirmation Dialog */}
      {showPlanAnotherConfirm && (
        <div className="plan-another-confirm-overlay" onClick={() => setShowPlanAnotherConfirm(false)}>
          <div className="plan-another-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="delete-confirm-text">Start a new trip plan?</p>
            <p className="delete-confirm-subtext">This will reset your current trip data.</p>
            <div className="delete-confirm-actions">
              <button type="button" className="delete-confirm-btn cancel" onClick={() => setShowPlanAnotherConfirm(false)}>Cancel</button>
              <button type="button" className="delete-confirm-btn confirm" onClick={() => { setShowPlanAnotherConfirm(false); onPlanAnother(); }}>Plan New</button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Another Action */}
      <div className="plan-another-section">
        <h3 className="section-title-large">Ready to Plan Another Trip?</h3>
        <p className="footer-subtext">Discover more destinations with optimized budget planning.</p>
        <button className="button-plan-another" onClick={() => setShowPlanAnotherConfirm(true)}>
          <Sparkles size={16} /> Plan Another Trip
        </button>
      </div>

      {/* Side-out research reports drawer */}
      {showResearchDrawer && planMeta?.researchArtifacts && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(90vw, 640px)',
          height: '100vh',
          background: 'var(--bg-card)',
          backdropFilter: 'var(--glass-blur)',
          borderLeft: '1px solid var(--border-glass)',
          boxShadow: 'var(--shadow-2xl)',
          zIndex: '1000',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) both'
        }}>
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Multi-Agent Deep Research Reports
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', margin: '4px 0 0 0' }}>
                Unedited research summaries compiled concurrently by cloud subagents
              </p>
            </div>
            <button 
              onClick={() => setShowResearchDrawer(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Subagent tabs inside drawer */}
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.1)',
            padding: '4px',
            margin: '16px 24px',
            borderRadius: '8px'
          }}>
            {['accommodation', 'transit', 'food', 'places'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveResearchTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  border: 'none',
                  background: activeResearchTab === tab ? 'var(--bg-elevated)' : 'transparent',
                  color: activeResearchTab === tab ? 'var(--primary-coral)' : 'var(--text-secondary)',
                  fontWeight: activeResearchTab === tab ? '600' : '400',
                  borderRadius: '4px',
                  fontSize: '12px',
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {tab === 'transit' ? 'Transit' : tab === 'accommodation' ? 'Stays' : tab === 'food' ? 'Gastronomy' : 'Sightseeing'}
              </button>
            ))}
          </div>

          {/* Drawer content area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 24px 24px 24px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'var(--text-secondary)'
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '20px',
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '12px',
              color: 'var(--text-primary)',
              maxHeight: 'calc(100vh - 240px)',
              overflowY: 'auto'
            }}>
              {planMeta.researchArtifacts[activeResearchTab] || 'No research log found for this subagent.'}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
