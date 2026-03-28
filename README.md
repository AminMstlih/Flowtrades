<img width="1676" height="768" alt="image" src="https://github.com/user-attachments/assets/4accfa67-04a7-424e-928d-9574127f7a88" />
<img width="1676" height="768" alt="image" src="https://github.com/user-attachments/assets/e1bbe359-7be9-45cc-9012-84626569c08a" />


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
| WebSocket connection to Binance | ✅ Working |
| Footprint ladder display | 🔨 In progress |
| Imbalance detection & highlighting | 🔨 In progress |
| OKX + Bybit multi-exchange merge | 📋 Planned |
| Absorption & exhaustion detection | 📋 Planned |
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
pip install -r requirements.txt

# Run
cd Flowtrades/btc-orderflow/frontend
npm run dev

cd Flowtrades/btc-orderflow
python main.py
```

Open your browser and go to `http://localhost:8000`

> ⚠️ **Note:** This project is actively being built. Expect rough edges. If something breaks, open an issue.

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

## Roadmap

- [x] Binance WebSocket trade stream
- [x] Real-time candlestick chart
- [x] Buy/sell volume aggregation per price level
- [x] Delta calculation
- [ ] Imbalance detection with threshold highlighting
- [ ] Absorption & exhaustion pattern detection
- [ ] OKX + Bybit integration (multi-exchange merged view)
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
