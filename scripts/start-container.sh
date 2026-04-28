#!/bin/sh
set -eu

mkdir -p "$HOME/.openclaw"

if [ ! -f "$HOME/.openclaw/openclaw.json" ]; then
  cp /app/openclaw/config.example.json "$HOME/.openclaw/openclaw.json"
fi

npm run setup

exec openclaw gateway --allow-unconfigured
