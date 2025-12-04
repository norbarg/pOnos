import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from 'react';
import { useLocation } from 'react-router-dom';
import WeekView from '../components/Calendar/WeekView';
import MonthView from '../components/Calendar/MonthView';
import YearView from '../components/Calendar/YearView';
import AccessPanel from '../components/Calendar/AccessPanel';
import { api } from '../api/axios';
import { absUrl } from '../config/apiOrigin';
import '../styles/Calendar.css';

import appIcon from '../assets/logo.png';
import icFilter from '../assets/filter.png';
import icFilterOn from '../assets/filter_on.png';
import icSearch from '../assets/search.png';
import icGear from '../assets/gear.png';
import icSendArrow from '../assets/arrow_up_right.png';

const LS_VIEW = 'calendar:viewMode';
const LS_DATE = 'calendar:currentDate';
const SS_RESET = 'calendar:_reset_on_enter';

function slugify(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

function startOfWeek(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function addMonths(d, n) {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
}
function monthFirstDay(y, m) {
    return new Date(y, m, 1);
}
function monthLastDay(y, m) {
    return new Date(y, m + 1, 0, 23, 59, 59, 999);
}
function fmtISO(d) {
    return d.toISOString();
}
function mergeEvents(a, b) {
    const map = new Map();
    [...a, ...b].forEach((e) => {
        const key =
            (e.id || e._id || Math.random()) +
            '|' +
            (e.start instanceof Date ? e.start.toISOString() : e.start);
        if (!map.has(key)) map.set(key, e);
    });
    return [...map.values()];
}
function startOfWeekLocal(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
}
function sameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function WeekPickerPopover({ open, currentDate, onClose, onSelectWeek }) {
    const ref = React.useRef(null);
    const [view, setView] = useState(
        new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    );

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => {
            if (!ref.current) return;
            if (!ref.current.contains(e.target)) onClose?.();
        };
        document.addEventListener('mousedown', onDoc, { passive: true });
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open, onClose]);

    const y = view.getFullYear();
    const m = view.getMonth();

    const firstOfMonth = new Date(y, m, 1);
    const firstGrid = startOfWeekLocal(firstOfMonth);
    const days = Array.from(
        { length: 42 },
        (_, i) =>
            new Date(
                firstGrid.getFullYear(),
                firstGrid.getMonth(),
                firstGrid.getDate() + i
            )
    );

    const curWeekStart = startOfWeekLocal(currentDate);

    return (
        <div ref={ref} className={`weekpicker-popover ${open ? 'open' : ''}`}>
            <div className="weekpicker-head">
                <button
                    className="icon"
                    onClick={() => setView(new Date(y, m - 1, 1))}
                    aria-label="prev-month"
                >
                    ‹
                </button>
                <div className="label">
                    {new Date(y, m, 1).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric',
                    })}
                </div>
                <button
                    className="icon"
                    onClick={() => setView(new Date(y, m + 1, 1))}
                    aria-label="next-month"
                >
                    ›
                </button>
            </div>

            <div className="weekpicker-dow">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <div key={d} className="dow">
                        {d}
                    </div>
                ))}
            </div>

            <div className="weekpicker-weeks">
                {Array.from({ length: 6 }, (_, row) => {
                    const rowDays = days.slice(row * 7, row * 7 + 7);
                    const rowWeekStart = startOfWeekLocal(rowDays[0]);
                    const selectedRow = sameDay(rowWeekStart, curWeekStart);
                    return (
                        <div
                            key={row}
                            className={`week-row ${
                                selectedRow ? 'selected' : ''
                            }`}
                            onClick={() => {
                                onSelectWeek?.(rowWeekStart);
                                onClose?.();
                            }}
                        >
                            {rowDays.map((d, i) => {
                                const inMonth = d.getMonth() === m;
                                return (
                                    <div
                                        key={i}
                                        className={`cell ${
                                            inMonth ? 'in' : 'out'
                                        }`}
                                        data-date={d.toISOString()}
                                    >
                                        <span className="dd">
                                            {d.getDate()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function FilterPopover({
    open,
    viewMode,
    setViewMode,
    categories,
    setCategories,
    categoryDefs,
    onClose,
    anchorRef,
}) {
    const popRef = React.useRef(null);

    React.useEffect(() => {
        if (!open) return;
        const onDocDown = (e) => {
            const pop = popRef.current;
            const btn = anchorRef?.current;
            if (!pop) return;
            const insidePop = pop.contains(e.target);
            const insideBtn = btn && btn.contains(e.target);
            if (!insidePop && !insideBtn) onClose?.();
        };
        document.addEventListener('pointerdown', onDocDown, true);
        return () =>
            document.removeEventListener('pointerdown', onDocDown, true);
    }, [open, onClose, anchorRef]);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === 'Escape' && onClose?.();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const Title = ({ children, right }) => (
        <div className="fp-row">
            <div className="title">{children}</div>
            {right}
        </div>
    );
    const Cap = (s) => s[0].toUpperCase() + s.slice(1);
    const allSlugs = (categoryDefs || []).map((c) => c.slug);
    return (
        <div ref={popRef} className={`filter-popover ${open ? 'open' : ''}`}>
            <div className="section">
                <Title>Filter by time</Title>
                <div className="segmented">
                    {['year', 'month', 'week'].map((v) => (
                        <button
                            key={v}
                            className={viewMode === v ? 'active' : ''}
                            onClick={() => {
                                setViewMode(v);
                                onClose?.();
                            }}
                        >
                            {Cap(v)}
                        </button>
                    ))}
                </div>
            </div>

            <div className="section">
                <Title
                    right={
                        <button
                            className="link"
                            onClick={() => setCategories(allSlugs)}
                        >
                            Clear
                        </button>
                    }
                >
                    Filter by categories
                </Title>

                <div className="tags">
                    {(categoryDefs || []).map((cat) => (
                        <label key={cat.slug} className="tag-wrap">
                            <input
                                type="checkbox"
                                checked={categories.includes(cat.slug)}
                                onChange={() =>
                                    setCategories((prev) =>
                                        prev.includes(cat.slug)
                                            ? prev.filter((s) => s !== cat.slug)
                                            : [...prev, cat.slug]
                                    )
                                }
                            />
                            <span
                                className="tag"
                                data-cat={cat.slug}
                                style={{
                                    '--br': cat.color,
                                    '--dot': cat.color,
                                }}
                            >
                                {cat.name}
                            </span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default function CalendarsPage() {
    const location = useLocation();
    const preselectCalId = useMemo(() => {
        const viaState = location.state?.calId;
        const viaQuery = (() => {
            try {
                return new URLSearchParams(location.search).get('cal');
            } catch {
                return null;
            }
        })();
        return viaState || viaQuery || null;
    }, [location.state, location.search]);
    const resetOnEnter = (() => {
        try {
            const v = sessionStorage.getItem(SS_RESET);
            if (v) sessionStorage.removeItem(SS_RESET);
            return !!v;
        } catch {
            return false;
        }
    })();
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            try {
                setIsMobile(window.innerWidth <= 768);
            } catch {
                setIsMobile(false);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const useStored = !resetOnEnter;

    const [viewMode, setViewMode] = useState(() => {
        if (useStored) {
            try {
                const v = localStorage.getItem(LS_VIEW);
                return v === 'year' || v === 'month' || v === 'week'
                    ? v
                    : 'week';
            } catch {}
        }
        return 'week';
    });

    const [currentDate, setCurrentDate] = useState(() => {
        if (useStored) {
            try {
                const raw = localStorage.getItem(LS_DATE);
                const d = raw ? new Date(raw) : new Date();
                return isNaN(d.getTime()) ? new Date() : d;
            } catch {}
        }
        return new Date();
    });

    const [mainCal, setMainCal] = useState(null);
    const [holidayCal, setHolidayCal] = useState(null);
    const [events, setEvents] = useState([]);
    const [catDefs, setCatDefs] = useState([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);

    const [filterOpen, setFilterOpen] = useState(false);

    const filterBtnRef = useRef(null);

    const searchBtnRef = useRef(null);
    const searchPopRef = useRef(null);
    const searchInputRef = useRef(null);

    const [categories, setCategories] = useState([]);

    const [sharedWith, setSharedWith] = useState([]);
    const [weekPickerOpen, setWeekPickerOpen] = useState(false);

    const gearBtnRef = useRef(null);
    const [accessOpen, setAccessOpen] = useState(false);
    const accessPopRef = useRef(null);
    const [accessPos, setAccessPos] = useState({ top: 56, left: 0 });

    const loadMembers = useCallback(async () => {
        if (!mainCal) return;
        try {
            const { data } = await api.get(`/calendars/${mainCal.id}/members`);
            const list = [data.owner, ...(data.members || [])]
                .filter(Boolean)
                .map((x) => {
                    const rawAvatar = x.avatarUrl || x.avatar || null;
                    const avatar =
                        rawAvatar && rawAvatar.startsWith('http')
                            ? rawAvatar
                            : rawAvatar
                            ? absUrl(rawAvatar)
                            : null;

                    return {
                        id: x.id,
                        email: x.email,
                        name: x.name,
                        avatar,
                        permission:
                            x.role === 'owner'
                                ? 'owner'
                                : x.role === 'editor'
                                ? 'edit'
                                : 'view',
                        role: x.role,
                    };
                });
            setSharedWith(list);
        } catch (e) {
            console.warn('load members failed', e?.message);
        }
    }, [mainCal]);

    const normalizeCategory = (c) => ({
        id: c.id ?? c._id,
        slug: c.slug ?? slugify(c.name || c.title || 'category'),
        name: c.name ?? c.title ?? c.slug ?? 'Category',
        color: c.color ?? c.hex ?? '#e9d5ff',
    });

    useEffect(() => {
        const st = location.state;
        if (!st) return;

        if (st.focusDate) {
            const d = new Date(st.focusDate);
            if (!Number.isNaN(d.getTime())) {
                setCurrentDate(d);
            }
        }

        if (
            st.view &&
            (st.view === 'week' || st.view === 'month' || st.view === 'year')
        ) {
            setViewMode(st.view);
        }
    }, [location.state]);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get('/categories');
                const raw = data?.categories ?? data ?? [];

                const filtered = raw.filter((c) => {
                    const builtIn = (c.builtInKey || c.key || '').toLowerCase();
                    if (builtIn === 'holiday') return false;

                    const title = (c.title || c.name || '').toLowerCase();
                    if (title === 'holiday' || title === 'holidays')
                        return false;

                    const slug = (
                        c.slug || slugify(c.name || c.title || builtIn || '')
                    ).toLowerCase();
                    return slug !== 'holiday';
                });

                const list = filtered.map(normalizeCategory);
                setCatDefs(list);
            } catch (e) {
                setCatDefs([
                    {
                        slug: 'arrangement',
                        name: 'Arrangement',
                        color: '#E0BDA1',
                    },
                    { slug: 'reminder', name: 'Reminder', color: '#B9C9F1' },
                    { slug: 'task', name: 'Task', color: '#E083AC' },
                ]);
            }
        })();
    }, []);

    useEffect(() => {
        if (!catDefs.length) return;
        setCategories((prev) => {
            const all = catDefs.map((c) => c.slug);
            const cur = prev.filter((s) => all.includes(s));
            return cur.length ? cur : all;
        });
    }, [catDefs]);

    const headerLabel =
        viewMode === 'year'
            ? `Year ${currentDate.getFullYear()}`
            : currentDate.toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
              });

    const loadedMonthsRef = useRef(new Set());
    const autoNavRef = useRef(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get('/calendars');
                const cals = data?.calendars || [];
                const byId = (x) =>
                    String(x.id ?? x._id) === String(preselectCalId);
                const main =
                    (preselectCalId && cals.find(byId)) ||
                    cals.find((c) => c.isMain) ||
                    cals[0];
                const hol = cals.find(
                    (c) => c.isSystem && c.systemType === 'holidays'
                );
                setMainCal(main || null);
                setHolidayCal(hol || null);
            } catch (e) {
                console.warn('load calendars failed', e?.message);
            }
        })();
    }, [preselectCalId]);

    useEffect(() => {
        if (!mainCal) return;

        if (viewMode === 'week') {
            const from = startOfWeek(currentDate);
            const to = addDays(from, 7);
            loadRange(from, to, false);
        }

        if (viewMode === 'month') {
            const y = currentDate.getFullYear();
            const m = currentDate.getMonth();

            loadMonth(y, m);
        }
    }, [mainCal, holidayCal, currentDate, viewMode]);

    useEffect(() => {
        try {
            localStorage.setItem(LS_VIEW, viewMode);
        } catch {}
    }, [viewMode]);
    useEffect(() => {
        const prev = document.title;
        const title = mainCal?.name
            ? `${mainCal.name} — Timely`
            : 'Calendar — Timely';
        document.title = title;
        return () => {
            document.title = prev;
        };
    }, [mainCal?.name]);
    useEffect(() => {
        try {
            localStorage.setItem(LS_DATE, currentDate.toISOString());
        } catch {}
    }, [currentDate]);
    function convEvent(ev, { isHoliday = false } = {}) {
        let rawCatKey =
            ev.categoryInfo?.builtInKey ||
            ev.categoryInfo?.key ||
            ev.categoryInfo?.title ||
            ev.categoryKey ||
            ev.categorySlug ||
            ev.category?.slug ||
            ev.category ||
            '';

        if (/^[0-9a-fA-F]{24}$/.test(rawCatKey)) rawCatKey = '';

        let cat = slugify(rawCatKey);
        if (!cat) cat = 'arrangement';

        const color = ev.categoryInfo?.color || ev.category?.color || ev.color;

        return {
            ...ev,
            id: ev.id || ev._id,
            start: new Date(ev.start),
            end: new Date(ev.end),
            category: cat,
            color,
            isHoliday,
        };
    }

    async function loadRange(from, to, replace = false) {
        if (!mainCal) return;
        try {
            const params = {
                from: fmtISO(from),
                to: fmtISO(to),
                expand: 1,
            };

            const [a, b] = await Promise.all([
                api.get(`/calendars/${mainCal.id}/events`, { params }),
                holidayCal
                    ? api.get(`/calendars/${holidayCal.id}/events`, { params })
                    : Promise.resolve({ data: { events: [] } }),
            ]);

            const mainEvents = (a.data?.events || []).map((ev) =>
                convEvent(ev, { isHoliday: false })
            );
            const holidayEvents = (b.data?.events || []).map((ev) =>
                convEvent(ev, { isHoliday: true })
            );

            const merged = mergeEvents(mainEvents, holidayEvents);

            setEvents((prev) => (replace ? merged : mergeEvents(prev, merged)));
        } catch (e) {
            console.error('loadRange error', e?.message);
        }
    }

    async function loadMonth(year, month) {
        if (!mainCal) return;
        const from = monthFirstDay(year, month),
            to = addDays(monthLastDay(year, month), 1);
        await loadRange(from, to, false);
    }

    useEffect(() => {
        if (accessOpen) loadMembers();
    }, [accessOpen, loadMembers]);

    useEffect(() => {
        if (!accessOpen) return;
        const btn = gearBtnRef.current;
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const width = 420;
        const gap = 8;
        const top = r.bottom + gap;
        const left = Math.min(
            window.innerWidth - width - 16,
            Math.max(16, r.right - width)
        );
        setAccessPos({ top, left });
    }, [accessOpen]);

    useEffect(() => {
        if (!searchOpen) return;
        const onDoc = (e) => {
            const pop = searchPopRef.current;
            const btn = searchBtnRef.current;
            const inPop = pop && pop.contains(e.target);
            const inBtn = btn && btn.contains(e.target);
            if (!inPop && !inBtn) setSearchOpen(false);
        };
        document.addEventListener('pointerdown', onDoc, true);
        return () => document.removeEventListener('pointerdown', onDoc, true);
    }, [searchOpen]);

    useEffect(() => {
        if (!searchOpen) return;
        const onKey = (e) => e.key === 'Escape' && setSearchOpen(false);
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [searchOpen]);

    useEffect(() => {
        if (searchOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [searchOpen]);

    function handlePrevNext(delta) {
        if (viewMode === 'month') {
            autoNavRef.current = true;
            setCurrentDate((d) => addMonths(d, delta));
        } else {
            setCurrentDate((d) => addDays(d, delta * 7));
        }
    }

    function handleYearSelect(y) {
        const d = new Date(currentDate);
        d.setFullYear(y);
        d.setMonth(0);
        d.setDate(1);
        setCurrentDate(d);
        setViewMode('month');
    }

    function handleMonthChange(y, m) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (loadedMonthsRef.current.has(key)) return;
        loadedMonthsRef.current.add(key);
        loadMonth(y, m);
    }

    async function inviteUser(email, perm) {
        if (!mainCal) return;
        const { data } = await api.post(`/calendars/${mainCal.id}/share`, {
            email,
            role: perm === 'edit' ? 'editor' : 'member',
        });
        return data;
    }
    async function changePermission(userId, perm) {
        if (!mainCal) return;
        const targetId = String(userId);
        const nextRole = perm === 'edit' ? 'editor' : 'member';
        setSharedWith((prev) =>
            prev.map((u) =>
                String(u.id) === targetId
                    ? { ...u, permission: perm, role: nextRole }
                    : u
            )
        );
        try {
            await api.patch(`/calendars/${mainCal.id}/members/${targetId}`, {
                role: nextRole,
            });
            await loadMembers();
        } catch (e) {
            console.error(
                'changePermission error:',
                e?.response?.data || e.message
            );
            await loadMembers();
        }
    }
    async function removeAccess(userId) {
        if (!mainCal) return;
        await api.delete(`/calendars/${mainCal.id}/members/${userId}`);
        await loadMembers();
    }

    const visibleEvents = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const hasCatFilter = Array.isArray(categories) && categories.length > 0;
        const catsSet = new Set(categories || []);
        const allKnownCats = new Set((catDefs || []).map((c) => c.slug));

        return events.filter((e) => {
            if (e.isHoliday) return true;

            const text = (
                (e.title || '') +
                ' ' +
                (e.description || '')
            ).toLowerCase();

            const evSlug = slugify(
                e.category ||
                    e.categoryInfo?.builtInKey ||
                    e.categoryInfo?.title
            );

            const isKnown = evSlug && allKnownCats.has(evSlug);

            const catOK = !hasCatFilter || catsSet.has(evSlug) || !isKnown;

            return catOK && (!q || text.includes(q));
        });
    }, [events, searchQuery, categories]);

    useEffect(() => {
        console.log('RAW events from API:', events);
        console.log('visibleEvents after filters:', visibleEvents);
        console.log('category filters:', categories);
    }, [events, visibleEvents, categories]);

    const weekStart = startOfWeek(currentDate);
    const DEFAULT_CATS = ['arrangement', 'reminder', 'task'];
    const isSameCats = (a, b) =>
        a.length === b.length && a.every((x) => b.includes(x));
    const ALL_SLUGS = useMemo(() => catDefs.map((c) => c.slug), [catDefs]);
    const isSame = (a, b) =>
        a.length === b.length && a.every((x) => b.includes(x));
    const filterApplied = !isSame(categories, ALL_SLUGS);
    const calTitle = mainCal?.name;
    return (
        <div className="calendar-container">
            {/* App bar */}
            <div className="calendar-appbar">
                <div className="brand">
                    <span className="brand__name" title={calTitle}>
                        {calTitle}
                    </span>
                    <img className="brand__logo" src={appIcon} alt="app" />
                </div>
            </div>

            {/* Header */}
            <div
                className={`calendar-header ${
                    viewMode === 'year' ? 'calendar-header--year' : ''
                }`}
            >
                <div className="hdr-left">
                    {/* FILTER ICON */}

                    <button
                        ref={filterBtnRef}
                        className={`btn-icon filter-btn${
                            filterApplied ? ' is-on' : ''
                        }`}
                        onClick={() => setFilterOpen((v) => !v)}
                        aria-label="Filter / View"
                        title="Filter / View"
                    >
                        <img
                            src={filterApplied ? icFilterOn : icFilter}
                            alt="filter"
                        />
                    </button>

                    <FilterPopover
                        open={filterOpen}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        categories={categories}
                        setCategories={setCategories}
                        categoryDefs={catDefs}
                        anchorRef={filterBtnRef}
                        onClose={() => setFilterOpen(false)}
                    />

                    {/* NAV + PERIOD */}
                    {viewMode !== 'year' && (
                        <>
                            <button
                                className="btn-icon nav"
                                onClick={() => handlePrevNext(-1)}
                                aria-label="prev"
                            >
                                ‹
                            </button>

                            <button
                                className="btn-icon nav"
                                onClick={() => handlePrevNext(+1)}
                                aria-label="next"
                            >
                                ›
                            </button>
                            <div className="period">
                                <span className="period-text">
                                    {headerLabel}
                                </span>
                                {viewMode === 'week' && (
                                    <>
                                        <button
                                            className="btn-caret"
                                            aria-label="choose week"
                                            onClick={() =>
                                                setWeekPickerOpen((v) => !v)
                                            }
                                        >
                                            ▾
                                        </button>
                                        <WeekPickerPopover
                                            open={weekPickerOpen}
                                            currentDate={currentDate}
                                            onClose={() =>
                                                setWeekPickerOpen(false)
                                            }
                                            onSelectWeek={(ws) =>
                                                setCurrentDate(ws)
                                            }
                                        />
                                    </>
                                )}
                            </div>
                        </>
                    )}

                    {viewMode === 'year' && (
                        <div className="period">
                            <span className="period-text">{headerLabel}</span>
                        </div>
                    )}
                </div>

                <div className="hdr-right">
                    {(viewMode === 'week' || viewMode === 'month') && (
                        <>
                            {!isMobile && (
                                <div className="searchbox searchbox--inline">
                                    <input
                                        className="search-input"
                                        placeholder="Search"
                                        value={searchQuery}
                                        onChange={(e) =>
                                            setSearchQuery(e.target.value)
                                        }
                                    />
                                    <img
                                        className="search-ico"
                                        src={icSearch}
                                        alt="search"
                                    />
                                </div>
                            )}

                            {isMobile && (
                                <>
                                    <button
                                        ref={searchBtnRef}
                                        className="btn-icon search-toggle"
                                        onClick={() => setSearchOpen((v) => !v)}
                                        aria-label="Search"
                                    >
                                        <img src={icSearch} alt="search" />
                                    </button>

                                    {searchOpen && (
                                        <div
                                            ref={searchPopRef}
                                            className="search-popover"
                                        >
                                            <input
                                                ref={searchInputRef}
                                                className="search-popover-input"
                                                placeholder="Search"
                                                value={searchQuery}
                                                onChange={(e) =>
                                                    setSearchQuery(
                                                        e.target.value
                                                    )
                                                }
                                            />
                                            <img
                                                className="search-popover-ico"
                                                src={icSearch}
                                                alt="search"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    <button
                        ref={gearBtnRef}
                        className="btn-icon gear"
                        onClick={() => setAccessOpen((v) => !v)}
                        aria-label="access"
                    >
                        <img src={icGear} alt="settings" />
                    </button>
                    {accessOpen && (
                        <div
                            ref={accessPopRef}
                            className="access-popover"
                            style={{
                                position: 'fixed',
                                top: accessPos.top,
                                left: accessPos.left,
                            }}
                        >
                            <AccessPanel
                                sharedWith={sharedWith}
                                onInvite={inviteUser}
                                onChangePermission={changePermission}
                                onRemove={removeAccess}
                                sendIcon={icSendArrow}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="calendar-body">
                {viewMode === 'week' && (
                    <WeekView
                        weekStart={weekStart}
                        events={visibleEvents}
                        filters={categories}
                        onDateSelect={(d) => setCurrentDate(d)}
                        calendarId={mainCal?.id}
                    />
                )}
                {viewMode === 'month' && (
                    <MonthView
                        initialYear={currentDate.getFullYear()}
                        initialMonth={currentDate.getMonth()}
                        activeYear={currentDate.getFullYear()}
                        activeMonth={currentDate.getMonth()}
                        events={visibleEvents}
                        filters={categories}
                        onMonthChange={handleMonthChange}
                        onViewportMonthChange={(y, m) => {
                            if (autoNavRef.current) return;
                            const d = new Date(currentDate);
                            d.setFullYear(y);
                            d.setMonth(m);
                            d.setDate(1);
                            setCurrentDate(d);
                        }}
                        onAutoScrollDone={() => {
                            autoNavRef.current = false;
                        }}
                        onDateSelect={(d) => {
                            setCurrentDate(d);
                            setViewMode('week');
                        }}
                    />
                )}
                {viewMode === 'year' && (
                    <YearView
                        initialYear={currentDate.getFullYear()}
                        onYearSelect={handleYearSelect}
                    />
                )}
            </div>
        </div>
    );
}
