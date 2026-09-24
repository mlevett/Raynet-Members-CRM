#!/usr/bin/env sh
set -eu
docker compose up -d --build
echo "RAYNET CRM is starting. Open ${APP_URL:-http://localhost:4173}"
