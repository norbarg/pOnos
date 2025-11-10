import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

/* AUTH */
import Login from './pages/Login';
import Register from './pages/Register';

/* APP LAYOUT + PAGES */
import AppShell from './layouts/AppShell';
import Calendars from './pages/Calendars';
import EventPage from './pages/EventPage';
import Profile from './pages/Profile';

export default function App() {
    return (
        <Routes>
            {/* публичные */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* после логина "/" редиректит на /calendars */}
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Navigate to="/calendars" replace />
                    </ProtectedRoute>
                }
            />

            {/* защищённая коробка */}
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <AppShell />
                    </ProtectedRoute>
                }
            >
                <Route path="calendars" element={<Calendars />} />
                <Route path="event" element={<EventPage />} />
                <Route path="profile" element={<Profile />} />
            </Route>

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
