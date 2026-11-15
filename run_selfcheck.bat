@echo off
rem Checks that the original trained model loads and predicts correctly in the pinned Python environment.
cd /d "%~dp0backend"
if not exist ".venv\Scripts\activate.bat" (
  echo Setup has not been done yet. Double-click setup_windows.bat first.
  pause & exit /b 1
)
call ".venv\Scripts\activate.bat"
python scripts\selfcheck.py
echo.
echo To run the full automated test suite instead:  python -m pytest -q
pause
