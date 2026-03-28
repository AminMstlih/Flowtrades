import React, { useRef, useEffect, useCallback } from 'react';

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

  // Drag state
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
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

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;

    // We only drag the background (InteractiveViewport) - the Axis handles its own drag
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };

    if (containerRef.current) {
      containerRef.current.style.cursor = 'grabbing';
    }

    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging.current) return;

    if (onUserPan) onUserPan(true);

    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;

    onTransformChange({
      ...transform,
      x: transform.x + dx,
      y: transform.y + dy
    });

    lastPos.current = { x: e.clientX, y: e.clientY };
  }, [onTransformChange, onUserPan, transform]);

  const handlePointerUp = (e) => {
    isDragging.current = false;
    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab';
    }
    e.target.releasePointerCapture(e.pointerId);
  };

  // Wheel to zoom (Uniform zoom)
  const handleWheel = useCallback((e) => {
    // Prevent accidental zoom from wheel/trackpad gestures.
    // Require explicit Shift+Ctrl/Cmd + wheel to zoom.
    const explicitZoomGesture = (e.ctrlKey || e.metaKey) && e.shiftKey;
    if (!explicitZoomGesture) return;
    e.preventDefault();
    if (onUserPan) onUserPan(true);

    const scaleFactor = 1.05;

    let newScaleX = transform.scaleX;
    let newScaleY = transform.scaleY;

    if (e.deltaY < 0) {
      newScaleX *= scaleFactor;
      newScaleY *= scaleFactor;
    } else {
      newScaleX /= scaleFactor;
      newScaleY /= scaleFactor;
    }

    newScaleX = Math.min(Math.max(.1, newScaleX), 10);
    newScaleY = Math.min(Math.max(.1, newScaleY), 10);

    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Adjust X and Y to zoom toward cursor
    const xAdj = (cursorX - transform.x) * (1 - newScaleX / transform.scaleX);
    const yAdj = (cursorY - transform.y) * (1 - newScaleY / transform.scaleY);

    onTransformChange({
      scaleX: newScaleX,
      scaleY: newScaleY,
      x: transform.x + xAdj,
      y: transform.y + yAdj
    });
  }, [onTransformChange, onUserPan, transform]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div
      ref={containerRef}
      className="viewport-container"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
