/**
 * MONITOR BRIDGE
 *
 * Tiny fire-and-forget helper that emits planning events to the
 * separate Wanderlust Monitor server (port 3001) over HTTP.
 *
 * If the monitor is offline, the call silently fails — no impact on
 * the planning flow.
 *
 * Usage:
 *   const { emitEvent, emitBatch } = require('./monitorBridge');
 *
 *   emitEvent('orchestrator', 'tool_call', {
 *     toolName: 'searchHotels',
 *     args: { destination: 'Goa' },
 *   }, 'session-123');
 *
 *   emitBatch([{ layer: 'router', event: 'decide', ... }]);
 */

const MONITOR_URL = (process.env.MONITOR_URL || 'http://localhost:3001').replace(/\/+$/, '');

/**
 * Emit a single event to the monitor.
 * @param {'orchestrator'|'router'|'cache'|'api'|'browser'|'fusion'|'llm'|'response'} layer
 * @param {string} event
 * @param {object} [data={}]
 * @param {string} [sessionId='default']
 */
async function emitEvent(layer, event, data = {}, sessionId = 'default') {
  if (!layer || !event) return;
  const payload = JSON.stringify({ layer, event, sessionId, data });
  if (typeof fetch !== 'undefined') {
    // Browser / edge runtime
    fetch(`${MONITOR_URL}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } else {
    // Node runtime
    try {
      const http = require('http');
      const url = `${MONITOR_URL}/event`;
      const parsed = new URL(url);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, () => {});
      req.on('error', () => {});
      req.write(payload);
      req.end();
    } catch {
      // Swallow all errors — monitor is optional
    }
  }
}

/**
 * Emit a batch of events atomically.
 * @param {Array<{layer:string, event:string, data?:object, sessionId?:string}>} items
 */
async function emitBatch(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const payload = JSON.stringify(
    items.map(({ layer, event, data = {}, sessionId = 'default' }) => ({ layer, event, data, sessionId }))
  );
  try {
    const http = require('http');
    const url = `${MONITOR_URL}/event/batch`;
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, () => {});
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch {
    // Swallow
  }
}

module.exports = { emitEvent, emitBatch };
