/**
 * Wanderlust Monitor Server
 *
 * Lightweight sidecar: receives planning events from backend over HTTP POST /event
 * and streams them to connected browser sessions via WebSocket.
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '512kb' }));

const MAX_LOG = 5000;
const eventLog = [];

function broadcast(envelope) {
  const payload = JSON.stringify(envelope);
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

function pushToLog(envelope) {
  eventLog.push(envelope);
  if (eventLog.length > MAX_LOG) eventLog.shift();
}

// ─── HTTP endpoints ──────────────────────────────────────────────────

app.post('/event', (req, res) => {
  const { layer, event, sessionId = 'default', data = {} } = req.body || {};
  if (!layer || !event) return res.status(400).json({ error: 'layer and event are required' });
  const envelope = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    layer, event, sessionId, data,
    ts: new Date().toISOString(),
  };
  pushToLog(envelope);
  broadcast(envelope);
  res.json({ ok: true, id: envelope.id });
});

app.post('/event/batch', (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [];
  const ids = [];
  items.forEach((item) => {
    const { layer, event, sessionId = 'default', data = {} } = item || {};
    if (!layer || !event) return;
    const envelope = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      layer, event, sessionId, data,
      ts: new Date().toISOString(),
    };
    pushToLog(envelope);
    ids.push(envelope.id);
  });
  broadcast({ type: 'batch', items: ids });
  res.json({ ok: true, count: ids.length });
});

app.get('/events', (req, res) => {
  const sessionId = (req.query.sessionId || 'default').toString();
  const limit = parseInt(req.query.limit || '200', 10);
  res.json(eventLog.filter((e) => !sessionId || e.sessionId === sessionId).slice(-limit));
});

// API-style routes MUST come before static middleware.
app.get('/health', (_, res) => res.json({ ok: true, connections: wss.clients.size, logSize: eventLog.length }));
app.get('/ready', (_, res) => {
  const hasWs = Array.from(wss.clients).some((ws) => ws.readyState === WebSocket.OPEN);
  res.json({ ready: hasWs, connections: wss.clients.size });
});

// simulator.js lives one directory above public/. Serve it with correct MIME type.
app.get('/simulator.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'simulator.js'));
});

const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC));

// SPA fallback — serve index.html for everything except API paths.
app.get('*', (req, res) => {
  if (req.path.startsWith('/event') || req.path.startsWith('/events')) return;
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

wss.on('connection', (ws) => {
  console.log('[Monitor] Client connected, total:', wss.clients.size);
  ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }));
  ws.on('close', () => {
    console.log('[Monitor] Client disconnected, total:', wss.clients.size);
  });
});

const PORT = Number(process.env.MONITOR_PORT || 3001);
server.listen(PORT, () => {
  console.log(`\n  🔭 Wanderlust Monitor  http://localhost:${PORT}`);
  console.log(`     WebSocket endpoint  ws://localhost:${PORT}`);
  console.log(`     HTTP events         POST http://localhost:${PORT}/event\n`);
});

module.exports = { app, server, wss, pushToLog };
