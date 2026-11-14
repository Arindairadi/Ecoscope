// Real-browser dashboard control regression checks.
// TEST ONLY network failures are injected in the browser; no scientific data
// fixtures are used. Successful series retries call the real FastAPI endpoint.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

const base = process.env.APP_URL || 'http://localhost:80/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const results = [];
  const pageErrors = [];
  const seriesRequests = [];
  let tileRequests = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/series') {
      seriesRequests.push(Object.fromEntries(url.searchParams.entries()));
    }
  });
  const check = async (name, run) => {
    await run();
    results.push(name);
    console.log('PASS', name);
  };
  const seriesResponse = (expected) => page.waitForResponse((response) => {
    const url = new URL(response.url());
    if (url.pathname !== '/api/series') return false;
    return Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
  }, { timeout: 15000 });

  try {
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      tileRequests += 1;
      await route.abort('failed');
    });
    await page.goto(base);
    await page.getByTestId('select-region').waitFor();

    await check('OSM tile failure is visible and tile loading recovers', async () => {
      await page.getByTestId('status-tiles').getByText(/tile.*failed/i).waitFor({ timeout: 15000 });
      assert(tileRequests > 0, 'browser did not attempt any OSM tile requests');
      await page.unroute('https://tile.openstreetmap.org/**');
      await page.getByTestId('button-toggle-basemap').click();
      await page.getByTestId('button-toggle-basemap').click();
      await page.getByTestId('status-tiles').getByText(/Tiles loaded/i).waitFor({ timeout: 20000 });
    });

    await check('Uganda viewport preset flies the map to a new tile view', async () => {
      const tileSourcesBefore = await page.locator('.es-tiles img.leaflet-tile').evaluateAll((images) =>
        images.map((image) => image.getAttribute('src')).sort(),
      );
      await page.getByTestId('select-region').selectOption('uganda');
      await page.getByText(/Uganda viewport preset/i).waitFor();
      await page.waitForTimeout(1300);
      const tileSourcesAfter = await page.locator('.es-tiles img.leaflet-tile').evaluateAll((images) =>
        images.map((image) => image.getAttribute('src')).sort(),
      );
      assert.notDeepEqual(tileSourcesAfter, tileSourcesBefore, 'map tile coordinates did not change after fly-to');
      assert(tileSourcesAfter.length > 0);
    });

    await check('map point selection and clearing update the selection', async () => {
      const map = page.locator('.leaflet-container');
      const before = await page.getByTestId('text-point').innerText();
      await page.getByTestId('button-pick-point').click();
      await map.click({ position: { x: 180, y: 210 } });
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-testid="text-point"]')?.textContent ?? '';
        return text !== 'none' && text.length > 0;
      });
      assert.notEqual(await page.getByTestId('text-point').innerText(), before);
      assert.equal(await page.locator('.leaflet-interactive').count(), 1);
      await page.getByTestId('button-clear-point').click();
      assert.equal(await page.getByTestId('text-point').innerText(), 'none');
      assert.equal(await page.getByTestId('text-applied-point').innerText(), 'none');
      assert.equal(await page.locator('.leaflet-interactive').count(), 0);
    });

    await check('indicator and date changes send the real query parameters', async () => {
      await page.getByTestId('select-region').selectOption('global');
      const initial = seriesResponse({ indicator: 'precipitation', region: 'global' });
      await page.getByTestId('button-indicator-precipitation').focus();
      await page.getByTestId('button-indicator-precipitation').press('Enter');
      const firstResponse = await initial;
      assert.equal(firstResponse.status(), 200);
      let body = await firstResponse.json();
      assert.equal(body.status, 'not_connected');
      assert.deepEqual(body.observations, []);
      assert.equal(body.indicator, 'precipitation');

      const dates = { indicator: 'precipitation', region: 'global', start: '2016-02-01', end: '2020-11-30' };
      const dated = seriesResponse(dates);
      await page.getByTestId('input-series-start').fill(dates.start);
      await page.getByTestId('input-series-end').fill(dates.end);
      const dateResponse = await dated;
      assert.equal(dateResponse.status(), 200);
      body = await dateResponse.json();
      assert.equal(body.status, 'not_connected');
      assert.deepEqual(body.observations, []);
      assert.equal(body.start, dates.start);
      assert.equal(body.end, dates.end);

      const ugandaQuery = seriesResponse({ ...dates, region: 'uganda' });
      await page.getByTestId('select-region').selectOption('uganda');
      const ugandaResponse = await ugandaQuery;
      assert.equal(ugandaResponse.status(), 200);
      body = await ugandaResponse.json();
      assert.equal(body.region, 'uganda');
      assert.deepEqual(body.observations, []);
      console.log('SERIES QUERY EVIDENCE', JSON.stringify(seriesRequests.slice(-3)));
    });

    await check('simulated backend outage shows no fallback and Retry recovers', async () => {
      const fail = async (route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'TEST ONLY simulated series outage' }),
      });
      await page.route('**/api/series?**', fail);
      await page.getByTestId('button-indicator-forest-cover').click();
      await page.getByTestId('panel-error').waitFor({ timeout: 10000 });
      assert.equal(await page.getByText('Pending: no observations returned', { exact: true }).count(), 0);
      await page.unroute('**/api/series?**');
      const recovered = seriesResponse({ indicator: 'forest-cover', region: 'uganda' });
      await page.getByTestId('button-retry').click();
      const retryResponse = await recovered;
      assert.equal(retryResponse.status(), 200);
      const body = await retryResponse.json();
      assert.equal(body.status, 'not_connected');
      assert.deepEqual(body.observations, []);
      await page.getByText('Pending: no observations returned', { exact: true }).waitFor();
      assert.equal(await page.getByTestId('panel-error').count(), 0);
    });

    await check('API health outage is announced and manual retry recovers', async () => {
      await page.route('**/api/healthz', async (route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'TEST ONLY simulated backend outage' }),
      }));
      await page.getByTestId('status-health').click();
      await page.getByText('Unreachable - click to retry', { exact: true }).waitFor({ timeout: 10000 });
      await page.unroute('**/api/healthz');
      await page.getByTestId('status-health').click();
      await page.getByText(/ok · Ecoscope FastAPI/i).waitFor({ timeout: 10000 });
    });

    await check('mobile menu supports keyboard, navigation works, and no viewport overflows', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      const menu = page.getByTestId('button-menu');
      await menu.focus();
      await menu.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Navigation' });
      await dialog.waitFor();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');

      await menu.focus();
      await menu.press('Enter');
      const integrations = page.locator('[data-testid="link-nav-integrations"]:visible');
      await integrations.focus();
      await integrations.press('Enter');
      await page.waitForURL('**/sources');
      await menu.focus();
      await menu.press('Enter');
      const workspace = page.locator('[data-testid="link-nav-workspace"]:visible');
      await workspace.focus();
      await workspace.press('Enter');
      await page.waitForURL('http://localhost/');

      const widths = [360, 390, 768, 1024];
      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        assert(overflow.scrollWidth <= overflow.innerWidth, `${width}px viewport overflows: ${JSON.stringify(overflow)}`);
      }
      console.log('RESPONSIVE WIDTHS', widths.join(', '));
    });

    assert.deepEqual(pageErrors, []);
    await fs.mkdir('generated-artifacts', { recursive: true });
    await fs.writeFile('generated-artifacts/browser-controls-results.json', JSON.stringify({
      passed: results.length,
      results,
      pageErrors,
      tileRequests,
      seriesRequests,
    }, null, 2));
    console.log(JSON.stringify({ passed: results.length, results, pageErrors, tileRequests }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
