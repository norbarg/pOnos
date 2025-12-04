import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/axios';
import '../styles/acceptInvite.css';

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
    const [phase, setPhase] = useState('accepting');
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
                const { data } = await api.post('/invites/accept', { token });

                if (data.kind === 'calendar') {
                    try {
                        sessionStorage.setItem(SS_RESET, '1');
                    } catch {}
                    navigate(
                        `/calendars?cal=${encodeURIComponent(data.calendarId)}`,
                        {
                            replace: true,
                        }
                    );
                    return;
                }

                if (data.kind === 'event') {
                    setEventId(data.eventId);

                    if (data.needsPlacement) {
                        const resp = await api.get('/calendars');
                        const cals = (resp.data?.calendars || [])
                            .filter(Boolean)
                            .filter(
                                (c) =>
                                    !(c.isSystem && c.systemType === 'holidays')
                            );

                        setCalendars(cals);
                        setPhase('choose-cal');
                    } else {
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
        return (
            <section className="acceptPage">
                <div className="acceptStatus">Accepting the invite…</div>
            </section>
        );
    }

    if (phase === 'error') {
        return (
            <section className="acceptPage">
                <div className="acceptStatus acceptStatus--error">
                    Error: {error}
                </div>
            </section>
        );
    }

    if (phase === 'choose-cal') {
        return (
            <section className="acceptPage">
                <div className="acceptCard">
                    <div className="acceptCard__top">
                        <h1 className="acceptCard__hello">Hey, Hello!</h1>
                    </div>

                    <div className="acceptCard__bottom">
                        <h2 className="acceptCard__title">
                            Select calendar to place the event
                        </h2>

                        <div className="acceptCard__list">
                            {calendars.map((c) => (
                                <label
                                    key={c.id}
                                    className={
                                        'acceptCal' +
                                        (selectedCal === c.id
                                            ? ' acceptCal--selected'
                                            : '')
                                    }
                                    onClick={() => setSelectedCal(c.id)}
                                >
                                    <span className="acceptCal__radio" />
                                    <span className="acceptCal__label">
                                        {c.name}
                                    </span>

                                    <input
                                        className="acceptCal__input"
                                        type="radio"
                                        name="calendar"
                                        value={c.id}
                                        checked={selectedCal === c.id}
                                        onChange={() => setSelectedCal(c.id)}
                                    />
                                </label>
                            ))}
                        </div>

                        <button
                            className="acceptCard__btn"
                            disabled={!selectedCal || loading}
                            onClick={() => placeEventTo(selectedCal)}
                        >
                            {loading ? 'Placing…' : 'Place event'}
                        </button>

                        {error && <p className="acceptCard__error">{error}</p>}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="acceptPage">
            <div className="acceptStatus">Done.</div>
        </section>
    );
}
