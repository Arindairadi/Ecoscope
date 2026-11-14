# Publishing runbook — not a deployment claim

Phase 1 establishes a **live development preview**. No public publishing action has been performed.

1. Run the checks in `README.md` and review `VERIFICATION.md`.
2. Confirm the committed dependency lockfiles, Python runtime and Node/pnpm dependencies are present.
3. The frontend's artifact definition builds Vite assets; the API definition runs a real Python Uvicorn service. `/` must route to the frontend and `/api` to FastAPI in the same project. `/api/healthz` is the API startup health endpoint.
4. Choose a hosting provider and review build/run configuration, visibility, location and any cost estimate. Hosting may incur charges; do not approve charges or change plans automatically. The owner chooses whether to proceed.
5. Keep all future scientific/database secrets server-side in the hosting provider's server-side environment variables. Phase 1 requires none. Never add secrets to `VITE_*` or copy a development connection string into documentation.
6. The owner publishes only after reviewing the settings. Do not call a preview URL a production URL.
7. After publishing, verify the actual published `/`, `/api/healthz`, `/api/foundation`, `/api/series` and `/api/docs`. Check frontend connectivity, static assets, mobile layout and tile-provider access on that actual URL. Publishing itself is not proof these work.
8. Record the real production URL, deployment time, check outcomes and any rollback decision. No production URL is recorded in Phase 1.

Optional server-side environment variables are listed under Configuration in `README.md` (`FIRMS_MAP_KEY`, `AI_PROVIDER`, provider keys/model IDs, and usage caps). For Gemini, set `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, and `GEMINI_MODEL` on the server. The app works without them using rule-based explanations.

Use a server-capable deployment for FastAPI, not a frontend-only static host. Production commands are separate from Vite's development server. There is no database migration to perform in this phase. Supabase is external and must have its own approved migration process if connected later.

OpenStreetMap's public tile servers are not an unlimited hosting backend. Review https://operations.osmfoundation.org/policies/tiles/ before traffic growth; no prefetching, scraping or offline bulk downloads. Evaluate a permitted free provider or self-hosting only after license/usage review and explicit cost approval when applicable.
