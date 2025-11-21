import mongoose from 'mongoose';
import Calendar from '../models/Calendar.js';
import User from '../models/User.js';
import Invitation from '../models/Invitation.js';
import Event from '../models/Event.js';
import EventInvitation from '../models/EventInvitation.js';
import {
    createInvite,
    resendInvite,
    revokeInvite,
} from '../services/invite.service.js';

const ObjectId = (v) => new mongoose.Types.ObjectId(v);

// ----- helpers -----
function rolesMapFrom(cal) {
    return cal.memberRoles instanceof Map
        ? cal.memberRoles
        : new Map(Object.entries(cal.memberRoles || {}));
}

function notifyMapFrom(cal) {
    return cal.notifyActive instanceof Map
        ? cal.notifyActive
        : new Map(Object.entries(cal.notifyActive || {}));
}

function getRole(cal, uidStr) {
    if (cal.owner?.toString() === uidStr) return 'owner';
    const rolesMap = rolesMapFrom(cal);
    if (rolesMap.get(uidStr) === 'editor') return 'editor';
    if ((cal.members || []).some((m) => m.toString() === uidStr))
        return 'member';
    return 'none';
}

function isActiveForUser(cal, uidStr) {
    const nmap = notifyMapFrom(cal);
    if (nmap.has(uidStr)) return !!nmap.get(uidStr);
    if (cal.owner?.toString() === uidStr) return true;
    if ((cal.members || []).some((m) => m.toString() === uidStr)) return true;
    return false;
}

function toCalendarResponse(cal, currentUserId) {
    const uidStr = String(currentUserId);
    const rolesMap = rolesMapFrom(cal);

    const membersDetailed = (cal.members || []).map((u) => {
        const id = u.toString();
        return {
            user: id,
            role: rolesMap.get(id) === 'editor' ? 'editor' : 'member',
        };
    });

    return {
        id: cal._id.toString(),
        name: cal.name,
        color: cal.color,
        description: cal.description,
        owner: cal.owner?.toString(),
        members: (cal.members || []).map((m) => m.toString()),
        isMain: !!cal.isMain,
        isSystem: !!cal.isSystem,
        systemType: cal.systemType,
        countryCode: cal.countryCode,
        createdAt: cal.createdAt,
        updatedAt: cal.updatedAt,
        _membersDetailed: membersDetailed,
        role: getRole(cal, uidStr),
        membersCount: 1 + (cal.members?.length || 0),
        active: isActiveForUser(cal, uidStr),
    };
}

function assertMutableCalendar(cal) {
    if (cal.isSystem) {
        const code = 'system-calendar-immutable';
        const err = new Error(code);
        err.code = code;
        throw err;
    }
}

// ===== CRUD =====
export async function listMyCalendars(req, res) {
    const uid = req.user.id;
    const calendars = await Calendar.find({
        $or: [{ owner: uid }, { members: uid }],
    }).lean();

    const dto = calendars.map((c) => toCalendarResponse(c, uid));
    return res.json({ calendars: dto });
}

export async function createCalendar(req, res) {
    try {
        const uid = req.user.id;
        const { name, color, description } = req.body || {};
        if (!name || !String(name).trim()) {
            return res.status(400).json({ error: 'name-required' });
        }

        const cal = await Calendar.create({
            name: String(name).trim(),
            color: color || '#151726',
            description: description?.trim() || undefined,
            owner: uid,
            members: [],
            memberRoles: {},
            notifyActive: { [uid]: true },
            isMain: false,
            isSystem: false,
        });

        return res.json({ calendar: toCalendarResponse(cal, uid) });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({ error: 'duplicate-name' });
        }
        console.error('createCalendar.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function getCalendar(req, res) {
    const uid = req.user.id;
    const cal = req.calendar;
    return res.json({ calendar: toCalendarResponse(cal, uid) });
}

export async function updateCalendar(req, res) {
    try {
        const uid = req.user.id;
        const cal = req.calendar;
        assertMutableCalendar(cal);

        const { name, color, description } = req.body || {};
        const patch = {};
        if (typeof name !== 'undefined') patch.name = String(name).trim();
        if (typeof color !== 'undefined') patch.color = color;
        if (typeof description !== 'undefined')
            patch.description = description?.trim() || undefined;

        const updated = await Calendar.findByIdAndUpdate(cal._id, patch, {
            new: true,
        });
        return res.json({ calendar: toCalendarResponse(updated, uid) });
    } catch (err) {
        if (err?.code === 'system-calendar-immutable') {
            return res.status(400).json({ error: 'system-calendar-immutable' });
        }
        if (err?.code === 11000) {
            return res.status(409).json({ error: 'duplicate-name' });
        }
        console.error('updateCalendar.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function deleteCalendar(req, res) {
    try {
        const cal = req.calendar;
        if (cal.isMain) {
            return res.status(400).json({ error: 'main-calendar-immutable' });
        }
        assertMutableCalendar(cal);

        // каскад: удалить все события этого календаря + их инвайты
        const evIds = (
            await Event.find({ calendar: cal._id }).select({ _id: 1 }).lean()
        ).map((e) => e._id);

        if (evIds.length) {
            await EventInvitation.deleteMany({ event: { $in: evIds } });
            await Event.deleteMany({ _id: { $in: evIds } });
        }

        // каскад: удалить инвайты на сам календарь
        await Invitation.deleteMany({ calendar: cal._id });

        // зачистить placements с этим календарём у чужих событий
        await Event.updateMany(
            { 'placements.calendar': cal._id },
            { $pull: { placements: { calendar: cal._id } } }
        );

        // сам календарь
        await Calendar.deleteOne({ _id: cal._id });

        return res.json({ ok: true });
    } catch (err) {
        if (err?.code === 'system-calendar-immutable') {
            return res.status(400).json({ error: 'system-calendar-immutable' });
        }
        console.error('deleteCalendar.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

// ===== Sharing & Members =====
export async function shareCalendar(req, res) {
    try {
        const uid = req.user.id;
        const cal = req.calendar;
        assertMutableCalendar(cal);

        let { email, role } = req.body || {};
        if (!email) return res.status(400).json({ error: 'email-required' });

        email = String(email).trim().toLowerCase();
        role = role === 'editor' ? 'editor' : 'member';

        // заборонити self-invite
        const inviter = await User.findById(uid).lean();
        if (inviter?.email?.toLowerCase() === email) {
            return res.status(400).json({ error: 'cannot-invite-yourself' });
        }

        // якщо юзер існує і вже має доступ — не дублюємо
        const existingUser = await User.findOne({ email }).lean();
        if (existingUser) {
            const uId = existingUser._id.toString();
            const already =
                cal.owner?.toString() === uId ||
                (Array.isArray(cal.members) &&
                    cal.members.some((m) => String(m) === uId));
            if (already) {
                return res.status(409).json({ error: 'already-member' });
            }
        }

        // якщо pending-інвайт уже є — повернемо його
        const pending = await Invitation.findOne({
            calendar: cal._id,
            email,
            status: 'pending',
        }).lean();
        if (pending) {
            return res.json({
                invitation: {
                    id: String(pending._id),
                    email: pending.email,
                    role: pending.role,
                    status: pending.status,
                    expiresAt: pending.expiresAt,
                },
                calendar: toCalendarResponse(cal, uid),
                alreadyInvited: true,
            });
        }

        const inv = await createInvite({
            calendarId: cal._id.toString(),
            inviterId: uid,
            email,
            role,
        });

        const fresh = await Calendar.findById(cal._id);
        return res.json({
            calendar: toCalendarResponse(fresh, uid),
            invitation: {
                id: String(inv._id),
                email: inv.email,
                role: inv.role,
                status: inv.status,
                expiresAt: inv.expiresAt,
            },
            sent: true,
        });
    } catch (err) {
        if (err?.code === 'system-calendar-immutable') {
            return res.status(400).json({ error: 'system-calendar-immutable' });
        }
        console.error('shareCalendar.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function listMembers(req, res) {
    const cal = req.calendar;
    const owner = await User.findById(cal.owner).lean();

    const members = await User.find({ _id: { $in: cal.members || [] } }).lean();
    const rolesMap = rolesMapFrom(cal);

    const ownerDto = {
        id: owner._id.toString(),
        email: owner.email,
        name: owner.name,
        role: 'owner',
    };

    const membersDto = members.map((m) => {
        const id = m._id.toString();
        const role = rolesMap.get(id) === 'editor' ? 'editor' : 'member';
        return { id, email: m.email, name: m.name, role };
    });

    return res.json({ owner: ownerDto, members: membersDto });
}

export async function updateMemberRole(req, res) {
    try {
        const uid = req.user.id;
        const cal = req.calendar;
        assertMutableCalendar(cal);

        const { userId } = req.params;
        let { role } = req.body || {};
        role = role === 'editor' ? 'editor' : 'member';

        if (cal.owner.toString() === userId) {
            return res.status(400).json({ error: 'cannot-change-owner-role' });
        }

        const set = {};
        set[`memberRoles.${userId}`] = role;

        const updated = await Calendar.findByIdAndUpdate(
            cal._id,
            { $addToSet: { members: ObjectId(userId) }, $set: set },
            { new: true }
        );

        return res.json({ calendar: toCalendarResponse(updated, uid) });
    } catch (err) {
        if (err?.code === 'system-calendar-immutable') {
            return res.status(400).json({ error: 'system-calendar-immutable' });
        }
        console.error('updateMemberRole.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function removeMember(req, res) {
    try {
        const uid = req.user.id;
        const cal = req.calendar;
        assertMutableCalendar(cal);

        const { userId } = req.params;
        if (cal.owner.toString() === userId) {
            return res.status(400).json({ error: 'cannot-remove-owner' });
        }

        const unset = {};
        unset[`memberRoles.${userId}`] = 1;
        unset[`notifyActive.${userId}`] = 1;

        const updated = await Calendar.findByIdAndUpdate(
            cal._id,
            { $pull: { members: ObjectId(userId) }, $unset: unset },
            { new: true }
        );

        return res.json({ calendar: toCalendarResponse(updated, uid) });
    } catch (err) {
        if (err?.code === 'system-calendar-immutable') {
            return res.status(400).json({ error: 'system-calendar-immutable' });
        }
        console.error('removeMember.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function leaveCalendar(req, res) {
    try {
        const uid = req.user.id;
        const cal = req.calendar;

        if (cal.owner.toString() === uid) {
            return res.status(400).json({ error: 'owner-cannot-leave' });
        }
        if (cal.isSystem) {
            return res.status(400).json({ error: 'system-calendar-immutable' });
        }

        const unset = {};
        unset[`memberRoles.${uid}`] = 1;
        unset[`notifyActive.${uid}`] = 1;

        const updated = await Calendar.findByIdAndUpdate(
            cal._id,
            { $pull: { members: ObjectId(uid) }, $unset: unset },
            { new: true }
        );

        return res.json({ calendar: toCalendarResponse(updated, uid) });
    } catch (err) {
        console.error('leaveCalendar.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

// ===== Invites (owner-only в роутере) =====
export async function listCalendarInvites(req, res) {
    const uid = req.user.id;
    const cal = req.calendar;
    const invites = await Invitation.find({ calendar: cal._id })
        .sort({ createdAt: -1 })
        .lean();

    const dto = invites.map((i) => ({
        id: i._id.toString(),
        email: i.email,
        role: i.role,
        status: i.status,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        acceptedAt: i.acceptedAt,
    }));

    return res.json({ invites: dto, calendar: toCalendarResponse(cal, uid) });
}

export async function resendCalendarInvite(req, res) {
    try {
        const { inviteId } = req.params;
        const cal = req.calendar;
        await resendInvite(cal._id.toString(), inviteId);
        const inv = await Invitation.findById(inviteId).lean();
        return res.json({
            ok: true,
            invite: { id: inv._id.toString(), status: inv.status },
        });
    } catch (err) {
        console.error('resendCalendarInvite.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function revokeCalendarInvite(req, res) {
    try {
        const { inviteId } = req.params;
        const cal = req.calendar;
        await revokeInvite(cal._id.toString(), inviteId);
        const inv = await Invitation.findById(inviteId).lean();
        return res.json({
            ok: true,
            invite: { id: inv._id.toString(), status: inv.status },
        });
    } catch (err) {
        console.error('revokeCalendarInvite.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function getCalendarStatus(req, res) {
    const uid = req.user.id;
    const cal = req.calendar;
    return res.json({ active: isActiveForUser(cal, String(uid)) });
}

export async function setCalendarStatus(req, res) {
    try {
        const uid = String(req.user.id);
        const cal = req.calendar;

        let { active } = req.body || {};
        const next = active === true || active === 'true';

        const set = {};
        set[`notifyActive.${uid}`] = next;

        const updated = await Calendar.findByIdAndUpdate(
            cal._id,
            { $set: set },
            { new: true }
        );

        return res.json({ active: isActiveForUser(updated, uid) });
    } catch (err) {
        console.error('setCalendarStatus.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}
