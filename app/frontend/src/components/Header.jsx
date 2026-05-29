import React, { useState, useEffect, useRef } from 'react';
import { TICK_STEPS, snapTick } from '../utils/tickSteps';
import { formatPriceLike } from '../utils/formatVol';
import { useUIStore } from '../core/store/uiStore';

export function Header({ state, status, instrument, tickSize, tickOptions = TICK_STEPS, setTickSize, setTickMode, autoFit, onAutoFitToggle, timeframeWindow, setTimeframeWindow, showBadges, setShowBadges, symbol, availableSymbols = [], setSymbol }) {
  const { isSidebarOpen, setIsSidebarOpen } = useUIStore();
  const { last_price, window_sec, total_trades, total_candles, exchanges } = state;

  const [isTickOpen, setIsTickOpen] = useState(false);
  const [isTfOpen, setIsTfOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsTickOpen(false);
        setIsTfOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

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
        <div className="controls-row" ref={containerRef}>
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

          <div className="control-group custom-dropdown-container">
            <label>Tick Size</label>
            <div 
              className="custom-dropdown-trigger" 
              onClick={() => { setIsTickOpen(!isTickOpen); setIsTfOpen(false); }}
            >
              <span>{tickSize}</span>
              <span className="arrow">▼</span>
            </div>
            {isTickOpen && (
              <div className="custom-dropdown-menu">
                {tickOptions.map((s) => (
                  <div
                    key={s}
                    className={`custom-dropdown-option ${s === tickSize ? 'selected' : ''}`}
                    onClick={() => {
                      setTickMode?.('manual');
                      setTickSize(snapTick(Number(s), 'nearest'));
                      setIsTickOpen(false);
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="control-group custom-dropdown-container">
            <label>Timeframe</label>
            <div 
              className="custom-dropdown-trigger" 
              onClick={() => { setIsTfOpen(!isTfOpen); setIsTickOpen(false); }}
            >
              <span>{timeframeWindow >= 60 ? `${timeframeWindow / 60}h` : `${timeframeWindow}m`}</span>
              <span className="arrow">▼</span>
            </div>
            {isTfOpen && (
              <div className="custom-dropdown-menu">
                {[
                  { val: 1, label: '1m' },
                  { val: 5, label: '5m' },
                  { val: 15, label: '15m' },
                  { val: 60, label: '1h' },
                  { val: 240, label: '4h' },
                  { val: 1440, label: '1D' }
                ].map((tf) => (
                  <div
                    key={tf.val}
                    className={`custom-dropdown-option ${tf.val === timeframeWindow ? 'selected' : ''}`}
                    onClick={() => {
                      setTimeframeWindow(tf.val);
                      setIsTfOpen(false);
                    }}
                  >
                    {tf.label}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className={`hud-toggle-btn autofit ${autoFit ? 'active' : 'inactive'}`}
            onClick={onAutoFitToggle}
            title="Double-click price column to toggle"
          >
            AUTO-FIT
          </div>

          <div
            className={`hud-toggle-btn badges ${showBadges ? 'active' : 'inactive'}`}
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
