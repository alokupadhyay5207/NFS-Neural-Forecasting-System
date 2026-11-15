@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  NFS one-time setup (Windows). Needs Python 3.12 and Node.js 20+.
echo  This downloads packages, so you need an internet connection.
echo ============================================================
where py >nul 2>nul
if errorlevel 1 (
  echo [ERROR] The Python launcher "py" was not found. Install Python 3.12 from https://www.python.org/downloads/
  echo         and tick "Add python.exe to PATH" in the installer, then run this file again.
  pause & exit /b 1
)
py -3.12 --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python 3.12 was not found. NFS needs Python 3.12 exactly, because the saved model needs scikit-learn 1.6.1.
  echo         Install Python 3.12 from https://www.python.org/downloads/ ^(other versions can stay installed^).
  pause & exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install the LTS version from https://nodejs.org and run this file again.
  pause & exit /b 1
)

echo.
echo [1/4] Creating the Python environment...
cd backend
if not exist ".venv\Scripts\activate.bat" (
  py -3.12 -m venv .venv
  if errorlevel 1 goto :fail
)
call ".venv\Scripts\activate.bat"
echo [2/4] Installing backend packages ^(a few minutes^)...
python -m pip install --upgrade pip
pip install -r requirements.txt -r requirements-dev.txt
if errorlevel 1 goto :fail
if not exist ".env" copy ".env.example" ".env" >nul
cd ..

echo [3/4] Installing web app packages ^(a few minutes^)...
cd web
call npm install
if errorlevel 1 goto :fail
if not exist ".env.local" copy ".env.example" ".env.local" >nul
cd ..

echo.
echo [4/4] Checking the trained model in this environment...
cd backend
python scripts\selfcheck.py
if errorlevel 1 (
  echo.
  echo [WARNING] The model self-check reported a problem. See the messages above and README.md ^> Troubleshooting.
) 
cd ..

echo.
echo ============================================================
echo  Setup finished. NEXT STEPS:
echo   1. Follow docs\DATABASE_SETUP.md to create your free Supabase project.
echo   2. Put your Supabase values in  backend\.env  and  web\.env.local  ^(open them with Notepad^).
echo   3. Double-click run_all.bat
echo ============================================================
pause
exit /b 0

:fail
echo.
echo [ERROR] Setup failed. Read the messages above, then see README.md ^> Troubleshooting.
pause
exit /b 1
