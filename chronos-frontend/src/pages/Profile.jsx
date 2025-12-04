import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMe } from '../features/auth/authActions';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/axios';
import { absUrl } from '../config/apiOrigin';
import '../styles/profile.css';
import dotsMenu from '../assets/dots.png';
import icTask from '../assets/cat_task.png';
import icReminder from '../assets/cat_reminder.png';
import icArrangement from '../assets/cat_arrangement.png';
import NewCalendarModal from '../components/profile/NewCalendarModal.jsx';
import EditProfileModal from '../components/profile/EditProfileModal.jsx';

import EditCalendarModal from '../components/profile/EditCalendarModal.jsx';
import CalendarCardMenu from '../components/profile/CalendarCardMenu.jsx';

const CAL_RESET_FLAG = 'calendar:_reset_on_enter';

function firstLetter(user) {
    const s =
        user?.name ||
        user?.login ||
        user?.username ||
        (user?.email ? user.email.split('@')[0] : '') ||
        '';
    return (s.trim()[0] || '?').toUpperCase();
}

function fmtEventWhen(s) {
    try {
        const d = new Date(s);
        return new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }).format(d);
    } catch {
        return '';
    }
}

function hexToRgba(hex, a = 0.25) {
    if (!hex) return `rgba(156,178,249,${a})`;
    const m = String(hex).trim().replace('#', '');
    const [r, g, b] =
        m.length === 3
            ? [m[0] + m[0], m[1] + m[1], m[2] + m[2]]
            : [m.slice(0, 2), m.slice(2, 4), m.slice(4, 6)];
    const R = parseInt(r, 16),
        G = parseInt(g, 16),
        B = parseInt(b, 16);
    return `rgba(${R || 0}, ${G || 0}, ${B || 0}, ${a})`;
}

function toHex6(hex) {
    let m = String(hex || '')
        .trim()
        .replace('#', '');
    if (m.length === 3)
        m = m
            .split('')
            .map((c) => c + c)
            .join('');
    if (m.length !== 6) return '#151726';
    return `#${m.toUpperCase()}`;
}

function shadeHex(hex, pct) {
    const h = toHex6(hex).replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const f = (v) => {
        const nv = Math.round(v + (pct / 100) * 255);
        return Math.max(0, Math.min(255, nv));
    };
    const out = (n) => n.toString(16).padStart(2, '0');
    return `#${out(f(r))}${out(f(g))}${out(f(b))}`.toUpperCase();
}

const CAT_ICONS = {
    task: icTask,
    reminder: icReminder,
    arrangement: icArrangement,
};
function iconForEvent(ev) {
    const raw = (
        ev?.categoryInfo?.builtInKey ??
        ev?.categoryInfo?.key ??
        ev?.categoryInfo?.title ??
        ''
    )
        .toString()
        .trim()
        .toLowerCase();
    return CAT_ICONS[raw] || null;
}

function pickTwoUpcomingOrLast(all, now = new Date()) {
    const list = Array.isArray(all) ? all.slice() : [];
    const future = list
        .filter((e) => e?.start && new Date(e.start) >= now)
        .sort((a, b) => new Date(a.start) - new Date(b.start));
    if (future.length)
        return { preview: future.slice(0, 2), more: future.length > 2 };
    const past = list
        .filter((e) => e?.start && new Date(e.start) < now)
        .sort((a, b) => new Date(b.start) - new Date(a.start));
    return { preview: past.slice(0, 2), more: past.length > 2 };
}

export default function Profile() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { user } = useSelector((s) => s.auth);
    const [calendars, setCalendars] = useState([]);
    const [openNew, setOpenNew] = useState(false);
    const [openEdit, setOpenEdit] = useState(false);
    const [menuFor, setMenuFor] = useState(null);
    const [editCal, setEditCal] = useState(null);

    const loadCalendars = async () => {
        try {
            const { data } = await api.get('/calendars');
            const raw = Array.isArray(data?.calendars) ? data.calendars : [];

            const main = raw.find((c) => c.isMain);
            const holidays = raw.find(
                (c) => c.isSystem && c.systemType === 'holidays'
            );
            const visible = raw.filter(
                (c) => !(c.isSystem && c.systemType === 'holidays')
            );

            if (main && holidays) {
                main.hasHolidays = true;
                if (!main.countryCode && holidays.countryCode)
                    main.countryCode = holidays.countryCode;
            }

            visible.sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0));

            const withMembers = await Promise.all(
                visible.map(async (cal) => {
                    try {
                        const { data: mdata } = await api.get(
                            `/calendars/${cal.id}/members`
                        );
                        const list = Array.isArray(mdata?.members)
                            ? mdata.members
                            : [];

                        const names = list
                            .map(
                                (m) =>
                                    m?.name ||
                                    (m?.email ? m.email.split('@')[0] : 'user')
                            )
                            .filter(Boolean);
                        const preview = names.slice(0, 3);
                        const hasMore = names.length > 3;

                        const ownerId = mdata?.owner?.id || cal.owner;
                        const ownerName =
                            mdata?.owner?.name ||
                            (mdata?.owner?.email
                                ? mdata.owner.email.split('@')[0]
                                : 'user');

                        return {
                            ...cal,
                            owner: ownerId,
                            _ownerId: ownerId,
                            _ownerName: ownerName,
                            _membersPreview: preview,
                            _membersHasMore: hasMore,
                        };
                    } catch {
                        return {
                            ...cal,
                            _membersPreview: [],
                            _membersHasMore: false,
                        };
                    }
                })
            );

            const now = new Date();
            const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const to = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

            const withEvents = await Promise.all(
                withMembers.map(async (cal) => {
                    let evs = [];
                    try {
                        const { data: edata } = await api.get(
                            `/calendars/${cal.id}/events`,
                            {
                                params: {
                                    from: from.toISOString(),
                                    to: to.toISOString(),
                                    expand: 1,
                                },
                            }
                        );
                        evs = Array.isArray(edata?.events) ? edata.events : [];
                    } catch {}

                    if (!evs.length) {
                        try {
                            const { data: allData } = await api.get(
                                `/calendars/${cal.id}/events`
                            );
                            evs = Array.isArray(allData?.events)
                                ? allData.events
                                : [];
                        } catch {}
                    }

                    const picked = pickTwoUpcomingOrLast(evs, now);

                    let desc = cal.description;
                    if (
                        !desc &&
                        cal.isMain &&
                        cal.hasHolidays &&
                        cal.countryCode
                    ) {
                        desc = `National holidays for ${cal.countryCode}`;
                    }

                    return {
                        ...cal,
                        description: desc,
                        _eventsPreview: picked.preview,
                        _eventsMore: picked.more,
                    };
                })
            );

            setCalendars(withEvents);
        } catch (e) {
            console.warn(
                'calendars load failed:',
                e?.response?.data || e.message
            );
            setCalendars([]);
        }
    };

    const me = useMemo(() => {
        if (!user) return null;
        const id = user.id || user._id || user.sub || null;
        const name =
            user.name ||
            user.username ||
            (user.email ? user.email.split('@')[0] : '');
        const avatarUrl = user?.avatar ? absUrl(user.avatar) : null;
        const createdAt = user.createdAt || user.created_at || null;
        return { ...user, id, name, avatarUrl, createdAt };
    }, [user]);

    const [avatarError, setAvatarError] = useState(false);

    function openCalendar(calId) {
        try {
            sessionStorage.setItem(CAL_RESET_FLAG, '1');
        } catch {}
        navigate('/calendars', { state: { calId } });
    }

    useEffect(() => setAvatarError(false), [me?.avatarUrl]);

    useEffect(() => {
        dispatch(fetchMe());
        loadCalendars();
    }, [dispatch]);

    function handleCreated(cal) {
        if (!cal) return;
        setCalendars((prev) => [cal, ...prev]);
    }

    function handleUpdated() {
        dispatch(fetchMe());
        loadCalendars();
    }

    function handleDeleted() {
        window.location.href = '/login';
    }

    function openMenu(id) {
        setMenuFor((prev) => (prev === id ? null : id));
    }
    function closeMenu() {
        setMenuFor(null);
    }
    function applyCalendarPatch(upd) {
        if (upd?.__openEdit) {
            setEditCal(upd);
            return;
        }
        setCalendars((prev) =>
            prev.map((c) => (c.id === upd.id ? { ...c, ...upd } : c))
        );
    }
    function removeCalendar(id) {
        setCalendars((prev) => prev.filter((c) => c.id !== id));
    }

    return (
        <>
            <h1 className="profile__title">
                <span>My profile</span>
                <img className="profile__brand" src="/logo.png" alt="Timely" />
            </h1>

            <section className="profile profile--threads">
                <div className="profilePanel">
                    <div className="identity-row">
                        <div className="identity-left">
                            <div className="identity-name">
                                {me?.name || '—'}
                            </div>
                            <div className="identity-meta muted">
                                <span>{me?.email || '—'}</span>
                                {me?.createdAt && (
                                    <span>
                                        {' '}
                                        · joined{' '}
                                        {new Date(
                                            me.createdAt
                                        ).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            timeZone: 'UTC',
                                        })}
                                    </span>
                                )}
                            </div>
                            <div className="identity-actions">
                                <button
                                    className="btn btn--small"
                                    data-open="edit-profile"
                                    onClick={() => setOpenEdit(true)}
                                >
                                    Edit profile
                                </button>
                            </div>
                        </div>

                        <div className="identity-right">
                            {me?.avatarUrl && !avatarError ? (
                                <img
                                    src={me.avatarUrl}
                                    alt="avatar"
                                    className="identity-avatar"
                                    loading="lazy"
                                    decoding="async"
                                    onError={() => setAvatarError(true)}
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div
                                    className="identity-avatar identity-avatar--fallback"
                                    aria-label="avatar initial"
                                >
                                    <span>{firstLetter(me)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="panelDivider" />

                    <div className="panelHeader">
                        <h2>Calendars: {calendars.length}</h2>
                        <button
                            className="btn1"
                            data-open="new-calendar"
                            onClick={() => setOpenNew(true)}
                        >
                            New calendar
                        </button>
                    </div>

                    <div className="calendar-grid">
                        {calendars.map((cal) => {
                            const calColor = hexToRgba(cal.color, 0.8);
                            const calBorder = hexToRgba(calColor, -0.8);
                            return (
                                <div
                                    key={cal.id}
                                    className={`calendar-card ${
                                        menuFor === cal.id
                                            ? 'card--menu-open'
                                            : ''
                                    } ${!cal.active ? 'is-inactive' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={(e) => {
                                        if (menuFor === cal.id) return;
                                        if (
                                            e.target.closest(
                                                '.calendar-card__menuDots'
                                            )
                                        )
                                            return;
                                        if (
                                            e.target.closest('.calMenu') ||
                                            e.target.closest('.calMenu-wrap')
                                        )
                                            return;
                                        openCalendar(cal.id);
                                    }}
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === 'Enter' &&
                                            menuFor !== cal.id
                                        ) {
                                            openCalendar(cal.id);
                                        }
                                    }}
                                >
                                    <div
                                        className="calendar-header-profile"
                                        style={{
                                            background: calColor,
                                            borderColor: calBorder,
                                        }}
                                    >
                                        <h3 className="calendar-header-profile__title oneLine">
                                            <Link
                                                to="/calendars"
                                                state={{ calId: cal.id }}
                                                onClick={(e) => {
                                                    if (menuFor === cal.id) {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        return;
                                                    }
                                                }}
                                            >
                                                {cal.name}
                                            </Link>
                                        </h3>
                                    </div>

                                    <div className="calendar-body">
                                        {!cal.isMain && (
                                            <img
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openMenu(cal.id);
                                                }}
                                                className="calendar-card__menuDots"
                                                src={dotsMenu}
                                                alt="menu"
                                                title="menu"
                                                draggable="false"
                                            />
                                        )}
                                        {menuFor === cal.id && (
                                            <div
                                                className="calMenu-wrap"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                                onMouseDown={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <CalendarCardMenu
                                                    cal={cal}
                                                    meId={me?.id}
                                                    onClose={closeMenu}
                                                    onEdited={
                                                        applyCalendarPatch
                                                    }
                                                    onRemoved={removeCalendar}
                                                    onLeft={removeCalendar}
                                                />
                                            </div>
                                        )}

                                        {cal.description && (
                                            <p className="calendar-desc oneLine">
                                                {cal.description}
                                            </p>
                                        )}

                                        <div className="calendar-metaBlock">
                                            <div className="calendar-metaRow oneLine">
                                                owner:{' '}
                                                {cal.owner === me?.id
                                                    ? 'you'
                                                    : cal._ownerName ||
                                                      cal.owner}
                                            </div>
                                            {!cal.isMain && (
                                                <div className="calendar-metaRow oneLine">
                                                    members:{' '}
                                                    {cal._membersPreview?.length
                                                        ? cal._membersPreview.join(
                                                              ', '
                                                          ) +
                                                          (cal._membersHasMore
                                                              ? ' …'
                                                              : '')
                                                        : '—'}
                                                </div>
                                            )}
                                        </div>

                                        <div className="eventPreviewList">
                                            {(
                                                cal._eventsPreview?.slice(
                                                    0,
                                                    2
                                                ) || []
                                            ).length ? (
                                                cal._eventsPreview
                                                    .slice(0, 2)
                                                    .map((ev) => {
                                                        const color =
                                                            ev?.categoryInfo
                                                                ?.color ||
                                                            '#151726';
                                                        const bg = hexToRgba(
                                                            color,
                                                            0.8
                                                        );
                                                        const bd = hexToRgba(
                                                            color,
                                                            1
                                                        );
                                                        const icon =
                                                            iconForEvent(ev);

                                                        return (
                                                            <div
                                                                key={
                                                                    ev.id ||
                                                                    ev._id
                                                                }
                                                                className={`eventChip${
                                                                    icon
                                                                        ? ''
                                                                        : ' eventChip--noIcon'
                                                                }`}
                                                                style={{
                                                                    background:
                                                                        bg,
                                                                    borderColor:
                                                                        bd,
                                                                    cursor: 'pointer',
                                                                }}
                                                                title={fmtEventWhen(
                                                                    ev.start
                                                                )}
                                                                onClick={(
                                                                    e
                                                                ) => {
                                                                    e.stopPropagation();
                                                                    try {
                                                                        sessionStorage.setItem(
                                                                            CAL_RESET_FLAG,
                                                                            '1'
                                                                        );
                                                                    } catch {}

                                                                    navigate(
                                                                        '/calendars',
                                                                        {
                                                                            state: {
                                                                                calId: cal.id,
                                                                                focusDate:
                                                                                    ev.start,
                                                                                focusEventId:
                                                                                    ev.id ||
                                                                                    ev._id,
                                                                                view: 'week',
                                                                            },
                                                                        }
                                                                    );
                                                                }}
                                                            >
                                                                {icon && (
                                                                    <img
                                                                        src={
                                                                            icon
                                                                        }
                                                                        alt="category"
                                                                        className="eventChip__icon"
                                                                    />
                                                                )}
                                                                <span className="eventChip__label">
                                                                    {ev.title}
                                                                </span>
                                                            </div>
                                                        );
                                                    })
                                            ) : (
                                                <p
                                                    className="muted1"
                                                    style={{ margin: '0' }}
                                                >
                                                    no events
                                                </p>
                                            )}
                                            {cal._eventsMore && (
                                                <span className="eventMore">
                                                    + more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>
            <NewCalendarModal
                open={openNew}
                onClose={() => setOpenNew(false)}
                onCreated={handleCreated}
            />
            <EditProfileModal
                open={openEdit}
                me={me}
                onClose={() => setOpenEdit(false)}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
            />
            <EditCalendarModal
                open={!!editCal}
                calendar={editCal}
                onClose={() => setEditCal(null)}
                onSaved={(updated) => {
                    setEditCal(null);
                    setCalendars((prev) =>
                        prev.map((c) =>
                            c.id === updated.id ? { ...c, ...updated } : c
                        )
                    );
                }}
            />
        </>
    );
}
