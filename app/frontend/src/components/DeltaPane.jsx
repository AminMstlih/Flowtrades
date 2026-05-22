import React, { memo, useMemo } from 'react';
import { formatVol } from '../utils/formatVol';

export const DeltaPane = memo(function DeltaPane({ candles, scrollX = 0, scaleX = 1, barSpacing, priceDecimals = 2 }) {
    const { deltas, maxDelta } = useMemo(() => {
        if (!candles || candles.length === 0) {
            return { deltas: [], maxDelta: 1 };
        }

        const deltaList = candles.map(c => ({
            start_time: c.start_time,
            delta: c.delta || 0,
            buy_vol: c.buy_vol || 0,
            sell_vol: c.sell_vol || 0,
            close: c.close,
            open: c.open,
        }));

        const maxAbs = Math.max(...deltaList.map(d => Math.abs(d.delta)), 1);
        return { deltas: deltaList, maxDelta: maxAbs };
    }, [candles]);

    if (deltas.length === 0) return null;

    const cellWidth = barSpacing !== undefined ? barSpacing : Math.max(48, Math.min(132, 105 * Math.max(0.75, scaleX)));

    // Three degradation tiers — never rotate text.
    // full:    bar + value + time  (>= 60px)
    // compact: value only          (30–59px)
    // minimal: value only, tiny    (< 30px)
    const isFull    = cellWidth >= 60;
    const isCompact = cellWidth >= 30 && cellWidth < 60;
    const isMinimal = cellWidth < 30;

    return (
        <div className="delta-pane">
            <div className="delta-pane-label">DELTA</div>
            <div
                className="delta-pane-content"
                style={{ transform: `translateX(${scrollX}px)` }}
            >
                {deltas.map((d, i) => {
                    const deltaPct = Math.min((Math.abs(d.delta) / maxDelta) * 100, 100);
                    const isBuy = d.delta >= 0;
                    const isUp = d.close >= d.open;
                    const time = new Date(d.start_time);
                    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

                    // Font size scales with cell width — never rotates
                    const fontSize = isFull ? '0.65rem' : isCompact ? '0.6rem' : '0.5rem';

                    return (
                        <div
                            key={i}
                            className="delta-pane-cell"
                            style={{ width: `${cellWidth}px`, justifyContent: 'flex-end' }}
                        >
                            {isFull && (
                                <div className="delta-pane-bar-container">
                                    <div
                                        className={`delta-pane-bar ${isBuy ? 'delta-pane-bar-buy' : 'delta-pane-bar-sell'}`}
                                        style={{ width: `${deltaPct}%` }}
                                    />
                                </div>
                            )}
                            <div
                                className={`delta-pane-value ${isBuy ? 'delta-pane-value-buy' : 'delta-pane-value-sell'}`}
                                style={{
                                    fontSize,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%',
                                    textAlign: 'center',
                                }}
                            >
                                {formatVol(d.delta, true)}
                            </div>
                            {isFull && (
                                <div className={`delta-pane-time ${isUp ? 'delta-pane-time-up' : 'delta-pane-time-down'}`}>
                                    {timeStr}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
});
