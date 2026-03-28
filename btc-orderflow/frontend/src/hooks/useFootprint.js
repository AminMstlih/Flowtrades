import { useState, useEffect, useCallback, useRef } from 'react';

const RECONNECT_DELAY_MS = 2000;

export function useFootprint(url) {
    const [state, setState] = useState({
    candles: [],
    last_price: 0,
    window_sec: 300,
    total_trades: 0,
    total_candles: 0,
    active_buckets: 0,
    exchanges: []
  });

  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log(`[ws] Connecting to ${url}...`);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[ws] Connected');
      setIsConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setState({
          candles: data.candles || [],
          last_price: data.last_price || 0,
          window_sec: data.window_sec || 300,
          total_trades: data.total_trades || 0,
          total_candles: data.total_candles || 0,
          active_buckets: data.active_buckets || 0,
          exchanges: data.exchanges || [] 
        });
      } catch (err) {
        console.error('[ws] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected');
      setIsConnected(false);
      wsRef.current = null;
      // Auto-reconnect
      reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = (err) => {
      console.error('[ws] Error:', err);
      ws.close(); // Trigger onclose to reconnect
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

  return { state, isConnected };
}
