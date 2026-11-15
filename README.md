# NFS – Neural Forecasting System

**Predict Beyond Patterns. Anticipate the Future.**
AI-Powered Customer Behaviour Prediction & Risk Assessment.

NFS is a customer churn risk platform powered by the original trained Random Forest model, FastAPI, React,
and Supabase authentication and PostgreSQL. It includes individual and batch predictions, persistent history,
customer segmentation, analytics, reports, and a rule-based Intelligence Assistant that works without a paid LLM API.
Optional LLM integration is available for enhanced AI-generated responses. Analytics are based on saved records;
predictions represent estimated risk, not confirmed customer churn.

```
backend/                 FastAPI + the trained model (artifacts never modified)
web/                     React + TypeScript + Tailwind app
supabase/migrations/     0001_init.sql, 0002_attribute_breakdowns.sql
docs/                    DATABASE_SETUP.md, AI_SETUP.md, TESTING_REPORT.md, DEPLOYMENT.md (not needed locally)
setup_windows.bat        one-time setup        run_all.bat   start everything
run_selfcheck.bat        verify the model      run_nfs.bat / run_nfs_web.bat   start one half
frontend/index.html      the original single-file page (still served at http://127.0.0.1:8000/)
```

## Run it on Windows (beginner steps)

**1. Install two programs** (once):
- **Python 3.12** from https://www.python.org/downloads/ — tick **"Add python.exe to PATH"**. It must be 3.12: the saved model only works with scikit-learn 1.6.1.
- **Node.js (LTS)** from https://nodejs.org.

**2. Unzip** the project to a short folder without spaces, e.g. `C:\nfs`.

**3. Double-click `setup_windows.bat`.** It creates the Python environment, installs everything (needs internet; takes a few minutes), creates `backend\.env` and `web\.env.local`, and finishes by checking your trained model. Look for `ALL CHECKS PASSED`. You can re-run that check any time with `run_selfcheck.bat`.

**4. Create your free Supabase project** (this is what provides login and saved history). Follow `docs\DATABASE_SETUP.md` (about 10 minutes). Then open these two files in Notepad and paste your values:
- `backend\.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret, backend only)
- `web\.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**5. Double-click `run_all.bat`.** Two windows open (API and Web) and your browser goes to http://localhost:5173. Create an account, confirm the email Supabase sends, and sign in.

**6. (Optional) turn on the AI assistant:** see `docs\AI_SETUP.md`.

To stop NFS, close the two windows.

### Without Supabase?
The dashboard requires login, so Supabase is needed for the full app. The prediction API itself works without it: run `run_nfs.bat` and open http://127.0.0.1:8000/ for the original single-file page, or http://127.0.0.1:8000/docs for the API.

## What the app does
Sign up / login (email verification, password reset) · **Overview** (KPIs, risk distribution, activity, contracts, segments, model info, AI insights) · **Predict** one customer (19 fields) · **Batch** CSV up to 10,000 rows with search, filters and downloadable results · **Prediction History** (search, filters, sort, pagination, details, delete, CSV export; stored in PostgreSQL) · **Model Performance** (saved test metrics, confusion matrix, feature importance, limitations) · **Customer Segments** (3 rule segments + breakdowns by contract, tenure, monthly charge, tech support; "Frequent support contacts" is unavailable because the data has no support-ticket field) · **ML Workflow** (11 stages generated from the real saved pipeline) · **AI Assistant** · **Reports** (5 kinds, CSV and print-to-PDF) · **Settings**.

Thresholds: Medium risk from 0.35, High from 0.60, predicted churn at 0.50. Logistic Regression appears only as recorded comparison metrics; Random Forest is the live model. All metrics are saved training-time results on the IBM Telco sample dataset, not live performance.

## Tests
```
cd backend   (then)   .venv\Scripts\activate   and   python -m pytest -q      full backend suite
cd web       (then)   npm run typecheck   and   npm test   and   npm run build
```
`docs\TESTING_REPORT.md` lists exactly what was verified while building NFS and what still needs your first real run.

## Troubleshooting
| Problem | Fix |
|---|---|
| `setup_windows.bat` says Python 3.12 not found | Install Python 3.12 (see step 1). Having other versions installed is fine; the script asks for 3.12 specifically |
| Model self-check fails or `pip install` fails | Re-run `setup_windows.bat` with internet on. Never upgrade scikit-learn/numpy/pandas: the versions in `backend\requirements.txt` are pinned to match the saved model |
| Page shows "Supabase is not configured" | `web\.env.local` is missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, or you did not restart `run_nfs_web.bat` after editing |
| Header says "API offline" | The API window is not running or crashed. Start `run_nfs.bat` and read its last lines. Check http://127.0.0.1:8000/api/health |
| "Port 8000 / 5173 already in use" | Close old NFS windows, or restart the PC |
| Signup works but no email arrives | Check spam. Supabase's built-in sender is slow and limited; see `docs\DATABASE_SETUP.md` (SMTP) |
| Verification link goes to the wrong site | In Supabase > Authentication > URL Configuration set Site URL `http://localhost:5173` and add `http://localhost:5173/**` as a redirect URL |
| Prediction works but "could not be saved" | `SUPABASE_SERVICE_ROLE_KEY` is missing/wrong in `backend\.env`, the migrations were not run, or the backend was not restarted |
| Session expired / 401 errors | Sign out and in again; make sure `SUPABASE_URL` is identical in `backend\.env` and `web\.env.local`. If your Supabase project uses the legacy JWT secret, also set `SUPABASE_JWT_SECRET` |
| CSV upload says a column is missing | The file needs the 19 model columns (names are case-insensitive; `TotalCharges` and `customerID` optional). Use "Load sample CSV" to see the format |
| AI says "requires configuration" | See `docs\AI_SETUP.md` |
| `npm install` errors about versions | Install the current Node LTS, delete `web\node_modules`, run `npm install` again |

## Security notes
- The Supabase **service-role key** lives only in `backend\.env`. Users can read/delete only their own rows (database rules); only the backend inserts predictions, after verifying the user's JWT.
- `.env` files, virtual environments and `node_modules` are git-ignored. Never share or commit keys.
- AI provider keys live only in `backend\.env`; the assistant receives aggregate analytics, not raw customer rows.
