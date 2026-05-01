/**
 * Gesture handler for touch and mouse interactions.
 * 
 * Per UI Engineering Guide Section 4:
 * - Pinch-to-zoom with midpoint anchor
 * - Pan gesture with disambiguation
 * - Long press for crosshair lock
 * - Double tap for auto-fit
 * - All touch handlers use { passive: false }
 */

export class GestureHandler {
  constructor(element, callbacks = {}) {
    this.element = element;
    this.callbacks = callbacks;
    
    // Pinch-to-zoom state
    this.lastPinchDistance = null;
    this.lastPinchMidpoint = null;
    
    // Pan state
    this.isPanning = false;
    this.panStartPos = null;
    
    // Touch tracking
    this.touchStartTime = null;
    this.touchStartPos = null;
    this.lastTapTime = null;
    
    // Long press
    this.longPressTimer = null;
    this.LONG_PRESS_DELAY = 500; // ms
    
    // Gesture classification threshold
    this.ANGLE_THRESHOLD = 30; // degrees from horizontal
    
    this.bindEvents = this.bindEvents.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    
    this.bindEvents();
  }
  
  bindEvents() {
    const { element } = this;
    
    // Touch events - MUST use passive: false (Guide Section 4.4)
    element.addEventListener('touchstart', this.onTouchStart, { passive: false });
    element.addEventListener('touchmove', this.onTouchMove, { passive: false });
    element.addEventListener('touchend', this.onTouchEnd, { passive: false });
    element.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
    
    // Mouse events
    element.addEventListener('mousedown', this.onMouseDown);
    element.addEventListener('mousemove', this.onMouseMove);
    element.addEventListener('mouseup', this.onMouseUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    
    // Prevent context menu
    element.addEventListener('contextmenu', e => e.preventDefault());
  }
  
  destroy() {
    const { element } = this;
    
    element.removeEventListener('touchstart', this.onTouchStart);
    element.removeEventListener('touchmove', this.onTouchMove);
    element.removeEventListener('touchend', this.onTouchEnd);
    element.removeEventListener('touchcancel', this.onTouchEnd);
    
    element.removeEventListener('mousedown', this.onMouseDown);
    element.removeEventListener('mousemove', this.onMouseMove);
    element.removeEventListener('mouseup', this.onMouseUp);
    element.removeEventListener('wheel', this.onWheel);
    
    element.removeEventListener('contextmenu', e => e.preventDefault());
    
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
  }
  
  // ==================== TOUCH HANDLERS ====================
  
  onTouchStart(e) {
    const touches = e.touches;
    
    if (touches.length === 2) {
      // Pinch-to-zoom start (Guide Section 4.2)
      this.lastPinchDistance = this.getPinchDistance(touches);
      this.lastPinchMidpoint = this.getPinchMidpoint(touches);
      e.preventDefault();
    } else if (touches.length === 1) {
      // Single touch - track for pan/long-press
      const touch = touches[0];
      this.touchStartTime = Date.now();
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
      this.isPanning = true;
      this.panStartPos = { x: touch.clientX, y: touch.clientY };
      
      // Notify pan start (for momentum initialization)
      if (this.callbacks.onPanStart) {
        this.callbacks.onPanStart({ x: touch.clientX, y: touch.clientY });
      }
      
      // Start long press timer
      this.longPressTimer = setTimeout(() => {
        if (this.callbacks.onLongPress) {
          this.callbacks.onLongPress({
            x: touch.clientX,
            y: touch.clientY
          });
        }
      }, this.LONG_PRESS_DELAY);
    }
  }
  
  onTouchMove(e) {
    const touches = e.touches;
    
    if (touches.length === 2 && this.lastPinchDistance) {
      // Pinch-to-zoom in progress
      const currentDistance = this.getPinchDistance(touches);
      const currentMidpoint = this.getPinchMidpoint(touches);
      
      const pinchRatio = currentDistance / this.lastPinchDistance;
      
      if (this.callbacks.onZoom) {
        this.callbacks.onZoom(pinchRatio, currentMidpoint);
      }
      
      this.lastPinchDistance = currentDistance;
      this.lastPinchMidpoint = currentMidpoint;
      
      e.preventDefault();
    } else if (touches.length === 1 && this.isPanning) {
      // Cancel long press if moving
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      
      const touch = touches[0];
      const dx = touch.clientX - this.panStartPos.x;
      const dy = touch.clientY - this.panStartPos.y;
      
      // Classify gesture (Guide Section 4.4)
      const gesture = this.classifyGesture(dx, dy);
      
      if (gesture === 'horizontal-pan' && this.callbacks.onPan) {
        this.callbacks.onPan(dx, dy);
        e.preventDefault();
      } else if (gesture === 'vertical-scroll' && this.callbacks.onVerticalScroll) {
        this.callbacks.onVerticalScroll(dy);
        e.preventDefault();
      }
    }
  }
  
  onTouchEnd(e) {
    // Cancel long press
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    
    // Check for double tap
    if (e.changedTouches.length === 1 && this.touchStartTime) {
      const touch = e.changedTouches[0];
      const elapsed = Date.now() - this.touchStartTime;
      const dx = touch.clientX - this.touchStartPos.x;
      const dy = touch.clientY - this.touchStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // If quick tap with minimal movement
      if (elapsed < 300 && distance < 10) {
        if (this.lastTapTime && (Date.now() - this.lastTapTime) < 300) {
          // Double tap detected
          if (this.callbacks.onDoubleTap) {
            this.callbacks.onDoubleTap({
              x: touch.clientX,
              y: touch.clientY
            });
          }
          this.lastTapTime = null;
        } else {
          this.lastTapTime = Date.now();
        }
      }
    }
    
    // Notify pan end (for momentum calculation)
    if (this.callbacks.onPanEnd) {
      this.callbacks.onPanEnd();
    }
    
    this.isPanning = false;
    this.panStartPos = null;
    this.lastPinchDistance = null;
    this.touchStartTime = null;
  }
  
  // ==================== MOUSE HANDLERS ====================
  
  onMouseDown(e) {
    if (e.button !== 0) return; // Only left button
    
    this.isPanning = true;
    this.panStartPos = { x: e.clientX, y: e.clientY };
    this.element.style.cursor = 'grabbing';
    
    if (this.callbacks.onPanStart) {
      this.callbacks.onPanStart({ x: e.clientX, y: e.clientY });
    }
  }
  
  onMouseMove(e) {
    if (!this.isPanning || !this.panStartPos) return;
    
    const dx = e.clientX - this.panStartPos.x;
    const dy = e.clientY - this.panStartPos.y;
    
    if (this.callbacks.onPan) {
      this.callbacks.onPan(dx, dy);
    }
    
    this.panStartPos = { x: e.clientX, y: e.clientY };
  }
  
  onMouseUp(e) {
    this.isPanning = false;
    this.panStartPos = null;
    this.element.style.cursor = 'grab';
    
    if (this.callbacks.onPanEnd) {
      this.callbacks.onPanEnd();
    }
  }
  
  onWheel(e) {
    // Require Ctrl/Cmd + Shift for zoom (prevent accidental zoom)
    const explicitZoomGesture = (e.ctrlKey || e.metaKey) && e.shiftKey;
    if (!explicitZoomGesture) return;
    
    e.preventDefault();
    
    const scaleFactor = 1.05;
    let zoomRatio;
    
    if (e.deltaY < 0) {
      zoomRatio = scaleFactor; // Zoom in
    } else {
      zoomRatio = 1 / scaleFactor; // Zoom out
    }
    
    const midpoint = {
      x: e.clientX,
      y: e.clientY
    };
    
    if (this.callbacks.onZoom) {
      this.callbacks.onZoom(zoomRatio, midpoint);
    }
  }
  
  // ==================== UTILITY METHODS ====================
  
  /**
   * Classify gesture based on movement angle.
   * Guide Section 4.4: Use ±30° threshold
   */
  classifyGesture(deltaX, deltaY) {
    const angle = Math.abs(Math.atan2(deltaY, deltaX) * 180 / Math.PI);
    
    if (angle < this.ANGLE_THRESHOLD || angle > 180 - this.ANGLE_THRESHOLD) {
      return 'horizontal-pan';
    }
    
    if (angle > 60 && angle < 120) {
      return 'vertical-scroll';
    }
    
    return 'diagonal'; // Ambiguous - maintain current mode
  }
  
  /**
   * Calculate distance between two touch points.
   */
  getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Calculate midpoint between two touch points.
   */
  getPinchMidpoint(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }
}
