# Ecoscope — Earth System Trend Detective

See the Planet. Detect the Trends. Understand the Change.

## Scope and scientific integrity
- Build incrementally. Phase 1 is the connected environment foundation, not a finished platform.
- Never fabricate environmental measurements, statistics, charts, successful connections, tests or causal claims.
- NASA POWER monthly T2M point retrieval is the only implemented scientific adapter. Other sources, Supabase/PostGIS, trends, explanations and reports remain pending.
- User prefers free external services. Do not upgrade, buy add-ons or provision optional paid services.
- Keep all credentials server-side. Foundation and NASA POWER point retrieval require no credentials.

## Run and check
- Managed `artifacts/api-server: API Server` workflow invokes `pnpm --filter @workspace/api-server run dev`, which starts Python FastAPI via `backend.run`.
- Managed `artifacts/earthscope: web` workflow invokes `pnpm --filter @workspace/earthscope run dev`.
- API `/api`, dashboard `/`; both use managed `PORT`; frontend also uses `BASE_PATH`.
- `uv sync --frozen` installs Python dependencies; `pnpm install --frozen-lockfile` installs JavaScript dependencies.
- `uv run python -m pytest backend/tests -q`
- `pnpm run typecheck`
- `pnpm --filter @workspace/api-spec run codegen` after each contract change.
- API docs `/api/docs`; health `/api/healthz`.
- NASA contract `/api/power/monthly`; see `docs/NASA_POWER.md` for verified official metadata, bounds, caching, provenance and caveats.
- No database required. Unused Express/Drizzle scaffold is not the running backend.

## Code and team
- Frontend: `artifacts/earthscope/src/`; backend: `backend/`; shared contract: `lib/api-spec/openapi.yaml`.
- Python dependency lock: `uv.lock`; JS dependency lock: `pnpm-lock.yaml`.
- Keep one shared project and one canonical GitHub repository.
- Never switch branches in a working tree teammates are editing concurrently.
- Independent PR branches require isolated working trees/clones; review before merge.
- GitHub connection and teammate invitations require owner authorization; do not claim them completed without verification.

## Documentation
- `README.md`, `docs/ARCHITECTURE.md`, `docs/PHASES.md`, `docs/COLLABORATION.md`, `docs/DEPLOYMENT.md`, `docs/VERIFICATION.md`.
