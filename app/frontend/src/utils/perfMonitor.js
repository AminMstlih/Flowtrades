/**
 * Performance monitoring utilities.
 * 
 * Per UI Engineering Guide Section 8:
 * - Frame rate tracking
 * - Memory usage monitoring
 * - WebSocket message rate
 * - Performance budgets enforcement
 */

class PerformanceMonitor {
  constructor() {
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 0;
    this.targetFps = 60;
    
    this.wsMessageCount = 0;
    this.lastWsRateUpdate = performance.now();
    this.currentWsRate = 0;
    
    this.listeners = [];
  }
  
  /**
   * Call this every frame (in rAF loop).
   * Updates FPS counter every 500ms.
   */
  tick() {
    this.frameCount++;
    
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdate;
    
    if (elapsed >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      
      // Notify listeners
      this.notifyListeners();
    }
  }
  
  /**
   * Call this on every WebSocket message.
   */
  onWsMessage() {
    this.wsMessageCount++;
    
    const now = performance.now();
    const elapsed = now - this.lastWsRateUpdate;
    
    if (elapsed >= 1000) {
      this.currentWsRate = Math.round((this.wsMessageCount * 1000) / elapsed);
      this.wsMessageCount = 0;
      this.lastWsRateUpdate = now;
    }
  }
  
  /**
   * Get current memory usage (MB).
   * Returns null if Performance API not available.
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
        totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
        limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
      };
    }
    return null;
  }
  
  /**
   * Check if we're meeting performance budgets.
   * Guide Section 8.1: Budget thresholds
   */
  checkBudgets() {
    const budgets = {
      fpsMin: 50,        // Minimum acceptable FPS
      wsRateMax: 10,     // Max WebSocket messages per second
      memoryMaxMB: 256,  // Max JS heap usage
    };
    
    const issues = [];
    
    if (this.currentFps < budgets.fpsMin) {
      issues.push({
        metric: 'FPS',
        value: this.currentFps,
        threshold: budgets.fpsMin,
        severity: this.currentFps < 30 ? 'critical' : 'warning'
      });
    }
    
    if (this.currentWsRate > budgets.wsRateMax) {
      issues.push({
        metric: 'WS Rate',
        value: this.currentWsRate,
        threshold: budgets.wsRateMax,
        severity: this.currentWsRate > 20 ? 'critical' : 'warning'
      });
    }
    
    const memory = this.getMemoryUsage();
    if (memory && memory.usedMB > budgets.memoryMaxMB) {
      issues.push({
        metric: 'Memory',
        value: memory.usedMB,
        threshold: budgets.memoryMaxMB,
        severity: memory.usedMB > 512 ? 'critical' : 'warning'
      });
    }
    
    return {
      budgets,
      current: {
        fps: this.currentFps,
        wsRate: this.currentWsRate,
        memory,
      },
      issues,
      healthy: issues.length === 0
    };
  }
  
  /**
   * Subscribe to performance updates.
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
  
  /**
   * Notify all listeners.
   */
  notifyListeners() {
    const report = this.checkBudgets();
    this.listeners.forEach(callback => callback(report));
  }
  
  /**
   * Log performance report to console.
   */
  logReport() {
    const report = this.checkBudgets();
    
    console.group('[Performance Report]');
    console.log(`FPS: ${report.current.fps} (target: ${report.budgets.fpsMin}+)`);
    console.log(`WS Rate: ${report.current.wsRate}/s (max: ${report.budgets.wsRateMax}/s)`);
    
    if (report.current.memory) {
      console.log(`Memory: ${report.current.memory.usedMB}MB / ${report.current.memory.limitMB}MB`);
    }
    
    if (report.issues.length > 0) {
      console.warn('Performance Issues:', report.issues);
    } else {
      console.log('✅ All budgets met');
    }
    
    console.groupEnd();
  }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();
