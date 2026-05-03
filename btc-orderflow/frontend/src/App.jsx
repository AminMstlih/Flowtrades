import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useFootprint } from './hooks/useFootprint';
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
  const [tickSize, setTickSize] = useState(1.0);
  const [tickMode, setTickMode] = useState('auto');
  const [autoFit, setAutoFit] = useState(true);
  const [timeframeWindow, setTimeframeWindow] = useState(5);
  const [showBadges, setShowBadges] = useState(true);

  // Connection status and raw data feed
  const wsUrl = `${WS_URL_BASE}?window=${timeframeWindow}`;
  const { latestDataRef, status } = useFootprint(wsUrl);
  
  // Local state for the processed market data
  const [chartData, setChartData] = useState({
    candles: [],
    last_price: 0,
    window_sec: 300,
    total_trades: 0,
    total_candles: 0,
    active_buckets: 0,
    exchanges: []
  });

  // ViewModel handles aggregation, tick-sizing, and instrument inference
  const vm = useFootprintViewModel({
    chartData,
    tickSize,
    autoFit,
    tickMode,
    viewportSize: { width: 1000, height: 800 }, // Mock size for non-visual logic
    orderedCandles: chartData.candles,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    userHasPanned: false,
    setTickSize,
    setTransform: () => {},
  });
  
  // Render loop to consume WebSocket data via rAF
  useEffect(() => {
    let animFrameId;
    function renderLoop() {
      perfMonitor.tick();
      const newData = latestDataRef.current;
      if (newData) {
        setChartData({
          candles: newData.candles,
          last_price: newData.last_price,
          window_sec: newData.window_sec,
          total_trades: newData.total_trades,
          total_candles: newData.total_candles,
          active_buckets: newData.active_buckets,
          exchanges: newData.exchanges
        });
        latestDataRef.current = null;
      }
      animFrameId = requestAnimationFrame(renderLoop);
    }
    animFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [latestDataRef]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'p' || e.key === 'P') perfMonitor.logReport();
      if (e.key === 'b' || e.key === 'B') setShowBadges(prev => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        onAutoFitToggle={() => setAutoFit(prev => !prev)}
        timeframeWindow={timeframeWindow}
        setTimeframeWindow={setTimeframeWindow}
        showBadges={showBadges}
        setShowBadges={setShowBadges}
      />

      <div className="main-viewport-wrapper">
        <div className="chart-area">
          <FootprintLwcChart 
            candles={vm.aggCandles} 
            showBadges={showBadges}
            autoFit={autoFit}
          />
        </div>
      </div>

      <div className="fixed-bottom-panels">
        <DeltaPane
          candles={vm.aggCandles}
          priceDecimals={vm.instrument.priceDecimals}
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
