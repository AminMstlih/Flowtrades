import React, { useState } from 'react';
import { useUIStore } from '../core/store/uiStore';
import { useFootprintStore } from '../core/store/footprintStore';
import { formatPriceLike } from '../utils/formatVol';

export function SymbolSidebar() {
  const {
    symbol: activeSymbol,
    availableSymbols,
    setSymbol,
    watchlist,
    toggleWatchlist,
    isWatchlistOnly,
    setIsWatchlistOnly,
    isSidebarOpen,
    setIsSidebarOpen
  } = useUIStore();

  const { status, chartData } = useFootprintStore();
  const [searchQuery, setSearchQuery] = useState('');

  if (!isSidebarOpen) return null;

  // Filter symbols based on search and watchlist filters
  const filteredSymbols = availableSymbols.filter((sym) => {
    const matchesSearch = sym.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWatchlist = !isWatchlistOnly || watchlist.includes(sym);
    return matchesSearch && matchesWatchlist;
  });

  const handleSelectSymbol = (sym) => {
    if (sym !== activeSymbol) {
      setSymbol(sym);
    }
  };

  const isConnected = status === 'connected';

  // Available feeds on active symbol
  const activeExchanges = chartData.exchanges || [];

  return (
    <div className={`symbol-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
      <div className="sidebar-header">
        <div className="header-top-row">
          <h3>🏛️ SYMBOL HUB</h3>
          <button className="close-btn" onClick={() => setIsSidebarOpen(false)} title="Close Sidebar">
            ✕
          </button>
        </div>
        
        <div className="search-bar-container">
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Search symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="watchlist-tabs-row">
          <button
            className={`tab-btn ${!isWatchlistOnly ? 'active' : ''}`}
            onClick={() => setIsWatchlistOnly(false)}
          >
            All Coins ({availableSymbols.length})
          </button>
          <button
            className={`tab-btn ${isWatchlistOnly ? 'active' : ''}`}
            onClick={() => setIsWatchlistOnly(true)}
          >
            ★ Watchlist ({watchlist.length})
          </button>
        </div>
      </div>

      <div className="symbol-list">
        {filteredSymbols.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <p>No symbols match your filters.</p>
          </div>
        ) : (
          filteredSymbols.map((sym) => {
            const isActive = sym === activeSymbol;
            const isFav = watchlist.includes(sym);
            
            // Format price only for active symbol since we only stream active feed
            const displayPrice = isActive && chartData.last_price > 0
              ? `$${formatPriceLike(chartData.last_price, sym === 'BEAT-USDT' ? 4 : sym === 'HYPE-USDT' ? 2 : 1)}`
              : 'Tap to Latch';

            return (
              <div
                key={sym}
                className={`symbol-card ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectSymbol(sym)}
              >
                <div className="card-left">
                  <button
                    className={`star-btn ${isFav ? 'fav' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWatchlist(sym);
                    }}
                    title={isFav ? "Remove from Watchlist" : "Add to Watchlist"}
                  >
                    ★
                  </button>
                  <div className="symbol-info">
                    <span className="symbol-name">{sym}</span>
                    <span className="symbol-status">
                      {isActive ? (
                        <span className="active-tag">
                          <span className="pulse-dot"></span> ACTIVE FEED
                        </span>
                      ) : (
                        <span className="inactive-tag">OFFLINE</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="card-right">
                  <div className="symbol-price">{displayPrice}</div>
                  {isActive && activeExchanges.length > 0 && (
                    <div className="card-exchange-badges">
                      {activeExchanges.map((ex) => (
                        <span key={ex} className="ex-mini-badge">
                          {ex.substring(0, 3)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sidebar-hud">
        <h4 className="hud-title">📡 LIVE CONNECTION HUD</h4>
        
        <div className="hud-metric-row">
          <span className="hud-label">WebSocket Status</span>
          <span className={`hud-badge ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {isConnected ? 'STABLE' : status.toUpperCase()}
          </span>
        </div>

        <div className="hud-exchanges-grid">
          {['okx', 'bybit', 'binance'].map((ex) => {
            const isFeedActive = isConnected && activeExchanges.includes(ex);
            return (
              <div key={ex} className={`hud-exchange-item ${isFeedActive ? 'active' : 'inactive'}`}>
                <div className="hud-ex-indicator"></div>
                <div className="hud-ex-details">
                  <span className="ex-name">{ex.toUpperCase()}</span>
                  <span className="ex-status">{isFeedActive ? 'CONNECTED' : 'STANDBY'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
