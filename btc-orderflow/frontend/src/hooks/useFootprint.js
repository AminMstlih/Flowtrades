import { useState, useEffect, useCallback, useRef } from 'react';
import { perfMonitor } from '../utils/perfMonitor';

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_WINDOW_SEC = 86400; // 24 hours - allow history for higher timeframes

/**
 * Prune old candles outside the time window.
 * Per UI Engineering Guide Section 5.5: Time-windowed data
 * 
 * @param {Array} candles - All candles from backend
 * @param {number} windowSec - Keep only candles within this window
 * @returns {Array} Pruned candles
 */
function pruneTimeWindow(candles, windowSec = MAX_WINDOW_SEC) {
  if (!candles || candles.length === 0) return [];
  
  const now = Date.now();
  const cutoffMs = now - (windowSec * 1000);
  
  // Filter candles that are within the time window
  return candles.filter(c => {
    const candleTime = c.start_time || c.end_time || c.timestamp || c.ts || now;
    return candleTime >= cutoffMs;
  });
}

/**
 * WebSocket hook for real-time footprint data.
 * 
 * CRITICAL: Uses useRef for tick data to prevent React re-renders on every message.
 * Only UI state (connection status) uses useState.
 * 
 * Per UI Engineering Guide Section 5.2:
 * - WebSocket data stored in ref, NOT state
 * - Exponential backoff reconnection
 * - Parent component uses requestAnimationFrame to consume data
 */
export function useFootprint(url) {
  // UI state only - safe to use setState
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'connected' | 'reconnecting' | 'offline'
  
  // CRITICAL: Live data in refs - NO setState on tick data (Anti-Pattern #1)
  const latestDataRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log(`[ws] Connecting to ${url}...`);
    setStatus('connecting');
    
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[ws] Connected');
      setStatus('connected');
      reconnectAttemptsRef.current = 0; // Reset on successful connection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Track WebSocket message rate (Guide Section 8)
        perfMonitor.onWsMessage();
        
        // CRITICAL: Store in ref - DO NOT call setState here!
        // Parent component will read this via requestAnimationFrame loop
        
        // Apply time-window pruning to prevent memory leaks (Guide Section 5.5)
        const prunedCandles = pruneTimeWindow(data.candles || []);
        
        latestDataRef.current = {
          candles: prunedCandles,
          last_price: data.last_price || 0,
          window_sec: data.window_sec || 300,
          total_trades: data.total_trades || 0,
          total_candles: data.total_candles || 0,
          active_buckets: data.active_buckets || 0,
          exchanges: data.exchanges || [],
          timestamp: Date.now()
        };
      } catch (err) {
        console.error('[ws] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected');
      setStatus('reconnecting');
      wsRef.current = null;
      
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current)
      );
      reconnectAttemptsRef.current += 1;
      
      console.log(`[ws] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[ws] Error:', err);
      ws.close(); // Trigger onclose → reconnect logic
    };

    wsRef.current = ws;
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      // Clean up cleanly - remove the onclose listener FIRST
      // so we don't trigger the aggressive reconnect logic for an intentionally closed socket
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Return ref for data, status for UI
  return { latestDataRef, status };
}
