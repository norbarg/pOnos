// chronos-frontend/src/pages/Login.jsx
import { useDispatch, useSelector } from 'react-redux';
import { login, fetchMe, clearAuthError } from '../features/auth/authActions';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import logo from '../assets/logo.png';
import timely from '../assets/timely_logo.png';
import '../styles/auth.css';

export default function Login() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { status, error } = useSelector((s) => s.auth);

    const [form, setForm] = useState({ email: '', password: '' });
    const onChange = (e) => {
        dispatch(clearAuthError());
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    // куда вести после логина
    const target = useMemo(() => {
        const from = location.state?.from?.pathname;
        const last = localStorage.getItem('nav:last');
        if (from && from !== '/login' && from !== '/register') return from;
        return last || '/calendars';
    }, [location.state]);

    const onSubmit = async (e) => {
        e.preventDefault();
        const res = await dispatch(login(form));
        if (res?.ok) {
            // подхватываем пользователя, если бэк не прислал его сразу
            await dispatch(fetchMe());
            navigate(target, { replace: true });
        }
    };

    return (
        <section className="auth">
            <div className="auth__stage">
                <div className="auth__left">
                    <div className="auth__brand">
                        <img src={timely} />
                    </div>
                    <h1 className="auth__hello">Hey, Hello!</h1>
                    <p className="auth__lede">
                        Welcome to Timely — Your Smart Event Planner
                    </p>
                    <p className="auth__copy">
                        Create, manage, and explore events easily. Stay informed
                        about meetings, conferences, and more.
                    </p>
                </div>

                <div className="auth__panel_login">
                    <div>
                        <div className="auth__welcome">
                            Welcome
                            <br />
                            Back!
                        </div>
                        <div className="auth__logoMark">
                            <img src={logo} alt="Timely" />
                        </div>
                    </div>
                </div>

                <div className="auth__cardWrap">
                    <div className="auth__card">
                        <form className="form" onSubmit={onSubmit} noValidate>
                            <h2>Login</h2>
                            <p className="lead">
                                Welcome back! Please login to your account
                            </p>

                            <label>
                                <span className="label">Login/Email</span>
                                <input
                                    name="email"
                                    type="email"
                                    value={form.email}
                                    onChange={onChange}
                                    placeholder="timely@gmail.com"
                                    required
                                />
                            </label>

                            <label>
                                <span className="label">Password</span>
                                <input
                                    name="password"
                                    type="password"
                                    value={form.password}
                                    onChange={onChange}
                                    placeholder="••••••••"
                                    required
                                />
                            </label>

                            <button
                                className="btn"
                                type="submit"
                                disabled={status === 'loading'}
                            >
                                {status === 'loading'
                                    ? 'Signing in…'
                                    : 'Sign in'}
                            </button>

                            {error && error !== 'Not authenticated' && (
                                <div className="error">{String(error)}</div>
                            )}

                            <p className="muted">
                                New user?{' '}
                                <Link className="link-accent" to="/register">
                                    Sign up
                                </Link>
                            </p>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    );
}
