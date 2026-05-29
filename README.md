# Flowtrades

Real-time BTC order flow visualization across Binance, OKX, and Bybit exchanges.

<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/fa3eef6c-a4bf-4311-8a4a-0bb7208aec88" />
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/4ad8a6ae-9643-4a04-82b1-c5918cebd33a" />
<img width="1366" height="768" alt="image" src="https://github.com/user-attachments/assets/4ff25078-30f8-4dc2-bbfa-b562ee0bbae1" />

## Quick Start

### For Development (Hot Reload)
```bash
cd btc-orderflow
python dev_runner.py
```
Access: http://localhost:5173

### For Production (Single Server) ⭐
```bash
cd btc-orderflow
python prod_runner.py
```
Access: http://localhost:8000

## Documentation

See [btc-orderflow/DEV_GUIDE.md](btc-orderflow/DEV_GUIDE.md) for detailed setup instructions.

## Features

- 🔄 Real-time order flow aggregation from multiple exchanges
- 📊 Interactive footprint chart with price ladder
- 🎯 Detection of large trades, imbalances, and absorption
- 🚀 Production-ready single-server deployment
- 🔥 Development mode with hot reload

## Architecture

```
Exchange APIs → Normalization → Trade Bus → Aggregation → FastAPI Server → React Frontend
                                                    ↕
                                              WebSocket Broadcast
```

# Flowtrades ⚡

> **Real order flow. No signals. No noise. Just what the market is actually doing.**

A lightweight, real-time BTC order flow visualization tool built for retail traders who are tired of lagging indicators and fake signal providers. Flowtrades pulls live executed trade data from the biggest perpetual futures exchanges and shows you the actual buying and selling pressure at each price level.

---

## What This Is

Most retail traders watch RSI. MACD. Moving averages. These are all **derivatives of price** — they always lag behind what's happening. By the time they signal, the move is already done and you're the exit liquidity.

Flowtrades shows you the **raw executed trades** — who is buying, who is selling, and at what price levels volume is stacking up. This is what institutional traders see. Now you can too.

**This is not:**
- ❌ A signal provider
- ❌ A prediction engine
- ❌ A "buy here, sell there" tool

**This is:**
- ✅ A market transparency layer
- ✅ A decision-support tool
- ✅ A thinking framework for reading real price action

---

## Features (Current Build)

| Feature | Status |
|---------|--------|
| Live candlestick chart | ✅ Working |
| Real-time buy / sell volume per price level | ✅ Working |
| Delta (buy pressure − sell pressure) | ✅ Working |
| Footprint ladder display (DOM & Canvas) | ✅ Working |
| OKX + Bybit multi-exchange connectivity | ✅ Working |
| Imbalance detection & highlighting | ✅ Working |
| Absorption & exhaustion detection | ✅ Working |
| User UI toggles (Badges, Rendering) | ✅ Working |
| Mobile-responsive web dashboard | 📋 Planned |

---

## How It Works

```
Binance / OKX / Bybit WebSocket streams
        │
        ▼
  Trade Normalizer
  (price · volume · side · timestamp)
        │
        ▼
  Aggregation Engine
  (buckets by price level → buy vol · sell vol · delta · imbalance%)
        │
        ▼
  Detection Engine
  (imbalance · absorption · exhaustion patterns)
        │
        ▼
  Web Dashboard (Canvas-based chart + footprint ladder)
```

No indicators. No derivatives. Only **executed trade data**.

---

## Tech Stack

**Backend**
- Python + asyncio
- WebSocket clients (Binance aggTrade stream)
- FastAPI (WebSocket server to frontend)

**Frontend**
- JavaScript / CSS / HTML
- TradingView Lightweight Charts (Canvas-based, 60fps)
- Real-time WebSocket feed

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/AminMstlih/Flowtrades.git
cd Flowtrades/btc-orderflow

# Install Python dependencies
```
cd Flowtrades/btc-orderflow
pip install -r requirements.txt
```
## Quick Start

### For Development (Hot Reload)
```bash
cd btc-orderflow
python dev_runner.py
```
Access: http://localhost:5173

### For Production (Single Server) ⭐
```bash
cd btc-orderflow
python prod_runner.py
```
Access: http://localhost:8000

> ⚠️ **Note:** This project is actively being built. Expect rough edges. If something breaks, open an issue.

### Exchange Configuration
By default, the application is pre-configured to use **OKX** as the primary data source. This is recommended for users in regions (like Indonesia) where Binance IP restrictions (`HTTP 403`) are common.

> ⚓ **Architecture Note (OHLC Anchoring):** While the footprint ladder aggregates trading volume from ALL enabled exchanges to show full market liquidity, the Candlestick bounds (Open, High, Low, Close) are strictly anchored to the primary exchange (OKX). This prevents cross-exchange price differences (e.g. BTC-USDT-SWAP vs BTCUSDT) from creating visual artifacts or gaps in the candle bodies.

To edit your exchange sources:
1. Open `config.toml` in the root directory.
2. Locate the `[exchanges]` section.
3. Update the `enabled` list:
   ```toml
   [exchanges]
   enabled = ["okx", "bybit", "binance"]
   ```

---

## Project Structure

```
Flowtrades/
├── btc-orderflow/      # Core Python backend
│   ├── main.py         # Entry point
│   ├── ingestion/      # WebSocket clients per exchange
│   ├── normalization/  # Trade data schema + normalizers
│   ├── aggregation/    # Footprint engine (buy/sell/delta)
│   └── output/         # Terminal + WebSocket server
├── docs/               # Architecture & engineering docs
├── .gitignore
├── LICENSE             # MIT
└── README.md
```

---

## The Footprint — What You're Looking At

```
Price     | Buy Vol  | Sell Vol | Delta     | Imbalance
──────────┼──────────┼──────────┼───────────┼──────────
67,250    |   42.80  |   12.10  |  +30.70   |  +78%  ▲
67,249    |   18.40  |   62.30  |  -43.90   |  -77%  ▼  [ABS]
67,248    |    8.20  |    9.10  |   -0.90   |    --
67,247    |   91.00  |   22.50  |  +68.50   |  +80%  ▲
```

**Reading it:**
- **High imbalance (≥70%)** = one side aggressively dominating that price level
- **[ABS]** = Absorption detected — high volume, low price movement — a large player may be defending that level
- **[EXH]** = Exhaustion — volume spike followed by counter-pressure — momentum weakening

---

- [x] Binance + OKX + Bybit WebSocket support
- [x] Real-time candlestick chart
- [x] Buy/sell volume aggregation per price level
- [x] Delta calculation
- [x] Imbalance detection with threshold highlighting
- [x] Absorption & exhaustion pattern detection
- [x] Multi-exchange merged view (OKX/Bybit)
- [x] User-controlled toggle for detection badges
- [ ] Mobile-responsive web dashboard
- [ ] Educational tooltips explaining each pattern
- [ ] Historical replay mode

---

## Philosophy

This tool is built against three things:

- **Blind trading** — entering without knowing who is on the other side
- **Indicator dependency** — using lagging data as if it predicts the future
- **Fake signal providers** — paying for someone else's guesses

If you use this tool correctly, it won't tell you what to do. It will show you **what is happening**. The decision is still yours — which is exactly how it should be.

---

## Contributing

This is an open build. If you cloned this and have ideas, found bugs, or want to add exchange support — open an issue or a PR. Retail traders building tools for retail traders.

---

## License

MIT — use it, fork it, build on it.

---

<p align="center">
  Built by a retail trader, for retail traders.<br/>
  Not financial advice. Never signals. Always raw market data.
</p>
