@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Raynet Members CRM - Local network
cd /d "%~dp0"

set "RAYNET_NODE="
where node >nul 2>nul
if not errorlevel 1 set "RAYNET_NODE=node"

if not defined RAYNET_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "RAYNET_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined RAYNET_NODE (
  echo Node.js 18 or newer is required but could not be found.
  echo Download the LTS version from https://nodejs.org/ and then run this file again.
  pause
  exit /b 1
)

echo This mode makes the CRM available to other devices on your local network.
echo Do not use it on public or untrusted Wi-Fi.
echo.
set "RAYNET_LAN_IP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$address = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) ^| Where-Object { $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and $_.IPAddressToString -notlike '169.254.*' } ^| Select-Object -First 1; if ($address) { $address.IPAddressToString }"`) do set "RAYNET_LAN_IP=%%I"

set "HOST=0.0.0.0"
set "PORT=4173"
if defined RAYNET_LAN_IP set "APP_URL=http://!RAYNET_LAN_IP!:4173"

echo.
echo Starting Raynet Members CRM for the local network...
if defined RAYNET_LAN_IP (
  echo Open this address on another device: http://!RAYNET_LAN_IP!:4173
) else (
  echo Open http://COMPUTER-IP:4173 on another device. Run ipconfig to find this computer's IPv4 address.
)
echo Keep this window open. Press Ctrl+C to stop the CRM.
echo Windows may ask you to allow Node.js through the firewall.
echo.

start "" "http://localhost:4173"
"%RAYNET_NODE%" server.js

echo.
echo The CRM has stopped.
pause
