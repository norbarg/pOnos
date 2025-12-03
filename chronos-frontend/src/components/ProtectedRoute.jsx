// chronos-frontend/src/components/ProtectedRoute.jsx
import { useSelector, useDispatch } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { fetchMe } from '../features/auth/authActions';

export default function ProtectedRoute({ children }) {
    const { user } = useSelector((s) => s.auth);
    const dispatch = useDispatch();
    const location = useLocation();

    const hasToken = !!localStorage.getItem('chronos_token');

    // Чтобы не было бесконечных запросов при битом токене —
    // шлем fetchMe только один раз за монтирование.
    const requestedRef = useRef(false);
    useEffect(() => {
        if (hasToken && !user && !requestedRef.current) {
            requestedRef.current = true;
            dispatch(fetchMe());
        }
    }, [hasToken, user, dispatch]);

    // Если есть токен, но юзера ещё не получили — ничего не рендерим (короткий "прелоад")
    if (hasToken && !user) return null;

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return children;
}
