# Exploratory browser smoke test (NOT the final verification)

This harness bundles the real `web/src` app with esbuild and real React, runs it in real Chromium via Playwright, and
drives login, every dashboard page, predictions, batch, history, reports, settings and signup (60 checks).

It uses **stand-ins** for libraries that were not installable in the authoring sandbox (`shims/`: React Router,
Recharts, Lucide, three.js, and a seeded in-memory fake of `@supabase/supabase-js`) and a fake `/api` server that replays
your real `schema`, `metrics` and `pipeline` JSON (`data/`). It therefore proves the app's own logic and wiring
behave correctly end to end, but it does NOT prove compatibility with the real libraries, real Supabase, or the real backend.

Paths inside `build.mjs` and `smoke.cjs` point at the authoring machine (`/opt/npm-tools`, `/tmp/smoke`, Chromium under
`/opt/pw-browsers`). Adjust them if you want to re-run it. For real verification use `npm run typecheck`, `npm test`,
`npm run build` and a manual pass against your real Supabase project (see `docs/TESTING_REPORT.md`).
