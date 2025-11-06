// middlewares/eventAcl.middleware.js
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Calendar from '../models/Calendar.js';

export async function loadEvent(req, res, next) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
        return res.status(400).json({ error: 'invalid event id' });
    const ev = await Event.findById(id);
    if (!ev) return res.status(404).json({ error: 'event not found' });
    req.event = ev;
    next();
}

export async function canAccessCalendar(req, res, next) {
    const calId = req.params.calId || req.params.id; // зависит от роута
    if (!mongoose.isValidObjectId(calId))
        return res.status(400).json({ error: 'invalid calendar id' });

    const cal = await Calendar.findById(calId).lean();
    if (!cal) return res.status(404).json({ error: 'calendar not found' });

    const uid = req.user.id;
    const isOwner = String(cal.owner) === uid;
    const isMember =
        Array.isArray(cal.members) &&
        cal.members.some((m) => {
            const userId = m && m.user ? String(m.user) : String(m);
            return userId === uid;
        });

    if (!isOwner && !isMember)
        return res.status(403).json({ error: 'forbidden' });

    req.calendar = cal;
    next();
}

export function canEditEvent(req, res, next) {
    const ev = req.event;
    const uid = req.user.id;
    const isOwner = String(ev.owner) === uid;

    // владелец календаря тоже может редактировать
    const cal = req.calendarLoaded || null; // если до этого грузили
    const isCalOwner = cal ? String(cal.owner) === uid : false;

    if (!isOwner && !isCalOwner)
        return res.status(403).json({ error: 'forbidden' });
    next();
}
