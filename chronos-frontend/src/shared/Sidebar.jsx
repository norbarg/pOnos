// File: src/shared/Sidebar.jsx
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../features/auth/authActions';
import './Sidebar.css';

import icCal from '../assets/calendar_inactive.png';
import icCalActive from '../assets/calendar_active.png';
import icEvent from '../assets/event_inactive.png';
import icEventActive from '../assets/event_active.png';

import icThemeLight from '../assets/theme_dark.png';
import icThemeDark from '../assets/theme_light.png';
import icLogout from '../assets/logout.png';

import { absUrl } from '../config/apiOrigin';

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
function getAvatarUrl(user) {
    const raw =
        user?.avatar ||
        user?.avatarUrl ||
        user?.avatar_url ||
        user?.photo ||
        null;
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
    const idx = activeIndex >= 0 ? activeIndex : 0;

    // ===== slider positioning by real DOM =====
    const navRef = useRef(null);
    const sliderRef = useRef(null);
    const [sliderTop, setSliderTop] = useState(0);

    const placeSlider = () => {
        const navEl = navRef.current;
        const sliderEl = sliderRef.current;
        if (!navEl || !sliderEl) return;

        const links = navEl.querySelectorAll('.side__link');
        const target = links[idx];
        if (!target) return;

        // координата относительно nav
        const top =
            target.offsetTop +
            (target.clientHeight - sliderEl.clientHeight) / 2;
        setSliderTop(top);
    };

    // пересчитываем при смене роута/темы/аватара и при ресайзе
    useLayoutEffect(() => {
        placeSlider();
    }, [pathname, idx]);
    useEffect(() => {
        const onResize = () => placeSlider();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    // если аватар загрузился/упал — высота пункта могла измениться
    const onAvatarLoadOrError = () => {
        setTimeout(placeSlider, 0);
    };

    // ===== theme toggle =====
    const [theme, setTheme] = useState(
        document.documentElement.dataset.theme || 'dark'
    );
    useEffect(() => {
        const saved = localStorage.getItem('theme');
        const t = saved === 'light' || saved === 'dark' ? saved : 'dark';
        document.documentElement.dataset.theme = t;
        setTheme(t);
        // на случай смены системного шрифта/масштаба
        setTimeout(placeSlider, 0);
    }, []);
    const onToggleTheme = () => {
        const next = theme === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        setTheme(next);
        setTimeout(placeSlider, 0);
    };

    return (
        <aside className="side">
            <div className="side__inner">
                <nav ref={navRef} className="side__nav">
                    {/* ползунок теперь внутри nav и позиционируется относительно него */}
                    <div
                        ref={sliderRef}
                        className="side__slider"
                        style={{ top: `${sliderTop}px` }}
                    />

                    {items.map((it) => (
                        <NavLink
                            key={it.key}
                            to={it.to}
                            onClick={
                                it.key === 'calendars'
                                    ? () => {
                                          try {
                                              sessionStorage.setItem(
                                                  CAL_RESET_FLAG,
                                                  '1'
                                              );
                                          } catch {}
                                      }
                                    : undefined
                            }
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
                                            onLoad={onAvatarLoadOrError}
                                            onError={() => {
                                                setAvatarError(true);
                                                onAvatarLoadOrError();
                                            }}
                                            referrerPolicy="no-referrer"
                                        />
                                    ) : (
                                        <div
                                            className="side__iconAvatarFallback"
                                            aria-label="profile"
                                            onLoad={onAvatarLoadOrError}
                                        >
                                            <span>{userInitial}</span>
                                        </div>
                                    )
                                ) : (
                                    <img
                                        className="side__icon"
                                        src={isActive ? it.iconActive : it.icon}
                                        alt={it.key}
                                        onLoad={onAvatarLoadOrError}
                                    />
                                )
                            }
                        </NavLink>
                    ))}
                </nav>

                {/* низ */}
                <div className="side__bottom">
                    <button
                        className="side__tool side__tool--theme"
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
