/**
 * useChartWebSocket — Guide Section 5.2 Compliant WebSocket Hook
 *
 * CRITICAL RULES:
 * - onmessage writes to a REF, never calls setState on tick data
 * - Only connectionStatus is React state (for UI chrome rendering)
 * - Exponential backoff reconnection: 1s → 2s → 4s → 8s → max 30s
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export function useChartWebSocket(url) {
  const wsRef = useRef(null);
  const latestDataRef = useRef(null);       // Latest footprint state — REF, not state
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);

  const [status, setStatus] = useState('connecting'); // UI state only

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      wsRef.current = new WebSocket(url);
    } catch (err) {
      console.error('[ws] Connection error:', err);
      setStatus('offline');
      return;
    }

    wsRef.current.onopen = () => {
      console.log('[ws] Connected');
      setStatus('connected');
      reconnectAttempts.current = 0;
      clearTimeout(reconnectTimer.current);
    };

    wsRef.current.onmessage = (event) => {
      // CRITICAL: parse and store in ref — do NOT call setState
      try {
        latestDataRef.current = JSON.parse(event.data);
      } catch (err) {
        console.error('[ws] Parse error:', err);
      }
    };

    wsRef.current.onclose = () => {
      if (!mountedRef.current) return;
      console.log('[ws] Disconnected');
      setStatus('reconnecting');
      wsRef.current = null;

      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts.current));
      reconnectAttempts.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    wsRef.current.onerror = () => {
      // Trigger onclose → reconnect
      wsRef.current?.close();
    };
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { latestDataRef, status };
}
