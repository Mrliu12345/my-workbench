@echo off
chcp 65001 >nul
title WB
cd /d "%~dp0"

if not exist "node_modules" (
  echo Preparing, please wait...
  call npm install --no-audit --no-fund
)

node scripts\app.mjs

if errorlevel 1 (
  echo.
  echo [!] Start failed. Run this to see the error:
  echo     node server.js
  pause
)
exit
