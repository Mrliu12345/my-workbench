@echo off
chcp 65001 >nul
title Setup autostart
cd /d "%~dp0"

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\workbench-autostart.cmd"

echo This will open the workbench automatically when you sign in.
echo Shortcut: %LINK%
echo.
set /p ANSWER=Continue? (Y/N) 
if /i not "%ANSWER%"=="Y" (
  echo Canceled.
  pause
  exit /b 0
)

> "%LINK%" echo @echo off
>> "%LINK%" echo cd /d "%~dp0"
>> "%LINK%" echo start "" "%~dp0启动工作台.bat"

echo.
echo Done. Delete the shortcut above to undo.
pause