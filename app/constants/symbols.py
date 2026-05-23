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
    "HYPE-USDT": {
        "binance": "HYPEUSDT",
        "okx": "HYPE-USDT-SWAP",
        "bybit": "HYPEUSDT",
    },
    "BEAT-USDT": {
        "binance": "BEATUSDT",
        "okx": "BEAT-USDT-SWAP",
        "bybit": "BEATUSDT",
    },
}

SUPPORTED_SYMBOLS = list(SYMBOL_MAP.keys())
