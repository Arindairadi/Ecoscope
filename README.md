# EARTHSCOPE — Earth System Trend Detective

**See the Planet. Detect the Trends. Understand the Change.**

## Current scope

Phase 1 is a runnable scientific application foundation, not a completed environmental analytics platform. The React dashboard calls a real Python FastAPI REST backend. Scientific observations, trend estimates and external database connections are deliberately absent. No credentials are needed to run this phase.

The OpenStreetMap basemap is geographic context, **not environmental evidence**. Public tiles require internet access, may be unavailable or rate-limited, and carry visible attribution. Country presets are viewport centers, not authoritative boundary polygons. Uganda is included.

## Start in Replit

Use the configured **API Server** and **EARTHSCOPE web** workflows, then open the EARTHSCOPE preview. The Canvas workflow is unused scaffold and is not needed. One shared project holds the frontend and backend.

For a fresh checkout, Python 3.12+ and Node/pnpm are needed:

```sh
corepack enable
pnpm install --frozen-lockfile
uv sync --frozen
# Two terminals; Replit workflows already supply PORT and BASE_PATH:
PORT=8080 uv run python -m backend.run
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/earthscope run dev
```

The local two-terminal commands start separate services. Replit's shared proxy supplies `/` → frontend and `/api` → backend. Outside Replit, configure a same-origin reverse proxy with those routes; do not expose credentials or hardcode service origins into the browser. Do not start a second server on ports already owned by a workflow.

Interactive API docs: `/api/docs`; runtime OpenAPI: `/api/openapi.json`.

## Checks

Run at the repository root:

```sh
uv run python -m pytest backend/tests -q
pnpm run typecheck
uv run python -c 'from backend.services.science import scientific_versions; print(scientific_versions())'
curl --fail http://localhost:80/api/healthz
curl --fail 'http://localhost:80/api/series?region=uganda&indicator=temperature&start=2015-01-01&end=2025-12-31'
```

`localhost:80` checks use the Replit shared proxy, not a service's private port. See [verification results](docs/VERIFICATION.md) for actual outcomes and limitations.

## Documentation

- [Architecture and dependencies](docs/ARCHITECTURE.md)
- [Phase roadmap and scientific acceptance gates](docs/PHASES.md)
- [Team collaboration and GitHub authorization](docs/COLLABORATION.md)
- [Publishing runbook](docs/DEPLOYMENT.md)
- [Verification results](docs/VERIFICATION.md)

No external paid service, plan upgrade, add-on or database was provisioned. A paid Replit subscription does not authorize optional paid services.
