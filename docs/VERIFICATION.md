# Verification history

## Product rename to Ecoscope — 2026-11-14

- Updated desktop/mobile branding, browser title, description, Open Graph/Twitter metadata, API display names, project documentation and the Replit artifact display title to **Ecoscope**. Preserved the full tagline.
- Kept package names, directory paths, artifact IDs, routes, API field names and workflow identifiers unchanged. The source-specific JSON export has no old product branding and its data format is unchanged.
- Reran **54 backend tests**, the full workspace TypeScript check and the frontend production build: passed. Existing deprecation, sourcemap and bundle-size warnings remain non-blocking.
- Reran the browser integration suite: **12 groups passed**, no page errors. Added assertions for the exact browser title, product metadata, visible branding and accessible text; also exercised mobile branding and the existing real NASA chart/download flow.
- Rechecked all 24 displayed Kampala months against a fresh NASA response; the app retrieval timestamp for this run was **2026-11-14T07:51:40.997547Z**.
- Screenshot confirmed the updated visible brand and FastAPI service label. Remaining old-name matches are compatibility identifiers/paths and negative regression assertions, not visible product branding.
- Workspace-level project-name editing is a separate Replit UI action: click the app name and change it to **Ecoscope**. Only the artifact display title was changed programmatically. Nothing was published.

## Latest increment — NASA POWER monthly T2M, 2026-11-14

**The Phase 1 results below are historical. This section supersedes their “not connected” and browser-test limitations for this one NASA POWER increment.**

### Completed checks and observed outcomes

| Check actually run | Result |
|---|---|
| Before integration: real-browser foundation checks | **9 groups passed**: Uganda viewport preset, zoom, drag/pan, point selection/clear, basemap toggle, theme persistence, navigation, injected series outage/retry, mobile controls/no overflow |
| Final maintained foundation browser suite | **9 groups passed**, no browser page errors |
| Final NASA POWER browser suite | **11 groups passed**, no browser page errors |
| Python backend/API tests | **54 passed**, one Starlette test-client deprecation warning |
| Full workspace TypeScript check | **Passed** |
| Frontend check after the final mobile fix | **Passed** |
| Vite production build, including final mobile fix | **Passed**, exit 0; non-blocking sourcemap diagnostic and large-chunk warning |
| API production build | **Passed**: frozen Python dependency sync and Python compilation |
| Managed development workflows | Frontend and real FastAPI services running; startup and browser/API requests succeeded |
| Current scientific integration | Only NASA POWER monthly T2M point retrieval enabled; remaining sources and database pending |
| Publishing / paid services | **Not performed / not purchased** |

The final browser suite exercised actual controls for chart tooltip and brush zoom, desktop/mobile navigation, point/map controls, theme persistence, mobile loaded-data layout, invalid input hiding previous data, explicit loading, source error/retry handling, a delayed-old-versus-new request race, no-data results, missing gaps and genuine zero values, and dataset download equality. Gaps/errors/race tests intercepted browser requests with **clearly test-only** fixtures. These are not evidence of real NASA outages or environmental values.

### Actual live scientific comparison

Point: **Kampala, Uganda, latitude 0.3476, longitude 32.5825** — a single grid estimate, **not Uganda's average**.

Requested and valid coverage: **2020-01 through 2021-12**, 24/24 months, 100% complete.

- Browser-called app endpoint: `/api/power/monthly?latitude=0.3476&longitude=32.5825&start=2020-01&end=2021-12`.
- Original [NASA request](https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M&community=AG&latitude=0.3476&longitude=32.5825&start=2020&end=2021&format=JSON) returned HTTP 200.
- Retrieved by the app **2026-11-14T07:44:55.676172Z**, preserved on cached responses.
- Source header: **MERRA2**, API **v2.10.0**, T2M native units **C**, fill sentinel −999.
- Every displayed table value was compared against a fresh direct NASA response, not merely against our backend.
- January 2020 **22.27°C**, February **23.16°C**, March **22.42°C**.
- Equal-month-weight mean **21.950416666666666°C** (UI 21.95°C), minimum **20.06°C**, maximum **23.17°C**.
- Source annual entries (`202013`, `202113`) were not included in the 24 monthly values.
- Downloaded JSON exactly matched the displayed API result and generated no new source request.

Live values are MERRA-2 **reanalysis/modelled estimates**, not direct station observations or forecasts. NASA can revise archives; these numbers document this check, not immutable reference constants.

### Defects and test-harness corrections

- The expanded mobile test found that the original header menu toggle was covered by the open drawer overlay. Added a dedicated close button inside the drawer and Escape handling; the close button was exercised successfully afterward.
- Added map longitude wrapping and coordinate bounds for global point selection.
- No-data results now retain provenance/completeness details without drawing a fake series. Error responses suppress old cached result downloads instead of offering a silent fallback.
- Early browser attempts required an explicit provisioned Chromium executable and corrected selectors for Leaflet's actual layer class and hidden desktop/mobile duplicate navigation. Those failed harness attempts were corrected; **they were not reported as passing tests**.
- The old Phase 1 empty-state test was scoped to the pending-indicator panel after the NASA panel introduced a second empty state.

### Reproduce

```sh
python -m pytest backend/tests -q
pnpm run typecheck
PORT=23026 BASE_PATH=/ pnpm --filter @workspace/earthscope run build
pnpm --filter @workspace/api-server run build
node scripts/browser-foundation.cjs
node scripts/browser-power.cjs
```

The explicit build port/base values above match the current artifact configuration; managed workflows supply them automatically. Browser scripts require Playwright and a compatible Chromium. They default to `require("playwright")` and its default executable; when using a provisioned environment, set `PLAYWRIGHT_MODULE` to the installed module and `CHROMIUM_PATH` to the provisioned executable. This run used `/mnt/pid2/node_modules/playwright` and the provisioned Chromium 1248. Screenshots and machine-readable results are under ignored `generated-artifacts/`, not app data or committed scientific fixtures.

### Remaining limits / warnings

- No blocking runtime error observed in the completed checks.
- Starlette warns that the current `httpx` TestClient support is deprecated in favor of `httpx2`.
- Production Vite build emits a sourcemap-location diagnostic from the existing tooltip scaffold and warns about a roughly 931KB minified JavaScript chunk; it still exits successfully. Bundle splitting remains optimization work, not a hidden failed build.
- A production **build** is not a production deployment. No published-domain routing or production startup test was performed.
- In-memory cache/rate controls are per process, not a distributed service. No persistent storage, saved analyses, Supabase/PostGIS, GitHub authorization or GitHub push has been verified.
- Other scientific sources, national aggregation, validated trend methods, LLM explanations and reproducible multi-source reports remain pending.
- Passing browser groups are scoped regression checks, not an exhaustive cross-browser/accessibility audit. Escape handling was implemented; the dedicated close button was the closure path exercised in the recorded final mobile test.

## Historical Phase 1 verification — 2026-11-14

## Actual outcomes

| Check | Result | Evidence / scope |
|---|---|---|
| Managed FastAPI workflow | PASS | Uvicorn started on the assigned port; application startup completed |
| Managed frontend workflow | PASS | Vite started successfully; live development preview rendered |
| Python API/unit suite | PASS | `python -m pytest backend/tests -q`: **15 passed**, one library deprecation warning |
| Full TypeScript check | PASS | `pnpm run typecheck`: shared libraries, API scaffold, scientific dashboard, scripts and sandbox passed |
| Final frontend typecheck after UI fixes | PASS | `pnpm --filter @workspace/earthscope run typecheck` exited successfully |
| Live proxied health request | PASS | `/api/healthz` returned HTTP 200, `status: ok`, then-current FastAPI service name, UTC timestamp |
| Live Uganda query | PASS | Valid region/indicator/date selection returned HTTP 200, `not_connected`, `observations: []`, target unit `°C` |
| Live foundation request | PASS | HTTP 200; database and scientific data `not_connected`; OSM `basemap_only` |
| Browser-to-backend connectivity | PASS | Rendered UI displayed fetched catalogs, live FastAPI health and empty result message; workflow logs recorded browser GET requests to all five API endpoints returning 200 |
| Desktop initial render | PASS | 1440×1050 screenshot showed global basemap, attribution, controls, live health and honest empty scientific view |
| Mobile responsive render | PASS | 390×844 viewport plus full-page screenshot showed single-column controls, map with attribution, blank statistics and foundation status without visible horizontal overflow |
| Source catalog route | PASS | `/sources` rendered at 1440×1000 with real backend integration statuses; no fake connect buttons |
| Basemap tile loading | PASS at capture time | OSM tiles visibly rendered and UI reported loaded tiles; not a guarantee of future provider availability |
| Browser console at capture | PASS | No application error in captured browser logs; Vite connection and React development notice only |
| Scientific package imports | PASS | Pandas 3.1.1, NumPy 2.5.4, scikit-learn 1.9.1, Xarray 2026.9.0, GeoPandas 1.2.0 |
| Local Git | PRESENT | Existing initialized working tree on `main`; no Git remotes configured |
| GitHub authorization | NOT CONNECTED | No connected GitHub integration found; no remote or repository push verified |
| Public publishing | NOT PERFORMED | Development preview only; no public publishing operation initiated |

The API suite checks health/timestamps, honest integration status, Uganda catalog presence, indicator metadata, empty scientific results, invalid region/indicator/date and future-date rejection, missing parameters, scientific imports, explicit failure for unimplemented trends, and basic contract/runtime consistency.

## Warnings and limits

- The test suite reported a Starlette warning that `httpx` TestClient support is deprecated in favor of `httpx2`. Tests passed; migrate the test transport when appropriate.
- `git diff --check` flagged extra blank lines at EOF in three generated Orval files. This is a generated whitespace warning, not a failed TypeScript/runtime check; generated files were not hand-edited to hide it.
- API logs include 404 responses to generic `/` probes. The API intentionally serves `/api/*`; the frontend owns `/`. Health checks at `/api/healthz` passed.
- Screenshots are render checks, not interactive end-to-end tests. Automated click/drag tests of map panning, preset selection, point selection, date editing, mobile menu, retry controls and theme toggle were **not run**. Their event handlers and data flow are implemented, but these interactions are not claimed as browser-tested.
- Dark-mode styling and toggle are implemented and typechecked, but a dark-mode screenshot was **not** captured.
- Error and loading UI exists, and invalid API inputs were tested; browser network failure injection was not performed.
- The conditional Recharts view is installed but remains intentionally unrendered without real observations. No synthetic scientific series was generated to make a chart appear.
- No authentic environmental observations, source API integration, database connection, trend model, evidence-grounded AI output, export or reproducible report was validated. Those are subsequent phases.
- Production build/publishing, production routing and real GitHub synchronization were not exercised.

## Foundation gate and next actions

Core environment, running services, live frontend/backend requests, API validation, scientific dependencies and responsive initial rendering passed. There is no credential blocker for the Phase 1 preview.

Before Phase 2, investigate one authentic no-key candidate and verify its current API/license constraints. Before broader team use, the owner must authorize GitHub, confirm the canonical repository and invite teammates using the documented least-privilege workflow. Before production use, complete interactive browser regression checks and published-environment verification.
