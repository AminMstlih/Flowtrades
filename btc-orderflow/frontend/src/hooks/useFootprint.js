import { useState, useEffect, useCallback, useRef } from 'react';

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

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
        // CRITICAL: Store in ref - DO NOT call setState here!
        // Parent component will read this via requestAnimationFrame loop
        latestDataRef.current = {
          candles: data.candles || [],
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
      if (wsRef.current) {
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
