#!/usr/bin/env bash
set -euo pipefail

if command -v firewall-cmd >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-service=http
  sudo firewall-cmd --permanent --add-service=https
  sudo firewall-cmd --reload
  sudo firewall-cmd --list-services
elif command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow 22/tcp
  sudo ufw status
else
  echo "No supported local firewall tool found. You may rely on Oracle security rules only."
fi
