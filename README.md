# Zerodha Streamer

This repository now uses a small Python package for Zerodha login, live market data streaming, local candle creation, and a browser dashboard for showcasing the feed.

## What changed

- Credentials are loaded from environment variables.
- Access tokens are cached outside the code files.
- Live streaming logic is isolated from login and configuration.
- Local OHLC candles can be built from live ticks on your machine.
- Live latency can be measured from exchange timestamp to local receipt time.
- A browser dashboard can load symbols, draw candles, highlight pivot levels, and preview trade placement.
- The dashboard now includes an instrument finder that groups cash, futures, and options results.
- The older scripts in `full code/` are kept only as reference material.

## Setup

1. Create a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy `.env.example` values into your shell or an `.env` file that you load manually:

```bash
export ZERODHA_API_KEY="your_api_key"
export ZERODHA_API_SECRET="your_api_secret"
```

4. Create a watchlist file from the sample:

```bash
cp watchlist.example.json watchlist.json
```

## Usage

Run the full local app stack with one command:

```bash
./start_local.sh
```

This starts:
- the Zerodha API on `127.0.0.1:8080`
- the frontend on `127.0.0.1:5173`

If today's access token is missing, the API will automatically launch the supported Zerodha login flow.

If you run the launcher again, it will first stop any older local API or frontend process already using ports `8080` or `5173`.

You can also stop both manually:

```bash
./stop_local.sh
```

The launcher also reads local values from `.env`, so you can keep your setup in one file:

```bash
cp .env.example .env
```

Then fill in:
- `ZERODHA_API_KEY`
- `ZERODHA_API_SECRET`
- `ZERODHA_LOGIN_CALLBACK_URL`

Generate a fresh access token:

```bash
python run.py login
```

You can make login smoother by setting a localhost callback URL that matches your Zerodha app configuration:

```bash
export ZERODHA_LOGIN_CALLBACK_URL="http://127.0.0.1:8765/callback"
python run.py login
```

With that in place, the browser can open automatically and the terminal can capture the request token for you. Even without a callback URL, you can now paste the full redirected URL instead of manually extracting only the request token.

Or exchange a request token directly:

```bash
python run.py login --request-token "paste_request_token_here"
```

Start streaming:

```bash
python run.py stream --duration 30 --mode ltp
```

If a token is missing and you run commands interactively from a terminal, the app can now offer to start the Zerodha login flow for you instead of failing immediately.

Measure websocket lag in milliseconds:

```bash
python run.py stream --duration 30 --mode ltp --show-latency
```

Build local 1-minute candles from live ticks:

```bash
python run.py candles --duration 300 --interval 1 --mode ltp
```

Include latency stats with candle output:

```bash
python run.py candles --duration 120 --interval 1 --mode quote --show-latency
```

Run a no-network candle demo for one share:

```bash
python run.py candles-demo --symbol RELIANCE --token 738561 --interval 1
```

Open today's candles in a local browser dashboard:

```bash
python run.py dashboard --interval 1
```

The same applies to `api`, `dashboard`, `stream`, and `candles`: if today's token is missing, they now automatically start the supported login flow and continue after the callback is captured.

Open a specific stock from NSE or BSE without editing the watchlist:

```bash
python run.py dashboard --stock RELIANCE --exchange NSE --interval 1
```

You can also type a stock symbol and choose NSE/BSE inside the dashboard after it opens.

Enable live buy order placement from the dashboard:

```bash
python run.py dashboard --stock RELIANCE --exchange NSE --interval 1 --enable-trading
```

Try the dashboard without Zerodha network access:

```bash
python run.py dashboard --demo --symbol RELIANCE --token 738561 --interval 1
```

## Showcase Flow

For a clean end-to-end demo, run these in order:

1. Login and cache the current access token:

```bash
python run.py login
```

2. Show live ticks plus lag measurement:

```bash
python run.py stream --duration 30 --mode quote --show-latency
```

3. Show live candle building plus lag stats:

```bash
python run.py candles --duration 120 --interval 1 --mode quote --show-latency
```

4. Launch the dashboard for the visual showcase:

```bash
python run.py dashboard --stock RELIANCE --exchange NSE --interval 1
```

If you prefer a one-command startup, you can also directly run:

```bash
python run.py api
```

or:

```bash
python run.py dashboard
```

If today's token is missing, the app will automatically open the Zerodha login flow, capture the callback, cache the token, and continue.

5. If you want a safe offline demo instead:

```bash
python run.py dashboard --demo --symbol RELIANCE --token 738561 --interval 1
```

## Dashboard Highlights

- Load a stock directly from NSE or BSE without editing files.
- Search an underlying like `NIFTY`, `BANKNIFTY`, `RELIANCE`, `GOLD`, or `USDINR` and browse grouped cash, futures, and options contracts.
- View locally built candles with zoom, hover details, and pivot levels.
- Watch live latency cards for latest, average, min, and max lag.
- Draw buy boxes by clicking candles and preview a buy workflow.
- Optionally enable real buy placement with `--enable-trading`.

## How To Explore Derivatives

1. Start the live dashboard:

```bash
python run.py dashboard --interval 1
```

2. In the left sidebar, use `Instrument finder`.

3. Type an underlying such as:
- `NIFTY`
- `BANKNIFTY`
- `RELIANCE`
- `GOLD`
- `USDINR`

4. Choose `All`, `Futures`, or `Options`, then click `Find contracts`.

5. Click any result to load its live candle chart.

Notes:
- Real derivatives need Zerodha login and a valid access token for the day.
- The current buy-order panel is intentionally limited to cash equities, so derivative exploration stays safe and simple.

## Verification

Run the lightweight test suite with:

```bash
python -m unittest discover -s tests
```
