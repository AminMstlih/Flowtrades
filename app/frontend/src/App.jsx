import React, { useEffect } from 'react';
import { useUIStore } from './core/store/uiStore';
import { useFootprintStore } from './core/store/footprintStore';
import { Header } from './components/Header';
import { FootprintLwcChart } from './components/FootprintLwcChart';
import { DeltaPane } from './components/DeltaPane';
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
    setTickSize, setTickMode, setAutoFit, setTimeframeWindow, setShowBadges, setViewportScroll
  } = useUIStore();

  const { status, chartData, connect, disconnect } = useFootprintStore();

  const wsUrl = `${WS_URL_BASE}?window=${timeframeWindow}`;

  useEffect(() => {
    connect(wsUrl);
    return () => disconnect();
  }, [wsUrl, connect, disconnect]);

  // ViewModel handles aggregation, tick-sizing, and instrument inference
  const vm = useFootprintViewModel({
    chartData,
    tickSize,
    autoFit,
    tickMode,
    viewportSize: { width: 1000, height: 800 },
    orderedCandles: chartData.candles,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    userHasPanned: false,
    setTickSize,
    setTransform: () => {},
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
    <div className="dashboard">
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
      />

      <div className="main-viewport-wrapper">
        <div className="chart-area" style={{ position: 'relative', width: '100%', height: '100%' }}>
          <FootprintLwcChart 
            candles={vm.aggCandles} 
            maxVolumeGlobal={vm.maxVolumeGlobal}
            showBadges={showBadges}
            autoFit={autoFit}
            onViewportChange={setViewportScroll}
          />
        </div>
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
            <div className="loading-title">Waiting for Market Data...</div>
            <div className="loading-sub">Latching onto live BTC tape.</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
