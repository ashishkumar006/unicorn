const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const travelRoutes = require('./routes/travel');
const agentRoutes = require('./routes/agent');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/travel', travelRoutes);
app.use('/api/agent', agentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Travel Planner API is running',
    services: {
      travel: 'available',
      agent: 'available',
      rag: 'available'
    }
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║        🚀 TRAVEL BOOKING PLATFORM - LIVE                ║
╚════════════════════════════════════════════════════════╝

📍 Server: http://localhost:${PORT}
✅ Travel API: /api/travel/*
✅ Agent API: /api/agent/*
✅ RAG System: /api/agent/rag/*
📊 Health: /api/health

Press Ctrl+C to stop
  `);
});
