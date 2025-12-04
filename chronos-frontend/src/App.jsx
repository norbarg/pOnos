import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';

import AppShell from './layouts/AppShell';
import Calendars from './pages/Calendars';
import EventPage from './pages/EventPage';
import Profile from './pages/Profile';
import AcceptInvite from './pages/AcceptInvite.jsx';

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Navigate to="/calendars" replace />
                    </ProtectedRoute>
                }
            />

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

            <Route path="*" element={<Navigate to="/" replace />} />
            <Route path="/invite/accept" element={<AcceptInvite />} />
        </Routes>
    );
}
