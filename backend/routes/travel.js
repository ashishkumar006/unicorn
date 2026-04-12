const express = require('express');
const router = express.Router();
const { getTravelPlan, getTravelDetails } = require('../services/travelPlanner');

router.post('/plan', async (req, res) => {
  try {
    const { fromPlace, toPlace, budget, luxuryType, days, startDate, endDate, travelers, provider = 'auto' } = req.body;

    // Validation
    if (!fromPlace || !toPlace || !budget || !luxuryType) {
      return res.status(400).json({
        error: 'Missing required fields: fromPlace, toPlace, budget, luxuryType'
      });
    }

    console.log('📍 Generating live travel plan with Gemma cloud:', { 
      fromPlace, 
      toPlace, 
      budget, 
      luxuryType, 
      days, 
      startDate, 
      endDate, 
      travelers,
      provider 
    });

    const plan = await getTravelPlan({ fromPlace, toPlace, budget, luxuryType, days, startDate, endDate, travelers, provider });

    res.json({ success: true, data: plan });
  } catch (error) {
    console.error('❌ Error generating travel plan:', error.message);
    res.status(500).json({
      error: 'Failed to generate travel plan',
      details: error.message
    });
  }
});

// Get detailed data for specific tabs
router.post('/details', async (req, res) => {
  try {
    const { fromPlace, toPlace, tabType, budget, luxuryType, days, startDate, endDate, travelers, provider = 'auto' } = req.body;

    if (!fromPlace || !toPlace || !tabType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('📊 Generating live tab data with Gemma cloud:', tabType, { 
      fromPlace, 
      toPlace, 
      budget, 
      days,
      startDate,
      endDate,
      travelers,
      provider 
    });

    const data = await getTravelDetails({ fromPlace, toPlace, budget, luxuryType, days, startDate, endDate, travelers, provider }, tabType);

    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error generating detailed data:', error.message);
    res.status(500).json({
      error: 'Failed to generate detailed data',
      details: error.message
    });
  }
});

module.exports = router;
