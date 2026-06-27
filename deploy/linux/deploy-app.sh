#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-$HOME/dingtou}"

mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/cloud-data"

cd "$APP_DIR"
npm install

if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env created. Edit it before first public use."
fi

pm2 start ecosystem.config.js
pm2 save
