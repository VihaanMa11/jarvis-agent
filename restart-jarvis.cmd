@echo off
setlocal
title JARVIS - update and restart

rem ---------------------------------------------------------------------------
rem  JARVIS one-shot launcher.
rem  Stops the running app, pulls the latest code, refreshes dependencies, then
rem  relaunches the desktop app DETACHED so you can close this window.
rem  Keep this file in the jarvis-agent folder (it finds the repo from %~dp0).
rem ---------------------------------------------------------------------------
set "REPO=%~dp0"
if not exist "%REPO%apps\desktop" set "REPO=C:\Users\vihaa\Desktop\HERMIES\jarvis-agent\"
set "LOG=%REPO%desktop-dev.log"

echo ==================================================
echo   JARVIS  -  stop, update, run in the background
echo ==================================================
echo.

echo [1/4] Stopping any running JARVIS app...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.Name -eq 'electron.exe' -or $_.Name -eq 'node.exe') -and $_.CommandLine -like '*jarvis-agent*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-Process -Name 'JARVIS*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
timeout /t 2 /nobreak >nul

echo [2/4] Pulling the latest code...
cd /d "%REPO%"
git pull

echo [3/4] Refreshing dependencies (this can take a minute)...
call npm install

echo [4/4] Launching JARVIS in the background...
start "" powershell -NoProfile -WindowStyle Hidden -Command "cd '%REPO%apps\desktop'; npm run dev *>> '%LOG%'"

echo.
echo Done. JARVIS is starting in the background.
echo   Logs: %LOG%
echo   You can close this window now.
timeout /t 6 >nul
