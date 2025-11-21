// invite.service.js
import crypto from 'crypto';
import Invitation from '../models/Invitation.js';
import Calendar from '../models/Calendar.js';
import { sendInviteEmail } from './mail.service.js';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const INVITE_TTL_DAYS = Number(process.env.INVITE_TTL_DAYS || 7);

function buildAcceptLink(token) {
    return `${APP_URL}/invite/accept?token=${token}`;
}

export async function createInvite({
    calendarId,
    inviterId,
    email,
    role = 'member',
}) {
    const cal = await Calendar.findById(calendarId).lean();
    if (!cal) throw new Error('calendar not found');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
        Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    const inv = await Invitation.create({
        email,
        calendar: calendarId,
        inviter: inviterId,
        role,
        token,
        expiresAt,
        status: 'pending',
    });

    const link = buildAcceptLink(token);
    await sendInviteEmail({ to: email, calendarName: cal.name, role, link });
    return inv;
}

export async function resendInvite(inviteId) {
    const inv = await Invitation.findById(inviteId).populate('calendar').lean();
    if (!inv) throw new Error('invite not found');
    if (inv.status !== 'pending') throw new Error('invite is not pending');

    const link = buildAcceptLink(inv.token);
    await sendInviteEmail({
        to: inv.email,
        calendarName: inv.calendar?.name || 'Calendar',
        role: inv.role,
        link,
    });
    return inv;
}

export async function revokeInvite(inviteId) {
    const inv = await Invitation.findById(inviteId);
    if (!inv) throw new Error('invite not found');
    if (inv.status !== 'pending') return inv;
    inv.status = 'revoked';
    await inv.save();
    return inv;
}

export async function acceptInviteByToken({ userId, userEmail, token }) {
    const inv = await Invitation.findOne({ token });
    if (!inv) throw new Error('invalid token');

    if (inv.status !== 'pending') throw new Error('invite not pending');
    if (inv.expiresAt.getTime() < Date.now()) {
        inv.status = 'expired';
        await inv.save();
        throw new Error('invite expired');
    }
    if (String(userEmail).toLowerCase() !== String(inv.email).toLowerCase()) {
        throw new Error('email mismatch');
    }

    // ✅ добавляем участника и роль в актуальную модель
    const set = {};
    set[`memberRoles.${userId}`] = inv.role;
    set[`notifyActive.${userId}`] = true;

    await Calendar.updateOne(
        { _id: inv.calendar, owner: { $ne: userId } },
        { $addToSet: { members: userId }, $set: set }
    );

    inv.status = 'accepted';
    inv.acceptedAt = new Date();
    inv.acceptedBy = userId;
    await inv.save();

    return inv;
}

// автоподцепление висящих инвайтов на регистрацию
export async function attachPendingInvitesForEmail({ userId, email }) {
    const now = new Date();
    const pendings = await Invitation.find({
        email: String(email).toLowerCase(),
        status: 'pending',
        expiresAt: { $gt: now },
    });

    for (const inv of pendings) {
        const set = {};
        set[`memberRoles.${userId}`] = inv.role;
        set[`notifyActive.${userId}`] = true;

        await Calendar.updateOne(
            { _id: inv.calendar, owner: { $ne: userId } },
            { $addToSet: { members: userId }, $set: set }
        );

        inv.status = 'accepted';
        inv.acceptedAt = new Date();
        inv.acceptedBy = userId;
        await inv.save();
    }
    return pendings.length;
}
