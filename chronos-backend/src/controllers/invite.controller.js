// src/controllers/invite.controller.js
import Invitation from '../models/Invitation.js';
import {
    acceptInviteByToken,
    resendInvite,
    revokeInvite,
} from '../services/invite.service.js';
import Calendar from '../models/Calendar.js';
import Event from '../models/Event.js';
import mongoose from 'mongoose';
import { acceptEventInviteByToken } from '../services/eventInvite.service.js';

// owner-only: список інвайтів календаря
export async function listCalendarInvites(req, res) {
    const { calendar } = req;
    const list = await Invitation.find({ calendar: calendar._id })
        .sort({ createdAt: -1 })
        .lean();
    return res.json({
        invites: list.map((i) => ({
            id: String(i._id),
            email: i.email,
            role: i.role,
            status: i.status,
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
            acceptedAt: i.acceptedAt,
        })),
    });
}

// owner-only: повторна відправка
export async function resendCalendarInvite(req, res) {
    const { inviteId } = req.params;
    try {
        const inv = await resendInvite(inviteId); // ← сервіс приймає тільки inviteId
        return res.json({
            ok: true,
            invite: { id: String(inv._id), status: inv.status },
        });
    } catch (e) {
        return res.status(400).json({ error: e.message || 'resend failed' });
    }
}

// owner-only: відкликання
export async function revokeCalendarInvite(req, res) {
    const { inviteId } = req.params;
    try {
        const inv = await revokeInvite(inviteId); // ← сервіс приймає тільки inviteId
        return res.json({
            ok: true,
            invite: { id: String(inv._id), status: inv.status },
        });
    } catch (e) {
        return res.status(400).json({ error: e.message || 'revoke failed' });
    }
}

// user: прийняти інвайт (календар або подія) + опц. placement для події
export async function acceptInvite(req, res) {
    const { token, calendarId } = req.body || {};
    const tok = String(token || '').trim();
    if (!tok) return res.status(400).json({ error: 'token is required' });

    try {
        const inv = await acceptInviteByToken({
            userId: req.user.id,
            userEmail: req.user.email,
            token: tok,
        });
        return res.json({
            ok: true,
            kind: 'calendar',
            calendarId: String(inv.calendar),
        });
    } catch (e1) {
        try {
            const einv = await acceptEventInviteByToken({
                userId: req.user.id,
                userEmail: req.user.email,
                token: tok,
            });
            const uid = String(req.user.id);
            const ev = await Event.findById(einv.event).lean();
            if (!ev) return res.status(404).json({ error: 'event not found' });

            const hadPlacement = (ev.placements || []).some(
                (p) => String(p.user) === uid
            );
            let placedTo = null;

            if (calendarId) {
                if (!mongoose.isValidObjectId(calendarId))
                    return res
                        .status(400)
                        .json({ error: 'invalid calendarId' });
                const cal = await Calendar.findById(calendarId).lean();
                if (!cal)
                    return res
                        .status(404)
                        .json({ error: 'calendar not found' });

                const iOwn = String(cal.owner) === uid;
                const iMember =
                    Array.isArray(cal.members) &&
                    cal.members.some(
                        (m) => String(m.user || m) === uid || String(m) === uid
                    );
                if (!iOwn && !iMember)
                    return res
                        .status(403)
                        .json({ error: 'no access to this calendar' });

                await Event.updateOne(
                    { _id: ev._id, 'placements.user': { $ne: uid } },
                    {
                        $addToSet: {
                            placements: { user: uid, calendar: calendarId },
                        },
                    }
                );
                await Event.updateOne(
                    { _id: ev._id, 'placements.user': uid },
                    { $set: { 'placements.$.calendar': calendarId } }
                );
                placedTo = String(calendarId);
            }

            const needsPlacement = !(hadPlacement || placedTo);

            return res.json({
                ok: true,
                kind: 'event',
                eventId: String(einv.event),
                placedTo,
                needsPlacement,
            });
        } catch (e2) {
            return res
                .status(400)
                .json({ error: e2.message || e1.message || 'accept failed' });
        }
    }
}
