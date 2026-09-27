@echo off
rem ダブルクリックで開発用サーバーを起動して、ブラウザでゲームを開く（この黒い画面を閉じると終了）
cd /d "%~dp0"
if not exist node_modules call npm install
npm run dev -- --open
