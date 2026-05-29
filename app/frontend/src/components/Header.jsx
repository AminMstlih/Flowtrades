import React from 'react';
import { TICK_STEPS, snapTick } from '../utils/tickSteps';
import { formatPriceLike } from '../utils/formatVol';
import { useUIStore } from '../core/store/uiStore';

export function Header({ state, status, instrument, tickSize, tickOptions = TICK_STEPS, setTickSize, setTickMode, autoFit, onAutoFitToggle, timeframeWindow, setTimeframeWindow, showBadges, setShowBadges, symbol, availableSymbols = [], setSymbol }) {
  const { isSidebarOpen, setIsSidebarOpen } = useUIStore();
  const { last_price, window_sec, total_trades, total_candles, exchanges } = state;

  // Map status to display values
  const isConnected = status === 'connected';
  const statusText = status === 'connected' ? 'LIVE' :
    status === 'reconnecting' ? 'RECONNECTING' :
      status === 'connecting' ? 'CONNECTING' : 'OFFLINE';

  const fmtPrice = formatPriceLike(last_price, instrument?.priceDecimals ?? 2);

  const fmtTotal = new Intl.NumberFormat('en-US').format(total_trades);
  const fmtCandles = new Intl.NumberFormat('en-US').format(total_candles);

  return (
    <div className="header">
      <div className="header-left">
        <h1 className="title">⚡Flowtrades</h1>
        <div className="exchange-list">
          {exchanges?.length ? exchanges.join(' • ').toUpperCase() : 'WAITING FOR DATA...'}
        </div>
      </div>

      <div className="header-center">
        <div className="live-price">{fmtPrice}</div>
      </div>

      <div className="header-right">
        <div className="controls-row">
          <div className="control-group">
            <div
              className={`auto-fit-badge markets-toggle-btn ${isSidebarOpen ? 'active' : 'inactive'}`}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle Symbol Hub & Watchlist"
              style={{
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                background: isSidebarOpen ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255,255,255,0.05)',
                color: isSidebarOpen ? '#00e676' : '#ffffff',
                border: isSidebarOpen ? '1px solid #00e676' : '1px solid rgba(255,255,255,0.1)',
                padding: '4px 10px',
                borderRadius: '4px',
                fontSize: '13px',
                transition: 'all 0.2s ease-in-out'
              }}
            >
              <span>🏛️</span>
              <span>MARKETS ({symbol})</span>
            </div>
          </div>

          <div className="control-group">
            <label>Tick Size</label>
            <select
              value={tickSize}
              onChange={(e) => {
                setTickMode?.('manual');
                setTickSize(snapTick(Number(e.target.value), 'nearest'));
              }}
            >
              {tickOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>Timeframe</label>
            <select
              value={timeframeWindow}
              onChange={(e) => setTimeframeWindow(Number(e.target.value))}
            >
              <option value={1}>1m</option>
              <option value={5}>5m</option>
              <option value={15}>15m</option>
              <option value={60}>1h</option>
              <option value={240}>4h</option>
              <option value={1440}>1D</option>
            </select>
          </div>

          <div
            className={`auto-fit-badge ${autoFit ? 'active' : 'inactive'}`}
            onClick={onAutoFitToggle}
            title="Double-click price column to toggle"
          >
            AUTO-FIT
          </div>

          <div
            className={`auto-fit-badge ${showBadges ? 'active' : 'inactive'}`}
            onClick={() => setShowBadges(!showBadges)}
            title="Press 'B' to toggle"
            style={{ marginLeft: '8px' }}
          >
            BADGES
          </div>

          <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            <div className="status-dot"></div>
            {statusText}
          </div>
        </div>

        <div className="stats-row">
          <div>
            Interval: <span className="stat-value">{window_sec / 60}m</span>
          </div>
          <div>
            Candles: <span className="stat-value">{fmtCandles}</span>
          </div>
          <div>
            Tot: <span className="stat-value">{fmtTotal}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
