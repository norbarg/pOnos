// заглушка страницы home после входа пользователя
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../features/auth/authActions';

export default function Dashboard() {
  const { user } = useSelector(s => s.auth);
  const dispatch = useDispatch();

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Welcome to Chronos</h2>
      <p className="muted">
        You are signed in as <b>{user?.email}</b>{user?.name ? ` (name: ${user.name})` : ''}.
      </p>
      <div className="row">
        <button onClick={() => dispatch(logout())}>Sign out</button>
      </div>
    </div>
  );
}
