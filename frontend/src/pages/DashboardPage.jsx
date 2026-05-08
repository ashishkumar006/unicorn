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
  ExternalLink
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import InternalToolsRail from '../components/internal/InternalToolsRail';
import '../styles/designSystem.css';

const BUDGET_SPLITS = [
  { name: 'Travel', percentage: 30, color: '#DE6B48' },
  { name: 'Accommodation', percentage: 35, color: '#45B7A0' },
  { name: 'Food', percentage: 20, color: '#F0B342' },
  { name: 'Activities', percentage: 15, color: '#2A3C4B' },
];

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
  const budgetData = buildBudgetData(budgetAmount);
  const planningHighlights = plan.highlights || [];
  const agentUserId = tripData?.sessionId || `${fromPlace}-${toPlace}-${startDate}`;
  const selectedTravel = tabData.Travel?.options?.[0] || {
    name: 'Konkan Scenic Express',
    rating: 4.8,
    duration: '12-14 hours',
    price: 2000,
    departure: 'Mumbai CST',
    arrival: 'Goa Madgaon',
    highlights: ['Scenic coastline', 'Budget-friendly', 'Relaxed journey'],
    link: '',
  };
  const selectedHotel = tabData.Hotels?.options?.[0] || {
    name: 'Taj Holiday Village',
    rating: 4.8,
    location: 'Calangute Beach',
    pricePerNight: 5000,
    highlights: ['Beachfront luxury', 'Resort amenities', 'Great for families'],
    link: '',
  };

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
      `Travel: ${selectedTravel.name}`,
      `Stay: ${selectedHotel.name}`,
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
    <div className="page-wrapper dashboard">
      {/* Top Navbar */}
      <div className="dash-nav">
        <button className="back-link" onClick={onBackToHome}>
          <ArrowLeft size={16} />
          Back to Home
        </button>
        <div className="brand-header nav-brand">
          <Sparkles className="brand-icon" size={20} />
          <span className="brand-name">TripOptimizer</span>
        </div>
      </div>

      {/* Hero Section with Watercolor Background */}
      <div className="dash-hero-container">
        <div className="watercolor-bg"></div>
        <div className="dash-hero">
          <p className="dash-hero-label">
            <MapPin size={12} /> YOUR OPTIMIZED TRIP
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
            <button type="button" className="button button-secondary hero-action" onClick={copyTripSummary}>
              <Copy size={14} /> Copy summary
            </button>
            <button type="button" className="button button-secondary hero-action" onClick={() => openTab('Hotels')}>
              <Hotel size={14} /> View hotels
            </button>
            <button type="button" className="button button-secondary hero-action" onClick={() => openTab('Food')}>
              <Utensils size={14} /> View food
            </button>
            <button
              type="button"
              className="button button-secondary hero-action"
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
              <h2 className="section-title">
                <Sparkles size={16} /> Plan Intelligence
              </h2>

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
                        <span className="plan-intelligence-chip">Stay base {routeInsights.hotel?.name || selectedHotel.name}</span>
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

          <div className="content-section openstreetmap-section">
            <div className="openstreetmap-header">
              <h2 className="section-title">
                <MapPin size={16} /> OpenStreetMap Preview
              </h2>
              <a
                className="openstreetmap-link"
                href={openStreetMapMapUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open in OpenStreetMap <ExternalLink size={14} />
              </a>
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
              ) : (
                <div className="openstreetmap-fallback">
                  <p>Map preview is loading for {openStreetMapLabel}.</p>
                  <a href={openStreetMapMapUrl} target="_blank" rel="noreferrer">
                    Open the map page
                  </a>
                </div>
              )}

              <div className="openstreetmap-meta">
                <span className="openstreetmap-pill">{openStreetMapLabel}</span>
                {openStreetMapMeta?.lat != null && openStreetMapMeta?.lon != null && (
                  <span className="openstreetmap-coordinates">
                    {Number(openStreetMapMeta.lat).toFixed(4)}, {Number(openStreetMapMeta.lon).toFixed(4)}
                  </span>
                )}
                {openStreetMapMeta?.summary && (
                  <span className="openstreetmap-summary">{openStreetMapMeta.summary}</span>
                )}
              </div>
            </div>
          </div>

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
            <div className="summary-value">{selectedTravel.name}</div>
            <div className="summary-subtext">{formatBudget(selectedTravel.price)} · {selectedTravel.duration}</div>
          </div>
          
          <div className="summary-item">
            <div className="summary-label">
              <Hotel size={14} className="summary-icon"/> SELECTED HOTEL
            </div>
            <div className="summary-value">{selectedHotel.name}</div>
            <div className="summary-subtext">{formatBudget(selectedHotel.pricePerNight)}/night · ⭐ {selectedHotel.rating}</div>
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
        
        {/* Itinerary Tab */}
        {activeTab === 'Itinerary' && (
          <div className="itinerary-content fade-in">
            <div className="itinerary-grid">
              {(itinerary.length > 0 ? itinerary : [{ day: 1, date: startDate, title: 'Mumbai to Goa - Arrival & Beach Relax', activities: [] }]).map((day) => (
                <article key={day.day} className="day-card">
                  <div className="day-header">
                    <div className="day-circle">{day.day}</div>
                    <div className="day-title-group">
                      <h3>Day {day.day}</h3>
                      <span className="day-date">{day.date}</span>
                    </div>
                  </div>

                  <h4 className="day-theme">{day.title}</h4>

                  <ul className="day-list">
                    {(day.activities || []).map((activity, index) => (
                      <li key={`${day.day}-${index}`} style={{ animationDelay: `${index * 50}ms` }}>
                        <span className="list-dot">●</span>
                        <span>
                          <strong>{activity.time}</strong> - {activity.activity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* Travel Tab */}
        {activeTab === 'Travel' && (
          <div className="tab-content fade-in">
            {loadingTab === 'Travel' ? (
              <div className="loading-spinner">
                <Loader2 size={32} className="spinner" />
                <p>Finding best transport options...</p>
              </div>
            ) : tabData['Travel']?.options ? (
              <div className="options-grid">
                {tabData['Travel'].options.map((option, idx) => (
                  <div key={idx} className="option-card travel-card" style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className="option-header">
                      <div className="card-title-group">
                        <h3>{option.name}</h3>
                        {option.link && (
                          <a className="card-link-badge" href={option.link} target="_blank" rel="noreferrer">
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
                    <div className="option-details">
                      <p><Clock size={13} /> {option.duration}</p>
                      <p><MapPinIcon size={13} /> {option.departure} - {option.arrival}</p>
                    </div>
                    <div className="highlights">
                      {option.highlights?.map((h, i) => (
                        <span key={i} className="highlight-tag">{h}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No transport options available</div>
            )}
          </div>
        )}

        {/* Hotels Tab */}
        {activeTab === 'Hotels' && (
          <div className="tab-content fade-in">
            {loadingTab === 'Hotels' ? (
              <div className="loading-spinner">
                <Loader2 size={32} className="spinner" />
                <p>Finding best hotels...</p>
              </div>
            ) : tabData['Hotels']?.options ? (
              <div className="options-grid">
                {tabData['Hotels'].options.map((hotel, idx) => (
                  <div key={idx} className="option-card hotel-card" style={{ animationDelay: `${idx * 100}ms` }}>
                    <div className="option-header">
                      <div className="card-title-group">
                        <h3>{hotel.name}</h3>
                        {hotel.link && (
                          <a className="card-link-badge" href={hotel.link} target="_blank" rel="noreferrer">
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
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No hotels available</div>
            )}
          </div>
        )}

        {/* Places Tab */}
        {activeTab === 'Places' && (
          <div className="tab-content fade-in">
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
          </div>
        )}

        {/* Food Tab */}
        {activeTab === 'Food' && (
          <div className="tab-content fade-in">
            {loadingTab === 'Food' ? (
              <div className="loading-spinner">
                <Loader2 size={32} className="spinner" />
                <p>Finding great food spots...</p>
              </div>
            ) : tabData['Food']?.restaurants ? (
              <div className="food-container">
                <div className="restaurants-grid">
                  {tabData['Food'].restaurants.map((restaurant, idx) => (
                    <div key={idx} className="restaurant-card" style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="restaurant-header">
                        <div className="card-title-group">
                          <h3>{restaurant.name}</h3>
                          {restaurant.link && (
                            <a className="card-link-badge" href={restaurant.link} target="_blank" rel="noreferrer">
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
          </div>
        )}

          </div>
        </div>

        <aside className="dashboard-side-rail">
          <InternalToolsRail
            userId={agentUserId}
            currentPlan={plan}
            onPlanUpdate={handleAgentPlanUpdate}
            agentModel="gemma-cloud"
          />
        </aside>
      </div>

      {/* Plan Another Action */}
      <div className="plan-another-section">
        <h3 className="section-title-large">Ready to Plan Another Trip?</h3>
        <p className="footer-subtext">Discover more destinations with optimized budget planning.</p>
        <button className="button-plan-another" onClick={onPlanAnother}>
          <Sparkles size={16} /> Plan Another Trip
        </button>
      </div>

    </div>
  );
}
