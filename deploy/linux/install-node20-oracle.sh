#!/usr/bin/env bash
set -euo pipefail

if command -v apt-get >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get update
  sudo apt-get install -y nodejs
elif command -v dnf >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo dnf install -y nodejs
else
  echo "Unsupported OS: neither apt-get nor dnf is available." >&2
  exit 1
fi

node -v
npm -v
