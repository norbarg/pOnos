import crypto from 'crypto';
import Event from '../models/Event.js';
import EventInvitation from '../models/EventInvitation.js';
import { sendEventInviteEmail } from './mail.service.js';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const INVITE_TTL_DAYS = Number(process.env.INVITE_TTL_DAYS || 7);

function buildAcceptLink(token) {
    // единая точка входа на фронте
    return `${APP_URL}/invite/accept?token=${token}`;
}

export async function createEventInvite({ eventId, inviterId, email }) {
    const ev = await Event.findById(eventId).populate('calendar').lean();
    if (!ev) throw new Error('event not found');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
        Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    const inv = await EventInvitation.create({
        email,
        event: eventId,
        inviter: inviterId,
        token,
        expiresAt,
        status: 'pending',
    });

    const when = `${new Date(ev.start).toISOString()} – ${new Date(
        ev.end
    ).toISOString()}`;
    const link = buildAcceptLink(token);
    await sendEventInviteEmail({
        to: email,
        eventTitle: ev.title,
        when,
        link,
    });

    return inv;
}

export async function resendEventInvite(inviteId) {
    const inv = await EventInvitation.findById(inviteId)
        .populate('event')
        .lean();
    if (!inv) throw new Error('invite not found');
    if (inv.status !== 'pending') throw new Error('invite is not pending');

    const when = inv.event
        ? `${new Date(inv.event.start).toISOString()} – ${new Date(
              inv.event.end
          ).toISOString()}`
        : '';
    const link = buildAcceptLink(inv.token);

    await sendEventInviteEmail({
        to: inv.email,
        eventTitle: inv.event?.title || 'Event',
        when,
        link,
    });
    return inv;
}

export async function revokeEventInvite(inviteId) {
    const inv = await EventInvitation.findById(inviteId);
    if (!inv) throw new Error('invite not found');
    if (inv.status !== 'pending') return inv;
    inv.status = 'revoked';
    await inv.save();
    return inv;
}

export async function acceptEventInviteByToken({ userId, userEmail, token }) {
    const inv = await EventInvitation.findOne({ token });
    if (!inv) throw new Error('invalid token');

    // если истёк срок – помечаем и выкидываем ошибку
    if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) {
        if (inv.status === 'pending') {
            inv.status = 'expired';
            await inv.save();
        }
        throw new Error('invite expired');
    }

    // жёстко запрещаем только revoked/expired
    if (inv.status === 'revoked' || inv.status === 'expired') {
        throw new Error('invite not pending');
    }

    // проверяем, что залогиненный юзер = тот же email, на который ушёл инвайт
    if (String(userEmail).toLowerCase() !== String(inv.email).toLowerCase()) {
        throw new Error('email mismatch');
    }

    // добавляем участника (идемпотентно через $addToSet)
    await Event.updateOne(
        { _id: inv.event },
        { $addToSet: { participants: userId } }
    );

    // если ещё не был accepted – помечаем
    if (inv.status !== 'accepted') {
        inv.status = 'accepted';
        inv.acceptedAt = new Date();
        inv.acceptedBy = userId;
        await inv.save();
    }

    return inv; // контроллеру важно получить inv.event
}
