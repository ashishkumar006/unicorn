/**
 * MONITORING SERVICE STUB
 *
 * Placeholder for future monitoring, metrics, and analytics.
 * Default implementation: no-op and not-configured response.
 */

function recordEvent({ event, userId, properties = {} } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Monitoring service is not configured.',
    meta: {
      event,
      userId,
      properties,
    },
  };
}

function trackMetric({ name, value, tags = {} } = {}) {
  return {
    success: false,
    configured: false,
    error: 'Monitoring service is not configured.',
    meta: {
      name,
      value,
      tags,
    },
  };
}

function getServiceHealth() {
  return {
    success: true,
    configured: false,
    services: {
      api: 'available',
      travel: 'available',
      agent: 'available',
      internal: 'available',
      browser: 'available',
      cache: 'in-memory',
      jobs: 'noop',
    },
  };
}

module.exports = {
  recordEvent,
  trackMetric,
  getServiceHealth,
};
