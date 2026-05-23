/**
 * GROUP TRAVEL BOOKING API
 * 
 * Endpoints for group travel booking
 * This is what the frontend will call
 */

const express = require('express');
const router = express.Router();
const GroupTravelAgent = require('../agents/groupTravelAgent');

// Store agent instances per user session
const agents = new Map();

// ============================================================
// GET OR CREATE AGENT FOR USER
// ============================================================
function getAgent(userId) {
  if (!agents.has(userId)) {
    agents.set(userId, new GroupTravelAgent());
  }
  return agents.get(userId);
}

// ============================================================
// API: POST /api/chat - Chat with agent
// ============================================================
router.post('/chat', (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({
        error: 'Missing userId or message'
      });
    }

    const agent = getAgent(userId);
    const response = agent.chat(message);

    res.json({
      success: true,
      response: response,
      tripState: agent.getTrip()
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// ============================================================
// API: GET /api/trip/:userId - Get current trip state
// ============================================================
router.get('/trip/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const agent = getAgent(userId);
    
    res.json({
      success: true,
      trip: agent.getTrip()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// API: GET /api/history/:userId - Get chat history
// ============================================================
router.get('/history/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const agent = getAgent(userId);
    
    res.json({
      success: true,
      history: agent.getHistory()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// API: POST /api/reset/:userId - Reset trip
// ============================================================
router.post('/reset/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    agents.delete(userId); // Delete and recreate
    const agent = getAgent(userId);
    
    res.json({
      success: true,
      message: 'Trip reset successfully',
      trip: agent.getTrip()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// API: POST /api/search - Search trips (shortcut)
// ============================================================
router.post('/search', async (req, res) => {
  try {
    const { userId, origin, destination, departureDate, nights, groupSize, budget } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const agent = getAgent(userId);
    
    // Update trip directly
    if (origin) agent.currentTrip.origin = origin;
    if (destination) agent.currentTrip.destination = destination;
    if (departureDate) agent.currentTrip.departureDate = departureDate;
    if (nights) agent.currentTrip.nights = nights;
    if (groupSize) agent.currentTrip.groupSize = groupSize;
    if (budget) agent.currentTrip.budget = budget;

    // Search
    const response = await agent.searchTrips();

    res.json({
      success: true,
      response: response,
      tripState: agent.getTrip()
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// API: POST /api/book - Book selected trip
// ============================================================
router.post('/book', async (req, res) => {
  try {
    const { userId, optionIndex, travelers, paymentMethod } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const agent = getAgent(userId);
    
    // Select option
    if (optionIndex !== undefined) {
      const selected = agent.currentTrip.searchResults?.recommendations[optionIndex];
      if (selected) {
        agent.currentTrip.selectedFlight = selected.flight;
        agent.currentTrip.selectedHotel = selected.hotel;
        agent.currentTrip.selectedBus = selected.bus;
      }
    }

    // Add travelers
    if (travelers) {
      agent.currentTrip.travelers = travelers;
    }

    // Book
    const response = await agent.bookTrip({ paymentMethod });

    res.json({
      success: true,
      response: response,
      bookingId: response.bookingId,
      tripState: agent.getTrip()
    });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// API: GET /api/health - Check if service is running
// ============================================================
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Group Travel Booking Agent',
    agentsActive: agents.size,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

// ============================================================
// USAGE IN server.js
// ============================================================
/*
const express = require('express');
const cors = require('cors');
const travelRoutes = require('./routes/travel');

const app = express();

app.use(cors());
app.use(express.json());

// Mount travel routes
app.use('/api', travelRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 Chat endpoint: POST /api/chat`);
  console.log(`📍 Search endpoint: POST /api/search`);
  console.log(`📍 Book endpoint: POST /api/book`);
});
*/

// ============================================================
// EXAMPLE FRONTEND USAGE
// ============================================================
/*
// JavaScript (Frontend)

const userId = 'user-' + Date.now();

// Start chat
async function chat(message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, message })
  });
  return response.json();
}

// Search
async function search(origin, destination, groupSize) {
  const response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      userId, 
      origin, 
      destination, 
      groupSize,
      departureDate: '2026-04-20',
      nights: 3 
    })
  });
  return response.json();
}

// Book
async function book(optionIndex, travelers) {
  const response = await fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      userId, 
      optionIndex, 
      travelers,
      paymentMethod: 'UPI'
    })
  });
  return response.json();
}

// Usage
const response1 = await chat("I want to book a trip");
const response2 = await search('MAA', 'BLR', 7);
const response3 = await book(0, [
  { name: 'Student 1', email: 's1@college.edu', phone: '9xxx' }
]);
*/
