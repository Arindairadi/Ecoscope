# Development phases

## Phase 1 — Connected foundation

Deliverables: runnable React/FastAPI services; responsive dark/light dashboard; attributed interactive global basemap; Uganda/geographic selection; indicator/date controls; explicit loading/error/empty states; real health/catalog/empty-series responses; scientific dependency import checks; setup, team and publishing documentation.

Actual acceptance evidence is recorded separately in `VERIFICATION.md`. A UI badge is not proof of test completion. No scientific data is connected in this phase.

## Phase 2 — Authentic sources, incrementally (first increment implemented)

NASA POWER monthly T2M point/grid retrieval is implemented in this increment. Official access, metadata, licensing/attribution and resolution findings are in `NASA_POWER.md`. Browser interactions were exercised before integration; final parser/API/browser/build results are recorded in the latest `VERIFICATION.md` section. This does not complete Phase 2 as a whole: all other sources and database persistence remain pending.

The first no-key NASA POWER T2M vertical slice has passed the checks recorded in `VERIFICATION.md`. For every additional source, research official documentation and verify current authentication, API limits, costs, licensing and attribution before enabling it.

| Source | Investigation gate |
|---|---|
| NASA POWER | **T2M monthly point slice verified**; any additional parameter/product still needs its own review |
| NASA Earthdata / FIRMS | Earthdata product access versus FIRMS map/API keys, thermal anomaly interpretation, latency, licensing |
| NOAA | Specific endpoint/product, token requirements, units, station coverage, quality flags and limits |
| Copernicus | Specific product and platform, registration/auth, quotas, license, resolution and processing |
| World Bank | No-key availability, indicator definitions, licensing, revisions, missing periods and country aggregates |
| Global Forest Watch | API eligibility/auth, dataset-specific license, forest definition, loss versus cover, resolution |
| OpenStreetMap | Existing context-only basemap; ODbL attribution and public tile usage policy, availability and scale suitability |
| Earth Engine | Project registration/authorization, eligibility, quotas, current commercial/noncommercial terms and dataset licenses |

Except for the explicitly verified NASA POWER T2M slice, entries above are **research gates, not verified connection claims**. Basemap usage does not connect OSM as a scientific measurement source.

Integration acceptance requires real request fixtures or reproducible bounded retrieval, source URL/product/version, retrieval and observation timestamps, units and conversions, quality flags, spatial definition, missing-data behavior, honest error handling and tests. Do not turn nulls into zero. Separate observations, modelled estimates, forecasts and clearly labeled demonstration data in API and UI.

Supabase/PostGIS remains optional pending explicit project authorization and credentials; prefer existing free service options and do not provision paid features.

## Phase 3 — Validated trend engine (pending)

Implement regression, Mann–Kendall, Sen slope, seasonal/anomaly analysis, Isolation Forest, change points and correlation incrementally. Validate against known analytical fixtures and independent reference results. Document minimum sample sizes, uncertainty, seasonality, serial dependence, outliers, multiple comparisons, missingness, sensitivity and aggregation bias. Correlation is not causation. No significance/trend claims without tests and assumptions.

## Phase 4 — Evidence-grounded explanations (pending)

Generate explanations only from retrieved scientific evidence and validated analysis. Cite dataset/product and retrieval date, quantify uncertainty, refuse unsupported claims and never invent values or causal explanations. Model output is not itself environmental evidence.

## Phase 5 — Reproducible reporting (pending)

Exports, side-by-side comparisons and reproducible reports must include query parameters, units, source/product/version, timestamps, quality/missingness notes, processing history, algorithm versions and statistical caveats. No export or report is implemented in Phase 1.
