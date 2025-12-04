import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/axios';
import { absUrl } from '../../config/apiOrigin';
import './editProfileModal.css';
import uploadCloud from '../../assets/upload_cloud.png';

const USER_RE = /^[a-z0-9._-]{3,32}$/;

const COUNTRY_OPTIONS = [
    { code: 'UA', label: 'Ukraine' },
    { code: 'PL', label: 'Poland' },
    { code: 'DE', label: 'Germany' },
    { code: 'US', label: 'United States' },
];

export default function EditProfileModal({
    open,
    me,
    onClose,
    onUpdated,
    onDeleted,
}) {
    const [username, setUsername] = useState('');
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState('');
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    const [askDelete, setAskDelete] = useState(false);
    const inputRef = useRef(null);
    const fileRef = useRef(null);
    const [countryCode, setCountryCode] = useState('UA');

    const currentAvatar = useMemo(() => {
        if (!me) return null;
        return (
            preview || me.avatarUrl || (me.avatar ? absUrl(me.avatar) : null)
        );
    }, [me, preview]);

    useEffect(() => {
        if (open) {
            document.body.classList.add('modal-open');
            setUsername(me?.username || me?.name || '');
            setCountryCode((me?.countryCode || 'UA').toUpperCase());
            setTimeout(() => inputRef.current?.focus(), 0);
        } else {
            document.body.classList.remove('modal-open');
            cleanupPreview();
            setUsername('');
            setFile(null);
            setErr('');
            setAskDelete(false);
            setLoading(false);
            setCountryCode('UA');
        }
        return () => document.body.classList.remove('modal-open');
    }, [open, me]);

    function cleanupPreview() {
        if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
        setPreview('');
    }

    function onOverlay(e) {
        if (e.target === e.currentTarget && !loading) onClose?.();
    }
    function onKey(e) {
        if (e.key === 'Escape' && !loading) onClose?.();
    }

    function pickFile(e) {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        cleanupPreview();
        setPreview(URL.createObjectURL(f));
    }

    const nameChanged = useMemo(() => {
        const base = (me?.username || me?.name || '').trim().toLowerCase();
        return username.trim().toLowerCase() !== base;
    }, [username, me]);

    const countryChanged = useMemo(() => {
        const base = (me?.countryCode || 'UA').toUpperCase();
        return countryCode.toUpperCase() !== base;
    }, [countryCode, me]);

    const canSubmit = useMemo(() => {
        const wantsName = nameChanged && username.trim().length > 0;
        const nameValid =
            !wantsName || USER_RE.test(username.trim().toLowerCase());

        const wantsCountry = countryChanged;

        return !loading && nameValid && (wantsName || !!file || wantsCountry);
    }, [loading, nameChanged, username, file, countryChanged]);

    async function submit() {
        if (!canSubmit) return;
        setLoading(true);
        setErr('');
        try {
            const fd = new FormData();
            if (nameChanged) fd.append('name', username.trim().toLowerCase());
            if (file) fd.append('avatar', file);
            if (countryChanged)
                fd.append('countryCode', countryCode.toUpperCase());

            const { data } = await api.patch('/users/me', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            onUpdated?.(data?.user);
            onClose?.();
        } catch (e) {
            const code = e?.response?.status;
            const msg = e?.response?.data?.error;
            if (code === 409 || /already in use/i.test(msg)) {
                setErr('This username is already taken.');
            } else if (code === 400 && msg === 'username-invalid') {
                setErr('Username must be 3–32 chars: a–z, 0–9, . _ -');
            } else if (code === 400 && msg === 'country-invalid') {
                setErr('Invalid country code.');
            } else {
                setErr('Failed to update profile. Try again.');
            }
        } finally {
            setLoading(false);
        }
    }

    async function doDelete() {
        if (!askDelete) {
            setAskDelete(true);
            return;
        }
        setLoading(true);
        setErr('');
        try {
            await api.delete('/users/me');
            onDeleted?.();
        } catch {
            setErr('Failed to delete account. Try again.');
            setAskDelete(false);
        } finally {
            setLoading(false);
        }
    }

    if (!open) return null;

    return (
        <div
            className="ep-overlay"
            onMouseDown={onOverlay}
            onKeyDown={onKey}
            role="dialog"
            aria-modal="true"
        >
            <div className="ep-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="ep-grid">
                    <div className="ep-left">
                        <h3 className="ep-title">Edit profile</h3>
                        <div className="ep-divider" aria-hidden="true" />
                        <p className="ep-description">
                            Update your profile information
                        </p>

                        <div className="ep-field">
                            <label>Login</label>
                            <input
                                ref={inputRef}
                                className="ep-input"
                                placeholder="Enter name"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                maxLength={32}
                                spellCheck={false}
                            />
                            <div className="ep-hint">
                                Allowed: a–z, 0–9, . _ - (3–32)
                            </div>
                        </div>
                        <div className="ep-field">
                            <label>Region</label>
                            <select
                                className="ep-input ep-select"
                                value={countryCode}
                                onChange={(e) => setCountryCode(e.target.value)}
                                disabled={loading}
                            >
                                <option value="UA">Ukraine</option>
                                <option value="PL">Poland</option>
                                <option value="DE">Germany</option>
                                <option value="US">United States</option>
                                <option value="GB">United Kingdom</option>
                            </select>
                            <div className="ep-hint">
                                Used for national holidays in your calendar
                            </div>
                        </div>

                        {err && (
                            <div className="ep-error" role="alert">
                                {err}
                            </div>
                        )}

                        <div className="ep-actions">
                            <button
                                className={`ep-btn1 ep-btn--danger${
                                    askDelete ? ' is-ask' : ''
                                }`}
                                onClick={doDelete}
                                disabled={loading}
                                title="Delete account"
                            >
                                {askDelete
                                    ? 'Confirm delete'
                                    : 'Delete account'}
                            </button>

                            <button
                                className="ep-btn ep-btn--primary"
                                onClick={submit}
                                disabled={!canSubmit}
                            >
                                {loading ? 'Saving…' : 'Confirm'}
                            </button>
                        </div>
                    </div>

                    <div className="ep-right">
                        <div className="ep-avatarWrap">
                            {currentAvatar ? (
                                <img
                                    src={currentAvatar}
                                    alt="avatar"
                                    className="ep-avatar"
                                />
                            ) : (
                                <div className="ep-avatar ep-avatar--placeholder" />
                            )}

                            <label
                                className="ep-uploadBtn"
                                title="Upload avatar"
                            >
                                <img src={uploadCloud} alt="upload" />
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={pickFile}
                                    hidden
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
