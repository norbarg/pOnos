import mongoose from "mongoose";
import Calendar from "../models/Calendar.js";
import User from "../models/User.js";

function sanitizeCalendar(doc) {
  if (!doc) return doc;
  const { _id, name, color, description, owner, members, isMain, isSystem, createdAt, updatedAt } =
    doc.toObject ? doc.toObject() : doc;
  return { id: String(_id), name, color, description, owner: String(owner), members: members?.map(String) ?? [], isMain, isSystem, createdAt, updatedAt };
}

export async function listMyCalendars(req, res) {
  const uid = req.user.id;
  const list = await Calendar.find({
    $or: [{ owner: uid }, { members: uid }],
  })
    .sort({ createdAt: 1 })
    .lean();
  return res.json({ calendars: list.map(sanitizeCalendar) });
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
    });
    return res.status(201).json({ calendar: sanitizeCalendar(created) });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: "calendar with this name already exists for owner" });
    }
    return res.status(500).json({ error: "failed to create calendar" });
  }
}

export async function getCalendar(req, res) {
  return res.json({ calendar: sanitizeCalendar(req.calendar) });
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
    return res.json({ calendar: sanitizeCalendar(updated) });
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

export async function shareCalendar(req, res) {
  const cal = req.calendar;
  const { email } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ error: "email is required" });

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return res.status(404).json({ error: "user not found" });

  if (String(user._id) === String(cal.owner)) {
    return res.status(409).json({ error: "cannot share with the owner" });
  }

  const updated = await Calendar.findByIdAndUpdate(
    cal._id,
    { $addToSet: { members: user._id } },
    { new: true }
  );
  return res.json({ calendar: sanitizeCalendar(updated) });
}

export async function listMembers(req, res) {
  const cal = req.calendar;
  const ids = [cal.owner, ...(cal.members || [])].map((x) => new mongoose.Types.ObjectId(x));
  const users = await User.find({ _id: { $in: ids } })
    .select({ _id: 1, email: 1, name: 1 })
    .lean();

  const owner = users.find((u) => String(u._id) === String(cal.owner));
  const members = users.filter((u) => String(u._id) !== String(cal.owner));
  return res.json({
    owner: owner ? { id: String(owner._id), email: owner.email, name: owner.name } : null,
    members: members.map((u) => ({ id: String(u._id), email: u.email, name: u.name })),
  });
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

  await Calendar.updateOne({ _id: cal._id }, { $pull: { members: userId } });
  const updated = await Calendar.findById(cal._id);
  return res.json({ calendar: sanitizeCalendar(updated) });
}