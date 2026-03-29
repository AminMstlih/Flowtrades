/**
 * ConnectionOverlay — Guide Section 9
 *
 * Communicates WebSocket connection state visually.
 * - Yellow banner during reconnection
 * - Red overlay after prolonged disconnect
 * - STALE DATA label — trader safety feature (Section 9)
 */

import React, { useState, useEffect, useRef } from 'react';

export const ConnectionOverlay = React.memo(function ConnectionOverlay({ status }) {
  const [disconnectDuration, setDisconnectDuration] = useState(0);
  const intervalRef = useRef(null);
  const disconnectTimeRef = useRef(null);

  useEffect(() => {
    if (status === 'connected') {
      setDisconnectDuration(0);
      disconnectTimeRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else if (status === 'reconnecting' || status === 'offline') {
      if (!disconnectTimeRef.current) {
        disconnectTimeRef.current = Date.now();
      }
      intervalRef.current = setInterval(() => {
        setDisconnectDuration(Math.floor((Date.now() - disconnectTimeRef.current) / 1000));
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  if (status === 'connected') return null;

  // Reconnecting — yellow banner
  if (status === 'reconnecting' && disconnectDuration < 10) {
    return (
      <div className="connection-banner connection-banner--warning">
        <span className="connection-banner__icon">⟳</span>
        <span>Reconnecting… ({disconnectDuration}s)</span>
      </div>
    );
  }

  // Offline > 10s — red overlay with stale data warning
  return (
    <div className="connection-overlay connection-overlay--danger">
      <div className="connection-overlay__content">
        <div className="stale-data-label">⚠ STALE DATA</div>
        <p className="connection-overlay__message">
          Live data disconnected. Chart shows last known state.
        </p>
        <p className="connection-overlay__duration">
          Offline for {disconnectDuration}s
        </p>
      </div>
    </div>
  );
});
