# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python)

```bash
# Install dependencies (use pip + venv, not uv or poetry)
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Run the full stack (API on :8080 + frontend on :5173)
./start_local.sh

# Stop the stack
./stop_local.sh

# Authenticate and cache today's access token
python run.py login

# Start just the API server
python run.py api

# Stream live ticks
python run.py stream --duration 30 --mode ltp

# Build candles from live ticks
python run.py candles --duration 300 --interval 1 --mode quote --show-latency

# Offline candle demo (no Zerodha credentials needed)
python run.py candles-demo --symbol RELIANCE --token 738561 --interval 1

# Run all tests
python -m unittest discover -s tests

# Run a single test file
python -m unittest tests.test_api_server
```

### Frontend (React/TypeScript)

```bash
cd frontend
npm install
npm run dev          # dev server on :5173
npm run build        # type-check + Vite production build
```

## Environment Variables

Required in `.env` or shell before running:
- `ZERODHA_API_KEY`
- `ZERODHA_API_SECRET`
- `ZERODHA_LOGIN_CALLBACK_URL` (optional; enables auto-capture of request token via localhost callback, e.g. `http://127.0.0.1:8765/callback`)

Optional overrides: `ZERODHA_TOKEN_CACHE`, `ZERODHA_WATCHLIST_FILE`, `ZERODHA_WATCHLIST` (inline `token:symbol,...` pairs), `ZERODHA_LOG_LEVEL`.

## Working in this repo

**Always ask before editing or creating files.** Describe what you plan to change and wait for confirmation. Only proceed without asking when the task is completely unambiguous and there is exactly one sensible implementation. Ask when requirements are ambiguous, multiple valid approaches exist, or the action is destructive.

**Commit format:** conventional commits — `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`. Subject line under 72 characters, imperative mood. Example: `feat: add 2-minute candle resampling in api_server`.

**Tests:** every new function or module in `zerodha_app/` needs a corresponding test in `tests/`. Run `python -m unittest discover -s tests` before declaring anything done. The test suite uses `unittest` and `FakeKiteAPI` stubs — do not introduce `pytest` or `mock` unless already imported in that file.

**`dashboard.py` is deprecated.** Don't add new features there. New API surface belongs in `api_server.py`.

**Never touch `.zerodha/access_tokens.json` directly.** Token reads and writes go through `AuthManager` in `auth.py` only.

**CORS is locked to `http://127.0.0.1:5173`.** Don't widen it or make it configurable without explicit instruction.

**Read before modifying.** Always read the relevant file before making changes. Don't assume behaviour from filenames — verify by reading. Match the existing code style and patterns of whatever file you're in.

**Complete tasks fully.** Don't leave stubs, TODOs, or partial implementations. If something is blocked, say so explicitly.

## Python standards

**Type hints on all new code** — Python 3.10+ style (`str | None`, not `Optional[str]`).

**File paths via `pathlib`** — the codebase uses `Path` consistently throughout; never use `os.path` string concatenation.

**Logging via `logging.getLogger(__name__)`** — module-level, matching the existing pattern in all `zerodha_app/` modules. Don't use `print()` for operational output in library code.

**Error handling:**
- Use specific exception types (`ValueError`, `RuntimeError`, `TimeoutError`) — no bare `except:` or silent swallows.
- The CLI boundary in `cli.py` catches `(OSError, RuntimeError, TimeoutError, ValueError)` — keep new exceptions in that set or handle them closer to the source.
- Use context managers for resource cleanup, not manual try/finally.

**Docstrings** on public functions and classes; skip for private `_prefixed` helpers unless the logic is non-obvious.

**Imports:** standard library first, then third-party, then local — alphabetical within each group. No wildcard imports.

## TypeScript / React standards

**Interfaces over inline types** for data structures passed between components or services. Shared types live in `src/types/index.ts`.

**All state and async operations go through `useTradingStore`** (Zustand). Don't scatter `useState` calls for data that other components need.

**Services in `src/services/`** are the only place that calls the backend API directly. Components call the store; the store calls services.

**Mock data** (`src/mocks/`) is activated by `VITE_USE_MOCK_DATA=true` in `frontend/.env`. Use it when working on UI without a running backend.

## Architecture

### Python package: `zerodha_app/`

- **`config.py`** — `Settings` dataclass, `load_settings()` reads env vars, `load_watchlist()` parses `watchlist.json` (`{token: symbol}` or list of `{token, symbol}` objects).
- **`auth.py`** — `AuthManager` wraps KiteConnect login. Tokens cached by date in `.zerodha/access_tokens.json`. On a missing token it prompts interactively (TTY) or triggers the localhost callback flow automatically.
- **`streamer.py`** — `LiveTicker` runs the KiteTicker WebSocket. Internally uses `TickStore` (latest tick per symbol), `CandleSeries` (OHLC candle builder), and `LatencyTracker` (exchange-to-local lag). `simulate_candles()` produces offline test data.
- **`dashboard.py`** — Deprecated single-binary HTTP server + embedded HTML dashboard. Kept for `python run.py dashboard`; seeds `CandleSeries` from Kite historical data then updates via `LiveTicker`.
- **`api_server.py`** — `ZerodhaFrontendAPI` backed by `ThreadingHTTPServer`. Serves the React frontend. Lazy-loads all instruments from NSE/BSE/NFO/MCX/CDS at first request. Handles interval resampling server-side (sub-minute expansion, N-minute aggregation, weekly rollup). CORS pinned to `http://127.0.0.1:5173`.
- **`instruments.py`** — `InstrumentCatalog` for derivative look-up (futures/options grouped by underlying).
- **`cli.py`** — `argparse` CLI; `auto_login_commands = {"api", "dashboard", "stream", "candles"}` sets `login_if_needed=True` automatically.

### API endpoints (`api_server.py`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/auth/status` | Whether today's token is cached |
| GET | `/api/auth/login-url` | Kite login URL |
| GET | `/api/auth/callback?request_token=` | OAuth redirect handler |
| GET | `/api/profile` | Zerodha user profile |
| GET | `/api/instruments` | All instruments (NSE/BSE/NFO/MCX/CDS) |
| GET | `/api/quote?symbols=A,B` | Live quotes |
| GET | `/api/historical/{token}?interval=&from=&to=` | Historical candles |
| GET | `/api/option-chain?underlying=&expiry=` | Option chain for an expiry |
| GET | `/api/depth?instrumentToken=` | Level 2 market depth |
| GET | `/api/watchlist` | Load watchlist file |
| POST | `/api/watchlist` | Save watchlist file |
| POST | `/api/orders` | Place a Kite buy/sell order |

Historical intervals not natively in Kite (`5second`, `10second`, `15second`, `30second`, `2minute`, `4minute`, `week`) are synthesised server-side from minute or day data via `_expand_minute_rows` / `_resample_rows_by_minutes` / `_resample_rows_by_week`.

### React frontend (`frontend/src/`)

- **State**: Single Zustand store in `store/useTradingStore.ts`. All async operations live here.
- **Services**: `services/` — thin wrappers over `axios` to the local API. Mock data in `mocks/` is used when `VITE_USE_MOCK_DATA=true`.
- **Components**: Organised by feature — `chart/` (CandleChart uses `lightweight-charts`), `watchlist/`, `optionChain/`, `layout/`, `common/`, `auth/`.
- **Types**: Shared TypeScript types in `src/types/index.ts`.

### Token / auth flow

1. `start_local.sh` starts frontend first (login redirect needs somewhere to land), then checks for a cached token.
2. If missing, runs `python run.py login`, which opens the Kite login URL in a browser, spins up a local HTTP server on the callback port, waits for Zerodha to redirect with `?request_token=`, exchanges it, and writes to `.zerodha/access_tokens.json`.
3. API server reads the cached token on first request; no token is ever sent to the frontend.

### Watchlist format

`watchlist.json` accepts either format:
```json
{"256265": "NIFTY 50", "738561": "RELIANCE"}
```
or
```json
[{"token": 256265, "symbol": "NIFTY 50"}]
```
