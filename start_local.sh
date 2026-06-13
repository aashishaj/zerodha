#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
CALLBACK_URL_DEFAULT="http://127.0.0.1:8765/callback"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT}"

stop_port_processes() {
  local port="$1"
  local label="$2"
  local pids

  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  echo "Stopping existing $label process on port $port"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" 2>/dev/null || true
  done <<< "$pids"

  sleep 1

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  echo "Force stopping stubborn $label process on port $port"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill -9 "$pid" 2>/dev/null || true
  done <<< "$pids"
}

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ -z "${ZERODHA_API_KEY:-}" || -z "${ZERODHA_API_SECRET:-}" ]]; then
  echo "Missing Zerodha credentials."
  echo "Set ZERODHA_API_KEY and ZERODHA_API_SECRET in your shell or in $ROOT_DIR/.env before running this launcher."
  exit 1
fi

export ZERODHA_LOGIN_CALLBACK_URL="${ZERODHA_LOGIN_CALLBACK_URL:-$CALLBACK_URL_DEFAULT}"

# Derive the auth callback bridge port from the redirect URL (default 8765).
CALLBACK_PORT="8765"
if [[ "$ZERODHA_LOGIN_CALLBACK_URL" =~ :([0-9]+) ]]; then
  CALLBACK_PORT="${BASH_REMATCH[1]}"
fi

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "Frontend dependencies are missing. Run: cd frontend && npm install"
  exit 1
fi

cleanup() {
  local exit_code=$?
  if [[ -n "${API_PID:-}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${CALLBACK_PID:-}" ]] && kill -0 "$CALLBACK_PID" 2>/dev/null; then
    kill "$CALLBACK_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup INT TERM EXIT

stop_port_processes "$API_PORT" "API"
stop_port_processes "$FRONTEND_PORT" "frontend"
stop_port_processes "$CALLBACK_PORT" "auth callback bridge"

echo "Starting Zerodha API on http://$API_HOST:$API_PORT"
echo "Using callback URL: $ZERODHA_LOGIN_CALLBACK_URL"
(
  cd "$ROOT_DIR"
  python run.py api --host "$API_HOST" --port "$API_PORT"
) &
API_PID=$!

echo "Starting auth callback bridge on port $CALLBACK_PORT"
(
  cd "$ROOT_DIR"
  python run.py auth-server --frontend-url "$FRONTEND_URL"
) &
CALLBACK_PID=$!

echo "Starting frontend on http://127.0.0.1:$FRONTEND_PORT"
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

# Wait for the frontend port to be ready, then open the browser
(
  echo "Waiting for frontend to be ready..."
  for i in $(seq 1 30); do
    if lsof -tiTCP:"$FRONTEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Opening http://127.0.0.1:$FRONTEND_PORT in your browser..."
      open "http://127.0.0.1:$FRONTEND_PORT"
      break
    fi
    sleep 1
  done
) &

echo
echo "Launcher ready."
echo "- Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo "- API: http://$API_HOST:$API_PORT"
echo "- Auth callback bridge: http://127.0.0.1:$CALLBACK_PORT"
echo

while true; do
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID" 2>/dev/null || true
    break
  fi

  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    wait "$FRONTEND_PID" 2>/dev/null || true
    break
  fi

  if ! kill -0 "$CALLBACK_PID" 2>/dev/null; then
    wait "$CALLBACK_PID" 2>/dev/null || true
    break
  fi

  sleep 1
done
