import Calendar from "../models/Calendar.js";

export async function loadCalendar(req, res, next) {
  try {
    const { id } = req.params; // :id из /calendars/:id
    const cal = await Calendar.findById(id);
    if (!cal) return res.status(404).json({ error: "calendar not found" });
    req.calendar = cal;
    next();
  } catch (e) {
    return res.status(400).json({ error: "invalid calendar id" });
  }
}

function isMemberOf(cal, uid) {
  const U = String(uid);
  return (cal.members || []).some((m) => {
    // поддержим оба формата на всякий случай
    if (m && typeof m === "object" && m.user) return String(m.user) === U;
    return String(m) === U; // старый формат [ObjectId]
  });
}

export function canAccessCalendar(req, res, next) {
  const uid = String(req.user.id);
  const cal = req.calendar;
  const isOwner = String(cal.owner) === uid;
  const isMember = isMemberOf(cal, uid);
  if (!isOwner && !isMember) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

export function isCalendarOwner(req, res, next) {
  if (String(req.calendar.owner) !== String(req.user.id)) {
    return res.status(403).json({ error: "owner-only" });
  }
  next();
}

export function isCalendarOwnerOrEditor(req, res, next) {
  const uid = String(req.user.id);
  const cal = req.calendar;

  if (String(cal.owner) === uid) return next();

  const mem = (cal.members || []).find((m) =>
    String(m && m.user ? m.user : m) === uid
  );
  const role = mem && typeof mem === "object" ? mem.role : null;
  if (role === "editor") return next();

  return res.status(403).json({ error: "owner-or-editor-only" });
}