@echo off
rem Start the dev server and open the game in the browser. Close this window to stop.
rem Always uses port 5173. If the server is already running, just open the browser.
cd /d "%~dp0"
netstat -ano | findstr ":5173 " | findstr "LISTENING" >nul
if not errorlevel 1 (
  start "" http://localhost:5173/
  exit /b
)
if not exist node_modules call npm install
npm run dev -- --open
