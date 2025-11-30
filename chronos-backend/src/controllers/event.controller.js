// chronos-backend/src/controllers/event.controller.js
import mongoose from 'mongoose';
import rrulePkg from 'rrule';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Category from '../models/Category.js';
import Calendar from '../models/Calendar.js';
import {
    createEventInvite,
    resendEventInvite as resendEvtInv,
    revokeEventInvite as revokeEvtInv,
} from '../services/eventInvite.service.js';
import EventInvitation from '../models/EventInvitation.js';

const { RRule } = rrulePkg;

/* helpers */
function parseISO(s) {
    const d = new Date(s);
    if (isNaN(d)) throw new Error('invalid date');
    return d;
}

function sanitizeEvent(ev, catMap) {
    const o = ev.toObject ? ev.toObject() : ev;
    const category =
        o.category && catMap ? catMap.get(String(o.category)) : null;
    return {
        id: String(o._id),
        title: o.title,
        description: o.description,
        start: o.start,
        end: o.end,
        category: o.category ? String(o.category) : null,
        categoryInfo: category
            ? {
                  id: category.id,
                  title: category.title,
                  color: category.color,
                  isDefault: category.isDefault,
              }
            : null,
        calendar: String(o.calendar),
        owner: String(o.owner),
        participants: (o.participants || []).map(String),
        recurrence: o.recurrence || null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
    };
}

function canManage(ev, uid, calOfEvent) {
    const isOwner = String(ev.owner) === String(uid);
    const isCalOwner = calOfEvent && String(calOfEvent.owner) === String(uid);
    return isOwner || isCalOwner;
}

/* CREATE */
export async function createEvent(req, res) {
    try {
        const uid = req.user.id;
        const { calId } = req.params;
        const cal = await Calendar.findById(calId);
        if (!cal) return res.status(404).json({ error: 'calendar not found' });

        const isOwner = String(cal.owner) === uid;
        const isMember =
            Array.isArray(cal.members) &&
            cal.members.some((m) => String(m.user || m) === uid);
        if (!isOwner && !isMember)
            return res.status(403).json({ error: 'forbidden' });

        let { title, description, start, end, categoryId, recurrence } =
            req.body || {};
        title = String(title || '').trim();
        if (!title) return res.status(400).json({ error: 'title is required' });

        const startDate = parseISO(start);
        const endDate = parseISO(end);
        if (endDate < startDate)
            return res.status(400).json({ error: 'end must be after start' });

        if (!mongoose.isValidObjectId(categoryId))
            return res.status(400).json({ error: 'invalid categoryId' });
        const cat = await Category.findById(categoryId).lean();
        if (!cat) return res.status(400).json({ error: 'category not found' });
        if (cat.user && String(cat.user) !== uid)
            return res
                .status(403)
                .json({ error: "cannot use someone else's custom category" });

        let recurrenceObj = undefined;
        if (recurrence && recurrence.rrule) {
            try {
                RRule.fromString(recurrence.rrule);
            } catch {
                return res.status(400).json({ error: 'invalid RRULE' });
            }
            recurrenceObj = {
                rrule: String(recurrence.rrule),
                timezone: recurrence.timezone || undefined,
                until: recurrence.until
                    ? parseISO(recurrence.until)
                    : undefined,
            };
        }

        const created = await Event.create({
            title,
            description,
            start: startDate,
            end: endDate,
            category: categoryId,
            calendar: cal._id,
            owner: uid,
            participants: [],
            placements: [],
            recurrence: recurrenceObj,
        });

        res.status(201).json({ event: sanitizeEvent(created) });
    } catch {
        return res.status(500).json({ error: 'failed to create event' });
    }
}

/* LIST (by calendar) + filters & expand */
// 7) обычный (не развернутый) режим
export async function listCalendarEvents(req, res) {
    const uid = req.user.id;
    const { calId } = req.params;
    const { from, to, category, expand } = req.query;

    const cal = await Calendar.findById(calId).lean();
    if (!cal) return res.status(404).json({ error: 'calendar not found' });

    const isOwner = String(cal.owner) === uid;
    const isMember =
        Array.isArray(cal.members) &&
        cal.members.some((m) => String(m.user || m) === uid);
    if (!isOwner && !isMember)
        return res.status(403).json({ error: 'forbidden' });

    const baseQuery = {
        $or: [
            // 1) события, у которых "родной" календарь = этот
            { calendar: cal._id },

            // 2) события, размещённые в этом календаре для ТЕКУЩЕГО пользователя
            {
                'placements.calendar': cal._id,
                'placements.user': uid,
            },
        ],
    };

    const allEvents = await Event.find(baseQuery).sort({ start: 1 }).lean();

    let list = allEvents;
    if (category) {
        const ids = String(category)
            .split(',')
            .filter((x) => mongoose.isValidObjectId(x));
        if (ids.length) {
            const idSet = new Set(ids.map(String));
            list = list.filter((e) => idSet.has(String(e.category)));
        }
    }

    let fromDate = null;
    let toDate = null;
    if (from) fromDate = parseISO(from);
    if (to) toDate = parseISO(to);

    if (fromDate || toDate) {
        list = list.filter((e) => {
            const hasRec = e.recurrence && e.recurrence.rrule;
            if (hasRec) {
                if (e.recurrence.until && fromDate) {
                    const until = parseISO(e.recurrence.until);
                    if (until < fromDate) return false;
                }
                return true;
            }

            const st = new Date(e.start);
            if (fromDate && st < fromDate) return false;
            if (toDate && st >= toDate) return false;
            return true;
        });
    }

    const catIds = [...new Set(list.map((e) => String(e.category)))];
    const cats = await Category.find({ _id: { $in: catIds } }).lean();
    const catMap = new Map(
        cats.map((c) => [
            String(c._id),
            {
                id: String(c._id),
                title: c.title,
                color: c.color,
                isDefault: c.user === null,
            },
        ])
    );

    if (expand && Number(expand) === 1 && (fromDate || toDate)) {
        const rangeFrom = fromDate || new Date('1970-01-01T00:00:00.000Z');
        const rangeTo = toDate || new Date('2999-01-01T00:00:00.000Z');

        const expanded = [];
        for (const e of list) {
            if (e.recurrence && e.recurrence.rrule) {
                let rule;
                try {
                    const baseOpts = RRule.parseString(e.recurrence.rrule);
                    baseOpts.dtstart = new Date(e.start);
                    rule = new RRule(baseOpts);
                } catch {
                    continue;
                }

                const dates = rule.between(rangeFrom, rangeTo, true);
                for (const dt of dates) {
                    const dur = new Date(e.end) - new Date(e.start) || 0;
                    const occ = {
                        ...e,
                        start: dt,
                        end: new Date(dt.getTime() + dur),
                    };
                    expanded.push(sanitizeEvent(occ, catMap));
                }
            } else {
                const base = sanitizeEvent(e, catMap);
                base.sourceCalendar = base.calendar;
                base.visibleInCalendar = String(cal._id);
                const myPl = (e.placements || []).find(
                    (p) => String(p.user) === uid
                );
                if (myPl)
                    base.placementForViewer = {
                        calendar: String(myPl.calendar),
                    };
                expanded.push(base);
            }
        }
        return res.json({ events: expanded });
    }

    const events = list.map((e) => {
        const base = sanitizeEvent(e, catMap);
        base.sourceCalendar = base.calendar;
        base.visibleInCalendar = String(cal._id);
        const myPl = (e.placements || []).find((p) => String(p.user) === uid);
        if (myPl) base.placementForViewer = { calendar: String(myPl.calendar) };
        return base;
    });
    return res.json({ events });
}

/* READ */
export async function getEvent(req, res) {
    const e = req.event;
    const cal = await Calendar.findById(e.calendar).lean();
    const uid = req.user.id;

    const isOwner = String(e.owner) === uid;
    const canSeeCal =
        cal &&
        (String(cal.owner) === uid ||
            (Array.isArray(cal.members) &&
                cal.members.some((m) => String(m.user || m) === uid)));
    const isParticipant =
        Array.isArray(e.participants) &&
        e.participants.some((p) => String(p) === uid);

    if (!isOwner && !canSeeCal && !isParticipant)
        return res.status(403).json({ error: 'forbidden' });

    const cat = e.category ? await Category.findById(e.category).lean() : null;
    const catMap = cat
        ? new Map([
              [
                  String(cat._id),
                  {
                      id: String(cat._id),
                      title: cat.title,
                      color: cat.color,
                      isDefault: cat.user === null,
                  },
              ],
          ])
        : null;
    return res.json({ event: sanitizeEvent(e, catMap) });
}

/* UPDATE */
export async function updateEvent(req, res) {
    const e = req.event;
    const uid = req.user.id;
    const cal = await Calendar.findById(e.calendar).lean();
    const canEdit =
        String(e.owner) === uid || (cal && String(cal.owner) === uid);
    if (!canEdit) return res.status(403).json({ error: 'forbidden' });

    let { title, description, start, end, categoryId, recurrence } =
        req.body || {};
    const patch = {};

    if (typeof title !== 'undefined') {
        const t = String(title || '').trim();
        if (!t) return res.status(400).json({ error: 'title cannot be empty' });
        patch.title = t;
    }
    if (typeof description !== 'undefined')
        patch.description = String(description || '').trim();
    if (typeof start !== 'undefined') patch.start = parseISO(start);
    if (typeof end !== 'undefined') patch.end = parseISO(end);
    if (patch.start && patch.end && patch.end < patch.start) {
        return res.status(400).json({ error: 'end must be after start' });
    }

    if (typeof categoryId !== 'undefined') {
        if (!mongoose.isValidObjectId(categoryId))
            return res.status(400).json({ error: 'invalid categoryId' });
        const cat = await Category.findById(categoryId).lean();
        if (!cat) return res.status(400).json({ error: 'category not found' });
        if (cat.user && String(cat.user) !== uid)
            return res
                .status(403)
                .json({ error: "cannot use someone else's custom category" });
        patch.category = categoryId;
    }

    if (typeof recurrence !== 'undefined') {
        if (recurrence && recurrence.rrule) {
            try {
                RRule.fromString(recurrence.rrule);
            } catch {
                return res.status(400).json({ error: 'invalid RRULE' });
            }
            patch.recurrence = {
                rrule: String(recurrence.rrule),
                timezone: recurrence.timezone || undefined,
                until: recurrence.until
                    ? parseISO(recurrence.until)
                    : undefined,
            };
        } else {
            patch.recurrence = undefined;
        }
    }

    const updated = await Event.findByIdAndUpdate(e._id, patch, {
        new: true,
        runValidators: true,
    });
    return res.json({ event: sanitizeEvent(updated) });
}

/* DELETE (with cascade) */
export async function deleteEvent(req, res) {
    const e = req.event;
    const uid = req.user.id;
    const cal = await Calendar.findById(e.calendar).lean();
    const canDelete =
        String(e.owner) === uid || (cal && String(cal.owner) === uid);
    if (!canDelete) return res.status(403).json({ error: 'forbidden' });

    // каскад: чистим инвайты события
    await EventInvitation.deleteMany({ event: e._id });

    // само событие
    await Event.deleteOne({ _id: e._id });

    return res.json({ ok: true });
}

/* PARTICIPANTS & PLACEMENTS */
export async function listParticipants(req, res) {
    const ev = req.event;
    const uid = req.user.id;

    const cal = await Calendar.findById(ev.calendar).lean();
    if (!cal) {
        return res.status(404).json({ error: 'calendar not found' });
    }

    const isOwner = String(ev.owner) === uid;
    const isCalOwner = String(cal.owner) === uid;
    const isParticipant = (ev.participants || []).some(
        (p) => String(p) === uid
    );

    if (!isOwner && !isCalOwner && !isParticipant) {
        return res.status(403).json({ error: 'forbidden' });
    }

    const canManageFlag = canManage(ev, uid, cal); // ← кто может редактировать/удалять

    const ids = [String(ev.owner), ...ev.participants.map(String)];
    const users = await User.find({ _id: { $in: ids } })
        .select({ _id: 1, email: 1, name: 1 })
        .lean();

    const placementsByUser = new Map(
        (ev.placements || []).map((p) => [String(p.user), String(p.calendar)])
    );

    const out = users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        isOwner: String(u._id) === String(ev.owner),
        placementCalendar: placementsByUser.get(String(u._id)) || null,
    }));

    return res.json({
        participants: out,
        canManage: canManageFlag,
    });
}

/** Добавить участника (owner/owner-calendar) */
export async function addParticipant(req, res) {
    const ev = req.event;
    const uid = req.user.id;
    const { userId, calendarId } = req.body || {};

    const cal = await Calendar.findById(ev.calendar).lean();
    if (!canManage(ev, uid, cal))
        return res.status(403).json({ error: 'forbidden' });

    if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ error: 'invalid userId' });
    }
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'user not found' });

    const isAlready = (ev.participants || []).some(
        (p) => String(p) === String(userId)
    );
    if (!isAlready) {
        await Event.updateOne(
            { _id: ev._id },
            { $addToSet: { participants: userId } }
        );
    }

    if (calendarId) {
        if (!mongoose.isValidObjectId(calendarId)) {
            return res.status(400).json({ error: 'invalid calendarId' });
        }
        const calTarget = await Calendar.findById(calendarId).lean();
        if (!calTarget)
            return res.status(404).json({ error: 'calendar not found' });

        const targetOwner = String(calTarget.owner) === String(userId);
        const targetMember =
            Array.isArray(calTarget.members) &&
            calTarget.members.some(
                (m) => String(m.user || m) === String(userId)
            );
        if (!targetOwner && !targetMember) {
            return res
                .status(403)
                .json({ error: 'user has no access to target calendar' });
        }

        await Event.updateOne(
            { _id: ev._id, 'placements.user': { $ne: userId } },
            {
                $addToSet: {
                    placements: { user: userId, calendar: calendarId },
                },
            }
        );
        await Event.updateOne(
            { _id: ev._id, 'placements.user': userId },
            { $set: { 'placements.$.calendar': calendarId } }
        );
    }

    const fresh = await Event.findById(ev._id).lean();
    return res.json({ event: { id: String(fresh._id) }, ok: true });
}

export async function removeParticipant(req, res) {
    const ev = req.event;
    const uid = req.user.id;
    const { userId } = req.params;

    const cal = await Calendar.findById(ev.calendar).lean();
    if (!canManage(ev, uid, cal))
        return res.status(403).json({ error: 'forbidden' });

    if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ error: 'invalid userId' });
    }
    if (String(userId) === String(ev.owner)) {
        return res.status(400).json({ error: 'cannot remove event owner' });
    }

    await Event.updateOne(
        { _id: ev._id },
        {
            $pull: {
                participants: new mongoose.Types.ObjectId(userId),
                placements: { user: new mongoose.Types.ObjectId(userId) },
            },
        }
    );

    return res.json({ ok: true });
}

/** Участник: выбрать свой календарь для размещения */
export async function setMyPlacement(req, res) {
    const ev = req.event;
    const uid = req.user.id;
    const { calendarId } = req.body || {};

    const amParticipant =
        String(ev.owner) === uid ||
        (ev.participants || []).some((p) => String(p) === uid);
    if (!amParticipant) return res.status(403).json({ error: 'forbidden' });

    if (!mongoose.isValidObjectId(calendarId)) {
        return res.status(400).json({ error: 'invalid calendarId' });
    }
    const cal = await Calendar.findById(calendarId).lean();
    if (!cal) return res.status(404).json({ error: 'calendar not found' });

    const iOwn = String(cal.owner) === uid;
    const iMember =
        Array.isArray(cal.members) &&
        cal.members.some((m) => String(m.user || m) === uid);
    if (!iOwn && !iMember)
        return res.status(403).json({ error: 'no access to this calendar' });

    await Event.updateOne(
        { _id: ev._id, 'placements.user': { $ne: uid } },
        { $addToSet: { placements: { user: uid, calendar: calendarId } } }
    );
    await Event.updateOne(
        { _id: ev._id, 'placements.user': uid },
        { $set: { 'placements.$.calendar': calendarId } }
    );

    return res.json({ ok: true });
}

/** Участник: покинуть событие */
export async function leaveEvent(req, res) {
    const ev = req.event;
    const uid = req.user.id;

    if (String(ev.owner) === uid) {
        return res.status(400).json({ error: 'owner cannot leave own event' });
    }

    await Event.updateOne(
        { _id: ev._id },
        {
            $pull: {
                participants: new mongoose.Types.ObjectId(uid),
                placements: { user: new mongoose.Types.ObjectId(uid) },
            },
        }
    );

    return res.json({ ok: true });
}

/* === INVITES BY EMAIL (EVENT) === */
export async function inviteByEmail(req, res) {
    try {
        const ev = req.event;
        const uid = req.user.id;
        const cal = await Calendar.findById(ev.calendar).lean();
        if (!canManage(ev, uid, cal)) {
            return res.status(403).json({ error: 'forbidden' });
        }

        let { email } = req.body || {};
        if (!email) {
            return res.status(400).json({ error: 'email-required' });
        }

        const raw = String(email).trim();
        if (!raw) {
            return res.status(400).json({ error: 'email-required' });
        }

        const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

        let targetEmail = raw.toLowerCase();
        let mode = 'email';
        let targetUser = null;

        // 🔹 если это НЕ email — считаем, что это ник / имя
        if (!emailRe.test(targetEmail)) {
            const lookup = raw.toLowerCase();

            targetUser = await User.findOne({
                $or: [
                    { email: lookup }, // вдруг ввели именно email, но без регистра
                    { name: raw }, // точное совпадение name
                    // если у тебя есть username, раскомментируй:
                    // { username: raw },
                ],
            }).lean();

            if (!targetUser) {
                return res.status(404).json({ error: 'user-not-found' });
            }

            // берём настоящий email из юзера
            targetEmail = String(targetUser.email || '').toLowerCase();
            if (!targetEmail) {
                return res.status(400).json({ error: 'user-has-no-email' });
            }

            mode = 'user';
        }

        // 🔹 тут ВСЕГДА создаём e-mail-инвайт (и отправляем письмо)
        const inv = await createEventInvite({
            eventId: ev._id.toString(),
            inviterId: uid,
            email: targetEmail,
        });

        return res.json({
            ok: true,
            mode, // 'email' или 'user'
            user: targetUser
                ? {
                      id: targetUser._id.toString(),
                      email: targetUser.email,
                      name: targetUser.name,
                  }
                : null,
            invite: {
                id: inv._id.toString(),
                email: inv.email,
                status: inv.status,
                expiresAt: inv.expiresAt,
            },
        });
    } catch (err) {
        console.error('inviteByEmail error:', err);
        return res.status(500).json({ error: 'failed-to-send-invite' });
    }
}

export async function listEventInvites(req, res) {
    const ev = req.event;
    const uid = req.user.id;
    const cal = await Calendar.findById(ev.calendar).lean();
    if (!canManage(ev, uid, cal))
        return res.status(403).json({ error: 'forbidden' });

    const list = await EventInvitation.find({ event: ev._id })
        .sort({ createdAt: -1 })
        .lean();
    return res.json({
        invites: list.map((i) => ({
            id: String(i._id),
            email: i.email,
            status: i.status,
            createdAt: i.createdAt,
            expiresAt: i.expiresAt,
            acceptedAt: i.acceptedAt,
        })),
    });
}

export async function resendEventInvite(req, res) {
    const ev = req.event;
    const uid = req.user.id;
    const cal = await Calendar.findById(ev.calendar).lean();
    if (!canManage(ev, uid, cal))
        return res.status(403).json({ error: 'forbidden' });

    const { inviteId } = req.params;
    const inv = await resendEvtInv(inviteId);
    return res.json({
        ok: true,
        invite: { id: String(inv._id), status: inv.status },
    });
}

export async function revokeEventInvite(req, res) {
    const ev = req.event;
    const uid = req.user.id;
    const cal = await Calendar.findById(ev.calendar).lean();
    if (!canManage(ev, uid, cal))
        return res.status(403).json({ error: 'forbidden' });

    const { inviteId } = req.params;
    const inv = await revokeEvtInv(inviteId);
    return res.json({
        ok: true,
        invite: { id: String(inv._id), status: inv.status },
    });
}
