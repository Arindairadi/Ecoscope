# Architecture

## Runtime

```text
Browser
 ├─ /              React + TypeScript + Vite + Tailwind
 │                  Leaflet map; Recharts-ready scientific result view
 └─ /api/*         Python FastAPI + Pydantic + Uvicorn
                    ├─ health and planning catalogs
                    ├─ validated empty time-series responses
                    └─ modular science adapter interface
                         external APIs and Supabase/PostGIS NOT connected
```

The managed API service now starts `backend.run`, not the Express scaffold. Existing unused TypeScript server/database scaffold is retained for template compatibility; it is not the running scientific backend and no Drizzle schema is applied. No application database or external database is required by Phase 1.

## Source layout

| Area | Owner path |
|---|---|
| Browser application | `artifacts/earthscope/src/` |
| API entry and validation | `backend/app.py`, `backend/models.py` |
| Catalog metadata | `backend/catalog.py` |
| Scientific interfaces | `backend/services/` |
| API tests | `backend/tests/` |
| Shared API contract | `lib/api-spec/openapi.yaml` |
| Generated hooks | `lib/api-client-react/` |
| Python dependencies | `pyproject.toml`, `uv.lock` |
| JavaScript dependencies | package manifests, `pnpm-lock.yaml` |

The YAML contract drives browser codegen; Pydantic validates Python responses. API contract tests compare routes, operation IDs and required response fields to catch basic drift. Any contract change must update both Python models and YAML, regenerate clients, and add regression checks.

```sh
pnpm --filter @workspace/api-spec run codegen
```

Do not hand-edit generated hooks. Use relative same-origin API paths. No permissive CORS configuration is required for this architecture.

## Dependencies

- React, TypeScript, Vite, Tailwind: interface and responsive theme system.
- Leaflet/react-leaflet: interactive, attributed geographic context.
- Recharts: chart rendering foundation; do not feed invented time series.
- FastAPI, Pydantic, Uvicorn: real REST API, validation and server.
- Pandas, NumPy: future cleaning, units/missing-data checks and numeric analysis.
- scikit-learn: future validated anomaly analysis, not an implemented detector.
- Xarray: future labeled multidimensional/netCDF handling.
- GeoPandas: future CRS-aware geographic processing.
- pytest/httpx/PyYAML: API tests and contract checks.

Exact resolved versions are in the lockfiles. Scientific packages are installed and import-checkable; their presence does not mean analysis algorithms or data ingestion are complete.

## Scientific contracts

Every future observation carries a timestamp, nullable value, unit, source, retrieval timestamp and kind (`observation`, `modelled_estimate`, `forecast`, or `demonstration`). Future adapters must extend this with dataset/product version, spatial support/CRS, quality flags, license/attribution and processing history before integration acceptance. Unit labels in the Phase 1 catalog are intended targets, not assertions about a source's native units.

Missing values stay `null`, never zero. Empty results mean unavailable data, not zero change. Source adapters must distinguish source outage, no matching records and missing values. Real results require source-specific conversion and QA tests. Time ranges are validated; future dates are rejected by the observation endpoint. Free-form map point selection is exploratory until a point-sampling API exists.

## Security and persistence

No secrets are required or returned. Do not access or print existing workspace secrets. Future external credentials belong in server-side Replit Secrets, never `VITE_*`, browser storage, source code, logs, screenshots or GitHub. Use least-privilege database credentials, parameterized queries and restricted access policies.

Phase 1 API is read-only and has no user accounts, shared saved analyses or durable scientific storage. Theme preferences may be stored in browser local storage; this is not collaborative persistence. Add authentication and authorization before enabling write operations or private data.

Supabase PostgreSQL/PostGIS is planned at the user's request. No project, database, extension, credentials, schema, migration or successful connection is claimed. Before connecting: authorize the intended project, verify free-tier constraints, use a server-only credential, explicitly approve migrations, and test connectivity without exposing secrets.
