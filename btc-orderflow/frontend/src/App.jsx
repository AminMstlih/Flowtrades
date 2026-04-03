import React from 'react';
import { useChartWebSocket } from './hooks/useChartWebSocket';
import { Header } from './components/Header';
import { ChartContainer } from './components/ChartContainer';
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

// Dynamic WS URL: works on localhost AND behind Cloudflare Tunnel (wss)
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_TOKEN = 'flowtrades_dev_token'; // Must match FLOWTRADES_WS_TOKEN on the backend
const WS_URL = `${protocol}//${window.location.host}/ws/footprint?token=${WS_TOKEN}`;

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
    </div>
  );
}

export default App;
