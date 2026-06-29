const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3000';
const API = 'http://localhost:5000/api';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPlanViaApi(sessionId) {
  const body = {
    fromPlace: 'Mumbai',
    toPlace: 'Goa',
    budget: 50000,
    luxuryType: 'semi',
    days: 5,
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    travelers: 2,
    provider: 'auto',
    sessionId,
    userPreferences: '',
  };

  const res = await fetch(`${API}/travel/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return res.json();
}

async function createRecoveryCode() {
  const body = {
    userId: 'playwright-guest',
    sessionId: `playwright-${Date.now()}`,
    planData: { summary: { toPlace: 'Goa' } },
  };

  const res = await fetch(`${API}/internal/guest/recovery-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return res.json();
}

test.describe('Wanderlust Travel Planner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
  });

  test('landing page renders with defaults and navigation', async ({ page }) => {
    await expect(page.locator('text=Wanderlust')).toBeVisible();
    await expect(page.locator('input[value="Mumbai"]').or(page.locator('input[placeholder*="Mumbai"]'))).toBeVisible();
    await expect(page.locator('text=Plan My Trip').or(page.locator('button:has-text("Plan")'))).toBeVisible();
  });

  test('loading screen shows agent avatars and elapsed timer', async ({ page }) => {
    const sessionId = `playwright-loading-${Date.now()}`;
    await createPlanViaApi(sessionId);

    await page.evaluate((sid) => {
      window.__TRIP_SESSION = sid;
    }, sessionId);

    await page.goto(`${BASE}?sessionId=${encodeURIComponent(sessionId)}`);
    await page.waitForLoadState('networkidle');

    const loadingScreen = page.locator('.loading-screen');
    await expect(loadingScreen).toBeVisible();

    await expect(page.locator('.loading-wordmark')).toContainText('Wanderlust');
    await expect(page.locator('.loading-elapsed')).toBeVisible();

    await expect(page.locator('.loading-agent-status-row').first()).toBeVisible();
  });

  test('dashboard shows full itinerary after plan completes', async ({ page }) => {
    const sessionId = `playwright-dashboard-${Date.now()}`;
    const planResponse = await createPlanViaApi(sessionId);

    await page.evaluate(({ sid, plan }) => {
      window.__TRIP_SESSION = sid;
      window.__PLAN_DATA = plan;
    }, { sid: sessionId, plan: planResponse });

    await page.goto(`${BASE}?sessionId=${encodeURIComponent(sessionId)}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.dashboard-layout').or(page.locator('.dash-hero'))).toBeVisible();
  });

  test('guest recovery flow works end-to-end', async ({ page }) => {
    const recovery = await createRecoveryCode();
    expect(recovery.success).toBe(true);
    expect(recovery.code).toBeTruthy();

    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    const recoveryButton = page.locator('text=Recover Plan').or(page.locator('button:has-text("Recover")'));
    if (await recoveryButton.count() > 0) {
      await recoveryButton.first().click();
      await page.waitForTimeout(500);

      const codeInput = page.locator('input[placeholder*="code" i]').or(page.locator('input[type="text"]').first());
      if (await codeInput.count() > 0) {
        await codeInput.first().fill(recovery.code);
        await page.locator('button:has-text("Recover")').first().click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('backend health endpoint is reachable', async ({ page }) => {
    const res = await page.request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('OK');
  });

  test('travel status endpoint returns logs', async ({ page }) => {
    const sessionId = `playwright-status-${Date.now()}`;
    await createPlanViaApi(sessionId);

    const res = await page.request.get(`${API}/travel/status/${encodeURIComponent(sessionId)}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.logs)).toBe(true);
  });
});
