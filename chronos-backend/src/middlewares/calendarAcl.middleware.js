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

export function canAccessCalendar(req, res, next) {
  const uid = String(req.user.id);
  const cal = req.calendar;
  const isOwner = String(cal.owner) === uid;
  const isMember = cal.members?.some((m) => String(m) === uid);
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