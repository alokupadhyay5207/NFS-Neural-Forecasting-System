# Database & authentication setup (Supabase)

NFS uses Supabase Auth for login and Supabase PostgreSQL for history. I (the developer tooling) cannot create your
project for you, and no real keys are included in this repository.

## 1. Create the project
1. https://supabase.com → **New project**. Choose a strong database password and a nearby region.
2. Open **Project Settings → API** and note:
   - **Project URL** → `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY` (safe for the browser)
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (**secret**: backend only, never in the web app or git)
   - JWT settings: if your project still uses the legacy shared JWT secret, copy it to `SUPABASE_JWT_SECRET`.
     Projects with asymmetric signing keys need nothing extra (the backend uses the project's JWKS endpoint).

## 2. Run the migrations
Open **SQL Editor → New query**, paste the whole of `supabase/migrations/0001_init.sql`, click **Run**. Then do the same with `supabase/migrations/0002_attribute_breakdowns.sql` (segment analytics by tenure, monthly charge and tech support).
It creates `profiles`, `predictions`, `prediction_batches`, `batch_prediction_results`, indexes, check constraints,
Row Level Security policies, an auto-profile trigger, and analytics functions
(`analytics_overview`, `activity_by_day`, `breakdown_by_contract`, `segment_stats`; `attribute_breakdowns` comes from 0002).

> The scripts have been reviewed but were **not executed** in the authoring environment (no Postgres available there).
> If the editor reports an error, copy the message back so it can be fixed.

## 3. Authentication settings (Authentication → ...)
- **Providers → Email**: enabled, **Confirm email: ON** (this provides email verification).
- **URL Configuration**:
  - Site URL: `http://localhost:5173` for development, your Vercel URL in production.
  - Redirect URLs: add `http://localhost:5173/**` and `https://YOUR-APP.vercel.app/**`
    (needed for the verification link `/login?verified=1` and password reset `/reset-password`).
- **Email Templates**: paste `supabase/email-templates/confirm-signup.html` and `reset-password.html` for NFS branding.
- **Google (optional)**: enable the provider with your Google OAuth client, then set `VITE_ENABLE_GOOGLE_AUTH=true`.
- The built-in Supabase email sender is rate-limited; configure custom SMTP for real use.

## 4. How data access works
| Who | Can do | How |
|---|---|---|
| Signed-in user (browser, anon key + their JWT) | read & delete **their own** rows; update own profile name/preferences | RLS policies |
| NFS backend (service-role key) | insert predictions, batches, results after verifying the user's JWT | bypasses RLS, server only |
| Anyone else | nothing | no policy grants access |

Users cannot insert or edit predictions, so a stored probability can only come from the real model.

## 5. Verify isolation (recommended)
Create two test users, run a prediction as each, then in the SQL editor run
`select user_id, count(*) from predictions group by 1;` (as admin you see both). In the app, each user must see only their own
rows on Overview and History. The SQL editor's "Run as" role feature can also be used to test policies.

## 6. Stored data (what and why)
Single prediction: 19 input fields, optional customer ID, model output, drivers. Batch: file name, counts, timing; per
**successfully scored** row: customer ID, probability, risk level, predicted churn and four segment fields (contract,
tenure, monthly charges, tech support). Failed rows and the rest of the CSV are not stored.
