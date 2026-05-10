import { create } from 'zustand';

export const useUIStore = create((set) => ({
  tickSize: 1.0,
  tickMode: 'auto',
  autoFit: true,
  timeframeWindow: 5,
  showBadges: true,
  viewportScroll: { scrollX: 0, scaleX: 1, barSpacing: 105, offsetX: 0 },

  setTickSize: (size) => set({ tickSize: size }),
  setTickMode: (mode) => set({ tickMode: mode }),
  setAutoFit: (fit) => set({ autoFit: fit }),
  setTimeframeWindow: (window) => set({ timeframeWindow: window }),
  setShowBadges: (show) => set({ showBadges: show }),
  setViewportScroll: (scroll) => set({ viewportScroll: scroll }),
}));
