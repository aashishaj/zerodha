#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${API_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

# Derive the auth callback bridge port from the redirect URL (default 8765).
CALLBACK_PORT="8765"
if [[ -n "${ZERODHA_LOGIN_CALLBACK_URL:-}" && "$ZERODHA_LOGIN_CALLBACK_URL" =~ :([0-9]+) ]]; then
  CALLBACK_PORT="${BASH_REMATCH[1]}"
fi

stop_port_processes() {
  local port="$1"
  local label="$2"
  local pids

  if ! command -v lsof >/dev/null 2>&1; then
    echo "lsof is required to stop local services by port."
    exit 1
  fi

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    echo "No $label process is listening on port $port"
    return
  fi

  echo "Stopping $label on port $port"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"

  sleep 1

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  echo "Force stopping $label on port $port"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill -9 "$pid" 2>/dev/null || true
  done <<< "$pids"
}

stop_port_processes "$API_PORT" "API"
stop_port_processes "$FRONTEND_PORT" "frontend"
stop_port_processes "$CALLBACK_PORT" "auth callback bridge"

echo "Local services stopped."
