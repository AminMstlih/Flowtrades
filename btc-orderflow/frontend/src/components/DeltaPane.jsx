import React, { useMemo } from 'react';
import { formatVol } from '../utils/formatVol';

export function DeltaPane({ candles, scrollX = 0, scaleX = 1 }) {
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

    return (
        <div className="delta-pane">
            <div className="delta-pane-label">DELTA</div>
            <div
                className="delta-pane-content"
                style={{
                    transformOrigin: 'top left',
                    transform: `translateX(${scrollX}px) scaleX(${scaleX})`
                }}
            >
                {deltas.map((d, i) => {
                    const deltaPct = Math.min((Math.abs(d.delta) / maxDelta) * 100, 100);
                    const isBuy = d.delta >= 0;
                    const isUp = d.close >= d.open;
                    const time = new Date(d.start_time);
                    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

                    return (
                        <div key={i} className="delta-pane-cell">
                            <div className="delta-pane-bar-container">
                                <div
                                    className={`delta-pane-bar ${isBuy ? 'delta-pane-bar-buy' : 'delta-pane-bar-sell'}`}
                                    style={{ width: `${deltaPct}%` }}
                                />
                            </div>
                            <div className={`delta-pane-value ${isBuy ? 'delta-pane-value-buy' : 'delta-pane-value-sell'}`}>
                                {formatVol(d.delta, true)}
                            </div>
                            <div className={`delta-pane-time ${isUp ? 'delta-pane-time-up' : 'delta-pane-time-down'}`}>
                                {timeStr}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}