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
    const isZoomedOut = cellWidth < 30;

    return (
        <div className="delta-pane">
            <div className="delta-pane-label">DELTA</div>
            <div
                className="delta-pane-content"
                style={{
                    transform: `translateX(${scrollX}px)`
                }}
            >
                {deltas.map((d, i) => {
                    const deltaPct = Math.min((Math.abs(d.delta) / maxDelta) * 100, 100);
                    const isBuy = d.delta >= 0;
                    const isUp = d.close >= d.open;
                    const time = new Date(d.start_time);
                    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

                    return (
                        <div key={i} className="delta-pane-cell" style={{ width: `${cellWidth}px`, justifyContent: isZoomedOut ? 'center' : 'flex-end' }}>
                            {!isZoomedOut && (
                                <div className="delta-pane-bar-container">
                                    <div
                                        className={`delta-pane-bar ${isBuy ? 'delta-pane-bar-buy' : 'delta-pane-bar-sell'}`}
                                        style={{ width: `${deltaPct}%` }}
                                    />
                                </div>
                            )}
                            <div 
                              className={`delta-pane-value ${isBuy ? 'delta-pane-value-buy' : 'delta-pane-value-sell'}`}
                              style={isZoomedOut ? { fontSize: '0.55rem', transform: 'rotate(-90deg)', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' } : {}}
                            >
                                {formatVol(d.delta, true)}
                            </div>
                            {!isZoomedOut && (
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
