@echo off
chcp 65001 >nul
title WB Web
cd /d "%~dp0"
node scripts\open.mjs
timeout /t 3 >nul
node server.js
pause
