// chronos-backend/src/services/eventReminder.service.js
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
const REMINDERS_INTERVAL_SEC = Number(process.env.REMINDERS_INTERVAL_SEC || 60);
const SCAN_LEEWAY_SEC = Number(process.env.REMINDERS_LEEWAY_SEC || 5);

function toISO(dt) {
    return new Date(dt).toISOString();
}

function isActiveForUser(cal, uidStr) {
    const nmap = cal.notifyActive || {};

    if (Object.prototype.hasOwnProperty.call(nmap, uidStr)) {
        return !!nmap[uidStr];
    }

    if (String(cal.owner) === uidStr) return true;

    const members = cal.members || [];
    if (
        members.some((m) => {
            if (!m) return false;
            const id = m && typeof m === 'object' && m.user ? m.user : m;
            return String(id) === uidStr;
        })
    ) {
        return true;
    }

    return false;
}

function resolveUserCalendarId(ev, uid) {
    const pl = (ev.placements || []).find(
        (p) => String(p.user) === String(uid)
    );
    return pl ? pl.calendar : ev.calendar;
}

function classifyCategory(catDoc) {
    if (!catDoc) return { type: 'custom' };

    if (catDoc.user) {
        return { type: 'custom' };
    }

    const raw = (
        catDoc.builtInKey ||
        catDoc.key ||
        catDoc.slug ||
        catDoc.title ||
        catDoc.name ||
        ''
    )
        .toString()
        .toLowerCase();

    if (raw.includes('remind')) return { type: 'reminder' };
    if (raw.includes('task')) return { type: 'task' };
    if (raw.includes('arrange')) return { type: 'arrangement' };

    return { type: 'builtin-other' };
}

function shouldSendForCategoryType(catType, kind) {
    switch (catType) {
        case 'reminder':
            return kind === 'start';

        case 'task':
            return kind === 'start' || kind === 'end';

        case 'arrangement':
            return kind === 'before15' || kind === 'start';

        case 'custom':
        case 'builtin-other':
        default:
            return kind === 'start';
    }
}

async function recipientsForEventOccurrence(ev, occStart) {
    const ids = new Set([String(ev.owner), ...ev.participants.map(String)]);

    const baseCal = await Calendar.findById(ev.calendar)
        .select({ _id: 1, owner: 1, members: 1, notifyActive: 1 })
        .lean();

    if (baseCal) {
        const baseUsers = [
            String(baseCal.owner),
            ...(baseCal.members || []).map((m) => {
                const id = m && typeof m === 'object' && m.user ? m.user : m;
                return String(id);
            }),
        ];

        for (const uid of baseUsers) {
            if (isActiveForUser(baseCal, uid)) {
                ids.add(uid);
            }
        }
    }

    const uidList = Array.from(ids);

    const userCalIds = new Map();
    for (const uid of uidList) {
        userCalIds.set(uid, resolveUserCalendarId(ev, uid));
    }

    const calIds = Array.from(
        new Set(
            Array.from(userCalIds.values())
                .filter(Boolean)
                .map((id) => String(id))
        )
    );

    const calendars = await Calendar.find({ _id: { $in: calIds } })
        .select({ _id: 1, owner: 1, members: 1, notifyActive: 1 })
        .lean();
    const calById = new Map(calendars.map((c) => [String(c._id), c]));

    const users = await User.find({ _id: { $in: uidList } })
        .select({ _id: 1, email: 1, name: 1 })
        .lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const recipients = [];

    for (const uid of uidList) {
        const user = userById.get(uid);
        if (!user || !user.email) continue;

        const calId = userCalIds.get(uid);
        const cal = calId ? calById.get(String(calId)) : null;

        if (uid === String(ev.owner)) {
            if (cal && !isActiveForUser(cal, uid)) {
                continue;
            }

            recipients.push({
                uid,
                email: user.email,
                calId: cal ? String(cal._id) : null,
            });
            continue;
        }
        if (cal && isActiveForUser(cal, uid)) {
            recipients.push({
                uid,
                email: user.email,
                calId: String(cal._id),
            });
            continue;
        }
        recipients.push({
            uid,
            email: user.email,
            calId: cal ? String(cal._id) : null,
        });
    }

    return recipients;
}
async function shouldSendAndLock({ eventId, occurrenceStart, userId, kind }) {
    const filter = {
        event: new mongoose.Types.ObjectId(eventId),
        occurrenceStart,
        user: new mongoose.Types.ObjectId(userId),
        kind,
    };

    try {
        const res = await EventNotification.updateOne(
            filter,
            { $setOnInsert: { sentAt: new Date() } },
            { upsert: true }
        );

        if (typeof res.upsertedCount === 'number') {
            return res.upsertedCount > 0;
        }

        if (typeof res.matchedCount === 'number' && res.matchedCount === 0) {
            return true;
        }

        return false;
    } catch (e) {
        if (e && e.code === 11000) {
            return false;
        }
        console.error('[reminder] shouldSendAndLock error', e);
        return false;
    }
}
function windowBounds(base, offsetMin, widthSec) {
    const from = new Date(base.getTime() + offsetMin * 60 * 1000);
    const to = new Date(from.getTime() + widthSec * 1000);
    return { from, to };
}

function* makeWindows(now) {
    const width = REMINDERS_INTERVAL_SEC;
    const leewayMs = SCAN_LEEWAY_SEC * 1000;

    yield {
        kind: 'start',
        from: new Date(now.getTime() - leewayMs),
        to: new Date(now.getTime() + width * 1000),
    };

    const base15 = new Date(now.getTime() + 15 * 60 * 1000);
    yield {
        kind: 'before15',
        from: new Date(base15.getTime() - leewayMs),
        to: new Date(base15.getTime() + width * 1000),
    };

    yield {
        kind: 'end',
        from: new Date(now.getTime() - leewayMs),
        to: new Date(now.getTime() + width * 1000),
    };
}
function buildRRuleForEvent(ev) {
    try {
        const opts = RRule.parseString(ev.recurrence.rrule);

        // привязываем правило к реальному старту события
        opts.dtstart = new Date(ev.start);

        // если в recurrence.until есть дата – тоже прокидываем
        if (ev.recurrence.until) {
            opts.until = new Date(ev.recurrence.until);
        }

        return new RRule(opts);
    } catch (e) {
        console.error(
            '[reminder] invalid rrule for event',
            ev._id?.toString?.() || ev._id,
            e?.message || e
        );
        return null;
    }
}

function expandOccurrences(ev, from, to, mode = 'start') {
    const dur = new Date(ev.end) - new Date(ev.start) || 0;
    let fromAdj = from;
    let toAdj = to;

    if (mode === 'end') {
        fromAdj = new Date(from.getTime() - dur);
        toAdj = new Date(to.getTime() - dur);
    }

    if (ev.recurrence && ev.recurrence.rrule) {
        const rule = buildRRuleForEvent(ev);
        if (!rule) return [];

        const dates = rule.between(fromAdj, toAdj, true);
        return dates.map((dt) => ({
            start: dt,
            end: new Date(dt.getTime() + dur),
        }));
    }

    if (mode === 'start') {
        if (ev.start >= from && ev.start < to) {
            return [{ start: ev.start, end: ev.end }];
        }
    } else {
        if (ev.end >= from && ev.end < to) {
            return [{ start: ev.start, end: ev.end }];
        }
    }
    return [];
}

async function scanWindowAndNotify({ kind, from, to }) {
    const baseFilter =
        kind === 'end'
            ? { end: { $gte: from, $lt: to } }
            : { start: { $gte: from, $lt: to } };

    const [simple, recurring] = await Promise.all([
        Event.find(baseFilter).populate('category').lean(),
        Event.find({ 'recurrence.rrule': { $exists: true, $ne: null } })
            .populate('category')
            .lean(),
    ]);

    const candidates = [...simple];

    for (const ev of recurring) {
        const occs = expandOccurrences(
            ev,
            from,
            to,
            kind === 'end' ? 'end' : 'start'
        );
        for (const occ of occs) {
            candidates.push({ ...ev, _occ: occ });
        }
    }

    for (const ev of candidates) {
        const occStart = ev._occ ? ev._occ.start : ev.start;
        const occEnd = ev._occ ? ev._occ.end : ev.end;

        const catDoc =
            ev.category && typeof ev.category === 'object' && ev.category._id
                ? ev.category
                : null;
        const { type: catType } = classifyCategory(catDoc);

        if (!shouldSendForCategoryType(catType, kind)) continue;

        const recips = await recipientsForEventOccurrence(ev, occStart);
        if (!recips.length) continue;

        let whenHuman;
        if (kind === 'before15') {
            whenHuman = `Starts at ${toISO(occStart)}`;
        } else if (kind === 'start') {
            whenHuman = `Started at ${toISO(occStart)} · Ends at ${toISO(
                occEnd
            )}`;
        } else if (kind === 'end') {
            whenHuman = `Finished at ${toISO(occEnd)} · Started at ${toISO(
                occStart
            )}`;
        } else {
            whenHuman = `${toISO(occStart)} – ${toISO(occEnd)}`;
        }

        const link = `${APP_URL}/events/${ev._id}?at=${encodeURIComponent(
            occStart.toISOString()
        )}`;

        const keyTime = kind === 'end' ? occEnd : occStart;

        for (const r of recips) {
            const ok = await shouldSendAndLock({
                eventId: ev._id,
                occurrenceStart: keyTime,
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
                await EventNotification.deleteOne({
                    event: ev._id,
                    occurrenceStart: keyTime,
                    user: r.uid,
                    kind,
                }).catch(() => {});
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
