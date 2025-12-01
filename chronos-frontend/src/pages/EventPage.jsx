// chronos-frontend/src/pages/EventPage.jsx
import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api/axios';
import Calendars from './Calendars'; // фон сзади – календарь
import '../styles/Calendar.css';

const CAL_RESET_FLAG = 'calendar:_reset_on_enter';

function formatDateInput(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function todayISO() {
    return formatDateInput(new Date()); // локальная сегодняшняя дата
}
function pad2(n) {
    return String(n).padStart(2, '0');
}
function defaultTimes() {
    const now = new Date();
    const h = now.getHours();
    return {
        startTime: `${pad2(h)}:00`,
        endTime: `${pad2(h + 1)}:00`,
    };
}
function slugify(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

// варианты повторения -> RRULE
const REPEAT_RRULE = {
    daily: 'FREQ=DAILY',
    weekly: 'FREQ=WEEKLY',
    monthly: 'FREQ=MONTHLY',
    '2months': 'FREQ=MONTHLY;INTERVAL=2',
};

// пресеты цветов для новой категории
const COLOR_PRESETS = ['#C5BDF0', '#96C0BE', '#D65050', '#F9F06C', '#59DAEB'];

export default function NewEventPage() {
    const navigate = useNavigate();
    const location = useLocation();

    const [calendars, setCalendars] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(todayISO());
    const [startTime, setStartTime] = useState(defaultTimes().startTime);
    const [endTime, setEndTime] = useState(defaultTimes().endTime);
    const [calendarId, setCalendarId] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [repeat, setRepeat] = useState('none');

    // новая категория
    const [newCatTitle, setNewCatTitle] = useState('');
    const [newCatColor, setNewCatColor] = useState(COLOR_PRESETS[0]);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [pendingDelCat, setPendingDelCat] = useState(null);
    const colorWrapRef = useRef(null);

    // если нас привели с calId / датой
    const preselectCalId = useMemo(
        () => location.state?.calId ?? null,
        [location.state]
    );
    const preselectDate = useMemo(
        () => location.state?.date ?? null,
        [location.state]
    );

    // подхватить дату из state, если есть
    // подхватить только дату из state.date, если нет slotStart
    useEffect(() => {
        const st = location.state;
        if (!st) return;

        // если есть slotStart — он главнее, тут ничего не делаем
        if (st.slotStart) return;

        const preselectDate = st.date;
        if (!preselectDate) return;

        if (/^\d{4}-\d{2}-\d{2}/.test(preselectDate)) {
            setDate(preselectDate.slice(0, 10));
        } else {
            const d = new Date(preselectDate);
            if (!Number.isNaN(d.getTime())) {
                setDate(formatDateInput(d));
            }
        }
    }, [location.state]);
    // если пришёл slotStart (клик по ячейке недели) — ставим дату и время
    useEffect(() => {
        const st = location.state;
        if (!st?.slotStart) return;

        const d = new Date(st.slotStart);
        if (Number.isNaN(d.getTime())) return;

        // дата
        setDate(formatDateInput(d));

        // время старта
        const h = d.getHours();
        const m = d.getMinutes();
        setStartTime(`${pad2(h)}:${pad2(m)}`);

        // конец через 30 минут
        const end = new Date(d.getTime() + 30 * 60 * 1000);
        setEndTime(`${pad2(end.getHours())}:${pad2(end.getMinutes())}`);
    }, [location.state]);

    // click-away для поповера выбора цвета
    useEffect(() => {
        if (!colorPickerOpen) return;
        const onDown = (e) => {
            if (!colorWrapRef.current) return;
            if (!colorWrapRef.current.contains(e.target)) {
                setColorPickerOpen(false);
            }
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
    }, [colorPickerOpen]);

    // подгружаем календари/категории
    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setError(null);

                const [{ data: calsData }, { data: catsData }] =
                    await Promise.all([
                        api.get('/calendars'),
                        api.get('/categories'),
                    ]);

                const rawCals = calsData?.calendars || [];

                // ❌ убираем системный календарь праздников из списка для выбора
                const userCals = rawCals.filter(
                    (c) => !(c.isSystem && c.systemType === 'holidays')
                );
                setCalendars(userCals);

                const catsRaw = catsData?.categories ?? catsData ?? [];

                // ❌ убираем системную категорию Holiday
                const catsList = catsRaw.filter((c) => {
                    const builtIn = (c.builtInKey || c.key || '').toLowerCase();
                    if (builtIn === 'holiday') return false;

                    const title = (c.title || c.name || '').toLowerCase();
                    if (title === 'holiday' || title === 'holidays')
                        return false;

                    const slug = (
                        c.slug || slugify(c.title || c.name || builtIn || '')
                    ).toLowerCase();
                    return slug !== 'holiday';
                });

                setCategories(catsList);

                const main =
                    (preselectCalId &&
                        userCals.find(
                            (c) => String(c.id) === String(preselectCalId)
                        )) ||
                    userCals.find((c) => c.isMain) ||
                    userCals[0];

                if (main) setCalendarId(main.id);

                const firstCat = catsList[0];
                if (firstCat) setCategoryId(firstCat.id ?? firstCat._id);
            } catch (e) {
                console.warn('load for new event failed', e?.message);
                setError('Failed to load calendars or categories');
            } finally {
                setLoading(false);
            }
        })();
    }, [preselectCalId]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!calendarId) {
            setError('Choose calendar');
            return;
        }

        const selectedCal = calendars.find(
            (c) => String(c.id) === String(calendarId)
        );

        if (selectedCal && selectedCal.role === 'member') {
            setError(
                'You can only create events in calendars where you have "can edit" rights.'
            );
            return;
        }
        if (!title.trim()) {
            setError('Title is required');
            return;
        }

        try {
            setSaving(true);
            setError(null);

            const startISO = new Date(`${date}T${startTime}:00`);
            const endISO = new Date(`${date}T${endTime}:00`);

            if (endISO <= startISO) {
                setError('End time must be after start time');
                setSaving(false);
                return;
            }
            const tooMany = await exceedsThreeOverlaps(
                calendarId,
                startISO,
                endISO
            );
            if (tooMany) {
                setError(
                    'You already have 3 events at this time. Please choose another time slot.'
                );
                setSaving(false);
                return;
            }

            // 1) определяем категорию: выбранная или новая
            let finalCategoryId = categoryId;

            if (!finalCategoryId) {
                if (newCatTitle.trim()) {
                    // создаём новую категорию
                    const { data } = await api.post('/categories', {
                        title: newCatTitle.trim(),
                        color: newCatColor,
                    });
                    const created =
                        data?.category ?? data?.categories?.[0] ?? data;
                    const createdId = created.id ?? created._id;
                    finalCategoryId = createdId;

                    // добавим в локальный список, чтобы потом можно было переиспользовать
                    setCategories((prev) => [
                        ...prev,
                        {
                            id: createdId,
                            title: created.title,
                            color: created.color,
                            isDefault: false,
                        },
                    ]);
                    setCategoryId(createdId);
                } else {
                    setError('Choose category or create your own');
                    setSaving(false);
                    return;
                }
            }

            let recurrence;
            if (repeat !== 'none' && REPEAT_RRULE[repeat]) {
                const tz =
                    Intl.DateTimeFormat().resolvedOptions().timeZone ||
                    undefined;
                recurrence = {
                    rrule: REPEAT_RRULE[repeat],
                    timezone: tz,
                };
            }
            async function exceedsThreeOverlaps(calendarId, startISO, endISO) {
                try {
                    // границы дня по локальному времени
                    const dayStart = new Date(startISO);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(startISO);
                    dayEnd.setHours(23, 59, 59, 999);

                    const { data } = await api.get(
                        `/calendars/${calendarId}/events`,
                        {
                            params: {
                                from: dayStart.toISOString(),
                                to: dayEnd.toISOString(),
                                expand: 1,
                            },
                        }
                    );

                    const events = data?.events || [];
                    const points = [];

                    for (const ev of events) {
                        let s = new Date(ev.start);
                        let e = new Date(ev.end);

                        if (e <= dayStart || s >= dayEnd) continue;
                        if (s < dayStart) s = dayStart;
                        if (e > dayEnd) e = dayEnd;

                        points.push({ t: s.getTime(), delta: +1 });
                        points.push({ t: e.getTime(), delta: -1 });
                    }

                    // добавляем наш новый ивент
                    points.push({ t: startISO.getTime(), delta: +1 });
                    points.push({ t: endISO.getTime(), delta: -1 });

                    // 🔧 ГЛАВНОЕ ИЗМЕНЕНИЕ:
                    // при равном времени сначала обрабатываем end (-1), потом start (+1)
                    points.sort((a, b) => {
                        if (a.t !== b.t) return a.t - b.t;
                        return a.delta - b.delta; // -1 перед +1
                    });

                    let cur = 0;
                    for (const p of points) {
                        cur += p.delta;
                        if (cur > 3) {
                            return true;
                        }
                    }
                    return false;
                } catch (err) {
                    console.warn('overlap check failed', err?.message);
                    return false;
                }
            }

            const payload = {
                title: title.trim(),
                description: description.trim(),
                start: startISO.toISOString(),
                end: endISO.toISOString(),
                categoryId: finalCategoryId,
                ...(recurrence ? { recurrence } : {}),
            };

            const { data } = await api.post(
                `/calendars/${calendarId}/events`,
                payload
            );

            const created = data?.event;
            const focusDate = created?.start || startISO.toISOString();

            try {
                sessionStorage.setItem(CAL_RESET_FLAG, '1');
            } catch {}

            navigate('/calendars', {
                state: {
                    calId: calendarId,
                    focusDate,
                    view: 'week',
                },
            });
        } catch (e) {
            const msg =
                e?.response?.data?.error ||
                e?.message ||
                'Failed to create event';
            setError(msg);
        } finally {
            setSaving(false);
        }
    }
    async function handleDeleteCategoryConfirm() {
        if (!pendingDelCat) return;

        const { id: catId, title: catTitle } = pendingDelCat;

        try {
            setError(null);
            setMessage(null);
            const { data } = await api.delete(`/categories/${catId}`);
            const deleted = data?.deletedEvents ?? 0;

            // убираем из списка
            setCategories((prev) =>
                prev.filter((c) => String(c.id ?? c._id) !== String(catId))
            );

            // если она была выбрана – сбрасываем
            if (String(categoryId) === String(catId)) {
                setCategoryId('');
            }

            setPendingDelCat(null);

            // аккуратное инфо-сообщение (не ошибка)
            setMessage(
                `Category "${catTitle}" deleted. Removed events: ${deleted}.`
            );
        } catch (e) {
            const msg =
                e?.response?.data?.error ||
                e?.message ||
                'Failed to delete category';
            setError(msg);
            setPendingDelCat(null);
        }
    }
    function askDeleteCategory(catId, catTitle) {
        setMessage(null);
        setError(null);
        setPendingDelCat({ id: catId, title: catTitle });
    }

    function handleCancel() {
        navigate('/calendars');
    }

    return (
        <>
            {/* фон – календарь как обычно */}
            <Calendars />

            {/* поверх него фиксированная модалка */}
            <div className="event-modal-overlay">
                <div className="event-modal">
                    {/* Левая колонка */}
                    <div className="event-modal-left">
                        <div className="event-modal-title-line">
                            <span className="em-label">New event</span>
                            <span className="em-sep"></span>
                            <input
                                className="em-input-title"
                                placeholder="> Add title…"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        {/* просто текстовая область без рамок */}
                        <form onSubmit={handleSubmit}>
                            <textarea
                                className="em-input-desc"
                                placeholder="Add description…"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </form>
                    </div>

                    {/* Правая колонка */}
                    <div className="event-modal-right">
                        {loading && <p className="muted">Loading…</p>}

                        {!loading && (
                            <form onSubmit={handleSubmit} className="em-form">
                                <div className="em-field">
                                    <label>Choose the event date</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) =>
                                            setDate(e.target.value)
                                        }
                                    />
                                </div>

                                <div className="em-inline">
                                    <div className="em-field">
                                        <label>Start time</label>
                                        <input
                                            type="time"
                                            value={startTime}
                                            onChange={(e) =>
                                                setStartTime(e.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="em-field">
                                        <label>End time</label>
                                        <input
                                            type="time"
                                            value={endTime}
                                            onChange={(e) =>
                                                setEndTime(e.target.value)
                                            }
                                        />
                                    </div>
                                </div>

                                {/* КАТЕГОРИИ: выбор существующей + добавление своей */}
                                <div className="em-field">
                                    <label>Choose category or add yours</label>

                                    {/* существующие категории как таблеточки */}
                                    <div className="em-cat-chips">
                                        {categories.map((c) => {
                                            const id = c.id ?? c._id;
                                            const active =
                                                String(id) ===
                                                String(categoryId);
                                            const color = c.color || '#C5BDF0';
                                            const catTitle =
                                                c.title ?? c.name ?? 'Category'; // 👈 название категории

                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    className={
                                                        'em-cat-chip' +
                                                        (active
                                                            ? ' em-cat-chip--active'
                                                            : '')
                                                    }
                                                    style={{
                                                        '--cat-color': color,
                                                    }}
                                                    onClick={() => {
                                                        setCategoryId(id);
                                                        setNewCatTitle('');
                                                        setPendingDelCat(null);
                                                    }}
                                                >
                                                    <span className="em-cat-dot" />
                                                    <span className="em-cat-label">
                                                        {catTitle}
                                                    </span>

                                                    {!c.isDefault && (
                                                        <span
                                                            className="em-cat-delete"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                askDeleteCategory(
                                                                    id,
                                                                    catTitle
                                                                ); // 👈 передаём имя категории
                                                            }}
                                                        >
                                                            ✕
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* новая категория */}
                                    <div
                                        className="em-cat-new-wrap"
                                        ref={colorWrapRef}
                                    >
                                        <div className="em-cat-new">
                                            <input
                                                className="em-cat-new-input"
                                                placeholder="Enter category and choose color"
                                                value={newCatTitle}
                                                onChange={(e) => {
                                                    setNewCatTitle(
                                                        e.target.value
                                                    );
                                                    // если юзер вводит свою категорию — снимаем выбор старой
                                                    if (e.target.value.trim()) {
                                                        setCategoryId('');
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="em-cat-new-color"
                                                style={{
                                                    '--newcat-color':
                                                        newCatColor,
                                                }}
                                                onClick={() =>
                                                    setColorPickerOpen(
                                                        (v) => !v
                                                    )
                                                }
                                                aria-label="Choose color"
                                            />
                                        </div>
                                        {/* предупреждение перед удалением категории */}
                                        {pendingDelCat && (
                                            <div className="em-cat-delete-confirm">
                                                <div className="em-cat-delete-text">
                                                    Delete category
                                                    <span className="em-cat-delete-name">
                                                        {` "${pendingDelCat.title}" `}
                                                    </span>
                                                    ?
                                                    <br />
                                                    All events with this
                                                    category will also be
                                                    permanently deleted.
                                                </div>
                                                <div className="em-cat-delete-actions">
                                                    <button
                                                        type="button"
                                                        className="em-cat-del-btn"
                                                        onClick={() =>
                                                            setPendingDelCat(
                                                                null
                                                            )
                                                        }
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="em-cat-del-btn em-cat-del-btn--danger"
                                                        onClick={
                                                            handleDeleteCategoryConfirm
                                                        }
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {colorPickerOpen && (
                                            <div className="em-cat-color-pop">
                                                {COLOR_PRESETS.map((col) => (
                                                    <button
                                                        key={col}
                                                        type="button"
                                                        className={
                                                            'em-cat-color-dot' +
                                                            (newCatColor === col
                                                                ? ' active'
                                                                : '')
                                                        }
                                                        style={{
                                                            '--dot-color': col,
                                                        }}
                                                        onClick={() => {
                                                            setNewCatColor(col);
                                                            setColorPickerOpen(
                                                                false
                                                            );
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="em-field">
                                    <label>
                                        Choose the event repeat (optional)
                                    </label>
                                    <select
                                        value={repeat}
                                        onChange={(e) =>
                                            setRepeat(e.target.value)
                                        }
                                    >
                                        <option value="none">None</option>
                                        <option value="daily">Every day</option>
                                        <option value="weekly">
                                            Every week
                                        </option>
                                        <option value="monthly">
                                            Every month
                                        </option>
                                        <option value="2months">
                                            Every 2 months
                                        </option>
                                    </select>
                                </div>

                                <div className="em-field">
                                    <label>
                                        Choose calendar to store it in
                                    </label>
                                    <select
                                        value={calendarId}
                                        onChange={(e) =>
                                            setCalendarId(e.target.value)
                                        }
                                    >
                                        {calendars.map((cal) => (
                                            <option key={cal.id} value={cal.id}>
                                                {cal.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="em-actions">
                                    {error && (
                                        <p
                                            className="muted"
                                            style={{
                                                color: '#f97373',
                                                marginTop: 4,
                                                fontSize: '14px',
                                            }}
                                        >
                                            {error}
                                        </p>
                                    )}
                                    {message && (
                                        <p
                                            className="muted em-info"
                                            style={{
                                                color: '#96c0be',
                                                marginTop: 4,
                                                fontSize: '14px',
                                            }}
                                        >
                                            {message}
                                        </p>
                                    )}

                                    <button
                                        type="button"
                                        className="btn2"
                                        onClick={handleCancel}
                                        disabled={saving}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn1"
                                        disabled={saving || loading}
                                    >
                                        {saving ? 'Saving…' : 'Confirm'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
