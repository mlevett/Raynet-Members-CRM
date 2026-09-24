@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Raynet Members CRM - Local network
cd /d "%~dp0"

set "RAYNET_NODE="
where node >nul 2>nul
if not errorlevel 1 set "RAYNET_NODE=node"

if not defined RAYNET_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "RAYNET_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined RAYNET_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "RAYNET_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not defined RAYNET_NODE (
  echo Node.js 18 or newer is required but could not be found.
  echo Download the LTS version from https://nodejs.org/ and then run this file again.
  pause
  exit /b 1
)

echo This mode makes the CRM available to other devices on your local network.
echo Do not use it on public or untrusted Wi-Fi.
echo.
set /p "RAYNET_LAN_IP=Enter this computer's IPv4 address, for example 192.168.1.50: "
if not defined RAYNET_LAN_IP (
  echo An IPv4 address is required.
  pause
  exit /b 1
)
echo(!RAYNET_LAN_IP!| findstr /r /x "[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul
if errorlevel 1 (
  echo Enter an IPv4 address containing only numbers and dots.
  pause
  exit /b 1
)

set "HOST=0.0.0.0"
set "PORT=4173"
set "APP_URL=http://!RAYNET_LAN_IP!:4173"
set "TRUSTED_ORIGINS=http://!RAYNET_LAN_IP!:4173"

echo.
echo Starting Raynet Members CRM for the local network...
echo Open this address on another device: http://!RAYNET_LAN_IP!:4173
echo Keep this window open. Press Ctrl+C to stop the CRM.
echo Windows may ask you to allow Node.js through the firewall.
echo.

start "" "http://!RAYNET_LAN_IP!:4173"
"%RAYNET_NODE%" server.js

echo.
echo The CRM has stopped.
pause
