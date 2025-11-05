// chronos-backend/src/controllers/calendar.controller.js
import mongoose from "mongoose";
import Calendar from "../models/Calendar.js";
import User from "../models/User.js";
import Invitation from "../models/Invitation.js";
import {
  createInvite,
  resendInvite,
  revokeInvite,
} from "../services/invite.service.js";

const ObjectId = (v) => new mongoose.Types.ObjectId(v);

// Определяем роль текущего пользователя внутри календаря
function getRole(cal, uidStr) {
  if (cal.owner?.toString() === uidStr) return "owner";
  const rolesMap = cal.memberRoles instanceof Map ? cal.memberRoles : new Map(Object.entries(cal.memberRoles || {}));
  if (rolesMap.get(uidStr) === "editor") return "editor";
  if (cal.members?.some((m) => m.toString() === uidStr)) return "member";
  return "none";
}

// Приведение календаря к удобному ответу
function toCalendarResponse(cal, currentUserId) {
  const uidStr = String(currentUserId);
  const rolesMap = cal.memberRoles instanceof Map ? cal.memberRoles : new Map(Object.entries(cal.memberRoles || {}));

  const membersDetailed = (cal.members || []).map((u) => {
    const id = u.toString();
    return { user: id, role: rolesMap.get(id) === "editor" ? "editor" : "member" };
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
  };
}

function assertMutableCalendar(cal) {
  if (cal.isSystem) {
    const code = "system-calendar-immutable";
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
      return res.status(400).json({ error: "name-required" });
    }

    const cal = await Calendar.create({
      name: String(name).trim(),
      color: color || "#3b82f6",
      description: description?.trim() || undefined,
      owner: uid,
      members: [],
      memberRoles: {},
      isMain: false,
      isSystem: false,
    });

    return res.json({ calendar: toCalendarResponse(cal, uid) });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "duplicate-name" });
    }
    console.error("createCalendar.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function getCalendar(req, res) {
  const uid = req.user.id;
  const cal = req.calendar; // загружен в loadCalendar
  return res.json({ calendar: toCalendarResponse(cal, uid) });
}

export async function updateCalendar(req, res) {
  try {
    const uid = req.user.id;
    const cal = req.calendar;
    assertMutableCalendar(cal);

    const { name, color, description } = req.body || {};
    const patch = {};
    if (typeof name !== "undefined") patch.name = String(name).trim();
    if (typeof color !== "undefined") patch.color = color;
    if (typeof description !== "undefined") patch.description = description?.trim() || undefined;

    const updated = await Calendar.findByIdAndUpdate(cal._id, patch, { new: true });
    return res.json({ calendar: toCalendarResponse(updated, uid) });
  } catch (err) {
    if (err?.code === "system-calendar-immutable") {
      return res.status(400).json({ error: "system-calendar-immutable" });
    }
    if (err?.code === 11000) {
      return res.status(409).json({ error: "duplicate-name" });
    }
    console.error("updateCalendar.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function deleteCalendar(req, res) {
  try {
    const cal = req.calendar;
    if (cal.isMain) {
      return res.status(400).json({ error: "main-calendar-immutable" });
    }
    assertMutableCalendar(cal);

    await Calendar.deleteOne({ _id: cal._id });
    return res.json({ ok: true });
  } catch (err) {
    if (err?.code === "system-calendar-immutable") {
      return res.status(400).json({ error: "system-calendar-immutable" });
    }
    console.error("deleteCalendar.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

// ===== Sharing & Members =====

export async function shareCalendar(req, res) {
  try {
    const uid = req.user.id;
    const cal = req.calendar;
    assertMutableCalendar(cal);

    let { email, role } = req.body || {};
    if (!email) return res.status(400).json({ error: "email-required" });

    email = String(email).trim().toLowerCase();
    role = (role === "editor" ? "editor" : "member");

    const user = await User.findOne({ email }).lean();

    if (user) {
      // Добавляем в members и выдаём роль
      const uId = user._id.toString();
      const update = { $addToSet: { members: ObjectId(uId) } };
      const set = {};
      set[`memberRoles.${uId}`] = role;
      update.$set = set;

      const updated = await Calendar.findByIdAndUpdate(cal._id, update, { new: true });
      return res.json({ calendar: toCalendarResponse(updated, uid) });
    }

    // Пользователь не зарегистрирован — создаём инвайт
    const inv = await createInvite({
      calendarId: cal._id.toString(),
      inviterId: uid,
      email,
      role,
    });

    // Текущий календарь без изменений
    const fresh = await Calendar.findById(cal._id);
    return res.json({
      calendar: toCalendarResponse(fresh, uid),
      invitation: {
        id: inv._id.toString(),
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
      },
    });
  } catch (err) {
    if (err?.code === "system-calendar-immutable") {
      return res.status(400).json({ error: "system-calendar-immutable" });
    }
    console.error("shareCalendar.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function listMembers(req, res) {
  const cal = req.calendar;
  const owner = await User.findById(cal.owner).lean();

  const members = await User.find({ _id: { $in: cal.members || [] } }).lean();
  const rolesMap = cal.memberRoles instanceof Map ? cal.memberRoles : new Map(Object.entries(cal.memberRoles || {}));

  const ownerDto = {
    id: owner._id.toString(),
    email: owner.email,
    name: owner.name,
    role: "owner",
  };

  const membersDto = members.map((m) => {
    const id = m._id.toString();
    const role = rolesMap.get(id) === "editor" ? "editor" : "member";
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
    role = (role === "editor" ? "editor" : "member");

    if (cal.owner.toString() === userId) {
      return res.status(400).json({ error: "cannot-change-owner-role" });
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
    if (err?.code === "system-calendar-immutable") {
      return res.status(400).json({ error: "system-calendar-immutable" });
    }
    console.error("updateMemberRole.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function removeMember(req, res) {
  try {
    const uid = req.user.id;
    const cal = req.calendar;
    assertMutableCalendar(cal);

    const { userId } = req.params;
    if (cal.owner.toString() === userId) {
      return res.status(400).json({ error: "cannot-remove-owner" });
    }

    const unset = {};
    unset[`memberRoles.${userId}`] = 1;

    const updated = await Calendar.findByIdAndUpdate(
      cal._id,
      { $pull: { members: ObjectId(userId) }, $unset: unset },
      { new: true }
    );

    return res.json({ calendar: toCalendarResponse(updated, uid) });
  } catch (err) {
    if (err?.code === "system-calendar-immutable") {
      return res.status(400).json({ error: "system-calendar-immutable" });
    }
    console.error("removeMember.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function leaveCalendar(req, res) {
  try {
    const uid = req.user.id;
    const cal = req.calendar;

    if (cal.owner.toString() === uid) {
      return res.status(400).json({ error: "owner-cannot-leave" });
    }
    // Системные календарей не покидаем (они принадлежат пользователю и без members)
    if (cal.isSystem) {
      return res.status(400).json({ error: "system-calendar-immutable" });
    }

    const unset = {};
    unset[`memberRoles.${uid}`] = 1;

    const updated = await Calendar.findByIdAndUpdate(
      cal._id,
      { $pull: { members: ObjectId(uid) }, $unset: unset },
      { new: true }
    );

    return res.json({ calendar: toCalendarResponse(updated, uid) });
  } catch (err) {
    console.error("leaveCalendar.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

// ===== Invites (owner-only в роутере) =====

export async function listCalendarInvites(req, res) {
  const uid = req.user.id;
  const cal = req.calendar;
  const invites = await Invitation.find({ calendar: cal._id }).sort({ createdAt: -1 }).lean();

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
    return res.json({ ok: true, invite: { id: inv._id.toString(), status: inv.status } });
  } catch (err) {
    console.error("resendCalendarInvite.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function revokeCalendarInvite(req, res) {
  try {
    const { inviteId } = req.params;
    const cal = req.calendar;
    await revokeInvite(cal._id.toString(), inviteId);
    const inv = await Invitation.findById(inviteId).lean();
    return res.json({ ok: true, invite: { id: inv._id.toString(), status: inv.status } });
  } catch (err) {
    console.error("revokeCalendarInvite.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}