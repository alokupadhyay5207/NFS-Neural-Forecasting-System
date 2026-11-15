# Testing & verification report

Authoring environment: Linux sandbox, Python 3.12.3 with scikit-learn **1.9.1** / pandas 3.0 / numpy (NOT the pinned
1.6.1 stack), Node 22, TypeScript, esbuild, Playwright + Chromium, **no network** (npm and PyPI unreachable), no Supabase
project, no LLM API key, no Postgres, no FastAPI / pydantic / pytest, no Vite / React Router / Recharts / Supabase JS /
three.js / Tailwind v3 installed.

## Executed and passing
| What | Result |
|---|---|
| `py_compile` of every backend file and test | OK |
| `tests/test_nfs_logic.py` (run standalone; also valid pytest) | **22 passed**. Covers JWT verification with real HS256 and RS256 keys (expired, wrong audience/issuer/secret, `alg=none`, malformed), record shaping (failed rows never stored; batch counts satisfy the SQL CHECK constraints), Supabase writes use the service key while reads forward the user's JWT, LLM payloads for Anthropic and OpenAI, assistant context (customer ID never requested; features only for an explicitly attached prediction), reports from supplied data only (incl. segment report), rate limiting, pipeline description and **feature importance computed from the real `churn_pipeline.joblib`** |
| Real model file inspection | Pipeline = `preprocess` (num: median imputer + StandardScaler on 4 columns; cat: most-frequent imputer + OneHotEncoder(handle_unknown=ignore) on 15 columns; remainder dropped) → RandomForestClassifier(300 trees, min_samples_leaf 5, class_weight balanced, random_state 42). No feature-engineering step. Top importances: Contract 0.204, tenure 0.126, TotalCharges 0.107 |
| Frontend unit tests (`csv.test.ts`, `password.test.ts`) | **11 passed** (run with Node's TypeScript stripping and a minimal test-runner stand-in, not Vitest itself) |
| Strict TypeScript check of all frontend source | 0 errors, **against hand-written type stubs** for React/Router/Recharts/Lucide/Supabase/three (not the real type packages) |
| esbuild bundle of the real app with real React 19 | 0 errors |
| Exploratory browser smoke test (`tools/smoke`) | **74/74 passed, 0 console errors** in real Chromium (details and limits in `tools/smoke/README.md`). Includes the 11-stage workflow text checked against the real pipeline description, batch search/filters, dashboard segment and AI cards, and: dashboard numbers equal the seeded records exactly; bearer token and typed payload on predict/batch; batch CSV download; history search/filter/details/confirm-delete/pagination; per-customer probability and risk shown for batch rows (no dashes); workflow text matches the real pipeline; assistant shows "requires configuration" when AI is off; settings persistence; sign-out; signup/verification messages; protected routes |
| Byte-identity | `churn_pipeline.joblib`, `feature_schema.json`, `model_metrics.json`, `model_service.py`, `schemas.py`, `tests/test_api.py` identical to the original upload |
| Secrets scan | No keys in `web/`, docs or templates |

## Added this round (not executable here)
- `backend/scripts/selfcheck.py` (`run_selfcheck.bat`): loads the original model and checks single prediction, the 0.35/0.60/0.50 bands, blank-TotalCharges imputation, batch with an invalid row (no probability for the failed row), and the recorded metrics. It could not run here (no pydantic / pinned scikit-learn); it is compiled only. It is run automatically at the end of `setup_windows.bat`.
- Per-user rate limits on predict (120/min) and batch (12/min), request logging, and `/api/v1/analytics/*` endpoints; two API tests for them were added to `tests/test_v1_api.py` (not run).
- Windows scripts `setup_windows.bat`, `run_all.bat`, `run_selfcheck.bat`: written, never executed (this is a Linux sandbox).

## Findings from testing (fixed)
- `pct(x, digits)` was called with two arguments but accepted one (caught by the type check).
- The notification checkbox in Settings did not update until the database round trip finished; it now updates immediately and rolls back on error (caught by the browser test).
- **Correction:** the saved Random Forest F1 is `0.6315`; it displays as **0.631** (matches the original request). An earlier note saying 0.632 was wrong.

## Could NOT be verified here (please run these)
1. **Model predictions and the pinned ML environment.** The pickle does not execute under scikit-learn 1.9.1 (`SimpleImputer` internals changed), which confirms the pins are mandatory. Single prediction, batch prediction, invalid-input handling and ROC/metrics consistency must be tested in the pinned environment: `pip install -r requirements.txt` (Python 3.12: scikit-learn 1.6.1, numpy 2.1.3, pandas 2.2.3, joblib 1.6.0), then `python -m pytest -q` (runs the original 20 API tests, `test_nfs_logic.py` and `test_v1_api.py`).
2. **FastAPI routes** (`routes_v1.py`, `main.py` wiring), `tests/test_v1_api.py` and `scripts/selfcheck.py`: compiled but never executed.
3. **SQL migrations** `0001_init.sql`, `0002_attribute_breakdowns.sql`: never executed (no Postgres). Run them in the Supabase SQL editor and report any error. Verify two-user isolation as described in `docs/DATABASE_SETUP.md`.
4. **Real npm install / `tsc` / `vite build` / `vitest`** against the real libraries; Tailwind v3 compilation (only a v4 binary was available, and `@apply` with custom tokens is unverified; all custom colour tokens were cross-checked against the config).
5. **WebGL 3D scene** (three.js) rendering, and layout/responsiveness on desktop, tablet and phone (no compiled CSS was available).
6. **Supabase Auth** against a real project (email verification, reset links, remember-me storage, Google), real LLM provider calls, Render and Vercel deployment.

## Local Windows verification — 2026-11-15

The following checks were subsequently performed on the developer's local Windows environment:

| Check | Result |
|---|---|
| Backend pytest suite | 55 passed, 1 non-blocking deprecation warning |
| Frontend unit tests | 11 passed |
| TypeScript typecheck | Passed |
| Vite production build | Passed |
| Original Random Forest model | Loaded successfully with scikit-learn 1.6.1 |
| Supabase signup/login | Verified |
| Individual prediction | Verified |
| Individual prediction persistence | Verified across refresh and re-login |
| CSV batch prediction | Verified |
| Batch history and per-customer results | Verified |
| Supabase analytics | Verified |
| Rule-based Assistant using saved analytics | User-confirmed working |

### Still not verified

- Production deployment on Vercel and Render.
- Hosted API connectivity, production CORS and authentication redirects.
- Production two-account isolation test.
- Full production security review and npm dependency vulnerability remediation.
- Hosted report export and optional LLM provider integration.

Local verification does not constitute production deployment approval.
