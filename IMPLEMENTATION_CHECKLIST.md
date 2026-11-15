# NFS implementation checklist (see docs/TESTING_REPORT.md for evidence and limits)

| Area | Status |
|---|---|
| Original model + `model_service.py` + `schemas.py` + original tests | Untouched, byte-identical |
| Pinned ML environment (Py 3.12, sklearn 1.6.1, numpy 2.1.3, pandas 2.2.3, joblib 1.6.0) | Pinned in `requirements.txt`; **not installable here** (no network). Real predictions must be tested by you |
| Backend modules (auth, db, llm, assistant, reports, records, pipeline_info incl. feature importance) | Written; 22 unit tests executed and passing |
| FastAPI routes + `tests/test_v1_api.py` | Written; compiled; **not executed** |
| Supabase SQL (0001, 0002) | Written; **not executed** |
| Frontend: auth (3D scene + fallback), dashboard, predict, batch, history, segments (+attribute breakdowns), performance (+feature importance), workflow, assistant, reports (5 kinds), settings (AI status, global sign-out) | Written; typecheck vs stubs = 0 errors; bundles; **74/74 browser smoke checks** with stand-ins |
| Windows scripts (`setup_windows.bat`, `run_all.bat`, `run_selfcheck.bat`), `scripts/selfcheck.py` | Written; never executed |
| Real `npm install` / `tsc` / `vite build` / `vitest`, Tailwind v3 build, WebGL render, responsive layout | **Not verified** |
| Real Supabase Auth/DB, real LLM provider, Render/Vercel deploy | **Not verified** |

Not implemented: light theme (shown as unavailable), email notifications, in-app account deletion, native PDF generation
(browser print-to-PDF + CSV instead), "Frequent support contacts" segment (no ticket field in the data).
