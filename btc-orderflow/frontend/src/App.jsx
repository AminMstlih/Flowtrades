import React from 'react';
import { useChartWebSocket } from './hooks/useChartWebSocket';
import { Header } from './components/Header';
import { ChartContainer } from './components/ChartContainer';
import { FootprintCanvas } from './components/FootprintCanvas';
import { DeltaCanvas } from './components/DeltaCanvas';
import { ConnectionOverlay } from './components/ConnectionOverlay';

/**
 * App — Root Application Component
 *
 * Architecture per Engineering Guide:
 * - WebSocket → ref buffer (never setState on ticks)
 * - Chart updates via LWC series API (Canvas)
 * - Footprint + Delta rendered on raw Canvas 2D
 * - React state ONLY for UI chrome controls
 * - CSS Grid layout per Section 2.2
 */

const WS_URL = 'ws://localhost:8000/ws/footprint';

function App() {
  const { latestDataRef, status } = useChartWebSocket(WS_URL);

  return (
    <div className="app-layout">
      {/* Toolbar — Section 2.3 */}
      <Header
        latestDataRef={latestDataRef}
        connectionStatus={status}
      />

      {/* Main Chart — LWC Canvas (Section 1.3) */}
      <div className="chart-panel">
        <ChartContainer latestDataRef={latestDataRef} />
        <ConnectionOverlay status={status} />
      </div>

      {/* Footprint Ladder — Canvas 2D (Section 6) */}
      <div className="footprint-panel">
        <div className="footprint-panel__header">
          <span className="panel-label">ORDER FLOW</span>
        </div>
        <div className="footprint-panel__body">
          <FootprintCanvas latestDataRef={latestDataRef} />
        </div>
      </div>

      {/* Delta Indicator — Canvas 2D */}
      <div className="delta-panel">
        <DeltaCanvas latestDataRef={latestDataRef} />
      </div>
    </div>
  );
}

export default App;
