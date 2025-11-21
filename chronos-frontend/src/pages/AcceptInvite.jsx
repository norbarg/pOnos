import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/axios';

const SS_RESET = 'calendar:_reset_on_enter';

function useQuery() {
    const { search } = useLocation();
    return useMemo(() => new URLSearchParams(search), [search]);
}

export default function AcceptInvite() {
    const q = useQuery();
    const token = q.get('token') || '';
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [phase, setPhase] = useState('accepting'); // 'accepting' | 'choose-cal' | 'done' | 'error'
    const [error, setError] = useState('');
    const [eventId, setEventId] = useState(null);
    const [calendars, setCalendars] = useState([]);
    const [selectedCal, setSelectedCal] = useState(null);

    useEffect(() => {
        const run = async () => {
            if (!token) {
                setError('Invalid invite link');
                setPhase('error');
                setLoading(false);
                return;
            }
            try {
                // 1-я спроба: без вибору календаря
                const { data } = await api.post('/invites/accept', { token });
                if (data.kind === 'calendar') {
                    // приєднали календар, ведемо користувача в нього
                    try {
                        sessionStorage.setItem(SS_RESET, '1');
                    } catch {}
                    navigate(
                        `/calendars?cal=${encodeURIComponent(data.calendarId)}`,
                        { replace: true }
                    );
                    return;
                }
                if (data.kind === 'event') {
                    setEventId(data.eventId);
                    if (data.needsPlacement) {
                        // треба обрати календар для розміщення події
                        const resp = await api.get('/calendars');
                        const cals = (resp.data?.calendars || []).filter(
                            Boolean
                        );
                        setCalendars(cals);
                        setPhase('choose-cal');
                    } else {
                        // уже розміщено або не потрібно — перекидаємо в календар (якщо відомий)
                        try {
                            sessionStorage.setItem(SS_RESET, '1');
                        } catch {}
                        const calId = data.placedTo || '';
                        navigate(
                            calId
                                ? `/calendars?cal=${encodeURIComponent(calId)}`
                                : '/calendars',
                            { replace: true }
                        );
                    }
                }
            } catch (e) {
                const msg =
                    e?.response?.data?.error ||
                    e.message ||
                    'Failed to accept invite';
                if (e?.response?.status === 401) {
                    // неавторизований → ведемо на логін і повернемося назад
                    const ret = encodeURIComponent(
                        window.location.pathname + window.location.search
                    );
                    navigate(`/login?next=${ret}`, { replace: true });
                    return;
                }
                setError(msg);
                setPhase('error');
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [token, navigate]);

    async function placeEventTo(calendarId) {
        if (!eventId || !token) return;
        setLoading(true);
        setError('');
        try {
            const { data } = await api.post('/invites/accept', {
                token,
                calendarId,
            });
            try {
                sessionStorage.setItem(SS_RESET, '1');
            } catch {}
            const calId = data.placedTo || calendarId;
            navigate(`/calendars?cal=${encodeURIComponent(calId)}`, {
                replace: true,
            });
        } catch (e) {
            setError(
                e?.response?.data?.error || e.message || 'Failed to place event'
            );
        } finally {
            setLoading(false);
        }
    }

    if (loading && phase === 'accepting') {
        return <div className="accept-wrap">Accepting the invite…</div>;
    }
    if (phase === 'error') {
        return <div className="accept-wrap error">Error: {error}</div>;
    }
    if (phase === 'choose-cal') {
        return (
            <div className="accept-wrap">
                <h2>Select calendar to place the event</h2>
                <div className="cal-list">
                    {calendars.map((c) => (
                        <label key={c.id} className="cal-item">
                            <input
                                type="radio"
                                name="cal"
                                value={c.id}
                                onChange={() => setSelectedCal(c.id)}
                            />
                            <span>{c.name}</span>
                        </label>
                    ))}
                </div>
                <button
                    className="btn1"
                    disabled={!selectedCal}
                    onClick={() => placeEventTo(selectedCal)}
                >
                    Place event
                </button>
                {error && (
                    <p className="error" style={{ marginTop: 8 }}>
                        {error}
                    </p>
                )}
            </div>
        );
    }
    return <div className="accept-wrap">Done.</div>;
}
