// chronos-frontend/src/components/Calendar/AccessPanel.jsx
import React, { useState } from 'react';

export default function AccessPanel({
    sharedWith = [],
    onInvite,
    onChangePermission,
    onRemove,
    sendIcon, // ← новая иконка для кнопки
}) {
    const [inviteEmail, setInviteEmail] = useState('');
    const [menuFor, setMenuFor] = useState(null); // id/email пользователя с открытым меню

    // chronos-frontend/src/components/Calendar/AccessPanel.jsx
    const sendInvite = async () => {
        const v = inviteEmail.trim();
        if (!v) return;
        try {
            const r = await onInvite?.(v, 'view');
            if (r?.alreadyInvited)
                alert('Invite already pending for this email.');
            else alert('Invite sent.');
        } catch (e) {
            const msg = e?.response?.data?.error || e.message;
            if (msg === 'already-member')
                alert('This user already has access.');
            else if (msg === 'cannot-invite-yourself')
                alert('You cannot invite yourself.');
            else if (msg === 'user-not-found')
                alert('User not found by this email or name.');
            else if (msg === 'user-has-no-email')
                alert('This user does not have an email set.');
            else if (msg === 'invalid-email')
                // на всякий пожарный, если все же придёт
                alert('Invalid email format.');
            else alert('Failed: ' + msg);
        }
        setInviteEmail('');
    };

    const roleLabel = (u) =>
        u.permission === 'owner'
            ? 'owner'
            : u.permission === 'edit'
            ? 'can edit'
            : 'can view';

    return (
        <div className="access-panel ap">
            {/* Invite */}
            <div className="ap-title">Invite to calendar</div>
            <div className="ap-invite">
                <input
                    className="ap-input"
                    placeholder="Enter email or user"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => (e.key === 'Enter' ? sendInvite() : null)}
                />
                <button
                    className="ap-send"
                    type="button"
                    onClick={sendInvite}
                    aria-label="Invite"
                    disabled={!inviteEmail.trim()}
                >
                    {sendIcon ? (
                        <img src={sendIcon} alt="" />
                    ) : (
                        <span className="ap-send-arrow" aria-hidden>
                            ↗
                        </span>
                    )}
                </button>
            </div>

            {/* List */}
            <div className="ap-title">Who has access</div>
            <div className="ap-list">
                {sharedWith.map((u) => {
                    const key = u.id ?? u.email;
                    const isOwner =
                        u.permission === 'owner' || u.role === 'owner';
                    const initials = (u.name || u.email || '?')
                        .slice(0, 1)
                        .toUpperCase();

                    const avatarUrl = u.avatar || u.avatarUrl || null;

                    return (
                        <div className="ap-row" key={key}>
                            <div className="ap-user">
                                <div className="ap-ava" aria-hidden>
                                    {avatarUrl ? (
                                        <img
                                            src={avatarUrl}
                                            alt={u.name || u.email}
                                        />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                <div className="ap-name">
                                    {u.name || u.email}
                                </div>
                            </div>

                            <div className="ap-role">
                                {isOwner ? (
                                    <span className="ap-badge mute">owner</span>
                                ) : (
                                    <div className="ap-select">
                                        <button
                                            className="ap-select-btn"
                                            onClick={() =>
                                                setMenuFor((id) =>
                                                    id === key ? null : key
                                                )
                                            }
                                        >
                                            {roleLabel(u)}{' '}
                                            <span className="caret">▾</span>
                                        </button>

                                        {menuFor === key && (
                                            <div className="ap-menu">
                                                <button
                                                    className="ap-menu-item"
                                                    onClick={() => {
                                                        onChangePermission?.(
                                                            String(u.id),
                                                            'view'
                                                        );
                                                        setMenuFor(null);
                                                    }}
                                                >
                                                    can view
                                                </button>
                                                <button
                                                    className="ap-menu-item"
                                                    onClick={() => {
                                                        onChangePermission?.(
                                                            String(u.id),
                                                            'edit'
                                                        );
                                                        setMenuFor(null);
                                                    }}
                                                >
                                                    can edit
                                                </button>
                                                <button
                                                    className="ap-menu-item danger"
                                                    onClick={() => {
                                                        onRemove?.(
                                                            String(u.id)
                                                        );
                                                        setMenuFor(null);
                                                    }}
                                                >
                                                    remove
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
