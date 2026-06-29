const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const travelRoutes = require('./routes/travel');
const agentRoutes = require('./routes/agent');
const internalRoutes = require('./routes/internal');
const browserRoutes = require('./routes/browser');

// Optional dependencies with try-catch requires for public launch hardening
let helmet;
try {
  helmet = require('helmet');
} catch (e) {
  console.log('[Server Info] helmet module not installed, skipping.');
}

let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (e) {
  console.log('[Server Info] express-rate-limit module not installed, skipping.');
}

let compression;
try {
  compression = require('compression');
} catch (e) {
  console.log('[Server Info] compression module not installed, skipping.');
}

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (helmet) {
  app.use(helmet());
}

if (compression) {
  app.use(compression());
}

if (rateLimit) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);
}

app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/travel', travelRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/internal', internalRoutes);
app.use('/api/browser', browserRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Travel Planner API is running',
    services: {
      travel: 'available',
      agent: 'available',
      internal: 'available',
      rag: 'available',
      browser: 'available',
    },
  });
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'An unexpected internal server error occurred.',
  });
});

// Process Level Safety Net
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err);
  // Give server time to close connections before exiting
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(PORT, () => {
  console.log([
    'Wanderlust API server is running',
    `Server: http://localhost:${PORT}`,
    'Travel API: /api/travel/*',
    'Agent API: /api/agent/*',
    'Internal Lab API: /api/internal/*',
    'RAG System: /api/agent/rag/*',
    'Health: /api/health',
  ].join('\n'));
});

// Graceful Shutdown Handler
const gracefulShutdown = () => {
  console.log('Received shutdown signal, shutting down gracefully...');
  server.close(() => {
    console.log('Closed out remaining connections.');
    process.exit(0);
  });
  
  // Force exit after 10s if connections persist
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
