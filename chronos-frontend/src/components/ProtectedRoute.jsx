import { useSelector, useDispatch } from 'react-redux';
import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { fetchMe } from '../features/auth/authActions';

export default function ProtectedRoute({ children }) {
    const { user } = useSelector((s) => s.auth);
    const dispatch = useDispatch();
    const location = useLocation();

    const hasToken = !!localStorage.getItem('chronos_token');

    const requestedRef = useRef(false);
    useEffect(() => {
        if (hasToken && !user && !requestedRef.current) {
            requestedRef.current = true;
            dispatch(fetchMe());
        }
    }, [hasToken, user, dispatch]);

    if (hasToken && !user) return null;

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }
    return children;
}
