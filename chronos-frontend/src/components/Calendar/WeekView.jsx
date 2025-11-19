import React, { useMemo } from 'react';
import '../../styles/Calendar.css';

/** helpers */
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}
function halfHourIndex(dt) {
    return dt.getHours() * 2 + Math.floor(dt.getMinutes() / 30);
}
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekView({ weekStart, events, onDateSelect }) {
    const days = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    );

    /** разложим события по дням недели */
    const dayEvents = useMemo(() => {
        const map = Array.from({ length: 7 }, () => []);
        events.forEach((ev) => {
            const s = new Date(ev.start),
                e = new Date(ev.end);
            for (let i = 0; i < 7; i++) {
                const dayS = startOfDay(addDays(weekStart, i));
                const dayE = endOfDay(addDays(weekStart, i));
                if (e >= dayS && s <= dayE) {
                    // отрезок в рамках текущего дня
                    const st = new Date(Math.max(s.getTime(), dayS.getTime()));
                    const en = new Date(Math.min(e.getTime(), dayE.getTime()));
                    const rowStart = halfHourIndex(st) + 1; // CSS grid index starts at 1
                    const rowEnd = Math.max(
                        rowStart + 1,
                        halfHourIndex(en) + 1
                    );
                    map[i].push({
                        ...ev,
                        _rowStart: rowStart,
                        _rowEnd: rowEnd,
                    });
                }
            }
        });
        return map;
    }, [events, weekStart]);

    return (
        <div className="calendar-week">
            {/* заголовок дней */}
            <div className="week-header">
                <div className="time-header"></div>
                {days.map((d, i) => (
                    <div className="day-header" key={i}>
                        <div className="date">{d.getDate()}</div>
                        <div className="dow">{WEEKDAY[i]}</div>
                    </div>
                ))}
            </div>

            {/* прокручиваемая сетка 7×48 + столбик часов */}
            <div className="week-grid" style={{ '--slot-h': '45px' }}>
                <div className="time-col">
                    {Array.from({ length: 24 }, (_, h) => (
                        <div
                            className="hour"
                            key={h}
                            style={{ gridRow: `${h * 2 + 1} / span 2` }}
                        >
                            {String(h).padStart(2, '0')}:00
                        </div>
                    ))}
                </div>

                {days.map((d, di) => (
                    <div
                        className="day-col"
                        key={di}
                        onDoubleClick={() => onDateSelect?.(d)}
                    >
                        {/* NEW: 48 capsule slots (каждые 30 минут) */}
                        {Array.from({ length: 48 }, (_, r) => (
                            <div
                                key={`slot-${di}-${r}`}
                                className="slot"
                                style={{ gridRow: `${r + 1} / span 1` }}
                                aria-hidden="true"
                            />
                        ))}

                        {/* events поверх слотов */}
                        {dayEvents[di].map((ev) => (
                            <div
                                key={
                                    (ev.id || ev._id || Math.random()) +
                                    '-' +
                                    ev._rowStart
                                }
                                className={`event ${ev.category || ''}`}
                                style={{
                                    gridRow: `${ev._rowStart} / ${ev._rowEnd}`,
                                }}
                                title={`${ev.title || '(no title)'}\n${new Date(
                                    ev.start
                                ).toLocaleString()} — ${new Date(
                                    ev.end
                                ).toLocaleString()}`}
                            >
                                <div className="ev-title">
                                    {ev.title || '(no title)'}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
