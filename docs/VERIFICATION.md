# Phase 1 verification — 2026-11-14

## Actual outcomes

| Check | Result | Evidence / scope |
|---|---|---|
| Managed FastAPI workflow | PASS | Uvicorn started on the assigned port; application startup completed |
| Managed frontend workflow | PASS | Vite started successfully; live EARTHSCOPE development preview rendered |
| Python API/unit suite | PASS | `python -m pytest backend/tests -q`: **15 passed**, one library deprecation warning |
| Full TypeScript check | PASS | `pnpm run typecheck`: shared libraries, API scaffold, EARTHSCOPE, scripts and sandbox passed |
| Final frontend typecheck after UI fixes | PASS | `pnpm --filter @workspace/earthscope run typecheck` exited successfully |
| Live proxied health request | PASS | `/api/healthz` returned HTTP 200, `status: ok`, service `EARTHSCOPE FastAPI`, UTC timestamp |
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
