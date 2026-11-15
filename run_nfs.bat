@echo off
rem Starts the NFS backend (prediction API). Do the one-time setup in README.md first.
cd /d "%~dp0backend"
if not exist ".venv\Scripts\activate.bat" (
  echo Setup has not been done yet. Please follow "One-time setup" in README.md.
  pause
  exit /b 1
)
call ".venv\Scripts\activate.bat"
echo.
echo NFS API is starting on http://127.0.0.1:8000  (API docs: /docs). Press Ctrl+C to stop.
echo In a second window run run_nfs_web.bat to start the web app on http://localhost:5173
echo.
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
