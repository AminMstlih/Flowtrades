/**
 * Header — UI Chrome Component
 *
 * Wrapped in React.memo (Section 8.2) — prevents re-renders from chart data changes.
 * Reads from latestDataRef via a low-frequency interval (not per-tick).
 * 44px minimum touch targets on all interactive controls (Section 4.3).
 */

import React, { useState, useEffect, useRef } from 'react';

export const Header = React.memo(function Header({ latestDataRef, connectionStatus }) {
  // Low-frequency UI update — read ref on interval, NOT per WebSocket tick
  const [displayData, setDisplayData] = useState({
    lastPrice: 0,
    totalTrades: 0,
    totalCandles: 0,
    windowSec: 300,
    exchanges: [],
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const data = latestDataRef.current;
      if (data) {
        setDisplayData({
          lastPrice: data.last_price || 0,
          totalTrades: data.total_trades || 0,
          totalCandles: data.total_candles || 0,
          windowSec: data.window_sec || 300,
          exchanges: data.exchanges || [],
        });
      }
    }, 500); // Update header at 2Hz max — no need for 60fps on text

    return () => clearInterval(interval);
  }, [latestDataRef]);

  const fmtPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 1,
  }).format(displayData.lastPrice);

  const fmtTotal = new Intl.NumberFormat('en-US').format(displayData.totalTrades);
  const fmtCandles = new Intl.NumberFormat('en-US').format(displayData.totalCandles);

  return (
    <header className="header" role="toolbar">
      <div className="header-left">
        <h1 className="title">⚡ BTC ORDER FLOW</h1>
        <div className="exchange-list">
          {displayData.exchanges.length
            ? displayData.exchanges.join(' • ').toUpperCase()
            : 'WAITING FOR DATA...'}
        </div>
      </div>

      <div className="header-center">
        <div className="live-price">{fmtPrice}</div>
      </div>

      <div className="header-right">
        <div className="controls-row">
          <div className={`status-badge ${connectionStatus === 'connected' ? 'connected' : 'disconnected'}`}>
            <div className="status-dot"></div>
            {connectionStatus === 'connected' ? 'LIVE' : connectionStatus === 'reconnecting' ? 'RECONNECTING' : 'OFFLINE'}
          </div>
        </div>

        <div className="stats-row">
          <div>
            Interval: <span className="stat-value">{displayData.windowSec / 60}m</span>
          </div>
          <div>
            Candles: <span className="stat-value">{fmtCandles}</span>
          </div>
          <div>
            Tot: <span className="stat-value">{fmtTotal}</span>
          </div>
        </div>
      </div>
    </header>
  );
});
