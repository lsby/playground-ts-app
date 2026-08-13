@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1" %*
set "UPDATE_EXIT_CODE=%errorlevel%"
if errorlevel 1 (
  echo.
  echo 更新未完成，请查看上方错误信息。
)
pause
exit /b %UPDATE_EXIT_CODE%
