import React, { useRef, useEffect, useCallback } from 'react';
import { GestureHandler } from '../utils/gestures';

// A high-performance wrapper that gives a React Element infinite-canvas pan/zoom behavior.
// Transform state is controlled by parent so chart/axis stay in lock-step.
export function InteractiveViewport({
  children,
  transform,
  onTransformChange,
  onResize,
  onUserPan,
}) {
  const containerRef = useRef(null);

  // Inertia state
  const velocityRef = useRef({ x: 0, y: 0 });
  const panHistoryRef = useRef([]); // track {x, y, time}
  const rAFRef = useRef(null);

  const applyInertia = useCallback(() => {
    rAFRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    };
  }, []);

  // Initialize GestureHandler for touch support
  const gestureHandlerRef = useRef(null);
  const stateRef = useRef({ transform, onTransformChange, onUserPan });
  
  useEffect(() => {
    stateRef.current = { transform, onTransformChange, onUserPan };
  }, [transform, onTransformChange, onUserPan]);
  
  useEffect(() => {
    if (!containerRef.current) return;

    // Create gesture handler with callbacks
    gestureHandlerRef.current = new GestureHandler(containerRef.current, {
      onPanStart: () => {
        if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
        panHistoryRef.current = [];
      },
      onPan: (dx, dy) => {
        const { transform: t, onTransformChange: onChange, onUserPan: onPan } = stateRef.current;
        if (onPan) onPan(true);
        
        // Track history for momentum calculation
        panHistoryRef.current.push({ x: t.x + dx, y: t.y + dy, time: Date.now() });
        if (panHistoryRef.current.length > 5) panHistoryRef.current.shift();
        
        onChange(prev => ({
          ...prev,
          x: prev.x + dx,
          y: prev.y + dy
        }));
      },
      onPanEnd: () => {
        velocityRef.current = { x: 0, y: 0 };
      },
      onZoom: (scaleFactor, midpoint) => {
        const { onTransformChange: onChange, onUserPan: onPan } = stateRef.current;
        if (onPan) onPan(true);
        
        onChange(prev => {
          let newScaleX = prev.scaleX * scaleFactor;
          let newScaleY = prev.scaleY * scaleFactor;
          
          // Clamp scale
          newScaleX = Math.min(Math.max(0.1, newScaleX), 10);
          newScaleY = Math.min(Math.max(0.1, newScaleY), 10);
          
          // Zoom from midpoint
          const rect = containerRef.current.getBoundingClientRect();
          const x = midpoint.x - rect.left;
          const y = midpoint.y - rect.top;
          
          const oldScaleX = prev.scaleX;
          const oldScaleY = prev.scaleY;
          
          const newX = x - ((x - prev.x) / oldScaleX) * newScaleX;
          const newY = y - ((y - prev.y) / oldScaleY) * newScaleY;
          
          return {
            x: newX,
            y: newY,
            scaleX: newScaleX,
            scaleY: newScaleY
          };
        });
      },
      onDoubleTap: () => {
        const { onTransformChange: onChange } = stateRef.current;
        // Reset to fit content
        if (onChange) {
          onChange({
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1
          });
        }
      },
      onLongPress: ({ x, y }) => {
        // Could lock crosshair here in future
        console.log('[Gesture] Long press at:', x, y);
      }
    });

    // Cleanup
    return () => {
      if (gestureHandlerRef.current) {
        gestureHandlerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (!onResize || !containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      onResize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onResize]);

  return (
    <div
      ref={containerRef}
      className="viewport-container"
      style={{
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none'
      }}
    >
      <div
        className="viewport-content"
        style={{
          transformOrigin: '0 0',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scaleX}, ${transform.scaleY})`,
          willChange: 'transform',
          display: 'inline-block',
        }}
      >
        {children}
      </div>

      {/* Visual Indicator of Panning Ability */}
      <div className="pan-hint">
        Drag background to pan chart
      </div>
    </div>
  );
}
