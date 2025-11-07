// chronos-frontend/src/pages/Register.jsx
import { useDispatch, useSelector } from 'react-redux';
import { register as registerThunk } from '../features/auth/authActions';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import logo from '../assets/logo.png';
import timely from '../assets/timely_logo.png';
import '../styles/auth.css';
import { clearAuthError } from '../features/auth/authActions';

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { status, error } = useSelector(s => s.auth);

  const [form, setForm] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
  });
  const [uiError, setUiError] = useState(null);

const onChange = (e) => {
  setUiError(null);
  dispatch(clearAuthError());
  setForm({ ...form, [e.target.name]: e.target.value });
};

  const isPasswordLongEnough = useMemo(() => form.password.length >= 6, [form.password]);
  const isSamePassword = useMemo(
    () => form.password && form.passwordConfirm && form.password === form.passwordConfirm,
    [form.password, form.passwordConfirm]
  );
  const canSubmit = useMemo(
    () => form.email && isPasswordLongEnough && isSamePassword,
    [form.email, isPasswordLongEnough, isSamePassword]
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isPasswordLongEnough) return setUiError('Password must be at least 6 characters.');
    if (!isSamePassword) return setUiError('Passwords do not match.');

    const payload = {
      email: form.email.trim(),
      password: form.password,
      passwordConfirm: form.passwordConfirm,
    };
    if (form.name.trim()) payload.name = form.name.trim();

    const res = await dispatch(registerThunk(payload));
    if (res?.ok) navigate('/', { replace: true });
  };

  return (
    <section className="auth">
      <div className="auth__stage">
        <div className="auth__left">
  <div className="auth__brand">
    <img src={timely} alt="Timely" />
  </div>
  <h1 className="auth__hello">Hey, Hello!</h1>
  <p className="auth__lede">Welcome to Timely — Your Smart Event Planner</p>
  <p className="auth__copy">
    Create, manage, and explore events easily. Stay informed about meetings,
    conferences, and more.
  </p>
</div>

        <div className="auth__panel">
  <div>
    <div className="auth__welcome">Join<br />Timely!</div>
    <div className="auth__logoMark">
      <img src={logo} alt="Timely" />
    </div>
  </div>
</div>

        <div className="auth__cardWrap">
  <div className="auth__card">
    <form className="form" onSubmit={onSubmit} noValidate>
      <h2>Create Account</h2>
      <p className="lead">Welcome! Please register</p>

              <label>
                <span className="label">Login</span>
                <input
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={onChange}
                  placeholder="yourname"
                />
              </label>

              <label>
                <span className="label">Email</span>
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
                  minLength={6}
                />
              </label>

              <label>
                <span className="label">Confirm Password</span>
                <input
                  name="passwordConfirm"
                  type="password"
                  value={form.passwordConfirm}
                  onChange={onChange}
                  placeholder="••••••••"
                  required
                />
              </label>

              {!isPasswordLongEnough && form.password.length > 0 && (
                <div className="muted">At least 6 characters</div>
              )}
              {form.passwordConfirm.length > 0 && !isSamePassword && (
                <div className="error">Passwords do not match</div>
              )}
<div className="form__actions">
              <button className="btn" type="submit" disabled={status==='loading' || !canSubmit}>
        {status === 'loading' ? 'Creating…' : 'Sign up'}
      </button>
      </div>
              {(uiError || (error && error !== 'Not authenticated')) && (
  <div className="error">{uiError || String(error)}</div>
)}
      <p className="muted">
        Already have an account? <Link className="link-accent" to="/login">Log in</Link>
      </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
