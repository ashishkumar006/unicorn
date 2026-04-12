import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './styles/designSystem.css';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';

function AppRoutes() {
  const navigate = useNavigate();
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [userId] = useState('user_' + Math.random().toString(36).substr(2, 9));

  const handlePlanGenerated = async (formData) => {
    try {
      // Calculate days from dates
      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);
      const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

      // Call backend to generate travel plan
      const response = await axios.post('http://localhost:5000/api/travel/plan', {
        fromPlace: formData.fromPlace,
        toPlace: formData.toPlace,
        budget: Math.round(parseFloat(formData.budget)),
        luxuryType: 'semi', // Default for now
        days: days || 3,
        provider: 'ollama'
      });

      // Also call the agent API to store the plan
      await axios.post('http://localhost:5000/api/agent/plan', {
        userId,
        plan: {
          ...response.data.data,
          destination: `${formData.fromPlace} → ${formData.toPlace}`,
          travelers: parseInt(formData.travelers),
          startDate: formData.startDate,
          endDate: formData.endDate
        },
        agentModel: 'ollama'
      });

      setGeneratedPlan(response.data.data);
      navigate('/dashboard');
    } catch (error) {
      console.error('Error generating plan:', error);
      alert('Failed to generate plan. Please try again.');
    }
  };

  const handleBackToHome = () => {
    setGeneratedPlan(null);
    navigate('/');
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage onPlanGenerated={handlePlanGenerated} />} />
      <Route 
        path="/dashboard" 
        element={<DashboardPage plan={generatedPlan} onBackToHome={handleBackToHome} />} 
      />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
