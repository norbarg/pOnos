// src/controllers/user.controller.js
import fs from 'fs/promises';
import path from 'path';
import User from '../models/User.js';
import { AVATARS_PUBLIC_BASE } from '../middlewares/uploadAvatar.middleware.js';

function isAvatarPathWithinUploads(p) {
    return typeof p === 'string' && p.startsWith(AVATARS_PUBLIC_BASE + '/');
}

export async function updateMe(req, res) {
    const uid = req.user.id;

    // принимаем name ИЛИ (по старой привычке) username -> всё пишем в name (lower-case)
    let nextName;
    if ('name' in req.body)
        nextName = String(req.body.name || '')
            .trim()
            .toLowerCase();
    else if ('username' in req.body)
        nextName = String(req.body.username || '')
            .trim()
            .toLowerCase();

    if (typeof nextName !== 'undefined') {
        if (!nextName) return res.status(400).json({ error: 'name-empty' });
        if (!/^[a-z0-9._-]{3,32}$/.test(nextName)) {
            return res.status(400).json({ error: 'name-invalid' });
        }
    }

    let avatarPublicPath;
    if (req.file)
        avatarPublicPath = `${AVATARS_PUBLIC_BASE}/${req.file.filename}`;

    const me = await User.findById(uid);
    if (!me) return res.status(404).json({ error: 'not-found' });

    const patch = {};
    if (typeof nextName !== 'undefined') patch.name = nextName;
    if (avatarPublicPath) patch.avatar = avatarPublicPath;

    try {
        const updated = await User.findByIdAndUpdate(uid, patch, {
            new: true,
            runValidators: true,
        });

        if (
            avatarPublicPath &&
            me.avatar &&
            isAvatarPathWithinUploads(me.avatar)
        ) {
            try {
                await fs
                    .unlink(path.join(process.cwd(), me.avatar))
                    .catch(() => {});
            } catch {}
        }
        return res.json({ user: updated.toJSON() });
    } catch (e) {
        if (e?.code === 11000 && e?.keyPattern?.name) {
            return res.status(409).json({ error: 'name already in use' });
        }
        return res.status(500).json({ error: 'internal' });
    }
}

export async function deleteMe(req, res) {
    const uid = req.user.id;
    const me = await User.findById(uid);
    if (!me) return res.status(404).json({ error: 'not-found' });

    if (me.avatar && isAvatarPathWithinUploads(me.avatar)) {
        try {
            await fs
                .unlink(path.join(process.cwd(), me.avatar))
                .catch(() => {});
        } catch {}
    }
    await User.deleteOne({ _id: uid });
    return res.json({ ok: true });
}
