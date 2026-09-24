@echo off
setlocal
title SE Hants RAYNET CRM
cd /d "%~dp0"

set "RAYNET_NODE="
where node >nul 2>nul
if not errorlevel 1 set "RAYNET_NODE=node"

if not defined RAYNET_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "RAYNET_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined RAYNET_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "RAYNET_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined RAYNET_NODE (
  echo Node.js 18 or newer is required but could not be found.
  echo.
  echo Download the LTS version from https://nodejs.org/ and then run this file again.
  pause
  exit /b 1
)

for /f "tokens=*" %%V in ('"%RAYNET_NODE%" --version') do set "NODE_VERSION=%%V"
echo Using Node.js %NODE_VERSION%
echo.

powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4173/api/auth/status' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } }; exit 1" >nul 2>nul
if not errorlevel 1 (
  echo The CRM is already running at http://localhost:4173
  start "" "http://localhost:4173"
  timeout /t 2 >nul
  exit /b 0
)

echo Starting SE Hants RAYNET CRM...
echo Open: http://localhost:4173
echo Keep this window open while using the CRM.
echo Press Ctrl+C to stop it.
echo.

set "HOST=127.0.0.1"
set "PORT=4173"
set "APP_URL=http://localhost:4173"
start "" "http://localhost:4173"
"%RAYNET_NODE%" server.js

echo.
echo The CRM has stopped.
pause
