@echo off
rem Starts the NFS web app (Vite dev server). Requires Node.js 20+ and web\.env.local (see web\.env.example).
cd /d "%~dp0web"
if not exist "node_modules" (
  echo Installing web dependencies, this can take a few minutes the first time...
  call npm install
)
if not exist ".env.local" (
  echo.
  echo web\.env.local is missing. Copy web\.env.example to web\.env.local and fill in your Supabase values.
  echo.
)
call npm run dev
pause
