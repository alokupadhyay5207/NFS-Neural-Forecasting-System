# NFS – Neural Forecasting System (web app)

Vite + React 18 + TypeScript + React Router + compiled Tailwind. This folder replaces the single-file
`frontend/index.html` (which is kept untouched and is still served by the backend at http://127.0.0.1:8000/).

## Run locally (Windows, Command Prompt)
1. Start the existing backend exactly as before (`run_nfs.bat`, or the README steps in the project root).
2. Install Node.js 20 or newer from https://nodejs.org (LTS).
3. In a second Command Prompt:
   ```
   cd /d C:\churniq\web
   npm install
   npm run dev
   ```
4. Open http://localhost:5173. The header chip should say **API connected**.
   In development Vite forwards `/api/*` to http://127.0.0.1:8000, so no CORS setup is needed.

## Checks
```
npm run typecheck   # TypeScript, no emit
npm test            # unit tests for CSV parsing / batch row preparation
npm run build       # production build into dist/
```

## Configuration
Copy `.env.example` to `.env.local`. Only `VITE_*` values reach the browser, so never put secrets here.
- `VITE_API_BASE_URL` - empty in development; in production the backend URL (e.g. your Render service).
- `VITE_DEV_API_TARGET` - optional; where the dev proxy forwards `/api` (default http://127.0.0.1:8000).

## Deployment (later phases)
Frontend: Vercel (`vercel.json` already rewrites all routes to `index.html`). Backend: Render.
