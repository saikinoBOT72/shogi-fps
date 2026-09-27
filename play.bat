@echo off
rem Start the dev server and open the game in the browser. Close this window to stop.
cd /d "%~dp0"
if not exist node_modules call npm install
npm run dev -- --open
