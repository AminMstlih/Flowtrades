import React, { useRef, useMemo } from 'react';
import { getTickDecimals } from '../utils/tickSteps';
import { binFloorPrice, unbinPrice } from '../utils/priceBinning';
import { formatPriceLike } from '../utils/formatVol';

const CELL_HEIGHT = 24;
const HEADER_HEIGHT = 32;

export function PriceScale({ prices, tickSize, lastPrice, transformY, scaleY = 1, onScaleDrag, onAutoFitToggle, priceDecimals }) {
  const scaleRef = useRef(null);
  const containerRef = useRef(null);
  const isDragging = useRef(false);
  const lastY = useRef(0);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    lastY.current = e.clientY;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    const dy = e.clientY - lastY.current;
    if (Math.abs(dy) < 1) return;
    onScaleDrag(-dy);
    lastY.current = e.clientY;
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const currentPriceBinned = lastPrice !== null
    ? unbinPrice(binFloorPrice(lastPrice, tickSize), tickSize)
    : null;
  const epsilon = tickSize / 1000;
  const priceIndex = currentPriceBinned !== null
    ? prices.findIndex(p => Math.abs(p - currentPriceBinned) <= epsilon)
    : -1;
  const decimals = priceDecimals ?? getTickDecimals(tickSize);

  const liveLabelTop = useMemo(() => {
    if (priceIndex === -1) return null;
    return transformY + (HEADER_HEIGHT + (priceIndex + 0.5) * CELL_HEIGHT) * scaleY;
  }, [priceIndex, transformY, scaleY]);

  return (
    <div
      ref={scaleRef}
      className="price-scale-sidebar"
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onAutoFitToggle) onAutoFitToggle();
      }}
    >
      <div
        className="price-scale-grip"
        onPointerDown={handleMouseDown}
        title="Drag to rescale vertically"
      />
      <div
        ref={containerRef}
        className="price-scale-container"
        style={{
          transformOrigin: 'top left',
          transform: `translateY(${transformY + HEADER_HEIGHT * scaleY}px) scaleY(${scaleY})`,
        }}
      >
        {prices.map(price => {
          const isActive = currentPriceBinned !== null && Math.abs(price - currentPriceBinned) <= epsilon;
          return (
            <div
              key={price}
              className={`price-tick ${isActive ? 'price-tick-active' : ''}`}
              style={{ height: `${CELL_HEIGHT}px` }}
            >
              <span className="tick-value">{formatPriceLike(price, decimals)}</span>
            </div>
          );
        })}
      </div>

      {/* Absolute Live Price Label (TradingView Style) - always centered */}
      {priceIndex !== -1 && (
        <div
          className="live-price-label"
          style={{
            top: `${liveLabelTop}px`,
            transform: 'translateY(-50%)',
          }}
        >
          {formatPriceLike(lastPrice, decimals)}
        </div>
      )}
    </div>
  );
}
