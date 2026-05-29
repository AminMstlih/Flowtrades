import { create } from 'zustand';

export const useUIStore = create((set) => ({
  tickSize: 1.0,
  tickMode: 'auto',
  autoFit: true,
  timeframeWindow: 5,
  showBadges: false,
  symbol: 'BTC-USDT',
  availableSymbols: ['BTC-USDT'],
  viewportScroll: { scrollX: 0, scaleX: 1, barSpacing: 105, offsetX: 0 },
  isSidebarOpen: false,
  watchlist: (() => {
    try {
      return JSON.parse(localStorage.getItem('flowtrades_watchlist')) || ['BTC-USDT'];
    } catch {
      return ['BTC-USDT'];
    }
  })(),
  isWatchlistOnly: false,

  setTickSize: (size) => set({ tickSize: size }),
  setTickMode: (mode) => set({ tickMode: mode }),
  setAutoFit: (fit) => set({ autoFit: fit }),
  setTimeframeWindow: (window) => set({ timeframeWindow: window }),
  setShowBadges: (show) => set({ showBadges: show }),
  setSymbol: (symbol) => set({ symbol }),
  setAvailableSymbols: (symbols) => set({ availableSymbols: symbols }),
  setViewportScroll: (scroll) => set({ viewportScroll: scroll }),
  setIsSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setIsWatchlistOnly: (only) => set({ isWatchlistOnly: only }),
  toggleWatchlist: (sym) => set((state) => {
    const next = state.watchlist.includes(sym)
      ? state.watchlist.filter((s) => s !== sym)
      : [...state.watchlist, sym];
    try {
      localStorage.setItem('flowtrades_watchlist', JSON.stringify(next));
    } catch (e) {
      console.error('Failed to save watchlist to localStorage', e);
    }
    return { watchlist: next };
  }),
}));
