@echo off
setlocal
title SE Hants RAYNET CRM - Docker
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker could not be found. Install Docker Desktop or use start_windows.bat instead.
  pause
  exit /b 1
)

docker compose up -d --build
if errorlevel 1 (
  echo The Docker container could not be started.
  pause
  exit /b 1
)

echo RAYNET CRM is running at http://localhost:4173
start "" "http://localhost:4173"
pause
