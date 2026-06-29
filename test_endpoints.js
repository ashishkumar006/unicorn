const http = require('http');

const BASE = 'http://localhost:5000';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  try {
    const health = await request('GET', '/api/health');
    console.log('HEALTH', health.status, JSON.stringify(health.body));

    const plan = await request('POST', '/api/travel/plan', {
      fromPlace: 'Mumbai',
      toPlace: 'Goa',
      budget: 50000,
      days: 5,
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      travelers: 2,
      sessionId: 'test-session-123',
    });
    console.log('PLAN', plan.status, JSON.stringify(plan.body).slice(0, 300));

    const status = await request('GET', '/api/travel/status/test-session-123');
    console.log('STATUS', status.status, JSON.stringify(status.body).slice(0, 300));

    const details = await request('POST', '/api/travel/details', {
      fromPlace: 'Mumbai',
      toPlace: 'Goa',
      budget: 50000,
      days: 5,
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      travelers: 2,
      tabType: 'itinerary',
      sessionId: 'test-session-123',
    });
    console.log('DETAILS', details.status, JSON.stringify(details.body).slice(0, 300));

    const recovery = await request('POST', '/api/internal/guest/recovery-code', {
      userId: 'guest-test-user',
      sessionId: 'test-session-123',
      planData: { summary: { toPlace: 'Goa' } },
    });
    console.log('RECOVERY_CODE', recovery.status, JSON.stringify(recovery.body));

    if (recovery.body?.code) {
      const recover = await request('POST', '/api/internal/guest/recover', {
        code: recovery.body.code,
      });
      console.log('RECOVER', recover.status, JSON.stringify(recover.body).slice(0, 300));
    }
  } catch (err) {
    console.error('TEST_ERROR', err.message);
  }
}

run();
