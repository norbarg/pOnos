import rrulePkg from 'rrule';
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Calendar from '../models/Calendar.js';
import User from '../models/User.js';
import EventNotification from '../models/EventNotification.js';
import { sendEventReminderEmail } from './mail.service.js';

const { RRule } = rrulePkg;

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const REMINDERS_ENABLED =
    String(process.env.REMINDERS_ENABLED || 'true') === 'true';
const REMINDERS_INTERVAL_SEC = Number(process.env.REMINDERS_INTERVAL_SEC || 60); // как часто сканим
const SCAN_LEEWAY_SEC = Number(process.env.REMINDERS_LEEWAY_SEC || 5); // небольшой запас окна

function toISO(dt) {
    return new Date(dt).toISOString();
}

// ------ active-logic: дублируем утилиту из контроллера ------
function isActiveForUser(cal, uidStr) {
    const nmap = cal.notifyActive || {};
    if (Object.prototype.hasOwnProperty.call(nmap, uidStr))
        return !!nmap[uidStr];
    if (String(cal.owner) === uidStr) return true;
    if ((cal.members || []).some((m) => String(m) === uidStr)) return true;
    return false;
}

// выбираем какой календарь “считать” для пользователя: placement || базовый
function resolveUserCalendarId(ev, uid) {
    const pl = (ev.placements || []).find(
        (p) => String(p.user) === String(uid)
    );
    return pl ? pl.calendar : ev.calendar;
}

// Собираем получателей с учётом активных календарей
async function recipientsForEventOccurrence(ev, occStart) {
    const ids = new Set([String(ev.owner), ...ev.participants.map(String)]);
    const uidList = Array.from(ids);

    // Карта userId -> calId (placement или базовый)
    const userCalIds = new Map();
    for (const uid of uidList) {
        userCalIds.set(uid, resolveUserCalendarId(ev, uid));
    }

    // Подтянем календари одним батчем
    const calIds = Array.from(
        new Set(Array.from(userCalIds.values()).map(String))
    );
    const calendars = await Calendar.find({ _id: { $in: calIds } })
        .select({ _id: 1, owner: 1, members: 1, notifyActive: 1 })
        .lean();
    const calById = new Map(calendars.map((c) => [String(c._id), c]));

    // Подтянем пользователей (для email)
    const users = await User.find({ _id: { $in: uidList } })
        .select({ _id: 1, email: 1, name: 1 })
        .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const recipients = [];
    for (const uid of uidList) {
        const user = userById.get(uid);
        if (!user || !user.email) continue;
        const calId = String(userCalIds.get(uid));
        const cal = calById.get(calId);
        if (!cal) continue;
        if (!isActiveForUser(cal, uid)) continue; // фильтр по активным

        recipients.push({ uid, email: user.email, calId });
    }
    return recipients;
}

// Идempotентная запись: если уже есть — не шлём повторно
async function shouldSendAndLock({ eventId, occurrenceStart, userId, kind }) {
    const filter = {
        event: new mongoose.Types.ObjectId(eventId),
        occurrenceStart,
        user: new mongoose.Types.ObjectId(userId),
        kind,
    };
    const res = await EventNotification.findOneAndUpdate(
        filter,
        { $setOnInsert: { sentAt: new Date() } },
        { upsert: true, new: false, rawResult: true }
    );
    return !res.lastErrorObject?.updatedExisting; // true => это новая вставка (можно слать)
}

function windowBounds(base, offsetMin, widthSec) {
    const from = new Date(base.getTime() + offsetMin * 60 * 1000);
    const to = new Date(from.getTime() + widthSec * 1000);
    return { from, to };
}

function* makeWindows(now) {
    // окно “start”: сейчас..+interval+leeway
    yield {
        kind: 'start',
        ...windowBounds(now, 0, REMINDERS_INTERVAL_SEC + SCAN_LEEWAY_SEC),
    };
    // окно “за 15 минут”: now+15..+15+interval+leeway
    yield {
        kind: 'before15',
        ...windowBounds(now, 15, REMINDERS_INTERVAL_SEC + SCAN_LEEWAY_SEC),
    };
}

function expandOccurrences(ev, from, to) {
    if (ev.recurrence && ev.recurrence.rrule) {
        try {
            const rule = RRule.fromString(ev.recurrence.rrule);
            const dates = rule.between(from, to, true);
            const dur = new Date(ev.end) - new Date(ev.start) || 0;
            return dates.map((dt) => ({
                start: dt,
                end: new Date(dt.getTime() + dur),
            }));
        } catch {
            return [];
        }
    }
    // нерекуррентное: попадает ли в окно?
    if (ev.start >= from && ev.start < to) {
        return [{ start: ev.start, end: ev.end }];
    }
    return [];
}

async function scanWindowAndNotify({ kind, from, to }) {
    // 1) кандидаты: простые события в окне + все рекуррентные
    const [simple, recurring] = await Promise.all([
        Event.find({ start: { $gte: from, $lt: to } }).lean(),
        Event.find({ 'recurrence.rrule': { $exists: true, $ne: null } }).lean(),
    ]);

    const candidates = [...simple];
    for (const ev of recurring) {
        const occs = expandOccurrences(ev, from, to);
        for (const occ of occs) {
            candidates.push({ ...ev, _occ: occ });
        }
    }

    // 2) группируем по (event, occurrenceStart)
    for (const ev of candidates) {
        const occStart = ev._occ ? ev._occ.start : ev.start;

        // аудитория с учётом активных календарей
        const recips = await recipientsForEventOccurrence(ev, occStart);
        if (!recips.length) continue;

        // подтянуть владельца календаря? (не нужно, уже есть title/время)
        const whenHuman = `${toISO(occStart)} – ${toISO(
            ev._occ ? ev._occ.end : ev.end
        )}`;
        const link = `${APP_URL}/events/${ev._id}?at=${encodeURIComponent(
            occStart.toISOString()
        )}`;

        // 3) по каждому получателю — идемпотентно послать
        for (const r of recips) {
            const ok = await shouldSendAndLock({
                eventId: ev._id,
                occurrenceStart: occStart,
                userId: r.uid,
                kind,
            });
            if (!ok) continue;

            try {
                await sendEventReminderEmail({
                    to: r.email,
                    eventTitle: ev.title,
                    when: whenHuman,
                    kind,
                    link,
                    minutes: kind === 'before15' ? 15 : 0,
                });
            } catch (e) {
                // если SMTP упал — откатим lock, чтобы можно было повторить следующим проходом
                await EventNotification.deleteOne({
                    event: ev._id,
                    occurrenceStart: occStart,
                    user: r.uid,
                    kind,
                }).catch(() => {});
                // и залогируем
                console.error('[reminder] send fail', e?.message || e);
            }
        }
    }
}

let _timer = null;

export function startEventReminderScheduler() {
    if (!REMINDERS_ENABLED) {
        console.log('[reminder] disabled via REMINDERS_ENABLED=false');
        return;
    }
    if (_timer) return;

    const tick = async () => {
        const now = new Date();
        for (const win of makeWindows(now)) {
            try {
                await scanWindowAndNotify(win);
            } catch (e) {
                console.error(
                    '[reminder] scan error',
                    win.kind,
                    e?.message || e
                );
            }
        }
    };

    // первый запуск сразу, затем по интервалу
    tick().catch(() => {});
    _timer = setInterval(
        () => tick().catch(() => {}),
        REMINDERS_INTERVAL_SEC * 1000
    );
    _timer.unref?.();
    console.log(
        `[reminder] scheduler started: every ${REMINDERS_INTERVAL_SEC}s`
    );
}
