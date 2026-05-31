import React, { useEffect, useState, useRef } from 'react';
import { useUIStore } from './core/store/uiStore';
import { useFootprintStore } from './core/store/footprintStore';
import { Header } from './components/Header';
import { FootprintLwcChart } from './components/FootprintLwcChart';
import { DeltaPane } from './components/DeltaPane';
import { SymbolSidebar } from './components/SymbolSidebar';
import { perfMonitor } from './utils/perfMonitor';
import { useFootprintViewModel } from './hooks/useFootprintViewModel';

// Connect to the FastAPI WebSocket broadcast
const getWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsHost = host.includes(':5173') ? host.replace(':5173', ':8000') : host;
    return `${protocol}//${wsHost}/ws/footprint`;
};
const WS_URL_BASE = getWsUrl();

function App() {
  const {
    tickSize, tickMode, autoFit, timeframeWindow, showBadges, viewportScroll,
    symbol, availableSymbols, isSidebarOpen,
    setTickSize, setTickMode, setAutoFit, setTimeframeWindow, setShowBadges, setViewportScroll,
    setSymbol, setAvailableSymbols
  } = useUIStore();

  const { status, chartData, connect, disconnect } = useFootprintStore();

  const wsUrl = `${WS_URL_BASE}?symbol=${symbol}&window=${timeframeWindow}`;

  useEffect(() => {
    // Fetch available symbols from backend health endpoint
    const fetchSymbols = async () => {
      try {
        const protocol = window.location.protocol;
        const host = window.location.host;
        const apiHost = host.includes(':5173') ? host.replace(':5173', ':8000') : host;
        const res = await fetch(`${protocol}//${apiHost}/health`);
        const data = await res.json();
        if (data.symbols && data.symbols.length > 0) {
          setAvailableSymbols(data.symbols);
          if (!data.symbols.includes(symbol)) {
            setSymbol(data.symbols[0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch symbols", err);
      }
    };
    fetchSymbols();
  }, [setAvailableSymbols, setSymbol, symbol]);

  useEffect(() => {
    connect(wsUrl);
    return () => disconnect();
  }, [wsUrl, connect, disconnect]);

  const chartAreaRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 1000, height: 800 });
  const [visiblePriceRange, setVisiblePriceRange] = useState(null);

  useEffect(() => {
    if (!chartAreaRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(chartAreaRef.current);
    return () => observer.disconnect();
  }, []);

  // ViewModel handles aggregation, tick-sizing, and instrument inference
  const vm = useFootprintViewModel({
    chartData,
    tickSize,
    autoFit,
    tickMode,
    viewportSize,
    visiblePriceRange,
    orderedCandles: chartData.candles,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    userHasPanned: false,
    setTickSize,
    setTransform: () => {},
    symbol,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'p' || e.key === 'P') perfMonitor.logReport();
      if (e.key === 'b' || e.key === 'B') setShowBadges(!useUIStore.getState().showBadges);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setShowBadges]);

  // Auto-fit and auto-tick logic
  useEffect(() => {
    if (autoFit) vm.maybeAutoFitTick();
  }, [vm.maybeAutoFitTick, autoFit, chartData.last_price, tickSize]);

  useEffect(() => {
    if (!autoFit) vm.syncAutoTick();
  }, [vm.syncAutoTick, autoFit, chartData.last_price, tickMode, tickSize]);

  return (
    <div className={`dashboard ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Header
        state={chartData}
        status={status}
        instrument={vm.instrument}
        tickSize={tickSize}
        tickOptions={vm.tickOptions}
        setTickSize={vm.setTickSizeSnapped}
        setTickMode={setTickMode}
        autoFit={autoFit}
        onAutoFitToggle={() => setAutoFit(!autoFit)}
        timeframeWindow={timeframeWindow}
        setTimeframeWindow={setTimeframeWindow}
        showBadges={showBadges}
        setShowBadges={setShowBadges}
        symbol={symbol}
        availableSymbols={availableSymbols}
        setSymbol={setSymbol}
      />

      <div className="main-viewport-wrapper">
        <div className="chart-area" ref={chartAreaRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
          <FootprintLwcChart 
            candles={vm.aggCandles} 
            maxVolumeGlobal={vm.maxVolumeGlobal}
            showBadges={showBadges}
            autoFit={autoFit}
            tickSize={tickSize}
            symbol={symbol}
            timeframeWindow={timeframeWindow}
            onViewportChange={setViewportScroll}
            onVisiblePriceRangeChange={setVisiblePriceRange}
          />
        </div>
        <SymbolSidebar />
      </div>

      <div className="fixed-bottom-panels">
        <DeltaPane
          candles={vm.aggCandles}
          priceDecimals={vm.instrument.priceDecimals}
          scrollX={viewportScroll.offsetX !== undefined ? viewportScroll.offsetX : viewportScroll.scrollX}
          scaleX={viewportScroll.scaleX}
          barSpacing={viewportScroll.barSpacing}
        />
      </div>

      {/* Loading overlay */}
      {chartData.candles.length === 0 && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="terminal-spinner"></div>
            <div className="loading-title">INITIALIZING DATA PIPELINE</div>
            <div className="loading-sub">Latching onto live trade tape...</div>
            
            <div className="telemetry-grid">
              <div className="telemetry-row">
                <span className="label">ACTIVE SYMBOL</span>
                <span className="val" style={{ color: '#00e676', fontWeight: 'bold' }}>{symbol}</span>
              </div>
              <div className="telemetry-row">
                <span className="label">WEBSOCKET BRIDGE</span>
                <span className="val" style={{ color: '#ffc107', fontWeight: 'bold' }}>CONNECTING</span>
              </div>
              <div className="telemetry-row">
                <span className="label">AGGREGATION TASK</span>
                <span className="val">STANDBY</span>
              </div>
              <div className="telemetry-row">
                <span className="label">EXCHANGE FEEDS</span>
                <span className="val">3 ENABLED</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
