// Real-browser E2E. Route interception is exclusively TEST ONLY failure/race data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 const errors=[],results=[],evidence={};
 page.on('pageerror',e=>errors.push(e.message));
 const test=async(name,fn)=>{await fn();results.push(name);console.log('PASS',name)};
 const get=id=>page.getByTestId(id);
 const download=async(id)=>{const event=page.waitForEvent('download');await get(id).click();const d=await event;return fs.readFile(await d.path(),'utf8')};
 const run=async()=>{const r=page.waitForResponse(r=>r.url().endsWith('/api/research/run'),{timeout:65000});await get('button-run-research').click();const response=await r;assert.equal(response.status(),200,await response.text());await get('panel-research-results').waitFor();return response.json()};
 let rain;
 try{
  await page.goto('http://localhost:80/research');
  await test('live rainfall analysis, 30-year SPI baseline and matched second-location comparison',async()=>{
   await get('select-research-indicator').selectOption('PRECTOTCORR');
   await get('checkbox-compare').check();
   rain=await run();
   assert.equal(rain.dataset.valid_count,420);assert.equal(rain.analysis.complete_years,35);
   assert.equal(rain.dataset.unit,'mm/day');assert.equal(rain.analysis.spi.status,'computed');
   assert.equal(rain.comparison.matched_count,420);
   assert(rain.analysis.anomalies.some(v=>v.spi3!==null));
   await get('panel-comparison-stats').waitFor();
   assert.match(await get('text-method-estimate-ols').innerText(),new RegExp(rain.analysis.ols.estimate.toFixed(4).replace('.','\\.')));
   const original=await page.request.get(rain.dataset.source_url,{timeout:45000});assert.equal(original.status(),200);
   const raw=await original.json();assert.equal(raw.parameters.PRECTOTCORR.units,'mm/day');
   for(const row of rain.dataset.values){
    const v=raw.properties.parameter.PRECTOTCORR[row.period.replace('-','')];
    assert.equal(row.value,v==null||v===raw.header.fill_value?null:v);
   }
   evidence.rainfall={first:rain.dataset.values[0],months:rain.dataset.valid_count,slope:rain.analysis.ols.estimate,spi:rain.analysis.spi.estimate,sha256:rain.dataset.fingerprint,retrieved_at:rain.dataset.retrieved_at};
  });
  await test('raw/anomaly/z-score/SPI/annual/seasonal chart views and SVG image export',async()=>{
   for(const view of ['anomaly','zscore','spi3','annual','seasonal','raw']){await get(`tab-view-${view}`).click();assert.equal(await get(`tab-view-${view}`).getAttribute('aria-selected'),'true');assert(await get('chart-research').locator('svg').count()>0)}
   const svg=await download('button-export-chart');assert(svg.includes('<svg'));assert(!/<script|foreignObject/.test(svg));
  });
  await test('actual CSV, dataset JSON, reproducible comparison bundle and printable report downloads',async()=>{
   const csv=await download('button-export-csv');assert(csv.includes(rain.dataset.fingerprint));assert(csv.includes('1990-01,3.73'));
   const json=JSON.parse(await download('button-export-json'));assert.deepEqual(json.dataset.values,rain.dataset.values);
   const bundle=JSON.parse(await download('button-export-bundle'));assert.deepEqual(bundle.result.comparison.values,rain.comparison.values);
   assert.equal(bundle.request.baseline_start,1991);
   const report=await download('button-export-report');assert(report.includes('Ecoscope'));assert(report.includes(rain.dataset.fingerprint));assert(report.includes('Method'));assert(report.includes('Matched comparison'));assert(!/<script/i.test(report));
  });
  await test('deterministic evidence answer and explicit causal-question refusal',async()=>{
   await get('input-research-question').fill('What does the trend show?');
   let r=page.waitForResponse(r=>r.url().endsWith('/api/research/run'));
   await get('button-ask-research').click();assert.equal((await r).status(),200);
   await get('text-research-answer').waitFor();assert((await get('text-research-answer').innerText()).includes(rain.dataset.fingerprint.slice(0,12)));
   await get('input-research-question').fill('Why did humans cause this?');
   r=page.waitForResponse(r=>r.url().endsWith('/api/research/run'));await get('button-ask-research').click();await r;
   await page.waitForFunction(()=>document.querySelector('[data-testid="text-research-answer"]')?.textContent.startsWith('Unsupported:'));
  });
  await test('local selection create, reload persistence, load and delete without server writes',async()=>{
   await get('input-selection-name').fill('TEST ONLY local rainfall research');
   await get('button-save-selection').click();
   const option=await get('select-saved-selection').locator('option').allTextContents();
   assert(option.some(v=>v.includes('TEST ONLY local rainfall research')));
   await page.reload();
   await get('select-saved-selection').selectOption({label:'TEST ONLY local rainfall research · power/PRECTOTCORR'});
   await get('button-load-selection').click();
   assert.equal(await get('select-research-indicator').inputValue(),'PRECTOTCORR');
   assert.equal(await get('input-research-start').inputValue(),'1990-01');
   assert(await get('checkbox-compare').isChecked());
   page.once('dialog',dialog=>dialog.accept());
   await get('button-delete-selection').click();
   await page.waitForFunction(()=>![...document.querySelectorAll('[data-testid="select-saved-selection"] option')].some(v=>v.textContent.includes('TEST ONLY local rainfall research')));
  });
  await test('TEST ONLY corrupt saved research and unsafe export strings are handled safely',async()=>{
   const safety=await page.evaluate(async fixture=>{
    const helpers=await import('/src/lib/research-export.ts');
    const data=structuredClone(fixture);data.dataset.label='=TEST_ONLY()<script>alert(1)</script>';
    const csv=helpers.datasetCsv(data.dataset);
    const html=helpers.reportHtml({selection:data.dataset.selection,baseline_start:1991,baseline_end:2020},data);
    return {csv,html};
   },rain);
   assert(safety.csv.includes("'=TEST_ONLY()"));assert(!safety.html.includes('<script>'));assert(safety.html.includes('&lt;script&gt;'));
   await page.evaluate(()=>localStorage.setItem('ecoscope.research.selections.v1','TEST ONLY invalid JSON'));
   await page.reload();await get('text-store-warning').waitFor();assert.match(await get('text-store-warning').innerText(),/corrupt/i);
   await page.evaluate(()=>localStorage.removeItem('ecoscope.research.selections.v1'));
   await get('input-import-selections').setInputFiles({name:'invalid-test-only.json',mimeType:'application/json',buffer:Buffer.from('{"items":[{"name":"TEST ONLY incomplete"}]}')});
   await get('text-store-warning').waitFor();
  });
  await test('live location/date changes update correct series and no short-baseline SPI is invented',async()=>{
   await get('checkbox-compare').uncheck();
   await get('select-research-preset').selectOption('gulu');
   await get('input-research-start').fill('2010-01');await get('input-research-end').fill('2021-12');
   await get('input-baseline-start').fill('2010');await get('input-baseline-end').fill('2019');
   const r=await run();assert.equal(r.dataset.selection.latitude,2.7724);assert.equal(r.dataset.values.length,144);
   assert.equal(r.analysis.spi.status,'insufficient_data');assert(r.analysis.anomalies.every(v=>v.spi3===null));
  });
  await test('live independent NOAA CO₂ matches the official CSV and rejects point comparison',async()=>{
   await get('select-research-source').selectOption('noaa');
   const r=await run();assert.equal(r.dataset.spatial_scope,'global_marine_surface');assert.equal(r.dataset.unit,'ppm');assert(await get('checkbox-compare').isDisabled());
   const response=await page.request.get(r.dataset.source_url);assert.equal(response.status(),200);
   const rows=(await response.text()).split(/\r?\n/).filter(l=>l&&!l.startsWith('#'));const cols=rows[0].split(',');
   const raw=Object.fromEntries(rows.slice(1).filter(Boolean).map(l=>{const v=l.split(',');return [`${v[0]}-${v[1].padStart(2,'0')}`,Number(v[cols.indexOf('average')])] }));
   for(const v of r.dataset.values)assert.equal(v.value,raw[v.period]<0?null:raw[v.period]??null);
   evidence.noaa={first:r.dataset.values[0],months:r.dataset.valid_count,sha256:r.dataset.fingerprint};
  });
  await test('input errors block requests and TEST ONLY upstream outage has a working Retry',async()=>{
   await get('select-research-source').selectOption('power');
   await get('input-research-latitude').fill('91');assert(await get('button-run-research').isDisabled());
   await get('input-research-latitude').fill('0.3476');
   await page.route('**/api/research/run',r=>r.fulfill({status:503,json:{detail:'TEST ONLY source unavailable'}}));
   await get('button-run-research').click();await get('panel-error').waitFor();
   assert.equal(await get('chart-research').count(),0);
   await page.unroute('**/api/research/run');
   const r=page.waitForResponse(r=>r.url().endsWith('/api/research/run'));await get('button-retry').click();assert.equal((await r).status(),200);
   await get('chart-research').waitFor();
  });
  await test('live capabilities, real NDVI imagery and side-by-side dates',async()=>{
   await page.goto('http://localhost:80/explorer');
   await get('select-explorer-layer').waitFor({timeout:45000});
   await get('select-explorer-layer').selectOption('MODIS_Terra_L3_NDVI_Monthly');
   await get('input-explorer-date').fill('2020-01-01');
   await get('checkbox-explorer-compare').check();await get('input-explorer-date-b').fill('2021-01-01');
   await get('map-explorer-b').waitFor();
   const image=get('map-explorer-a').locator('img[src*="gibs.earthdata.nasa.gov"]').first();
   await image.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('img[src*="gibs.earthdata.nasa.gov"]')].some(i=>i.complete&&i.naturalWidth>0),null,{timeout:40000});
   assert.match(await get('text-layer-caveat').innerText(),/not downloadable numeric NDVI/);
  });
  await test('live public FIRMS hotspots, exact coordinates and downloads; optional VIIRS honestly blocked',async()=>{
   await get('select-fire-preset').selectOption('central_africa');
   const event=page.waitForResponse(r=>r.url().endsWith('/api/research/fires'),{timeout:45000});
   await get('button-load-fires').click();const response=await event;assert.equal(response.status(),200);const d=await response.json();
   await get('map-fire-detections').waitFor();assert(d.returned_count>0);
   assert.equal(await get('map-fire-detections').locator('path.leaflet-interactive').count(),d.returned_count+1);
   const json=JSON.parse(await download('button-export-fires-json'));assert.deepEqual(json.dataset.features,d.features);
   const csv=await download('button-export-fires');assert(csv.includes(String(d.features[0].latitude)));
   evidence.fire={count_in_bbox:d.count_in_bbox,returned_count:d.returned_count,first:d.features[0],retrieved_at:d.retrieved_at};
   await get('select-fire-source').selectOption('firms_viirs');const blocked=page.waitForResponse(r=>r.url().endsWith('/api/research/fires'));
   await get('button-load-fires').click();assert.equal((await blocked).status(),503);await get('panel-error').waitFor();
   assert.match(await get('panel-error').innerText(),/FIRMS_MAP_KEY/);
  });
  await test('connector statuses and mobile research/theme/navigation without horizontal overflow',async()=>{
   await page.goto('http://localhost:80/sources');await get('row-connector-supabase').waitFor();assert.match(await get('row-connector-supabase').innerText(),/credentials[ _]missing/i);
   await page.setViewportSize({width:390,height:844});await get('button-menu').click();
   await page.locator('[data-testid="link-nav-research"]:visible').click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await get('select-research-indicator').selectOption('PRECTOTCORR');
   await get('button-run-research').click();await get('panel-research-results').waitFor({timeout:45000});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await get('button-menu').click();await page.locator('[data-testid="button-theme"]:visible').click();await get('button-close-menu').click();
   await fs.mkdir('generated-artifacts',{recursive:true});
   await page.screenshot({path:'generated-artifacts/research-mobile.png',fullPage:true});
  });
  assert.deepEqual(errors,[]);
  await fs.writeFile('generated-artifacts/browser-research-results.json',JSON.stringify({results,evidence,pageErrors:errors},null,2));
  console.log(JSON.stringify({passed:results.length,evidence,pageErrors:errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
