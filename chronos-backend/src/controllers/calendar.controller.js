import mongoose from "mongoose";
import Calendar from "../models/Calendar.js";
import User from "../models/User.js";
import Invitation from "../models/Invitation.js";
import { createInvite } from "../services/invite.service.js";

/* helpers */

function normalizeMembersArray(members) {
  const arr = members || [];
  return arr.map((m) => {
    if (m && typeof m === "object" && m.user) {
      return { user: String(m.user), role: m.role || "member" };
    }
    return { user: String(m), role: "member" };
  });
}

function findMemberRole(cal, uid) {
  if (String(cal.owner) === String(uid)) return "owner";
  const mem = normalizeMembersArray(cal.members).find((m) => m.user === String(uid));
  return mem ? mem.role : "none";
}

function sanitizeCalendar(doc) {
  if (!doc) return doc;
  const {
    _id, name, color, description, owner, members, isMain, isSystem, createdAt, updatedAt,
  } = doc.toObject ? doc.toObject() : doc;
  const mems = normalizeMembersArray(members);
  return {
    id: String(_id),
    name,
    color,
    description,
    owner: String(owner),
    members: mems.map((m) => m.user), // для обратной совместимости
    isMain,
    isSystem,
    createdAt,
    updatedAt,
    _membersDetailed: mems,          // детально (id+role)
  };
}

function presentCalendar(doc, viewerId) {
  const base = sanitizeCalendar(doc);
  const role = findMemberRole(doc, viewerId);
  const membersCount = base._membersDetailed.length + 1; // + owner
  return { ...base, role, membersCount };
}

/* CRUD */

export async function listMyCalendars(req, res) {
  const uid = req.user.id;

  // ВАЖНО: без { members: uid } (оно ломает каст при subdocs)
  const list = await Calendar.find({
    $or: [{ owner: uid }, { "members.user": uid }],
  })
    .sort({ createdAt: 1 })
    .lean();

  return res.json({ calendars: list.map((c) => presentCalendar(c, uid)) });
}

export async function createCalendar(req, res) {
  const uid = req.user.id;
  let { name, color, description } = req.body || {};
  name = String(name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  if (color) color = String(color).trim();

  try {
    const created = await Calendar.create({
      name,
      color,
      description,
      owner: uid,
      isMain: false,
      isSystem: false,
      members: [],
    });
    return res.status(201).json({ calendar: presentCalendar(created, uid) });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: "calendar with this name already exists for owner" });
    }
    return res.status(500).json({ error: "failed to create calendar" });
  }
}

export async function getCalendar(req, res) {
  return res.json({ calendar: presentCalendar(req.calendar, req.user.id) });
}

export async function updateCalendar(req, res) {
  const cal = req.calendar;
  if (cal.isSystem) return res.status(400).json({ error: "system calendar is not editable" });

  let { name, color, description } = req.body || {};
  const patch = {};
  if (typeof name !== "undefined") {
    name = String(name).trim();
    if (!name) return res.status(400).json({ error: "name cannot be empty" });
    patch.name = name;
  }
  if (typeof color !== "undefined") patch.color = String(color || "").trim();
  if (typeof description !== "undefined") patch.description = String(description || "").trim();

  try {
    const updated = await Calendar.findByIdAndUpdate(cal._id, patch, { new: true, runValidators: true });
    return res.json({ calendar: presentCalendar(updated, req.user.id) });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: "calendar with this name already exists for owner" });
    }
    return res.status(500).json({ error: "failed to update calendar" });
  }
}

export async function deleteCalendar(req, res) {
  const cal = req.calendar;
  if (cal.isMain) return res.status(400).json({ error: "cannot delete main calendar" });
  if (cal.isSystem) return res.status(400).json({ error: "cannot delete system calendar" });
  await Calendar.deleteOne({ _id: cal._id });
  return res.json({ ok: true });
}

/* Members & Roles */

export async function shareCalendar(req, res) {
  const cal = req.calendar;
  let { email, role } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ error: "email is required" });

  if (!role) role = "member";
  role = String(role).trim();
  if (!["member", "editor"].includes(role)) {
    return res.status(400).json({ error: "role must be 'member' or 'editor'" });
  }

  // 1) Зарегистрированный пользователь?
  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    if (String(user._id) === String(cal.owner)) {
      return res.status(409).json({ error: "cannot share with the owner" });
    }

    const exists = await Calendar.findOne({
      _id: cal._id,
      "members.user": user._id,
    }).lean();

    if (exists) {
      await Calendar.updateOne(
        { _id: cal._id, "members.user": user._id },
        { $set: { "members.$.role": role } }
      );
    } else {
      await Calendar.updateOne(
        { _id: cal._id },
        { $addToSet: { members: { user: user._id, role } } }
      );
    }

    const updated = await Calendar.findById(cal._id);
    return res.json({ calendar: presentCalendar(updated, req.user.id) });
  }

  // 2) Не зарегистрирован — создаём инвайт
  const inv = await createInvite({
    calendarId: cal._id,
    inviterId: req.user.id,
    email: normalizedEmail,
    role,
  });

  const updated = await Calendar.findById(cal._id);
  return res.status(202).json({
    calendar: presentCalendar(updated, req.user.id),
    invitation: {
      id: String(inv._id),
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
    },
  });
}

export async function listMembers(req, res) {
  const cal = req.calendar;
  const norm = normalizeMembersArray(cal.members);
  const ids = [String(cal.owner), ...norm.map((m) => m.user)].map((x) => new mongoose.Types.ObjectId(x));

  const users = await User.find({ _id: { $in: ids } })
    .select({ _id: 1, email: 1, name: 1 })
    .lean();

  const owner = users.find((u) => String(u._id) === String(cal.owner));
  const members = users
    .filter((u) => String(u._id) !== String(cal.owner))
    .map((u) => {
      const roleEntry = norm.find((m) => m.user === String(u._id));
      return {
        id: String(u._id),
        email: u.email,
        name: u.name,
        role: roleEntry?.role || "member",
      };
    });

  return res.json({
    owner: owner ? { id: String(owner._id), email: owner.email, name: owner.name, role: "owner" } : null,
    members,
  });
}

export async function updateMemberRole(req, res) {
  const cal = req.calendar;
  const { userId } = req.params;
  let { role } = req.body || {};

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "invalid userId" });
  }
  role = String(role || "").trim();
  if (!["member", "editor"].includes(role)) {
    return res.status(400).json({ error: "role must be 'member' or 'editor'" });
  }
  if (String(userId) === String(cal.owner)) {
    return res.status(400).json({ error: "cannot change owner role" });
  }

  const upd = await Calendar.updateOne(
    { _id: cal._id, "members.user": userId },
    { $set: { "members.$.role": role } }
  );

  if (upd.matchedCount === 0) {
    return res.status(404).json({ error: "member not found" });
  }

  const updated = await Calendar.findById(cal._id);
  return res.json({ calendar: presentCalendar(updated, req.user.id) });
}

export async function removeMember(req, res) {
  const cal = req.calendar;
  const { userId } = req.params;

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ error: "invalid userId" });
  }
  if (String(userId) === String(cal.owner)) {
    return res.status(400).json({ error: "cannot remove calendar owner" });
  }

  await Calendar.updateOne(
    { _id: cal._id },
    { $pull: { members: { user: new mongoose.Types.ObjectId(userId) } } }
  );

  const updated = await Calendar.findById(cal._id);
  return res.json({ calendar: presentCalendar(updated, req.user.id) });
}

export async function leaveCalendar(req, res) {
  const cal = req.calendar;
  const uid = String(req.user.id);

  if (String(cal.owner) === uid) {
    return res.status(400).json({ error: "owner cannot leave own calendar" });
  }

  const norm = normalizeMembersArray(cal.members);
  const isMember = norm.some((m) => m.user === uid);
  if (!isMember) return res.status(400).json({ error: "not a member of this calendar" });

  await Calendar.updateOne(
    { _id: cal._id },
    { $pull: { members: { user: new mongoose.Types.ObjectId(uid) } } }
  );

  const updated = await Calendar.findById(cal._id);
  return res.json({ calendar: presentCalendar(updated, uid) });
}

/* Invites (owner-only list) */

export async function listCalendarInvites(req, res) {
  const cal = req.calendar;
  const list = await Invitation.find({ calendar: cal._id }).sort({ createdAt: -1 }).lean();
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