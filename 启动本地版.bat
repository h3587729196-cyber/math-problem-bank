@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  pause
  exit /b 1
)

echo [1/2] Building production version, please wait...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed. Make sure you ran: npm install
  pause
  exit /b 1
)

echo [2/2] Starting local server...
node scripts\serve.mjs
pause
