import { create } from 'zustand';
import { perfMonitor } from '../../utils/perfMonitor';
import { pruneTimeWindow } from '../data/pruneCandles';

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

let wsRef = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;

export const useFootprintStore = create((set, get) => ({
  status: 'offline', // 'connecting' | 'connected' | 'reconnecting' | 'offline'
  chartData: {
    candles: [],
    last_price: 0,
    window_sec: 300,
    total_trades: 0,
    total_candles: 0,
    active_buckets: 0,
    exchanges: []
  },

  connect: (url) => {
    if (wsRef?.readyState === WebSocket.OPEN) return;

    console.log(`[ws] Connecting to ${url}...`);
    set({ status: 'connecting' });

    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[ws] Connected');
      set({ status: 'connected' });
      reconnectAttempts = 0;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        perfMonitor.onWsMessage();
        
        let prunedCandles = pruneTimeWindow(data.candles || []);
        
        if (prunedCandles.length > 2000) {
          prunedCandles = prunedCandles.slice(prunedCandles.length - 2000);
        }
        
        // Update Zustand state directly
        // React 18 batches this automatically, so 60fps updates are safe.
        set({
          chartData: {
            candles: prunedCandles,
            last_price: data.last_price || 0,
            window_sec: data.window_sec || 300,
            total_trades: data.total_trades || 0,
            total_candles: data.total_candles || 0,
            active_buckets: data.active_buckets || 0,
            exchanges: data.exchanges || [],
            timestamp: Date.now()
          }
        });
      } catch (err) {
        console.error('[ws] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected');
      set({ status: 'reconnecting' });
      wsRef = null;
      
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts)
      );
      reconnectAttempts += 1;
      
      console.log(`[ws] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      reconnectTimeout = setTimeout(() => get().connect(url), delay);
    };

    ws.onerror = (err) => {
      console.error('[ws] Error:', err);
      ws.close();
    };

    wsRef = ws;
  },

  disconnect: () => {
    if (wsRef) {
      wsRef.onclose = null;
      wsRef.close();
      wsRef = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    set({ status: 'offline' });
  }
}));
