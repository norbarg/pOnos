// chronos-frontend/src/components/Calendar/WeekView.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/Calendar.css';
import catArrangement from '../../assets/cat_arrangement.png';
import catReminder from '../../assets/cat_reminder.png';
import catTask from '../../assets/cat_task.png';
import icShare from '../../assets/share.png';
import icSendArrow from '../../assets/arrow_up_right.png';
import holidayIcon from '../../assets/holiday_icon.png';

import { api } from '../../api/axios';

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT_HEIGHT_PX = 45;
const POPOVER_WIDTH = 340; // ширина поповера (ориентир)

// helpers
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
function hexToRgba(hex, alpha = 1) {
    let c = (hex || '').replace('#', '').trim();
    if (!c) return `rgba(197,189,240,${alpha})`;

    if (c.length === 3) {
        c = c
            .split('')
            .map((x) => x + x)
            .join('');
    }

    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function layoutDayEvents(eventsForDay) {
    if (!eventsForDay.length) return [];

    const evs = [...eventsForDay].sort(
        (a, b) =>
            a._rowStart - b._rowStart ||
            a._rowEnd - a._rowStart - (b._rowEnd - b._rowStart)
    );

    let active = [];
    let clusterId = 0;
    const clusterMaxCols = {};

    for (const ev of evs) {
        active = active.filter((a) => a._rowEnd > ev._rowStart);

        if (active.length === 0) {
            clusterId += 1;
        }
        ev._clusterId = clusterId;

        const taken = new Set(active.map((a) => a._colIndex));
        let colIndex = 0;
        while (taken.has(colIndex)) colIndex++;
        ev._colIndex = colIndex;

        const colsHere = colIndex + 1;
        clusterMaxCols[clusterId] = Math.max(
            clusterMaxCols[clusterId] || 0,
            colsHere
        );

        active.push(ev);
    }

    for (const ev of evs) {
        const total = clusterMaxCols[ev._clusterId] || 1;
        ev._colTotal = Math.min(total, 3);
    }

    return evs;
}

const iconByCat = {
    arrangement: catArrangement,
    reminder: catReminder,
    task: catTask,
};

const BG_TO_DESC_COLOR = {
    A7BBEE: '#516495',
    D86497: '#791843',
    D8AC89: '#7F5738',
    C5BDF0: '#5A537A',
    '96C0BE': '#3D5756',
    D65050: '#581212',
    F9F06C: '#756E07',
    '59DAEB': '#12636E',
};

function getDescColor(bg) {
    if (!bg) return undefined;
    const norm = bg.toString().trim().toUpperCase().replace('#', '');
    return BG_TO_DESC_COLOR[norm];
}

function truncateWords(str, maxWords) {
    if (!str) return '';
    const words = str.trim().split(/\s+/);
    if (words.length <= maxWords) return str;
    return words.slice(0, maxWords).join(' ') + '…';
}

function formatRange(start, end) {
    const s = new Date(start);
    const e = new Date(end);

    const sameDay =
        s.getFullYear() === e.getFullYear() &&
        s.getMonth() === e.getMonth() &&
        s.getDate() === e.getDate();

    const dateStr = s.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
    });

    const fmtTime = (d) =>
        d.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

    if (sameDay) {
        return `${dateStr} ${fmtTime(s)} – ${fmtTime(e)}`;
    }
    const dateStrEnd = e.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
    });
    return `${dateStr} ${fmtTime(s)} – ${dateStrEnd} ${fmtTime(e)}`;
}
function formatTimeRangeShort(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const opts = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    };
    return `${s.toLocaleTimeString('en-GB', opts)} – ${e.toLocaleTimeString(
        'en-GB',
        opts
    )}`;
}

/** POPUP */
function EventPopover({
    event,
    top,
    left,
    onDeleteEvent,
    onRemoveMember,
    mobile,
}) {
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteValue, setInviteValue] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteStatus, setInviteStatus] = useState(null); // 'ok' | 'error' | null
    const [inviteMsg, setInviteMsg] = useState('');

    if (!event) return null;
    const style = mobile ? {} : { top, left, width: POPOVER_WIDTH };

    const title = event.title || '(no title)';
    const desc = event.description || '';
    const timeLabel = formatRange(event.start, event.end);

    const calendarName =
        event.calendarName || event.calendar?.name || 'Calendar';

    const ownerUser = event.ownerUser || null;
    const ownerText =
        (ownerUser &&
            (ownerUser.name || ownerUser.email || ownerUser.username)) ||
        (typeof event.owner === 'string' &&
        !OBJECT_ID_RE.test(event.owner.trim())
            ? event.owner
            : '—');

    const members = Array.isArray(event.members) ? event.members : [];
    const canDelete = !!event.canManage;

    const displayName = (u) =>
        u.name || u.email || u.username || u.id || 'user';

    // 🔹 тот же цвет, что и в мини-карточке
    const descColor = getDescColor(event.color);

    const handleInviteSubmit = async (e) => {
        e.preventDefault();
        const val = inviteValue.trim();
        if (!val || inviteLoading) return;

        setInviteLoading(true);
        setInviteStatus(null);
        setInviteMsg('');

        try {
            // сейчас бэкенд принимает email; если будешь делать поиск по имени —
            // тут можно форкнуть логику (if includes('@') ... else ...).
            await api.post(`/events/${event.id || event._id}/invite`, {
                email: val,
            });

            setInviteStatus('ok');
            setInviteMsg('Invitation sent');
            setInviteValue('');
        } catch (err) {
            const msg =
                err?.response?.data?.error ||
                err?.message ||
                'Failed to send invite';
            setInviteStatus('error');
            setInviteMsg(msg);
        } finally {
            setInviteLoading(false);
        }
    };

    return (
        <div
            className={
                'event-popover' + (mobile ? ' event-popover--mobile' : '')
            }
            style={style}
            onClick={(e) => e.stopPropagation()}
        >
            {/* верхняя строка: Calendar + title + share */}
            <div className="ep-head">
                <div className="ep-head-left">
                    <span className="ep-calendar">{calendarName}</span>
                    <span className="em-sep"></span>

                    <div className="ep-title">
                        {iconByCat[event.category] && (
                            <img
                                className="ep-icon"
                                src={iconByCat[event.category]}
                                alt=""
                            />
                        )}
                        {title}
                    </div>
                </div>
                <button
                    type="button"
                    className="ep-share-btn"
                    onClick={(e) => {
                        e.preventDefault();
                        setInviteOpen((v) => !v);
                    }}
                >
                    <img src={icShare} alt="share" />
                </button>
            </div>

            <div className="ep-time">{timeLabel}</div>
            {/* 🔹 Invite to event */}
            {inviteOpen && (
                <div className="ep-invite">
                    <div className="ep-invite-label">Invite to event</div>
                    <form
                        className="ep-invite-box"
                        onSubmit={handleInviteSubmit}
                    >
                        <input
                            className="ep-invite-input"
                            placeholder="Enter email or user"
                            value={inviteValue}
                            onChange={(e) => setInviteValue(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="ep-invite-btn"
                            disabled={inviteLoading || !inviteValue.trim()}
                        >
                            <img src={icSendArrow} alt="send" />
                        </button>
                    </form>
                    {inviteMsg && (
                        <div
                            className={
                                'ep-invite-msg ' +
                                (inviteStatus === 'error'
                                    ? 'is-error'
                                    : inviteStatus === 'ok'
                                    ? 'is-ok'
                                    : '')
                            }
                        >
                            {inviteMsg}
                        </div>
                    )}
                </div>
            )}
            {desc && (
                <div
                    className="ep-desc"
                    style={descColor ? { color: descColor } : undefined}
                >
                    {desc}
                </div>
            )}

            {/* owner / members */}
            <div className="ep-meta">
                <div className="ep-meta-lines">
                    <div className="ep-meta-row">
                        <span className="label">owner:</span>
                        <span className="value">{ownerText}</span>
                    </div>

                    <div className="ep-meta-row">
                        <span className="label">members:</span>
                        {members.length === 0 ? (
                            <span className="value">—</span>
                        ) : (
                            <div className="ep-members-list">
                                {members.map((m) => (
                                    <div
                                        key={m.id || m._id}
                                        className="ep-member-row"
                                    >
                                        <span className="value">
                                            {displayName(m)}
                                        </span>
                                        {canDelete && (
                                            <button
                                                type="button"
                                                className="ep-member-del"
                                                onClick={() =>
                                                    onRemoveMember?.(event, m)
                                                }
                                            >
                                                delete
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* нижний Delete — удаляет весь event */}
            {canDelete && (
                <div className="ep-footer">
                    <button
                        type="button"
                        className="ep-delete"
                        onClick={() => onDeleteEvent?.(event)}
                    >
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
}

export default function WeekView({
    weekStart,
    events,
    onDateSelect,
    calendarId, // 👈 новый проп
}) {
    const [openInfo, setOpenInfo] = useState(null);
    const [hiddenIds, setHiddenIds] = useState([]);
    const gridRef = useRef(null);

    const navigate = useNavigate();

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

    // Esc закрывает поповер
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') setOpenInfo(null);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const days = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    );

    // отфильтровываем удалённые ивенты
    const visibleEvents = useMemo(() => {
        if (!hiddenIds.length) return events;
        const set = new Set(hiddenIds.map((id) => String(id)));
        return (events || []).filter((e) => {
            const id = String(e.id || e._id || '');
            return !set.has(id);
        });
    }, [events, hiddenIds]);

    // какие дни недели являются праздничными (есть хотя бы один holiday-ивент)
    const holidayDayFlags = useMemo(() => {
        const flags = Array(7).fill(false);
        (visibleEvents || []).forEach((ev) => {
            if (!ev.isHoliday) return;
            const s = new Date(ev.start);
            const e = new Date(ev.end);
            for (let i = 0; i < 7; i++) {
                const dayS = startOfDay(addDays(weekStart, i));
                const dayE = endOfDay(addDays(weekStart, i));
                if (e >= dayS && s <= dayE) {
                    flags[i] = true;
                }
            }
        });
        return flags;
    }, [visibleEvents, weekStart]);

    const dayEvents = useMemo(() => {
        const map = Array.from({ length: 7 }, () => []);

        const nonHolidayEvents = (visibleEvents || []).filter(
            (ev) => !ev.isHoliday
        );

        nonHolidayEvents.forEach((ev) => {
            const s = new Date(ev.start),
                e = new Date(ev.end);
            for (let i = 0; i < 7; i++) {
                const dayS = startOfDay(addDays(weekStart, i));
                const dayE = endOfDay(addDays(weekStart, i));
                if (e >= dayS && s <= dayE) {
                    const st = new Date(Math.max(s.getTime(), dayS.getTime()));
                    const en = new Date(Math.min(e.getTime(), dayE.getTime()));
                    const rowStart = halfHourIndex(st) + 1;
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

        return map.map((list) => layoutDayEvents(list));
    }, [visibleEvents, weekStart]);
    // индекс ПРАЗДНИКОВ по дню (для мобилки)
    const holidaysIndex = useMemo(() => {
        const map = new Map();
        (visibleEvents || []).forEach((ev) => {
            if (!ev.isHoliday) return;
            const d = new Date(ev.start);
            const key = d.toDateString();
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(ev);
        });
        return map;
    }, [visibleEvents]);

    // загрузка owner/members + вычисление позиции поповера
    const handleOpenPopover = async (ev, di, domEvent) => {
        // 1) сначала просто открываем попап (мобилка или десктоп)
        if (isMobile) {
            setOpenInfo({
                event: ev,
                top: 0,
                left: 0,
            });
        } else {
            if (!gridRef.current) return;

            const targetRect = domEvent.currentTarget.getBoundingClientRect();
            const gridRect = gridRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const margin = 16;

            let top = (ev._rowStart - 1) * SLOT_HEIGHT_PX + 3;
            let left = targetRect.right - gridRect.left + 8;

            if (left + POPOVER_WIDTH + margin > viewportWidth) {
                left = targetRect.left - gridRect.left - POPOVER_WIDTH - 8;
            }
            if (left < margin) left = margin;

            setOpenInfo({
                event: ev,
                top,
                left,
            });
        }

        // 2) потом догружаем owner/members/canManage с бэка
        const eventId = ev.id || ev._id;
        if (!eventId) return;

        try {
            const { data } = await api.get(`/events/${eventId}/participants`);
            const participants = data?.participants || [];
            const owner = participants.find((p) => p.isOwner);
            const others = participants.filter((p) => !p.isOwner);
            const canManage = !!data?.canManage;

            setOpenInfo((prev) => {
                if (!prev) return prev;
                const prevId = prev.event.id || prev.event._id;
                if (String(prevId) !== String(eventId)) return prev;

                return {
                    ...prev,
                    event: {
                        ...prev.event,
                        ownerUser: owner || null,
                        members: others,
                        canManage,
                    },
                };
            });
        } catch (e) {
            console.warn('load participants failed', e?.message);
        }
    };

    const handleRemoveMember = async (event, member) => {
        const eventId = event.id || event._id;
        const userId = member.id || member._id;
        if (!eventId || !userId) return;

        try {
            await api.delete(`/events/${eventId}/participants/${userId}`);

            // обновляем участников только в текущем поповере
            setOpenInfo((prev) => {
                if (!prev) return prev;
                const prevId = prev.event.id || prev.event._id;
                if (String(prevId) !== String(eventId)) return prev;
                const prevMembers = Array.isArray(prev.event.members)
                    ? prev.event.members
                    : [];
                return {
                    ...prev,
                    event: {
                        ...prev.event,
                        members: prevMembers.filter(
                            (m) => String(m.id || m._id) !== String(userId)
                        ),
                    },
                };
            });
        } catch (e) {
            console.error(
                'remove member failed',
                e?.response?.data || e.message
            );
        }
    };

    const handleDelete = async (event) => {
        const id = event.id || event._id;
        if (!id) return;

        try {
            await api.delete(`/events/${id}`);
            // локально прячем
            setHiddenIds((prev) =>
                prev.includes(String(id)) ? prev : [...prev, String(id)]
            );
            setOpenInfo(null);
        } catch (e) {
            console.error(
                'delete event failed',
                e?.response?.data || e.message
            );
        }
    };

    return (
        <div className="calendar-week" onClick={() => setOpenInfo(null)}>
            {isMobile ? (
                <>
                    {/* MOBILE: неделя вертикально, день -> список событий */}
                    <div className="week-mobile">
                        {days.map((d, di) => {
                            const eventsForDay = (dayEvents[di] || [])
                                .slice()
                                .sort(
                                    (a, b) =>
                                        new Date(a.start) - new Date(b.start)
                                );

                            // праздники для этого дня (по дате начала, как в MonthView)
                            const dayKey = new Date(
                                d.getFullYear(),
                                d.getMonth(),
                                d.getDate()
                            ).toDateString();
                            const holidayEvents =
                                holidaysIndex.get(dayKey) || [];

                            const hasEvents =
                                eventsForDay.length > 0 ||
                                holidayEvents.length > 0;

                            return (
                                <div className="week-mobile-day" key={di}>
                                    <div className="week-mobile-day-header">
                                        <div className="week-mobile-day-date">
                                            {d.toLocaleDateString('en-GB', {
                                                day: 'numeric',
                                                month: 'short',
                                            })}
                                        </div>
                                        <div className="week-mobile-day-dow">
                                            {WEEKDAY[di]}
                                        </div>
                                    </div>

                                    {!hasEvents && (
                                        <div className="week-mobile-empty">
                                            There are no events
                                        </div>
                                    )}

                                    {/* 🔴 ПРАЗДНИКИ — таблетки без времени слева */}
                                    {holidayEvents.map((h) => (
                                        <div
                                            className="week-mobile-event-row week-mobile-holiday-row"
                                            key={
                                                h.id ||
                                                h._id ||
                                                h.title ||
                                                `holiday-${di}`
                                            }
                                        >
                                            {/* Пустой столбец времени для выравнивания, но без текста */}
                                            <div className="week-mobile-event-time week-mobile-holiday-time" />

                                            <div className="week-mobile-holiday-pill">
                                                <span className="pill-icon">
                                                    <img
                                                        src={holidayIcon}
                                                        alt=""
                                                    />
                                                </span>
                                                <span className="pill-label">
                                                    {h.title || 'Holiday'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}

                                    {/* обычные события с временем слева */}
                                    {eventsForDay.map((ev) => {
                                        const bg = hexToRgba(
                                            ev.color || '#C5BDF0',
                                            0.9
                                        );
                                        const border = hexToRgba(
                                            ev.color || '#C5BDF0',
                                            1
                                        );

                                        return (
                                            <div
                                                key={ev.id || ev._id}
                                                className="week-mobile-event-row"
                                            >
                                                <div className="week-mobile-event-time">
                                                    {formatTimeRangeShort(
                                                        ev.start,
                                                        ev.end
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    className="week-mobile-event-pill"
                                                    style={{
                                                        background: bg,
                                                        borderColor: border,
                                                    }}
                                                    onClick={(domEvent) => {
                                                        domEvent.stopPropagation();
                                                        handleOpenPopover(
                                                            ev,
                                                            di,
                                                            domEvent
                                                        );
                                                    }}
                                                >
                                                    <div className="week-mobile-event-title">
                                                        {iconByCat[
                                                            ev.category
                                                        ] && (
                                                            <img
                                                                className="ev-icon"
                                                                src={
                                                                    iconByCat[
                                                                        ev
                                                                            .category
                                                                    ]
                                                                }
                                                                alt=""
                                                            />
                                                        )}
                                                        {ev.title ||
                                                            '(no title)'}
                                                    </div>
                                                    {ev.description && (
                                                        <div className="week-mobile-event-desc">
                                                            {truncateWords(
                                                                ev.description,
                                                                8
                                                            )}
                                                        </div>
                                                    )}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>

                    {/* фуллскрін карточка ивента */}
                    {openInfo && (
                        <div
                            className="event-popover-overlay"
                            onClick={() => setOpenInfo(null)}
                        >
                            <EventPopover
                                event={openInfo.event}
                                onDeleteEvent={handleDelete}
                                onRemoveMember={handleRemoveMember}
                                mobile
                            />
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* DESKTOP: как было — шапка + сетка 7x24 */}
                    <div className="week-header">
                        <div className="time-header"></div>
                        {days.map((d, i) => (
                            <div
                                className={
                                    'day-header' +
                                    (holidayDayFlags[i]
                                        ? ' day-header--holiday'
                                        : '')
                                }
                                key={i}
                            >
                                <div className="date">{d.getDate()}</div>
                                <div className="dow">{WEEKDAY[i]}</div>
                            </div>
                        ))}
                    </div>

                    <div
                        className="week-grid"
                        style={{ '--slot-h': '45px' }}
                        ref={gridRef}
                    >
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
                                className={
                                    'day-col' +
                                    (holidayDayFlags[di]
                                        ? ' day-col--holiday'
                                        : '')
                                }
                                key={di}
                                onDoubleClick={() => onDateSelect?.(d)}
                            >
                                {Array.from({ length: 48 }, (_, r) => {
                                    const slotStart = new Date(d);
                                    slotStart.setHours(0, 0, 0, 0);
                                    slotStart.setMinutes(r * 30);

                                    return (
                                        <div
                                            key={`slot-${di}-${r}`}
                                            className="slot"
                                            style={{
                                                gridRow: `${r + 1} / span 1`,
                                            }}
                                            aria-hidden="true"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate('/event', {
                                                    state: {
                                                        calId:
                                                            calendarId ||
                                                            undefined,
                                                        slotStart:
                                                            slotStart.toISOString(),
                                                    },
                                                });
                                            }}
                                        />
                                    );
                                })}

                                {dayEvents[di].map((ev) => {
                                    const top =
                                        (ev._rowStart - 1) * SLOT_HEIGHT_PX + 3;
                                    const height =
                                        (ev._rowEnd - ev._rowStart) *
                                            SLOT_HEIGHT_PX -
                                        6;

                                    if (ev._colIndex >= 3) return null;

                                    const colTotal = ev._colTotal || 1;
                                    const widthPart = 100 / colTotal;
                                    const leftPercent =
                                        widthPart * ev._colIndex;

                                    const slotSpan = ev._rowEnd - ev._rowStart;
                                    const isShort = slotSpan <= 1;

                                    const bgColor = hexToRgba(
                                        ev.color || '#C5BDF0',
                                        0.8
                                    );
                                    const borderColor = hexToRgba(
                                        ev.color || '#C5BDF0',
                                        0.8
                                    );

                                    return (
                                        <div
                                            key={`${
                                                ev.id || ev._id || 'ev'
                                            }-${di}-${ev._rowStart}-${
                                                ev._colIndex
                                            }`}
                                            className="event"
                                            style={{
                                                top,
                                                height,
                                                left: `calc(${leftPercent}% + 6px)`,
                                                width: `calc(${widthPart}% - 8px)`,
                                                background: bgColor,
                                                border: `1px solid ${borderColor}`,
                                            }}
                                            onClick={(domEvent) => {
                                                domEvent.stopPropagation();
                                                handleOpenPopover(
                                                    ev,
                                                    di,
                                                    domEvent
                                                );
                                            }}
                                        >
                                            <div className="ev-title">
                                                {iconByCat[ev.category] && (
                                                    <img
                                                        className="ev-icon"
                                                        src={
                                                            iconByCat[
                                                                ev.category
                                                            ]
                                                        }
                                                        alt=""
                                                    />
                                                )}
                                                {ev.title}
                                            </div>

                                            {!isShort && ev.description && (
                                                <div
                                                    className="ev-desc"
                                                    style={{
                                                        color: getDescColor(
                                                            ev.color
                                                        ),
                                                    }}
                                                >
                                                    {truncateWords(
                                                        ev.description,
                                                        4
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {openInfo && (
                            <EventPopover
                                event={openInfo.event}
                                top={openInfo.top}
                                left={openInfo.left}
                                onDeleteEvent={handleDelete}
                                onRemoveMember={handleRemoveMember}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
