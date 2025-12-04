import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Calendar from '../models/Calendar.js';
import Event from '../models/Event.js';
import Invitation from '../models/Invitation.js';
import EventInvitation from '../models/EventInvitation.js';
import { ensureUserHolidaysSeed } from '../services/holidays.service.js';

import { AVATARS_PUBLIC_BASE } from '../middlewares/uploadAvatar.middleware.js';

function isValidLogin(v) {
    return /^[a-z0-9._-]{3,32}$/.test(String(v || ''));
}

function isAvatarPathWithinUploads(p) {
    return typeof p === 'string' && p.startsWith(AVATARS_PUBLIC_BASE + '/');
}

export async function updateMe(req, res) {
    const uid = req.user.id;

    let usernamePatch;
    let namePatch;
    if ('name' in req.body || 'username' in req.body) {
        const raw = String(
            ('name' in req.body ? req.body.name : req.body.username) || ''
        )
            .trim()
            .toLowerCase();
        if (raw && !isValidLogin(raw)) {
            return res.status(400).json({ error: 'username-invalid' });
        }
        if (raw) {
            const exists = await User.findOne({
                _id: { $ne: uid },
                name: raw,
            }).lean();
            if (exists)
                return res
                    .status(409)
                    .json({ error: 'username already in use' });
        }
        namePatch = raw || undefined;
    }

    let countryPatch;
    if ('countryCode' in req.body) {
        const rawCc = String(req.body.countryCode || '')
            .trim()
            .toUpperCase();
        if (!rawCc || !/^[A-Z]{2}$/.test(rawCc)) {
            return res.status(400).json({ error: 'country-invalid' });
        }
        countryPatch = rawCc;
    }

    let avatarPublicPath;
    if (req.file) {
        avatarPublicPath = `${AVATARS_PUBLIC_BASE}/${req.file.filename}`;
    }

    const me = await User.findById(uid);
    if (!me) return res.status(404).json({ error: 'not-found' });

    const oldCountry = (me.countryCode || 'UA').toUpperCase();

    const patch = {};
    if (typeof namePatch !== 'undefined') patch.name = namePatch;
    if (avatarPublicPath) patch.avatar = avatarPublicPath;
    if (typeof countryPatch !== 'undefined') {
        patch.countryCode = countryPatch;
    }

    const updated = await User.findByIdAndUpdate(uid, patch, {
        new: true,
        runValidators: true,
    });

    if (avatarPublicPath && me.avatar && isAvatarPathWithinUploads(me.avatar)) {
        try {
            const abs = path.join(process.cwd(), me.avatar);
            await fs.unlink(abs).catch(() => {});
        } catch {}
    }

    if (typeof countryPatch !== 'undefined') {
        try {
            const ownerId = new mongoose.Types.ObjectId(uid);

            const holidaysCals = await Calendar.find({
                owner: ownerId,
                isSystem: true,
                systemType: 'holidays',
            })
                .select({ _id: 1 })
                .lean();

            const calIds = holidaysCals.map((c) => c._id);

            if (calIds.length) {
                await Event.deleteMany({
                    calendar: { $in: calIds },
                });

                await Calendar.deleteMany({ _id: { $in: calIds } });
            }

            await ensureUserHolidaysSeed(uid, countryPatch);

            console.log(
                '[updateMe] holidays re-synced from',
                oldCountry,
                'to',
                countryPatch
            );
        } catch (e) {
            console.error('updateMe.region-holidays.error:', e);
        }
    }

    return res.json({ user: updated.toJSON() });
}

export async function deleteMe(req, res) {
    const uid = req.user.id;
    const me = await User.findById(uid);
    if (!me) return res.status(404).json({ error: 'not-found' });

    const [ownedCals, ownedEvents] = await Promise.all([
        Calendar.find({ owner: uid }).select({ _id: 1 }).lean(),
        Event.find({ owner: uid }).select({ _id: 1 }).lean(),
    ]);
    const ownedCalIds = ownedCals.map((c) => c._id);
    const ownedEventIds = ownedEvents.map((e) => e._id);

    if (ownedEventIds.length) {
        await EventInvitation.deleteMany({ event: { $in: ownedEventIds } });
    }

    await Event.deleteMany({ owner: uid });

    if (ownedCalIds.length) {
        await Invitation.deleteMany({ calendar: { $in: ownedCalIds } });
    }

    if (ownedCalIds.length) {
        await Event.updateMany(
            { 'placements.calendar': { $in: ownedCalIds } },
            { $pull: { placements: { calendar: { $in: ownedCalIds } } } }
        );
        await Calendar.deleteMany({ _id: { $in: ownedCalIds } });
    }

    await Event.updateMany(
        { $or: [{ participants: uid }, { 'placements.user': uid }] },
        {
            $pull: {
                participants: new mongoose.Types.ObjectId(uid),
                placements: { user: new mongoose.Types.ObjectId(uid) },
            },
        }
    );

    const unset = {};
    unset[`memberRoles.${uid}`] = 1;
    unset[`notifyActive.${uid}`] = 1;
    await Calendar.updateMany(
        { members: uid },
        { $pull: { members: uid }, $unset: unset }
    );

    await Promise.all([
        Invitation.deleteMany({ inviter: uid }),
        EventInvitation.deleteMany({ inviter: uid }),
    ]);

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

    if (me.avatar && isAvatarPathWithinUploads(me.avatar)) {
        try {
            const abs = path.join(process.cwd(), me.avatar);
            await fs.unlink(abs).catch(() => {});
        } catch {}
    }

    await User.deleteOne({ _id: uid });

    return res.json({ ok: true });
}
