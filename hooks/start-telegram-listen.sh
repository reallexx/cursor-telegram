#!/usr/bin/env bash
# Autostart helper for Cursor Telegram listener (macOS / Linux)
set -euo pipefail
cd "${HOME}/.cursor"
command -v node >/dev/null || { echo "node not found in PATH"; exit 1; }
# Prefer nohup so the process survives the terminal
nohup node "${HOME}/.cursor/hooks/telegram-listen.mjs" >>"${HOME}/.cursor/telegram-listen.stdout.log" 2>&1 &
echo "telegram-listen started pid=$!"
