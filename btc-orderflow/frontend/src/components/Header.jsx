import React from 'react';
import { TICK_STEPS, snapTick } from '../utils/tickSteps';

export function Header({ state, status, tickSize, setTickSize, autoFit, onAutoFitToggle }) {
  const { last_price, window_sec, total_trades, total_candles, exchanges } = state;
  
  // Map status to display values
  const isConnected = status === 'connected';
  const statusText = status === 'connected' ? 'LIVE' : 
                     status === 'reconnecting' ? 'RECONNECTING' : 
                     status === 'connecting' ? 'CONNECTING' : 'OFFLINE';

  const fmtPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 1
  }).format(last_price);

  const fmtTotal = new Intl.NumberFormat('en-US').format(total_trades);
  const fmtCandles = new Intl.NumberFormat('en-US').format(total_candles);

  return (
    <div className="header">
      <div className="header-left">
        <h1 className="title">⚡ BTC ORDER FLOW</h1>
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
            <label>Tick Size</label>
            <select
              value={tickSize}
              onChange={(e) => setTickSize(snapTick(Number(e.target.value), 'nearest'))}
            >
              {TICK_STEPS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div
            className={`auto-fit-badge ${autoFit ? 'active' : 'inactive'}`}
            onClick={onAutoFitToggle}
            title="Double-click price column to toggle"
          >
            {autoFit ? '● AUTO' : '○ FREE'}
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
