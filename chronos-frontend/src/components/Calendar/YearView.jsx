import React, { useEffect, useRef, useState, useMemo } from 'react';
import '../../styles/Calendar.css';

const ROW = 4;
const CHUNK_ROWS = 3;
const TOP_THRESHOLD = 16;
const BOTTOM_THRESHOLD = 160;

const rowStartFor = (year) => year - (year % ROW);
const makeRow = (start) => [start, start + 1, start + 2, start + 3];

const offsetTopWithin = (elContainer, el) => {
    if (!elContainer || !el) return 0;
    const c = elContainer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top - c.top;
};

const firstVisibleRowEl = (el) => {
    if (!el) return null;
    const rows = el.querySelectorAll('.year-row');
    let best = null;
    let bestTop = Infinity;
    for (const row of rows) {
        const t = offsetTopWithin(el, row);
        if (t >= 0 && t < bestTop) {
            best = row;
            bestTop = t;
        }
    }
    return best || rows[0] || null;
};

export default function YearView({ initialYear, onYearSelect }) {
    const containerRef = useRef(null);

    const startRow = rowStartFor(initialYear);
    const initialRows = useMemo(() => {
        const rows = [];
        for (let i = -CHUNK_ROWS; i <= CHUNK_ROWS; i++)
            rows.push(startRow + i * ROW);
        return rows;
    }, [startRow]);

    const [rows, setRows] = useState(initialRows);
    const rowsRef = useRef(rows);
    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);

    const stealFocusFromCells = () => {
        const el = containerRef.current;
        if (!el) return;
        const active = document.activeElement;
        if (active && el.contains(active) && active !== el) {
            try {
                el.focus({ preventScroll: true });
            } catch {
                el.focus();
            }
        }
    };

    const mountedRef = useRef(false);
    const busyRef = useRef(true);
    useEffect(() => {
        const el = containerRef.current;
        if (!el || mountedRef.current) return;
        requestAnimationFrame(() => {
            const anchorSel = `[data-rowstart="${startRow}"]`;
            const anchorEl = el.querySelector(anchorSel);
            const top = offsetTopWithin(el, anchorEl);
            el.scrollTop += top;
            busyRef.current = false;
            mountedRef.current = true;
        });
    }, [startRow]);

    const lastTopMinRef = useRef(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onScroll = () => {
            if (busyRef.current) return;

            const nearTop = el.scrollTop <= TOP_THRESHOLD;
            const nearBottom =
                el.scrollTop + el.clientHeight >=
                el.scrollHeight - BOTTOM_THRESHOLD;

            if (nearTop) {
                const cur = rowsRef.current;
                if (!cur.length) return;
                const minStart = cur[0];

                if (lastTopMinRef.current === minStart) return;

                const anchorEl = firstVisibleRowEl(el);
                const anchorKey = anchorEl?.dataset?.rowstart;
                const anchorBefore = anchorEl
                    ? offsetTopWithin(el, anchorEl)
                    : 0;

                const toAdd = [];
                for (let i = CHUNK_ROWS; i >= 1; i--) {
                    const r = minStart - i * ROW;
                    if (!cur.includes(r) && !toAdd.includes(r)) toAdd.push(r);
                }
                if (!toAdd.length) {
                    if (el.scrollTop <= TOP_THRESHOLD)
                        el.scrollTop = TOP_THRESHOLD + 1;
                    return;
                }

                busyRef.current = true;
                stealFocusFromCells();
                lastTopMinRef.current = minStart;

                setRows((list) => [...toAdd, ...list]);

                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (anchorKey) {
                            const sameAnchor = el.querySelector(
                                `[data-rowstart="${anchorKey}"]`
                            );
                            if (sameAnchor) {
                                const anchorAfter = offsetTopWithin(
                                    el,
                                    sameAnchor
                                );
                                el.scrollTop += anchorAfter - anchorBefore;
                            }
                        }
                        if (el.scrollTop <= TOP_THRESHOLD)
                            el.scrollTop = TOP_THRESHOLD + 1;
                        busyRef.current = false;
                    });
                });
                return;
            }

            if (nearBottom) {
                const cur = rowsRef.current;
                if (!cur.length) return;
                const maxStart = cur[cur.length - 1];

                const toAdd = [];
                for (let i = 1; i <= CHUNK_ROWS; i++) {
                    const r = maxStart + i * ROW;
                    if (!cur.includes(r) && !toAdd.includes(r)) toAdd.push(r);
                }
                if (!toAdd.length) return;

                busyRef.current = true;
                stealFocusFromCells();
                setRows((list) => [...list, ...toAdd]);
                requestAnimationFrame(() => {
                    busyRef.current = false;
                });
            }
        };

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div ref={containerRef} className="calendar-year" tabIndex={0}>
            {rows.map((rowStart) => (
                <div
                    className="year-row"
                    key={rowStart}
                    data-rowstart={rowStart}
                >
                    {makeRow(rowStart).map((y) => (
                        <button
                            key={y}
                            className={`year-cell ${
                                y === initialYear ? 'active' : ''
                            }`}
                            tabIndex={-1}
                            onClick={() => onYearSelect?.(y)}
                            title={String(y)}
                        >
                            {y}
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
}
