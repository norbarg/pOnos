import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/Calendar.css';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const toKey = (n) => String(n);
const toN = (y, m) => y * 12 + m;
const fromN = (n) => {
    const y = Math.floor(n / 12);
    const m = n - y * 12;
    return [y, m];
};

function startOfMonth(y, m) {
    return new Date(y, m, 1);
}
function endOfMonth(y, m) {
    return new Date(y, m + 1, 0, 23, 59, 59, 999);
}
function startOfGrid(y, m) {
    const d = new Date(y, m, 1);
    const wd = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - wd);
    d.setHours(0, 0, 0, 0);
    return d;
}

// offset внутри скролл-контейнера
function offsetTopWithin(elContainer, el) {
    if (!elContainer || !el) return 0;
    const c = elContainer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top - c.top;
}
function monthHeadH(container) {
    const head = container?.querySelector('.month-weekdays');
    return head ? head.getBoundingClientRect().height : 0;
}
// какой .month-block сейчас «доминирует» в вьюпорте по площади пересечения
function dominantMonthEl(container) {
    if (!container) return null;

    const H = monthHeadH(container); // высота липкой шапки Mon..Sun
    const viewTop = H; // видимая область начинается под шапкой
    const viewBottom = container.clientHeight;

    const blocks = container.querySelectorAll('.month-block');
    let best = null;
    let bestOverlap = -1;
    let bestTop = Infinity;

    blocks.forEach((b) => {
        const rect = b.getBoundingClientRect();
        const top = offsetTopWithin(container, b); // top в координатах контейнера
        const bottom = top + rect.height;

        const overlap = Math.max(
            0,
            Math.min(bottom, viewBottom) - Math.max(top, viewTop)
        );
        if (
            overlap > bestOverlap ||
            (overlap === bestOverlap && top < bestTop) // тай-брейк — тот, что выше
        ) {
            best = b;
            bestOverlap = overlap;
            bestTop = top;
        }
    });

    return best || blocks[0] || null;
}

export default function MonthView({
    initialYear,
    initialMonth,
    activeYear, // из хедера
    activeMonth, // из хедера
    events = [],
    onMonthChange,
    onViewportMonthChange, // обновлять заголовок при скролле
    onAutoScrollDone, // ← НОВОЕ: сообщаем родителю, что авто-скролл завершён
    onDateSelect,
}) {
    const containerRef = useRef(null);

    const TOP_THRESHOLD = 16;
    const BOTTOM_THRESHOLD = 140;

    const n0 = toN(initialYear, initialMonth);
    const initialNs = [n0 - 1, n0, n0 + 1];

    const [ns, setNs] = useState(initialNs);
    const nsRef = useRef(ns);
    useEffect(() => {
        nsRef.current = ns;
    }, [ns]);

    const requestedRef = useRef(new Set(initialNs));
    const busyRef = useRef(true);
    const mountedRef = useRef(false);
    const lastReportedRef = useRef(null);
    const lastScrollTopRef = useRef(0);
    const lastTopEdgeRef = useRef(null);
    const lastBottomEdgeRef = useRef(null);
    const headerLockRef = useRef(false); // блокируем onViewportMonthChange во время авто-скролла
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // стартовая подгрузка
    useEffect(() => {
        for (const n of initialNs) {
            const [y, m] = fromN(n);
            onMonthChange?.(y, m);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // стартовая прокрутка — показываем current
    useEffect(() => {
        const el = containerRef.current;
        if (!el || mountedRef.current) return;
        requestAnimationFrame(() => {
            const firstBlock = el.querySelector('.month-block');
            const hBlock = firstBlock
                ? firstBlock.getBoundingClientRect().height
                : 0;
            const hHead = monthHeadH(el);
            el.scrollTop = hHead + hBlock; // было: el.scrollTop = h;
            lastScrollTopRef.current = el.scrollTop;
            busyRef.current = false;
            mountedRef.current = true;

            const topEl = dominantMonthEl(el);
            if (topEl) {
                const n = parseInt(topEl.dataset.n, 10);
                const [y, m] = fromN(n);
                lastReportedRef.current = n;
                onViewportMonthChange?.(y, m);
            }
        });
    }, []);

    // включить в список недостающий месяц
    function ensureContains(targetN) {
        setNs((list) => {
            if (list.includes(targetN)) return list;
            const min = list[0],
                max = list[list.length - 1];
            if (targetN < min) {
                const add = [];
                for (let n = targetN; n < min; n++) add.push(n);
                return [...add, ...list];
            }
            if (targetN > max) {
                const add = [];
                for (let n = max + 1; n <= targetN; n++) add.push(n);
                return [...list, ...add];
            }
            return list;
        });
    }

    // автоскролл по стрелкам (плавно и вперёд, и назад)
    useEffect(() => {
        if (activeYear == null || activeMonth == null) return;
        if (!mountedRef.current) return;

        const el = containerRef.current;
        if (!el) return;

        const targetN = toN(activeYear, activeMonth);

        const topEl = dominantMonthEl(el);
        if (topEl) {
            const nTop = parseInt(topEl.dataset.n, 10);
            if (nTop === targetN) return;
        }

        // будем ли препендить?
        const needPrepend =
            nsRef.current.length > 0 && targetN < nsRef.current[0];
        const beforeHeight = needPrepend ? el.scrollHeight : 0;

        headerLockRef.current = true; // на время авто-скролла хедер «молчит»
        ensureContains(targetN);
        busyRef.current = true;

        let tries = 0;
        const finish = () => {
            busyRef.current = false;
            lastScrollTopRef.current = el.scrollTop;
            lastTopEdgeRef.current = null;
            lastBottomEdgeRef.current = null;
            lastReportedRef.current = targetN;

            const [y, m] = fromN(targetN);
            onViewportMonthChange?.(y, m); // финально сообщаем целевой месяц
            headerLockRef.current = false;
            onAutoScrollDone?.(); // ← сообщаем родителю: можно снова слушать скролл
        };

        const tick = () => {
            const block = el.querySelector(`.month-block[data-n="${targetN}"]`);
            if (!block) {
                if (tries++ < 8) return requestAnimationFrame(tick);
                return finish();
            }

            if (needPrepend) {
                const afterHeight = el.scrollHeight;
                const delta = afterHeight - beforeHeight;
                if (delta > 0) el.scrollTop += delta;
            }

            const hHead = monthHeadH(el);
            const off = Math.round(offsetTopWithin(el, block) - hHead); // было без - hHead
            if (Math.abs(off) > 1) {
                el.scrollTo({ top: el.scrollTop + off, behavior: 'smooth' });
                setTimeout(finish, 360);
            } else {
                finish();
            }
        };

        requestAnimationFrame(tick);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeYear, activeMonth]);

    // бесконечный скролл + обновление заголовка
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const notifyTopMonth = () => {
            if (headerLockRef.current) return;
            const topEl = dominantMonthEl(el);
            if (!topEl) return;
            const n = parseInt(topEl.dataset.n, 10);
            if (lastReportedRef.current === n) return;
            lastReportedRef.current = n;
            const [y, m] = fromN(n);
            onViewportMonthChange?.(y, m);
        };

        const onScroll = () => {
            if (busyRef.current) return;

            const st = el.scrollTop;
            const dir =
                st > lastScrollTopRef.current
                    ? 'down'
                    : st < lastScrollTopRef.current
                    ? 'up'
                    : 'none';
            lastScrollTopRef.current = st;

            const nearTop = st <= TOP_THRESHOLD;
            const nearBottom =
                st + el.clientHeight >= el.scrollHeight - BOTTOM_THRESHOLD;

            if (!nearTop) lastTopEdgeRef.current = null;
            if (!nearBottom) lastBottomEdgeRef.current = null;

            // вверх
            if (nearTop && dir === 'up') {
                const cur = nsRef.current;
                if (!cur.length) return;
                const firstN = cur[0];
                if (lastTopEdgeRef.current === firstN) {
                    notifyTopMonth();
                    return;
                }
                const targetN = firstN - 1;

                busyRef.current = true;
                lastTopEdgeRef.current = targetN;
                const before = el.scrollHeight;

                setNs((list) =>
                    list.includes(targetN) ? list : [targetN, ...list]
                );

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const after = el.scrollHeight;
                        el.scrollTop += after - before;
                        if (el.scrollTop <= TOP_THRESHOLD)
                            el.scrollTop = TOP_THRESHOLD + 1;
                        busyRef.current = false;
                        notifyTopMonth();
                    });
                });

                if (!requestedRef.current.has(targetN)) {
                    const [y, m] = fromN(targetN);
                    onMonthChange?.(y, m);
                    requestedRef.current.add(targetN);
                }
                return;
            }

            // вниз
            if (nearBottom && dir === 'down') {
                const cur = nsRef.current;
                if (!cur.length) return;
                const lastN = cur[cur.length - 1];
                if (lastBottomEdgeRef.current === lastN) {
                    notifyTopMonth();
                    return;
                }
                const targetN = lastN + 1;

                busyRef.current = true;
                lastBottomEdgeRef.current = targetN;

                setNs((list) =>
                    list.includes(targetN) ? list : [...list, targetN]
                );
                requestAnimationFrame(() => {
                    busyRef.current = false;
                    notifyTopMonth();
                });

                if (!requestedRef.current.has(targetN)) {
                    const [y, m] = fromN(targetN);
                    onMonthChange?.(y, m);
                    requestedRef.current.add(targetN);
                }
                return;
            }

            // обычная прокрутка
            notifyTopMonth();
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [onMonthChange, onViewportMonthChange]);

    // индекс событий по дню
    const eventsIndex = useMemo(() => {
        const map = new Map();
        for (const ev of events) {
            const d = new Date(ev.start);
            const key = d.toDateString();
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(ev);
        }
        return map;
    }, [events]);

    return (
        <div className="calendar-month" ref={containerRef}>
            <div className="month-weekdays">
                {DOW.map((d) => (
                    <div key={d} className="wd">
                        {d}
                    </div>
                ))}
            </div>

            {ns.map((n) => {
                const [y, m] = fromN(n);
                const key = toKey(n);
                const firstGrid = startOfGrid(y, m);
                const days = Array.from(
                    { length: 42 },
                    (_, i) =>
                        new Date(
                            firstGrid.getFullYear(),
                            firstGrid.getMonth(),
                            firstGrid.getDate() + i
                        )
                );
                const monthStart = startOfMonth(y, m);
                const monthEnd = endOfMonth(y, m);
                const isActiveBlock = activeYear === y && activeMonth === m;

                return (
                    <div
                        className={`month-block ${
                            isActiveBlock ? 'is-active' : ''
                        }`}
                        key={key}
                        data-k={key}
                        data-n={n}
                    >
                        <div className="month-grid">
                            {days.map((d, i) => {
                                const inMonth =
                                    d >= monthStart && d <= monthEnd;
                                const list = inMonth
                                    ? eventsIndex.get(d.toDateString()) || []
                                    : [];
                                const dateClass =
                                    inMonth && isActiveBlock
                                        ? 'cur'
                                        : inMonth
                                        ? 'in'
                                        : 'pad';

                                const isToday =
                                    inMonth &&
                                    d.getFullYear() === today.getFullYear() &&
                                    d.getMonth() === today.getMonth() &&
                                    d.getDate() === today.getDate();

                                return (
                                    <div
                                        key={i}
                                        className={`month-cell ${
                                            inMonth ? 'in' : 'pad'
                                        }`}
                                        onClick={() =>
                                            inMonth && onDateSelect?.(d)
                                        }
                                        onKeyDown={(e) => {
                                            if (!inMonth) return;
                                            if (
                                                e.key === 'Enter' ||
                                                e.key === ' '
                                            ) {
                                                e.preventDefault();
                                                onDateSelect?.(d);
                                            }
                                        }}
                                        tabIndex={inMonth ? 0 : -1}
                                        title={
                                            inMonth
                                                ? list
                                                      .map((e) => e.title)
                                                      .join(', ')
                                                : ''
                                        }
                                    >
                                        <div
                                            className={`cell-date ${dateClass} ${
                                                isToday ? 'today' : ''
                                            }`}
                                            aria-hidden={!inMonth}
                                        >
                                            {inMonth ? d.getDate() : ''}
                                        </div>
                                        {inMonth && (
                                            <div
                                                className="cell-events"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                {list
                                                    .slice(0, 3)
                                                    .map((e, idx) => (
                                                        <div
                                                            className={`pill ${
                                                                e.category || ''
                                                            }`}
                                                            key={idx}
                                                        >
                                                            {e.title || 'event'}
                                                        </div>
                                                    ))}
                                                {list.length > 3 && (
                                                    <div className="more">
                                                        +{list.length - 3}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
