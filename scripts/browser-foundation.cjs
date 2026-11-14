// Real browser checks; run against the development proxy, no app test bypass.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const results = [];
  const check = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };
  try {
    await page.goto('http://localhost:80/');
    await page.getByTestId('select-region').waitFor();
    await check('preset Uganda and map fly-to', async () => {
      await page.getByTestId('select-region').selectOption('uganda');
      await page.waitForTimeout(1300);
      assert.match(await page.locator('body').innerText(), /Uganda viewport preset/);
      assert.equal(await page.getByTestId('select-region').inputValue(), 'uganda');
    });
    const map = page.locator('.leaflet-container');
    await check('zoom button changes map tile zoom', async () => {
      const before = await page.locator('.leaflet-tile-pane').innerHTML();
      await page.locator('.leaflet-control-zoom-in').click();
      await page.waitForTimeout(700);
      assert.notEqual(await page.locator('.leaflet-tile-pane').innerHTML(), before);
    });
    await check('drag pans map', async () => {
      const box = await map.boundingBox();
      const pane = page.locator('.leaflet-map-pane');
      const before = await pane.getAttribute('style');
      await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
      await page.mouse.down(); await page.mouse.move(box.x + box.width/2+110, box.y + box.height/2+50, {steps:12}); await page.mouse.up();
      await page.waitForTimeout(500);
      assert.notEqual(await pane.getAttribute('style'), before);
    });
    await check('point selection and clear', async () => {
      const previous = await page.getByTestId('text-point').innerText();
      await page.getByTestId('button-pick-point').click();
      await map.click({position:{x:180,y:210}});
      await page.getByTestId('text-point').waitFor();
      assert.notEqual(await page.getByTestId('text-point').innerText(), previous);
      assert.equal(await page.locator('.leaflet-interactive').count(),1);
      await page.getByTestId('button-clear-point').click();
      assert.equal(await page.locator('.leaflet-interactive').count(),0);
    });
    await check('basemap off and on', async () => {
      await page.getByTestId('button-toggle-basemap').click();
      assert.equal(await page.locator('.es-tiles').count(),0);
      await page.getByTestId('button-toggle-basemap').click();
      await page.locator('.es-tiles').waitFor({state:'attached'});
    });
    await check('theme toggle and persistence', async () => {
      await page.getByTestId('button-theme').click();
      assert.equal(await page.locator('html').getAttribute('class'),'dark');
      await page.reload();
      assert.equal(await page.locator('html').getAttribute('class'),'dark');
      await page.getByTestId('button-theme').click();
    });
    await check('navigation and return', async () => {
      await page.getByTestId('link-nav-integrations').click();
      await page.waitForURL('**/sources');
      await page.getByText('NASA POWER',{exact:true}).waitFor();
      await page.getByTestId('link-nav-roadmap').click();
      await page.waitForURL('**/roadmap');
      await page.getByTestId('link-nav-workspace').click();
      await page.waitForURL('http://localhost/');
    });
    await check('series network failure and retry', async () => {
      await page.getByTestId('button-indicator-precipitation').click();
      await page.route('**/api/series?**', r=>r.fulfill({status:503,contentType:'application/json',body:'{"detail":"TEST ONLY simulated outage"}'}));
      await page.getByTestId('input-series-start').fill('2016-01-01');
      await page.getByTestId('panel-error').waitFor();
      await page.unroute('**/api/series?**');
      await page.getByTestId('button-retry').click();
      await page.getByText('Pending: no observations returned', {exact:true}).waitFor();
      assert.equal(await page.getByTestId('panel-error').count(), 0);
    });
    await check('mobile menu, navigation, controls and no overflow', async () => {
      await page.setViewportSize({width:390,height:844});
      await page.getByTestId('button-menu').click();
      await page.locator('[data-testid="link-nav-integrations"]:visible').click();
      await page.waitForURL('**/sources');
      await page.getByTestId('button-menu').click();
      await page.locator('[data-testid="link-nav-workspace"]:visible').click();
      await page.getByTestId('select-region').selectOption('uganda');
      await page.getByTestId('button-toggle-basemap').scrollIntoViewIfNeeded();
      await page.getByTestId('button-toggle-basemap').click();
      assert.equal(await page.locator('.es-tiles').count(),0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    });
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:results.length,results,pageErrors:errors}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
