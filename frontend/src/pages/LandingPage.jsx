import React, { useState } from 'react';
import { Target, MapPin, Calendar, IndianRupee, Users, Sparkles, ArrowRight, Bot, TrendingUp } from 'lucide-react';
import '../styles/designSystem.css';
import ThemeToggle from '../components/ThemeToggle';

const DEFAULT_TRIP = {
  fromPlace: 'Mumbai',
  toPlace: 'Goa',
  startDate: '2026-04-16',
  endDate: '2026-04-22',
  budget: '10000',
  travelers: '1',
  userPreferences: '',
};

export default function LandingPage({ onPlanTrip }) {
  const [formData, setFormData] = useState(DEFAULT_TRIP);

  const normalizedFromPlace = formData.fromPlace.trim();
  const normalizedToPlace = formData.toPlace.trim();
  const parsedBudget = Number(formData.budget);
  const hasBudgetError = !Number.isFinite(parsedBudget) || parsedBudget <= 0;
  const hasSameRouteError = Boolean(
    normalizedFromPlace
    && normalizedToPlace
    && normalizedFromPlace.toLowerCase() === normalizedToPlace.toLowerCase()
  );
  const hasDateRangeError = Boolean(
    formData.startDate
    && formData.endDate
    && new Date(formData.endDate) < new Date(formData.startDate)
  );
  const formError = hasSameRouteError
    ? 'From and destination cannot be the same place.'
    : hasDateRangeError
      ? 'End date should be the same as or later than start date.'
      : hasBudgetError
        ? 'Budget should be greater than 0.'
        : '';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (formError) {
      return;
    }

    onPlanTrip({
      ...formData,
      fromPlace: normalizedFromPlace,
      toPlace: normalizedToPlace,
      budget: String(Math.max(1, Math.round(parsedBudget))),
    });
  };

  return (
    <div className="page-wrapper landing">
      {/* Decorative Luminous Orbs */}
      <div className="gradient-orbs">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <div className="landing-shell">
        <div className="brand-header landing-brand-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '820px', margin: '0 auto 2.5rem auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles className="brand-icon" size={22} />
            <span className="brand-name" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 700 }}>
              Wanderlust
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div className="landing-hero">
          <p className="landing-subtitle">Wanderlust AI Travel Planner</p>
          <h1 className="landing-title">
            Plan your journey, <span>feel the destination</span>
          </h1>
          <p className="landing-description">
            Experience premium, bespoke itineraries with automated real-time local budget estimations, live maps preview, and intelligent guidance.
          </p>
        </div>

        <div className="landing-content">
          {/* Form Card */}
          <div className="landing-form-card">
            <form onSubmit={handleSubmit}>
              <div className="landing-form-grid">
                
                <div className="form-group">
                  <label className="form-label">
                    <Target size={14} className="label-icon" />
                    FROM
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      name="fromPlace"
                      value={formData.fromPlace}
                      onChange={handleChange}
                      placeholder="Select origin"
                      className="input-field"
                      maxLength={80}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <MapPin size={14} className="label-icon" />
                    TO
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      name="toPlace"
                      value={formData.toPlace}
                      onChange={handleChange}
                      placeholder="Select destination"
                      className="input-field"
                      maxLength={80}
                      aria-invalid={hasSameRouteError}
                      required
                    />
                  </div>
                  {hasSameRouteError && <span className="error-text">{formError}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <Calendar size={14} className="label-icon" />
                    START DATE
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="date"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleChange}
                      className="input-field"
                      max={formData.endDate || undefined}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <Calendar size={14} className="label-icon" />
                    END DATE
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="date"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleChange}
                      className="input-field"
                      min={formData.startDate || undefined}
                      aria-invalid={hasDateRangeError}
                      required
                    />
                  </div>
                  {hasDateRangeError && <span className="error-text">{formError}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <Users size={14} className="label-icon" />
                    TRAVELERS
                  </label>
                  <div className="input-wrapper">
                    <select
                      name="travelers"
                      value={formData.travelers}
                      onChange={handleChange}
                      className="input-field"
                    >
                      <option value="1">1 Person</option>
                      <option value="2">2 People</option>
                      <option value="3">3 People</option>
                      <option value="4">4 People</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <IndianRupee size={14} className="label-icon" />
                    BUDGET (₹)
                  </label>
                  <div className="input-wrapper">
                    <input
                      type="number"
                      name="budget"
                      value={formData.budget}
                      onChange={handleChange}
                      placeholder="Enter budget in ₹"
                      className="input-field"
                      min="1"
                      aria-invalid={hasBudgetError}
                      required
                    />
                  </div>
                  {hasBudgetError && <span className="error-text">{formError}</span>}
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">
                    <Sparkles size={14} className="label-icon" style={{ color: 'var(--primary-coral)' }} />
                    SPECIAL TRIP REQUESTS / CONSTRAINTS (E.G. HOTEL HOPPING, VEGETARIAN FOOD...)
                  </label>
                  <div className="input-wrapper">
                    <textarea
                      name="userPreferences"
                      value={formData.userPreferences}
                      onChange={handleChange}
                      placeholder="e.g. I want to change hotels every 2 days, I prefer vegetarian food, and only do sightseeing on the first 3 days of the stay..."
                      className="input-field"
                      style={{ minHeight: '74px', padding: '12px', resize: 'vertical', width: '100%', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

              </div>

              {/* SUBMIT BUTTON */}
              <div className="submit-container">
                <button type="submit" className="btn btn-primary" style={{ width: '100%', maxWidth: '320px' }} disabled={Boolean(formError)}>
                  <Sparkles size={18} />
                  Start Planning
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>

          {/* Bespoke Features Showcase */}
          <div className="landing-features-grid">
            <div className="landing-feature-card">
              <div className="feature-icon-box">
                <Sparkles size={20} />
              </div>
              <h3>Bespoke Itineraries</h3>
              <p>Tailored routing designed around your preferences, group size, and timeline constraints.</p>
            </div>
            <div className="landing-feature-card">
              <div className="feature-icon-box">
                <TrendingUp size={20} />
              </div>
              <h3>Live Cost Optimizer</h3>
              <p>Instant per-person splits, real-time cost estimations, and local transport options.</p>
            </div>
            <div className="landing-feature-card">
              <div className="feature-icon-box">
                <MapPin size={20} />
              </div>
              <h3>Interactive Maps</h3>
              <p>Explore stay clusters, restaurants, and attractions mapped directly onto OpenStreetMap.</p>
            </div>
            <div className="landing-feature-card">
              <div className="feature-icon-box">
                <Bot size={20} />
              </div>
              <h3>AI Co-Pilot Assistant</h3>
              <p>Talk to a dedicated 24/7 travel assistant who instantly edits your schedule and researches places.</p>
            </div>
          </div>

          {/* Footer */}
          <footer className="landing-footer">
            <p>© {new Date().getFullYear()} Wanderlust AI Travel Co. Crafted for bespoke journeys.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
