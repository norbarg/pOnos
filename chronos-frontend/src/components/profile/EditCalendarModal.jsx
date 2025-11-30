// chronos-frontend/src/components/profile/EditCalendarModal.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/axios';
import './newCalendarModal.css';

const PALETTE = [
    '#A7BBEE',
    '#D86497',
    '#D8AC89',
    '#C5BDF0',
    '#96C0BE',
    '#D65050',
    '#F9F06C',
    '#59DAEB',
];

const NAME_MIN = 1;
const DESC_MIN = 1;

export default function EditCalendarModal({
    open,
    calendar,
    onClose,
    onSaved,
}) {
    const cal = calendar || {};
    const [name, setName] = useState('');
    const [desc, setDesc] = useState('');
    const [color, setColor] = useState('#151726');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (open) {
            document.body.classList.add('modal-open');
            setName(cal.name || '');
            setDesc(cal.description || '');
            setColor(cal.color || '#151726');
            setError('');
            setTimeout(() => inputRef.current?.focus(), 0);
        } else {
            document.body.classList.remove('modal-open');
            setSaving(false);
        }
        return () => document.body.classList.remove('modal-open');
    }, [open, cal]);

    const changed = useMemo(
        () =>
            (name || '') !== (cal.name || '') ||
            (desc || '') !== (cal.description || '') ||
            (color || '') !== (cal.color || ''),
        [name, desc, color, cal]
    );

    const canSubmit = useMemo(() => {
        const nm = name.trim();
        const ds = desc.trim();
        return (
            changed && nm.length >= NAME_MIN && ds.length >= DESC_MIN && !saving
        );
    }, [changed, name, desc, saving]);

    function onOverlay(e) {
        if (e.target === e.currentTarget && !saving) onClose?.();
    }
    function onKey(e) {
        if (e.key === 'Escape' && !saving) onClose?.();
    }

    async function submit() {
        if (!canSubmit) return;

        const nm = name.trim();
        const ds = desc.trim();
        if (nm.length < NAME_MIN || ds.length < DESC_MIN) {
            setError(
                nm.length < NAME_MIN
                    ? `Title is required (min ${NAME_MIN} chars).`
                    : `Description is required (min ${DESC_MIN} chars).`
            );
            return;
        }

        setSaving(true);
        setError('');
        try {
            const { data } = await api.put(`/calendars/${cal.id}`, {
                name: nm,
                description: ds,
                color,
            });
            onSaved?.(
                data?.calendar || { ...cal, name: nm, description: ds, color }
            );
            onClose?.();
        } catch (err) {
            const code = err?.response?.status;
            const msg = err?.response?.data?.error || 'failed';
            if (code === 409 || msg === 'duplicate-name') {
                setError('You already have a calendar with this name.');
            } else if (
                code === 400 &&
                (msg === 'name-required' || msg === 'description-required')
            ) {
                setError(
                    msg === 'name-required'
                        ? 'Title is required.'
                        : 'Description is required.'
                );
            } else {
                setError('Failed to save calendar. Try again.');
            }
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    return (
        <div
            className="nc-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={onOverlay}
            onKeyDown={onKey}
        >
            <div className="nc-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="nc-head">
                    <h3 className="nc-title1">Edit calendar</h3>
                    <div className="nc-titleInput1">
                        <span className="nc-caret1" aria-hidden="true"></span>
                        <input
                            ref={inputRef}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="> Edit title..."
                            maxLength={64}
                            aria-label="Calendar title"
                            required
                            aria-invalid={name.trim().length < NAME_MIN}
                        />
                    </div>
                </div>

                <div className="nc-field">
                    <label>Enter calendar description</label>
                    <input
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        placeholder="Edit description..."
                        maxLength={300}
                        required
                        aria-invalid={desc.trim().length < DESC_MIN}
                    />
                </div>

                <div className="nc-field">
                    <label>Select the calendar color</label>
                    <div className="nc-swatches">
                        {PALETTE.map((c) => (
                            <button
                                key={c}
                                type="button"
                                className={`nc-swatch${
                                    color === c ? ' is-active' : ''
                                }`}
                                style={{ '--sw': c }}
                                onClick={() => setColor(c)}
                                aria-label={`choose color ${c}`}
                            >
                                <span className="nc-dot" />
                            </button>
                        ))}
                    </div>
                </div>
                <div className="ep-hint">
                              Calendar header color
                            </div>
                <div className="nc-actions">
                    <button
                        className="nc-btn nc-btn--ghost"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        className="nc-btn"
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {saving ? 'Saving…' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
}
