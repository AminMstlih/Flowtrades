<p align="center">
  <img src="https://img.shields.io/badge/FLOWTRADES-%E2%9A%A1-00e5ff?style=for-the-badge&labelColor=0D1B2A&color=00e5ff" height="35" />
</p>

<h1 align="center">⚡ Flowtrades — Trades Flow Terminal</h1>

<p align="center">
  <strong>Real-time parallel order flow aggregation, pattern detection, and Canvas footprints at 60 FPS.</strong>
</p>

<p align="center">
  <a href="https://github.com/AminMstlih/Flowtrades/actions"><img src="https://img.shields.io/badge/BUILD-PASSING-00e676?style=for-the-badge&logo=github-actions&logoColor=fff&labelColor=1E3448" alt="Build Status" /></a>
  <a href="https://github.com/AminMstlih/Flowtrades"><img src="https://img.shields.io/badge/STABILITY-STABLE-00e5ff?style=for-the-badge&logo=statuspage&logoColor=fff&labelColor=1E3448" alt="Stability" /></a>
  <a href="https://github.com/AminMstlih/Flowtrades"><img src="https://img.shields.io/badge/UI-HUD_GLASS-ff9f1c?style=for-the-badge&logo=css3&logoColor=fff&labelColor=1E3448" alt="UI Style" /></a>
  <a href="https://github.com/AminMstlih/Flowtrades/blob/main/LICENSE"><img src="https://img.shields.io/badge/LICENSE-MIT-2196f3?style=for-the-badge&logo=mit&logoColor=fff&labelColor=1E3448" alt="License" /></a>
</p>

<p align="center">
  <a href="https://github.com/AminMstlih/Flowtrades"><img src="https://img.shields.io/badge/EXCHANGES-OKX_%E2%80%A2_BYBIT_%E2%80%A2_BINANCE-7209b7?style=for-the-badge&logo=coingecko&logoColor=fff&labelColor=1E3448" alt="Exchanges Connected" /></a>
</p>

---

> [!NOTE]
> **NO SIGNALS. NO LAGGING INDICATORS. NO NOISE. JUST RAW EXECUTED CONTRACT DATA.**
>
> Flowtrades normalizes high-frequency WebSockets streams directly from major perpetual futures exchanges, resolving institutional-grade footprint volume ladders, volume-delta imbalances, and order book absorption wicks.

<details>
  <summary>📸 Click to view Terminal Interface Screenshots</summary>
  <br/>
  <p align="center">
    <img width="100%" alt="Flowtrades Dashboard" src="https://github.com/user-attachments/assets/fa3eef6c-a4bf-4311-8a4a-0bb7208aec88" />
    <img width="100%" alt="Footprint Detail View" src="https://github.com/user-attachments/assets/4ad8a6ae-9643-4a04-82b1-c5918cebd33a" />
    <img width="100%" alt="Order Book Imbalances" src="https://github.com/user-attachments/assets/4ff25078-30f8-4dc2-bbfa-b562ee0bbae1" />
  </p>
</details>

---

A high-performance, real-time order flow terminal built for retail traders who are tired of lagging indicators. Flowtrades streams raw perp trades directly from the biggest futures exchanges, organizing volume ticks through a dedicated WebWorker background thread to achieve lag-free rendering on a custom TradingView canvas.

---

## What This Is

Most retail traders watch RSI, MACD, or Moving Averages. These are all **derivatives of price** — they always lag. By the time they cross, you are exit liquidity.

Flowtrades shows you **raw, executed contract data** — who is buying, who is selling, and where orders are clustering in real-time. 

**This is not:**
- ❌ A signal provider or alert bot
- ❌ A prediction engine
- ❌ A "buy here, sell there" automated cheat

**This is:**
- ✅ A complete market transparency engine
- ✅ An institutional terminal layout for price discovery
- ✅ A strict visual record of raw executed market delta

---

## Features (Current Build)

| Feature | Status |
|---------|--------|
| Live Candlestick & Footprint Custom Series | ✅ Built |
| Parallel WebWorker Aggregation Thread | ✅ Built |
| Real-time Buy/Sell Volume Splits | ✅ Built |
| Cumulative Monospace Volume Delta | ✅ Built |
| High-Severity Delta Imbalance Color-Coding | ✅ Built |
| Absorption wicks (`ABS` / `A`) & Exhaustion limits (`EXH` / `E`) | ✅ Built |
| Dynamic Space-Aware Badge Abbreviation & Collision Guard | ✅ Built |
| Real-Time Price Line Countdown Overlay (`MM:SS`) | ✅ Built |
| Live Connection Health HUD & Starred Symbol Watchlist | ✅ Built |

---

## Tech Stack

**Backend**
- Python + `asyncio`
- High-frequency asynchronous exchange WebSocket clients (OKX, Bybit, Binance)
- FastAPI WebSocket Broadcasting Server

**Frontend**
- React 18 + Vite
- Zustand State Management
- HTML5 WebWorker Thread (Background data aggregation)
- TradingView Lightweight Charts (Custom Series Canvas Renderer)

---

## How It Works

```
Binance / OKX / Bybit WebSockets
               │
               ▼
       Trade Normalizer
  (price, volume, side, timestamp)
               │
               ▼
     FastAPI WS Broadcast
               │
               ▼
  HTML5 WebWorker Aggregation Thread
  (price-binning, POC, delta, imbalances)
               │
               ▼
  Glassmorphic Web UI (60 FPS Canvas)
```

---

## Project Structure

```
Flowtrades/
├── app/
│   ├── frontend/          # React + Vite UI
│   │   └── src/
│   │       ├── components/    # Chart components, sidebar panel, countdown overlays
│   │       ├── hooks/         # ViewModel and async state orchestrators
│   │       ├── core/          # Global Zustand UI stores & WebWorker scripts
│   │       └── utils/         # Formatting helpers and tick stepping logic
│   ├── aggregation/       # Footprint volume-binning & snapping engines
│   ├── detection/         # Asynchronous imbalance, absorption & exhaustion engines
│   ├── ingestion/         # Asynchronous exchange WebSocket stream clients
│   ├── normalization/     # Unified schema and price snaps normalization
│   ├── output/            # Uvicorn FastAPI WebSocket hub & REST server
│   ├── dev_runner.py      # Concurrent development process runner
│   ├── prod_runner.py     # Production asset builder & single-process runner
│   ├── main.py            # Base terminal orchestrator entrypoint
│   └── config.toml        # Live exchange feed configuration
├── docs/                  # System architecture specifications & Decisions Log
└── README.md
```

---

## Quick Start

### 1. Clone the Repo
```bash
git clone https://github.com/AminMstlih/Flowtrades.git
cd Flowtrades
```

### 2. Setup Backend (Virtual Env Recommended)
```bash
# Create and activate python virtual environment
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 3. Install Frontend Dependencies
```bash
cd app/frontend
npm install
cd ..
```

### 4. Run the Terminal

#### For Development (Backend + Frontend Hot-Reload)
Starts the FastAPI backend and Vite Dev Server concurrently in a single terminal.
```bash
# Run from the app/ directory
python dev_runner.py
```
* Access the interface at: **`http://localhost:5173`**

#### For Production (Single Process)
Compiles frontend assets into static bundles and serves them directly through the FastAPI uvicorn server.
```bash
# Run from the app/ directory
python prod_runner.py
```
* Access the interface at: **`http://localhost:8000`**

---

### Exchange Configuration
By default, the application is pre-configured to use **OKX** as the primary data source. This is recommended for users in regions (like Indonesia) where Binance IP restrictions (`HTTP 403`) are common.

> ⚓ **Architecture Note (OHLC Anchoring):** While the footprint ladder aggregates trading volume from ALL enabled exchanges to show full market liquidity, the Candlestick bounds (Open, High, Low, Close) are strictly anchored to the primary exchange (OKX). This prevents cross-exchange price differences (e.g. BTC-USDT-SWAP vs BTCUSDT) from creating visual gaps in the wicks.

To edit your exchange sources:
1. Open `app/config.toml` in the directory.
2. Locate the `[exchanges]` section.
3. Update the `enabled` list:
   ```toml
   [exchanges]
   enabled = ["okx", "bybit", "binance"]
   ```

---

## Troubleshooting

**Chart shows no data**
Check your region. Binance blocks certain IPs (Indonesia, etc.).
Set `enabled = ["okx", "bybit"]` in `app/config.toml` and restart the backend.

**Websocket connects but frontend shows nothing**
Make sure you are accessing the correct port.
- Dev Mode: Access **`http://localhost:5173`** (Vite proxy)
- Prod Mode: Access **`http://localhost:8000`** (Uvicorn static server)

---

## Contributing

This is an open build. If you cloned this and have ideas, found bugs, or want to add exchange support — open an issue or a PR. Retail traders building tools for retail traders.

---

## License

MIT — use it, fork it, build on it.
