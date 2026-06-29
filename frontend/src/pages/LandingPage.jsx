import React, { useState, useRef } from 'react';
import { Target, MapPin, Calendar, IndianRupee, Users, Sparkles, ArrowRight, Bot, TrendingUp, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

const formVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

const featureCardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
  hover: {
    y: -5,
    transition: { duration: 0.2 },
  },
};

export default function LandingPage({ onPlanTrip }) {
  const [formData, setFormData] = useState(DEFAULT_TRIP);
  const formRef = useRef(null);
  const featuresRef = useRef(null);

  const [showGuestRecoveryModal, setShowGuestRecoveryModal] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  const openGuestRecoveryModal = () => {
    setRecoveryCodeInput('');
    setRecoveryError('');
    setShowGuestRecoveryModal(true);
  };

  const closeGuestRecoveryModal = () => {
    if (!isRecovering) {
      setShowGuestRecoveryModal(false);
    }
  };

  const handleRecoverGuestPlan = async () => {
    const code = recoveryCodeInput.trim();
    if (!code) {
      setRecoveryError('Please enter a recovery code.');
      return;
    }

    setIsRecovering(true);
    setRecoveryError('');

    try {
      const response = await fetch('/api/internal/guest/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to restore plan. Please check the code and try again.');
      }

      const plan = data.plan || {};
      const restoredTrip = {
        fromPlace: plan.fromPlace || DEFAULT_TRIP.fromPlace,
        toPlace: plan.toPlace || DEFAULT_TRIP.toPlace,
        startDate: plan.startDate || DEFAULT_TRIP.startDate,
        endDate: plan.endDate || DEFAULT_TRIP.endDate,
        budget: String(plan.budget ?? DEFAULT_TRIP.budget),
        travelers: String(plan.travelers ?? DEFAULT_TRIP.travelers),
        userPreferences: plan.userPreferences || '',
      };

      setFormData(restoredTrip);
      setShowGuestRecoveryModal(false);

      toast.success('Previous plan restored! Review and update it below.', {
        position: 'top-center',
        duration: 3000,
        icon: '🗺️',
        style: {
          background: 'var(--bg-card)',
          color: 'var(--primary-coral)',
          border: '1px solid var(--primary-coral)',
        },
      });

      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err) {
      setRecoveryError(err.message || 'Something went wrong while restoring your plan.');
    } finally {
      setIsRecovering(false);
    }
  };

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
      toast.error(formError, {
        position: 'top-center',
        duration: 4000,
        style: {
          background: 'var(--bg-card)',
          color: 'var(--error)',
          border: '1px solid var(--error)',
        },
      });
      return;
    }

    toast.success('Planning your trip...', {
      position: 'top-center',
      duration: 2000,
      icon: '✈️',
      style: {
        background: 'var(--bg-card)',
        color: 'var(--primary-coral)',
        border: '1px solid var(--primary-coral)',
      },
    });

    onPlanTrip({
      ...formData,
      fromPlace: normalizedFromPlace,
      toPlace: normalizedToPlace,
      budget: String(Math.max(1, Math.round(parsedBudget))),
      planStartedAt: Date.now(),
    });
  };

  return (
    <motion.div 
      className="page-wrapper landing page-shell"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* Decorative Luminous Orbs */}
      <motion.div 
        className="gradient-orbs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </motion.div>

      <motion.div 
        className="landing-shell"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      >
        <motion.div 
          className="landing-header"
          variants={itemVariants}
        >
          <div className="landing-brand">
            <motion.div
              initial={{ rotate: -10, scale: 0.8 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Sparkles className="brand-icon" size={22} />
            </motion.div>
            <motion.span 
              className="brand-name" 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
            >
              Wanderlust
            </motion.span>
          </div>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 }}
          >
            <ThemeToggle />
          </motion.div>
        </motion.div>

        {/* Landing Hero Text */}
        <motion.div className="landing-hero-text" variants={itemVariants}>
          {!showGuestRecoveryModal && (
            <motion.div
              className="guest-recovery-banner"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <div className="guest-recovery-banner-inner">
                <div className="guest-recovery-icon">
                  <KeyRound size={18} />
                </div>
                <div className="guest-recovery-text">
                  <strong>Returning guest?</strong>
                  <span>You can restore a previously saved plan using a recovery code.</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary guest-recovery-cta"
                  onClick={openGuestRecoveryModal}
                >
                  Restore plan
                </button>
              </div>
            </motion.div>
          )}
          <span className="eyebrow hero-eyebrow">AI Trip Planning, Perfected</span>
          <h1 className="landing-heading">
            Your Journey. <span>Intelligently Planned.</span>
          </h1>
          <p className="landing-subheading">
            Our AI crafts personalized itineraries that balance where you want to go with how you want to travel — 
            from hidden gems to local eats, optimized routes to real-time budgets, all in under a minute.
          </p>
        </motion.div>

        <div className="landing-content">
          {/* Form Card */}
<motion.div 
          className="landing-form-card"
          variants={formVariants}
          initial="hidden"
          animate="visible"
          whileHover={{ boxShadow: 'var(--shadow-lg)' }}
          ref={formRef}
        >
          <form onSubmit={handleSubmit}>
            <motion.div 
              className="landing-form-grid"
              initial="hidden"
              animate="visible"
              variants={containerVariants}
            >
                
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

              </motion.div>

              {/* SUBMIT BUTTON */}
              <div className="submit-container">
                <button type="submit" className="btn btn-primary" style={{ width: '100%', maxWidth: '320px' }} disabled={Boolean(formError)}>
                  <Sparkles size={18} />
                  Start planning
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </motion.div>

          {/* Bespoke Features Showcase */}
          <motion.div 
            className="landing-features-grid"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            ref={featuresRef}
          >
            <motion.div 
              key="bespoke"
              className="landing-feature-card"
              variants={featureCardVariants}
              whileHover="hover"
            >
              <motion.div 
                className="feature-icon-box"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                <Sparkles size={20} />
              </motion.div>
              <h3>Bespoke itineraries</h3>
              <p>Tailored routing designed around your preferences, pace, and trip rhythm.</p>
            </motion.div>
            <motion.div 
              key="optimizer"
              className="landing-feature-card"
              variants={featureCardVariants}
              whileHover="hover"
            >
              <motion.div 
                className="feature-icon-box"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                <TrendingUp size={20} />
              </motion.div>
              <h3>Budget intelligence</h3>
              <p>Clear per-person splits, realistic cost cues, and smarter transport pacing.</p>
            </motion.div>
            <motion.div 
              key="maps"
              className="landing-feature-card"
              variants={featureCardVariants}
              whileHover="hover"
            >
              <motion.div 
                className="feature-icon-box"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                <MapPin size={20} />
              </motion.div>
              <h3>Spatial clarity</h3>
              <p>Stay clusters, restaurants, and attractions layered into a navigable plan.</p>
            </motion.div>
            <motion.div 
              key="ai"
              className="landing-feature-card"
              variants={featureCardVariants}
              whileHover="hover"
            >
              <motion.div 
                className="feature-icon-box"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                <Bot size={20} />
              </motion.div>
              <h3>AI co-pilot</h3>
              <p>Refine the plan with live research, itinerary edits, and summary drafts.</p>
            </motion.div>
          </motion.div>

          {/* Guest Recovery Modal */}
          {showGuestRecoveryModal && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeGuestRecoveryModal}
            >
              <motion.div
                className="modal-content"
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2>Welcome back, traveller</h2>
                  <p className="modal-subtitle">
                    Looks like you had a plan saved from a previous visit. Enter your recovery code to restore it, or start fresh.
                  </p>
                </div>

                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">Recovery Code</label>
                    <div className="input-wrapper">
                      <input
                        type="text"
                        value={recoveryCodeInput}
                        onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                        placeholder="e.g. WANDER-ABC123"
                        className="input-field"
                        style={{ fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}
                        maxLength={20}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeGuestRecoveryModal}
                    disabled={isRecovering}
                  >
                    Start fresh
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRecoverGuestPlan}
                    disabled={isRecovering || !recoveryCodeInput.trim()}
                  >
                    {isRecovering ? 'Restoring...' : 'Restore plan'}
                    {!isRecovering && <ArrowRight size={16} />}
                  </button>
                </div>

                {recoveryError && (
                  <p className="error-text" style={{ marginTop: '12px', textAlign: 'center' }}>
                    {recoveryError}
                  </p>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* Footer */}
          <footer className="landing-footer">
            <p>© {new Date().getFullYear()} Wanderlust AI Travel Co. Crafted for bespoke journeys.</p>
          </footer>
        </div>
      </motion.div>
    </motion.div>
  );
}
