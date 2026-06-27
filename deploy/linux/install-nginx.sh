#!/usr/bin/env bash
set -euo pipefail

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y nginx
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y nginx
else
  echo "Unsupported OS: neither apt-get nor dnf is available." >&2
  exit 1
fi

sudo systemctl enable nginx
sudo systemctl start nginx
sudo systemctl status nginx --no-pager
