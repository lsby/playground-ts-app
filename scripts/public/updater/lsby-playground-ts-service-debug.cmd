@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist "data\update-in-progress" (
  echo 检测到未完成的更新，已拒绝启动应用。
  echo 请先运行 update.cmd 恢复旧版本。
  pause
  exit /b 1
)

set "ENV_FILE_PATH=app\.env\.env.production.electron"
set "DEBUG=@lsby:*,@lsby:playground-ts-service:*"
start /wait "" "app\lsby-playground-ts-service.exe"
if errorlevel 1 (
  echo.
  echo 程序异常退出，退出码: %errorlevel%
  pause
)
