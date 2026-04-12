import React, { useState } from 'react';
import { Target, MapPin, Calendar, IndianRupee, Users, Sparkles, ArrowRight } from 'lucide-react';
import '../styles/designSystem.css';

const DEFAULT_TRIP = {
  fromPlace: 'Mumbai',
  toPlace: 'Goa',
  startDate: '2026-04-16',
  endDate: '2026-04-22',
  budget: '10000',
  travelers: '1',
};

export default function LandingPage({ onPlanTrip }) {
  const [formData, setFormData] = useState(DEFAULT_TRIP);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onPlanTrip(formData);
  };

  return (
    <div className="page-wrapper landing">
      <div className="landing-shell">
        <div className="brand-header landing-brand-header">
          <Sparkles className="brand-icon" size={24} />
          <span className="brand-name">TripOptimizer</span>
        </div>

        <div className="landing-content">
          <p className="landing-subtitle landing-subtitle-inline">
            A focused trip planner for routes, dates, budgets, and travelers.
          </p>

          {/* Form Card */}
          <div className="form-card landing-form-card">
            <div className="form-card-header">
              <span>Trip inputs</span>
              <span className="form-card-badge">Ready to plan</span>
            </div>

            <form onSubmit={handleSubmit}>
            <div className="form-grid">
              
              {/* FROM */}
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
                    required
                  />
                </div>
              </div>

              {/* TO */}
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
                    required
                  />
                </div>
              </div>

              {/* START DATE */}
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
                    required
                  />
                  <Calendar className="input-icon-right" size={16} />
                </div>
              </div>

              {/* END DATE */}
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
                    required
                  />
                  <Calendar className="input-icon-right" size={16} />
                </div>
              </div>

              {/* TOTAL BUDGET */}
              <div className="form-group">
                <label className="form-label">
                  <IndianRupee size={14} className="label-icon" />
                  TOTAL BUDGET
                </label>
                <div className="input-wrapper">
                  <input
                    type="number"
                    name="budget"
                    value={formData.budget}
                    onChange={handleChange}
                    placeholder="Enter budget in ₹"
                    className="input-field"
                    required
                  />
                </div>
              </div>

              {/* TRAVELERS */}
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

            </div>

              {/* SUBMIT BUTTON */}
              <div className="submit-container">
                <button type="submit" className="button-submit">
                  <Sparkles size={18} />
                  Plan My Trip
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>

          <p className="landing-footnote">
            Adjust the fields and generate your plan in one click.
          </p>
        </div>
      </div>
    </div>
  );
}
