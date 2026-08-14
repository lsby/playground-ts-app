@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1" %*
set "UPDATE_EXIT_CODE=%errorlevel%"
if %UPDATE_EXIT_CODE% neq 0 (
  echo.
  echo [ERROR] Update process failed. Please check error messages above.
)
pause
exit /b %UPDATE_EXIT_CODE%
