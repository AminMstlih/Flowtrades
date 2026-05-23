"""
Symbol mapping constants.
Translates internal symbols to exchange-specific websocket topics/formats.
"""

SYMBOL_MAP = {
    "BTC-USDT": {
        "binance": "BTCUSDT",
        "okx": "BTC-USDT-SWAP",
        "bybit": "BTCUSDT",
    },
    "ETH-USDT": {
        "binance": "ETHUSDT",
        "okx": "ETH-USDT-SWAP",
        "bybit": "ETHUSDT",
    },
    "SOL-USDT": {
        "binance": "SOLUSDT",
        "okx": "SOL-USDT-SWAP",
        "bybit": "SOLUSDT",
    },
}

SUPPORTED_SYMBOLS = list(SYMBOL_MAP.keys())
