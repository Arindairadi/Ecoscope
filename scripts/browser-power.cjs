// Real browser regression checks. Synthetic route responses below are TEST ONLY.
// The live group uses the app's real API and independently compares NASA values.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const base = process.env.APP_URL || 'http://localhost:80';
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const results=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const check=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
  let live;
  let requests=0;
  page.on('request',r=>{if(r.url().includes('/api/power/monthly?')) requests++});
  const load = () => page.getByTestId('button-load-power').click();
  const downloadData = async () => {
    const event=page.waitForEvent('download');
    await page.getByTestId('button-download-power').click();
    const dl=await event;
    return JSON.parse(await fs.readFile(await dl.path(),'utf8'));
  };
  const fixture = (url, value=12) => {
    const p=new URL(url).searchParams;
    return {...live,source:'TEST ONLY browser fixture',source_version:'test-only',latitude:Number(p.get('latitude')),longitude:Number(p.get('longitude')),
      requested_start:p.get('start'),requested_end:p.get('end'),available_start:p.get('start'),available_end:p.get('end'),
      values:[{month:p.get('start'),value},{month:'2020-02',value:null},{month:'2020-03',value:0}],
      expected_months:3,valid_months:2,missing_months:1,completeness_percent:200/3,mean:value/2,minimum:0,maximum:value};
  };
  try {
    await page.goto(base);
    await page.getByTestId('select-point-preset').waitFor();
    await check('Ecoscope branding, browser metadata and accessible text',async()=>{
      assert.equal(await page.title(),'Ecoscope');
      for(const selector of ['meta[name="description"]','meta[property="og:title"]','meta[property="og:description"]','meta[name="twitter:title"]','meta[name="twitter:description"]']) {
        const value=await page.locator(selector).getAttribute('content');
        assert(value.includes('Ecoscope'));assert(!/earthscope/i.test(value));
      }
      assert(!/earthscope/i.test(await page.locator('body').innerText()));
      assert.match(await page.locator('aside:visible').innerText(),/Ecoscope/);
      assert.match(await page.locator('aside:visible').innerText(),/See the Planet\. Detect the Trends\. Understand the Change\./);
      const snapshot=await page.locator('body').ariaSnapshot();
      assert(!/earthscope/i.test(snapshot));
    });
    await check('no NASA fetch before explicit Load',async()=>assert.equal(requests,0));
    await check('live NASA request equals chart table, summaries and original source',async()=>{
      const response=page.waitForResponse(r=>r.url().includes('/api/power/monthly?')&&r.status()===200,{timeout:40000});
      await load();
      live=await (await response).json();
      assert.equal(live.status,'ok');
      await page.getByTestId('toggle-power-table').click();
      for(const row of live.values) {
        assert.match(await page.getByTestId(`row-power-${row.month}`).innerText(),new RegExp(row.value===null?'missing':row.value.toFixed(2)));
      }
      assert.equal(await page.getByTestId('stat-power-mean').innerText(),live.mean.toFixed(2));
      const rawResponse=await page.request.get(live.source_url,{timeout:40000});
      assert.equal(rawResponse.status(),200);
      const raw=await rawResponse.json();
      assert.deepEqual(raw.header.sources,['MERRA2']);
      assert.equal(raw.parameters.T2M.units,'C');
      for(const row of live.values) {
        const v=raw.properties.parameter.T2M[row.month.replace('-','')];
        assert.equal(row.value,v===raw.header.fill_value||v==null?null:v);
      }
      assert.equal(live.values.length,24);
      assert.equal(live.values[0].value,22.27);
      assert(!live.values.some(v=>v.month.endsWith('-13')));
      await page.getByTestId('chart-power').waitFor();
      console.log('LIVE EVIDENCE',JSON.stringify({source_url:live.source_url,retrieved_at:live.retrieved_at,first:live.values[0],months:live.valid_months,mean:live.mean,minimum:live.minimum,maximum:live.maximum}));
    });
    await check('chart tooltip and brush zoom respond to mouse',async()=>{
      const chart=page.getByTestId('chart-power');await chart.scrollIntoViewIfNeeded();
      const surface=chart.locator('.recharts-surface').first(); const box=await surface.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+80);
      await page.locator('.recharts-tooltip-wrapper').waitFor({state:'visible'});
      assert.match(await page.locator('.recharts-tooltip-wrapper').innerText(),/°C/);
      const line=chart.locator('.recharts-line-curve');
      const before=await line.getAttribute('d');
      const brush=chart.locator('.recharts-brush-traveller').first();
      const b=await brush.boundingBox();
      await page.mouse.move(b.x+4,b.y+5);await page.mouse.down();await page.mouse.move(b.x+80,b.y+5,{steps:10});await page.mouse.up();
      assert.notEqual(await line.getAttribute('d'),before);
    });
    await check('download equals exact applied response and causes no fetch',async()=>{
      const before=requests;assert.deepEqual(await downloadData(),live);assert.equal(requests,before);
    });
    await check('edits do not fetch, invalid input hides data, clearing clears applied result',async()=>{
      const before=requests;
      await page.getByTestId('input-latitude').fill('10');
      await page.getByTestId('text-pending-selection').waitFor();
      assert.match(await page.getByTestId('text-applied-point').innerText(),/0.3476/);
      assert.equal(requests,before);
      await page.getByTestId('input-latitude').fill('91');
      await page.getByTestId('text-power-validation').waitFor();
      assert.equal(await page.getByTestId('chart-power').count(),0);
      assert(await page.getByTestId('button-load-power').isDisabled());
      await page.getByTestId('button-clear-point').click();
      assert.equal(await page.getByTestId('text-applied-point').innerText(),'none');
      await page.getByTestId('select-point-preset').selectOption('kampala');
    });
    await check('TEST ONLY upstream 502/503/504, no fallback and successful Retry',async()=>{
      for(const status of [502,503,504]) {
        await page.route('**/api/power/monthly?**',r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify({detail:`TEST ONLY ${status} failure`})}));
        await page.getByTestId('input-latitude').fill(String(status/10-45));
        await load();await page.getByTestId('panel-error').waitFor();
        assert.equal(await page.getByTestId('chart-power').count(),0);
        await page.unroute('**/api/power/monthly?**');
        await page.route('**/api/power/monthly?**',r=>r.fulfill({json:fixture(r.request().url())}));
        await page.getByTestId('button-retry').click();
        await page.getByTestId('chart-power').waitFor();
        await page.unroute('**/api/power/monthly?**');
      }
    });
    await check('TEST ONLY gaps stay missing and real zero remains zero',async()=>{
      await page.route('**/api/power/monthly?**',r=>r.fulfill({json:fixture(r.request().url())}));
      await page.getByTestId('input-latitude').fill('11');await load();
      await page.getByTestId('chart-power').waitFor();
      await page.getByTestId('toggle-power-table').click();
      assert.match(await page.getByTestId('row-power-2020-02').innerText(),/missing/);
      assert.match(await page.getByTestId('row-power-2020-03').innerText(),/0.00/);
      const path=await page.locator('[data-testid="chart-power"] .recharts-line-curve').getAttribute('d');
      assert.equal((path.match(/M/g)||[]).length,2);
      await page.unroute('**/api/power/monthly?**');
    });
    await check('TEST ONLY delayed old request cannot overwrite newer coordinates/dates',async()=>{
      await page.route('**/api/power/monthly?**',async r=>{
        const lat=Number(new URL(r.request().url()).searchParams.get('latitude'));
        if(lat===15) await new Promise(resolve=>setTimeout(resolve,1200));
        try{await r.fulfill({json:fixture(r.request().url(),lat)})}catch{/* older request can be aborted */}
      });
      await page.getByTestId('input-latitude').fill('15');await load();
      await page.getByTestId('input-latitude').fill('20');
      await page.getByTestId('input-end').fill('2020-03');await load();
      await page.getByTestId('chart-power').waitFor();
      await page.waitForTimeout(1500);
      const result=await downloadData();
      assert.equal(result.latitude,20);assert.equal(result.requested_end,'2020-03');assert.equal(result.values[0].value,20);
      await page.unroute('**/api/power/monthly?**');
    });
    await check('TEST ONLY no-data response is empty, not a fabricated zero series',async()=>{
      await page.route('**/api/power/monthly?**',r=>r.fulfill({json:{...fixture(r.request().url()),status:'no_data',message:'TEST ONLY unavailable months',values:[{month:'2020-01',value:null}],valid_months:0,mean:null,minimum:null,maximum:null}}));
      await page.getByTestId('input-latitude').fill('21');await load();
      await page.getByText('No data for this request',{exact:true}).waitFor();
      assert.equal(await page.getByTestId('chart-power').count(),0);
      await page.unroute('**/api/power/monthly?**');
    });
    await check('post-integration map, point clear, themes and mobile navigation',async()=>{
      await page.getByTestId('select-region').selectOption('uganda');await page.waitForTimeout(1100);
      const map=page.locator('.leaflet-container');
      const before=await page.locator('.leaflet-tile-pane').innerHTML();
      await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(500);
      assert.notEqual(await page.locator('.leaflet-tile-pane').innerHTML(),before);
      const box=await map.boundingBox();const pane=page.locator('.leaflet-map-pane');const style=await pane.getAttribute('style');
      await page.mouse.move(box.x+200,box.y+250);await page.mouse.down();await page.mouse.move(box.x+270,box.y+280,{steps:12});await page.mouse.up();await page.waitForTimeout(400);
      assert.notEqual(await pane.getAttribute('style'),style);
      await page.getByTestId('button-pick-point').click();await map.click({position:{x:180,y:210}});
      const lng=Number(await page.getByTestId('input-longitude').inputValue());assert(lng>=-180&&lng<=180);
      await page.getByTestId('button-clear-point').click();
      assert.equal(await page.getByTestId('text-applied-point').innerText(),'none');
      await page.getByTestId('button-toggle-basemap').click();assert.equal(await page.locator('.es-tiles').count(),0);
      await page.getByTestId('button-toggle-basemap').click();await page.locator('.es-tiles').waitFor({state:'attached'});
      await page.getByTestId('button-theme').click();assert.equal(await page.locator('html').getAttribute('class'),'dark');
      await page.reload();assert.equal(await page.locator('html').getAttribute('class'),'dark');
      await page.setViewportSize({width:390,height:844});
      assert.match(await page.locator('body').innerText(),/Ecoscope/);
      await page.getByTestId('button-menu').click();
      await page.locator('[data-testid="link-nav-integrations"]:visible').click();await page.waitForURL('**/sources');
      await page.getByTestId('button-menu').click();await page.locator('[data-testid="link-nav-roadmap"]:visible').click();await page.waitForURL('**/roadmap');
      await page.getByTestId('button-menu').click();await page.locator('[data-testid="link-nav-workspace"]:visible').click();
      await page.getByTestId('select-point-preset').selectOption('gulu');assert.equal(await page.getByTestId('input-latitude').inputValue(),'2.7746');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    });
    await fs.mkdir('generated-artifacts',{recursive:true});
    await check('mobile live-data layout and dark/light controls with provenance',async()=>{
      await page.getByTestId('select-point-preset').selectOption('kampala');
      await load();await page.getByTestId('chart-power').waitFor();
      await page.getByTestId('panel-power-provenance').waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'generated-artifacts/power-mobile-dark.png',fullPage:true});
      await page.getByTestId('button-menu').click();
      await page.locator('[data-testid="button-theme"]:visible').click();
      assert.equal(await page.locator('html').getAttribute('class'),'');
      await page.getByTestId('button-close-menu').click();
      await page.setViewportSize({width:1440,height:1100});
      await page.getByTestId('chart-power').scrollIntoViewIfNeeded();
      await page.screenshot({path:'generated-artifacts/power-chart-desktop.png'});
    });
    assert.deepEqual(errors,[]);
    await fs.writeFile('generated-artifacts/browser-power-results.json',JSON.stringify({results,errors,live},null,2));
    console.log(JSON.stringify({passed:results.length,results,pageErrors:errors}));
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
