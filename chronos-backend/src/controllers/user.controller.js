import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Calendar from '../models/Calendar.js';
import Event from '../models/Event.js';
import Invitation from '../models/Invitation.js';
import EventInvitation from '../models/EventInvitation.js';
import { AVATARS_PUBLIC_BASE } from '../middlewares/uploadAvatar.middleware.js';

function isValidUsername(v) {
    return /^[a-z0-9._-]{3,32}$/.test(String(v || ''));
}

function isAvatarPathWithinUploads(p) {
    return typeof p === 'string' && p.startsWith(AVATARS_PUBLIC_BASE + '/');
}

/** PATCH /users/me  (FormData: avatar?, JSON: username?) */
export async function updateMe(req, res) {
    const uid = req.user.id;

    // username из JSON-тела (если передан)
    let usernamePatch;
    if (Object.prototype.hasOwnProperty.call(req.body, 'username')) {
        const u = String(req.body.username || '')
            .trim()
            .toLowerCase();
        if (u && !isValidUsername(u)) {
            return res.status(400).json({ error: 'username-invalid' });
        }
        if (u) {
            const exists = await User.findOne({
                _id: { $ne: uid },
                username: u,
            }).lean();
            if (exists)
                return res
                    .status(409)
                    .json({ error: 'username already in use' });
        }
        usernamePatch = u || undefined;
    }

    // если пришёл файл
    let avatarPublicPath;
    if (req.file) {
        avatarPublicPath = `${AVATARS_PUBLIC_BASE}/${req.file.filename}`;
    }

    // достанем текущего юзера
    const me = await User.findById(uid);
    if (!me) return res.status(404).json({ error: 'not-found' });

    // собрать патч
    const patch = {};
    if (typeof usernamePatch !== 'undefined') patch.username = usernamePatch;
    if (avatarPublicPath) patch.avatar = avatarPublicPath;

    const updated = await User.findByIdAndUpdate(uid, patch, {
        new: true,
        runValidators: true,
    });

    // удалить старый файл, если был
    if (avatarPublicPath && me.avatar && isAvatarPathWithinUploads(me.avatar)) {
        try {
            const abs = path.join(process.cwd(), me.avatar);
            await fs.unlink(abs).catch(() => {});
        } catch {
            /* ignore */
        }
    }

    return res.json({ user: updated.toJSON() });
}

/** DELETE /users/me — удалить аккаунт + каскады */
export async function deleteMe(req, res) {
    const uid = req.user.id;
    const me = await User.findById(uid);
    if (!me) return res.status(404).json({ error: 'not-found' });

    // 1) Собираем связанные сущности
    const [ownedCals, ownedEvents] = await Promise.all([
        Calendar.find({ owner: uid }).select({ _id: 1 }).lean(),
        Event.find({ owner: uid }).select({ _id: 1 }).lean(),
    ]);
    const ownedCalIds = ownedCals.map((c) => c._id);
    const ownedEventIds = ownedEvents.map((e) => e._id);

    // 2) Удаляем инвайты событий по ownedEventIds
    if (ownedEventIds.length) {
        await EventInvitation.deleteMany({ event: { $in: ownedEventIds } });
    }

    // 3) Удаляем сами события владельца
    await Event.deleteMany({ owner: uid });

    // 4) Удаляем инвайты календарей, где пользователь — владелец
    if (ownedCalIds.length) {
        await Invitation.deleteMany({ calendar: { $in: ownedCalIds } });
    }

    // 5) Удаляем календари пользователя
    if (ownedCalIds.length) {
        // также выпиливаем placements с этими календарями у чужих событий
        await Event.updateMany(
            { 'placements.calendar': { $in: ownedCalIds } },
            { $pull: { placements: { calendar: { $in: ownedCalIds } } } }
        );
        await Calendar.deleteMany({ _id: { $in: ownedCalIds } });
    }

    // 6) Убираем пользователя из участников и placements чужих событий
    await Event.updateMany(
        { $or: [{ participants: uid }, { 'placements.user': uid }] },
        {
            $pull: {
                participants: new mongoose.Types.ObjectId(uid),
                placements: { user: new mongoose.Types.ObjectId(uid) },
            },
        }
    );

    // 7) Убираем пользователя из чужих календарей (members/roles/notifyActive)
    const unset = {};
    unset[`memberRoles.${uid}`] = 1;
    unset[`notifyActive.${uid}`] = 1;
    await Calendar.updateMany(
        { members: uid },
        { $pull: { members: uid }, $unset: unset }
    );

    // 8) Чистим инвайты, созданные пользователем (как инвайтер)
    await Promise.all([
        Invitation.deleteMany({ inviter: uid }),
        EventInvitation.deleteMany({ inviter: uid }),
    ]);

    // 9) (опционально) Чистим pending-инвайты, адресованные на email удаляемого
    if (me.email) {
        await Promise.all([
            Invitation.deleteMany({
                email: String(me.email).toLowerCase(),
                status: 'pending',
            }),
            EventInvitation.deleteMany({
                email: String(me.email).toLowerCase(),
                status: 'pending',
            }),
        ]);
    }

    // 10) Удаляем аватар с диска (если наш)
    if (me.avatar && isAvatarPathWithinUploads(me.avatar)) {
        try {
            const abs = path.join(process.cwd(), me.avatar);
            await fs.unlink(abs).catch(() => {});
        } catch {
            /* ignore */
        }
    }

    // 11) Удаляем самого пользователя
    await User.deleteOne({ _id: uid });

    return res.json({ ok: true });
}
