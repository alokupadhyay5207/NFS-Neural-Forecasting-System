@echo off
rem Starts the NFS backend and the web app in two windows, then opens the browser.
cd /d "%~dp0"
start "NFS API (backend)" cmd /k "%~dp0run_nfs.bat"
start "NFS Web (frontend)" cmd /k "%~dp0run_nfs_web.bat"
echo Waiting for the servers to start...
timeout /t 12 /nobreak >nul
start "" http://localhost:5173
echo Two windows were opened (API and Web). Close them to stop NFS.
