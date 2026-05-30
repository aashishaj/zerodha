# Derivatives Dashboard Frontend

This is a React + TypeScript + Vite frontend for a Kite-inspired derivatives dashboard. It is intentionally inspired by a modern trading terminal layout, but it does not use Zerodha branding, logos, or proprietary assets.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Lightweight Charts by TradingView
- Zustand
- Axios

## Run

```bash
cd frontend
npm install
npm run dev
```

If the browser ever shows a blank page during development, hard refresh once. The app now includes an on-screen error boundary so runtime crashes should display a readable message instead of silently failing.

## Mock Mode

Real Zerodha-backed mode is enabled by default.

Create `.env` if needed:

```bash
VITE_USE_MOCK_DATA=true
```

When mock mode is on:

- instruments are loaded from `src/mocks/instruments.ts`
- quotes are loaded from `src/mocks/quotes.ts`
- historical candles are loaded from `src/mocks/candles.ts`

This lets the app run without live Zerodha credentials.

To use real Zerodha data, keep `VITE_USE_MOCK_DATA` unset or set it to `false`, then start the Python API server:

```bash
cd /Users/amrutakekre/Aashish/zerodha
python run.py api
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8080`.

## Zerodha Backend Integration

The frontend assumes a backend proxy layer.

Expected internal endpoints:

- `GET /api/profile`
- `GET /api/instruments`
- `GET /api/quote?symbols=`
- `GET /api/historical/:instrumentToken?interval=`
- `GET /api/option-chain?underlying=&expiry=`
- `POST /api/watchlist`

Integration points are commented in:

- `src/services/instrumentsService.ts`
- `src/services/marketDataService.ts`
- `src/services/chartService.ts`
- `src/services/optionChainService.ts`

Important:

- never expose Zerodha access tokens in the frontend
- keep Kite Connect access token handling on the backend
- cache instruments dump server-side when possible
- historical candles should return latest available bars even when the market is closed

## Search Behavior

Search supports:

- `NIFTY`
- `BANKNIFTY`
- `24000`
- `NIFTY 24000`
- `NIFTY 24000 CE`
- `NIFTY 24000 PE`
- `BANKNIFTY 51000`

Search logic:

1. parse underlying, strike, and option side
2. filter instruments by segment/type
3. sort by exact match, underlying, expiry, strike, and side

Implementation:

- parser and ranking live in `src/utils/search.ts`

## Historical Chart Behavior

When an instrument is selected:

1. resolve `instrument_token`
2. fetch historical candles for the selected interval
3. cache the result by `instrument_token + timeframe`
4. render candles even if the market is closed

The UI should only show empty state if the historical API truly returns no candles.

## Persistence

Watchlist persistence uses `localStorage` through:

- `src/services/watchlistService.ts`

## Structure

```text
src/
  components/
    layout/
    watchlist/
    chart/
    optionChain/
    common/
  services/
  store/
  types/
  mocks/
  utils/
```
