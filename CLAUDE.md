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

Deployment / multi-account:
- `APP_URL` — public origin of the served app (e.g. `https://itmcrest.in`). Sets the CORS `Access-Control-Allow-Origin` and marks the session cookie `Secure` when it is `https`. Defaults to `http://127.0.0.1:5173`.
- `ZERODHA_DB_KEY` — optional passphrase enabling at-rest encryption of each account's stored Kite `api_secret` in `.zerodha/app.db` (see `secretbox.py`). When unset, secrets are stored in plaintext and existing rows keep working; when set, new/updated secrets are Fernet-encrypted. Losing or changing the key makes previously encrypted secrets unrecoverable (re-enter them via the account picker).

## Working in this repo

**Always ask before editing or creating files.** Describe what you plan to change and wait for confirmation. Only proceed without asking when the task is completely unambiguous and there is exactly one sensible implementation. Ask when requirements are ambiguous, multiple valid approaches exist, or the action is destructive.

**Commit format:** conventional commits — `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`. Subject line under 72 characters, imperative mood. Example: `feat: add 2-minute candle resampling in api_server`.

**Tests:** every new function or module in `zerodha_app/` needs a corresponding test in `tests/`. Run `python -m unittest discover -s tests` before declaring anything done. The test suite uses `unittest` and `FakeKiteAPI` stubs — do not introduce `pytest` or `mock` unless already imported in that file.

**`dashboard.py` is deprecated.** Don't add new features there. New API surface belongs in `api_server.py`.

**Never touch `.zerodha/access_tokens.json` directly.** Token reads and writes go through `AuthManager` in `auth.py` only.

**CORS origin comes from `APP_URL`** (`FRONTEND_URL` in `api_server.py`), defaulting to `http://127.0.0.1:5173` for local dev and set to the public origin (e.g. `https://itmcrest.in`) in the systemd deployment. It is a single allowed origin, not a wildcard — keep it that way. Don't broaden it to `*` or echo arbitrary request origins.

**Account secrets are sensitive.** Kite `api_secret` values live in `.zerodha/app.db`. The DB file is permission-hardened to owner-only on open (`secretbox.harden_db_permissions`) and can be encrypted at rest via `ZERODHA_DB_KEY`. Never send `api_secret` to the client (`accounts_for_user` exposes `api_key` to admins only, never the secret), and never log it.

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
- **`dashboard.py`** — Deprecated single-binary HTTP server + embedded HTML dashboard. Kept for `python run.py dashboard`; seeds `CandleSeries` from Kite historical data then updates via `LiveTicker`. `api_server.py` still imports `_history_window` / `_load_history_with_fallback` from it.
- **`api_server.py`** — `ZerodhaFrontendAPI` backed by `ThreadingHTTPServer`. Serves the built React app from `frontend/dist/` (no nginx needed), streams live ticks over SSE (`/api/ticks/stream` via `TickBroadcaster`), and gates every non-public route on an app session + role. Lazy-loads all instruments from NSE/BSE/NFO/MCX/CDS at first request. Handles interval resampling server-side (sub-minute expansion, N-minute aggregation, weekly rollup). CORS origin and cookie `Secure` flag derive from `APP_URL` (see the CORS note above).
- **`appauth.py`** — `UserStore`: SQLite-backed app users (roles `super_admin`/`trader`/`seller`/`buyer`), PBKDF2-SHA256 password hashing (600k iterations), and login sessions (12h TTL, per-session selected account). This is the app's own login, separate from the Zerodha/Kite session.
- **`accounts.py`** — `AccountStore`: Zerodha accounts (one per broker `zerodha_user_id`), their per-account Kite app credentials, and the `user_accounts` assignment table controlling which buyers/sellers can act on which accounts. Shares `.zerodha/app.db` with `UserStore`.
- **`secretbox.py`** — At-rest protection for stored `api_secret`: `harden_db_permissions()` (owner-only file perms, called on store init) and `encrypt_secret`/`decrypt_secret` (Fernet, keyed off `ZERODHA_DB_KEY`; no-ops to plaintext when unset).
- **`callback_server.py`** — Standalone localhost auth-callback bridge (`python run.py auth-server`) that catches the Kite OAuth redirect and exchanges the request token.
- **`instruments.py`** — `InstrumentCatalog` for derivative look-up (futures/options grouped by underlying).
- **`cli.py`** — `argparse` CLI; `auto_login_commands = {"api", "dashboard", "stream", "candles"}` sets `login_if_needed=True` automatically.

### API endpoints (`api_server.py`)

All routes except `/api/health`, `/api/app/login`, and `/api/auth/callback` require a valid app session cookie (`sid`); admin/account-management routes additionally require the `super_admin` role.

App auth & session:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check (public) |
| POST | `/api/app/login` | Log in an app user; sets the `sid` session cookie |
| POST | `/api/app/logout` | Clear the session |
| GET | `/api/app/me` | Current app user + the accounts they can use |
| POST | `/api/session/select-account` | Set the session's active Zerodha account |

App user admin (`super_admin` only):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/app/users` | List app users |
| POST | `/api/app/users` | Create an app user |
| POST | `/api/app/users/{id}/{role\|password\|active\|delete}` | Update a user's role/password/active flag, or delete |
| GET | `/api/app/users/{id}/accounts` | Accounts assigned to a user |

Zerodha account management (`super_admin` only unless noted):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/accounts` | Accounts visible to the caller (any logged-in user; scoped to their assignments) |
| GET | `/api/accounts/{id}/users` | Users assigned to an account |
| GET | `/api/accounts/{id}/login-url` | Kite login URL for a specific account |
| POST | `/api/accounts/connect-init` | Begin connecting a new Kite app (parks credentials, returns login URL) |
| POST | `/api/accounts/{id}/credentials` | Store/replace an account's Kite `api_key`/`api_secret` |
| POST | `/api/accounts/assign` | Assign an account to a user |
| POST | `/api/accounts/unassign` | Remove an assignment |
| POST | `/api/accounts/{id}/delete` | Delete an account |

Zerodha (Kite) session & market data (for the session's active account):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/status` | Whether today's token is cached |
| GET | `/api/auth/login-url` | Kite login URL |
| GET | `/api/auth/callback?request_token=` | OAuth redirect handler (public) |
| GET | `/api/profile` | Zerodha user profile |
| GET | `/api/funds` | Available cash/margin |
| GET | `/api/instruments` | All instruments (NSE/BSE/NFO/MCX/CDS) |
| GET | `/api/quote?symbols=A,B` | Live quotes |
| GET | `/api/historical/{token}?interval=&from=&to=` | Historical candles |
| GET | `/api/option-chain?underlying=&expiry=` | Option chain for an expiry |
| GET | `/api/depth?instrumentToken=` | Level 2 market depth |
| GET | `/api/ticks/stream` | Live tick stream (Server-Sent Events) |

Orders, portfolio & watchlist:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders/list` | Today's orders |
| POST | `/api/orders` | Place a Kite buy/sell order (role-gated by side) |
| POST | `/api/orders/cancel` | Cancel an open order |
| GET | `/api/holdings` | Long-term holdings |
| GET | `/api/positions` | Open positions |
| GET | `/api/watchlist` | Load watchlist file |
| POST | `/api/watchlist` | Save watchlist file |

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
