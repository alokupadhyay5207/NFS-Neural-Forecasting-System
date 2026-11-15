# Deployment guide

Frontend → **Vercel**, backend → **Render**, database/auth → **Supabase**. Nothing here has been deployed from the
authoring environment; follow the steps and verify at each checkpoint.

## A. Supabase
Complete `docs/DATABASE_SETUP.md` first.

## B. Backend on Render
1. Push the repository to GitHub (the root `.gitignore` already excludes `venv/`, `.venv/`, `node_modules/`, `.env`).
   Make sure `backend/artifacts/*` (the model files) **are** committed; the service needs them.
2. Render → **New → Blueprint** → choose the repo (uses `render.yaml`), or create a **Web Service** manually:
   - Root directory `backend`, runtime Python, **Python 3.12** (`PYTHON_VERSION=3.12.8`)
   - Build: `pip install --upgrade pip && pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health check path: `/api/health`
3. Environment variables (Render dashboard; see `backend/.env.example`):
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, (`SUPABASE_JWT_SECRET` if legacy HS256),
   `NFS_CORS_ORIGINS=https://YOUR-APP.vercel.app` (comma-separate extra origins), `NFS_PROTECT_LEGACY_API=true`,
   and optionally the `NFS_LLM_*` variables.
4. Dependency versions matter: scikit-learn **1.6.1**, numpy 2.1.3, pandas 2.2.3 are pinned because they must match
   the versions that saved `churn_pipeline.joblib`. A free 512 MB instance may be too small; use a paid instance if it restarts.
5. Checkpoint: open `https://YOUR-SERVICE.onrender.com/api/health` → `"model_loaded": true`.
   Free instances sleep; the first request after idle can take ~30-60 s.

## C. Frontend on Vercel
1. Vercel → **Add New → Project** → import the repo; set **Root Directory** to `web`. Framework preset: Vite.
2. Environment variables:
   - `VITE_API_BASE_URL=https://YOUR-SERVICE.onrender.com` (no trailing slash; **replaces** the local 127.0.0.1:8000)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optionally `VITE_ENABLE_GOOGLE_AUTH=true`
   (never add the service-role key or any LLM key here).
3. `web/vercel.json` already rewrites all routes to `index.html` (SPA routing).
4. Add the Vercel URL to Supabase **Site URL / Redirect URLs** and to Render's `NFS_CORS_ORIGINS`, then redeploy both.

## D. AI assistant (optional)
Set on Render: `NFS_LLM_PROVIDER` (`anthropic` or `openai`; `openai` also works with OpenAI-compatible servers via
`NFS_LLM_BASE_URL`), `NFS_LLM_API_KEY`, `NFS_LLM_MODEL`. Without them the assistant page states that AI requires
configuration and nothing is simulated. The assistant receives aggregate analytics for the signed-in user only.

## E. Post-deploy smoke test
Sign up (verify email) → Predict one customer → Batch with the sample CSV → History shows both with probabilities and
risk → Overview/Segments show real counts → second account cannot see the first account's data → Model Performance
shows the recorded metrics → (if configured) Assistant answers.
