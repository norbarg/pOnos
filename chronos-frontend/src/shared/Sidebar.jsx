import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../features/auth/authActions';
import './Sidebar.css';

import icCal from '../assets/calendar_inactive.png';
import icCalActive from '../assets/calendar_active.png';
import icEvent from '../assets/event_inactive.png';
import icEventActive from '../assets/event_active.png';

// ИКОНКИ ТЕМЫ: твои два файла (положи их в /src/assets/)
import icThemeLight from '../assets/theme_dark.png'; // для тёмной темы
import icThemeDark from '../assets/theme_light.png'; // для светлой темы
import icLogout from '../assets/logout.png';

import { absUrl } from '../config/apiOrigin';

function firstLetter(user) {
    const s =
        user?.name ||
        user?.login ||
        user?.username ||
        (user?.email ? user.email.split('@')[0] : '') ||
        '';
    return (s.trim()[0] || '?').toUpperCase();
}
function getAvatarUrl(user) {
    const raw =
        user?.avatar ||
        user?.avatarUrl ||
        user?.avatar_url ||
        user?.photo ||
        null; // на бэке хранится вроде "/uploads/avatars/xxx.png"
    return absUrl(raw);
}

export default function Sidebar() {
    const { pathname } = useLocation();
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const user = useSelector((s) => s.auth?.user);
    const userAvatar = getAvatarUrl(user);
    const userInitial = firstLetter(user);
    const [avatarError, setAvatarError] = useState(false);

    // порядок сверху: profile → calendars → event
    const items = useMemo(
        () => [
            { key: 'profile', to: '/profile', kind: 'avatar' },
            {
                key: 'calendars',
                to: '/calendars',
                kind: 'icon',
                icon: icCal,
                iconActive: icCalActive,
            },
            {
                key: 'event',
                to: '/event',
                kind: 'icon',
                icon: icEvent,
                iconActive: icEventActive,
            },
        ],
        []
    );

    const activeIndex = items.findIndex((it) =>
        pathname.toLowerCase().startsWith(it.to)
    );

    // синхрон с CSS-переменными
    const [sliderTop, setSliderTop] = useState(0);
    useEffect(() => {
        const cssNum = (name, fallback) => {
            const v = getComputedStyle(document.documentElement)
                .getPropertyValue(name)
                .trim();
            const n = parseFloat(v);
            return Number.isFinite(n) ? n : fallback;
        };
        const rowH = cssNum('--slot-h', 75);
        const topBase = cssNum('--top-base', 40);
        const idx = activeIndex >= 0 ? activeIndex : 0;
        setSliderTop(topBase + idx * rowH);
    }, [activeIndex]);

    // тема + смена иконки
    const [theme, setTheme] = useState(
        document.documentElement.dataset.theme || 'dark'
    );
    useEffect(() => {
        const saved = localStorage.getItem('theme');
        const t = saved === 'light' || saved === 'dark' ? saved : 'dark';
        document.documentElement.dataset.theme = t;
        setTheme(t);
    }, []);
    const onToggleTheme = () => {
        const next = theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        setTheme(next);
    };

    return (
        <aside className="side">
            <div className="side__inner">
                {/* ползунок на стыке (поверх всего) */}
                <div
                    className="side__slider"
                    style={{ top: `${sliderTop + 10}px` }}
                />

                {/* верх: строго три слота */}
                <nav className="side__nav">
                    {items.map((it) => (
                        <NavLink
                            key={it.key}
                            to={it.to}
                            className={({ isActive }) =>
                                'side__link' + (isActive ? ' is-active' : '')
                            }
                        >
                            {({ isActive }) =>
                                it.kind === 'avatar' ? (
                                    userAvatar && !avatarError ? (
                                        <img
                                            className="side__icon side__icon--avatar"
                                            src={userAvatar}
                                            alt="profile"
                                            loading="lazy"
                                            decoding="async"
                                            onError={() => setAvatarError(true)} // <- если 404/ошибка — показываем букву
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div
                                            className="side__iconAvatarFallback"
                                            aria-label="profile"
                                        >
                                            <span>{userInitial}</span>
                                        </div>
                                    )
                                ) : (
                                    <img
                                        className="side__icon"
                                        src={isActive ? it.iconActive : it.icon}
                                        alt={it.key}
                                    />
                                )
                            }
                        </NavLink>
                    ))}
                </nav>

                {/* низ: без подписей */}
                <div className="side__bottom">
                    <button
                        className="side__tool"
                        onClick={onToggleTheme}
                        title="toggle theme"
                    >
                        <img
                            className="side__toolIcon"
                            src={theme === 'light' ? icThemeLight : icThemeDark}
                            alt="theme"
                        />
                    </button>
                    <button
                        className="side__tool"
                        onClick={async () => {
                            await dispatch(logout());
                            navigate('/login', { replace: true });
                        }}
                        title="log out"
                    >
                        <img
                            className="side__toolIcon"
                            src={icLogout}
                            alt="logout"
                        />
                    </button>
                </div>
            </div>
        </aside>
    );
}
