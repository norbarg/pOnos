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
const REMINDERS_INTERVAL_SEC = Number(process.env.REMINDERS_INTERVAL_SEC || 60); // как часто сканим
const SCAN_LEEWAY_SEC = Number(process.env.REMINDERS_LEEWAY_SEC || 5); // небольшой запас окна

function toISO(dt) {
    return new Date(dt).toISOString();
}

// ------ active-logic: дублируем утилиту из контроллера ------
function isActiveForUser(cal, uidStr) {
    const nmap = cal.notifyActive || {};

    // 1) если в notifyActive явно есть ключ — доверяем ему
    if (Object.prototype.hasOwnProperty.call(nmap, uidStr)) {
        return !!nmap[uidStr];
    }

    // 2) владелец календаря по умолчанию активен
    if (String(cal.owner) === uidStr) return true;

    // 3) мемберы календаря:
    //    поддерживаем оба формата:
    //    - [ObjectId, ObjectId, ...]
    //    - [{ user: ObjectId, ... }, ...]
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

    // 4) все прочие — не активны
    return false;
}

// выбираем какой календарь “считать” для пользователя: placement || базовый
function resolveUserCalendarId(ev, uid) {
    const pl = (ev.placements || []).find(
        (p) => String(p.user) === String(uid)
    );
    return pl ? pl.calendar : ev.calendar;
}

// === КЛАССИФИКАЦИЯ КАТЕГОРИИ ===
// built-in: reminder / task / arrangement
// кастомные (user != null) → "custom"
function classifyCategory(catDoc) {
    // если категории нет — считаем как кастом (напоминание только в начале)
    if (!catDoc) return { type: 'custom' };

    // если категория пользовательская (есть поле user) → custom
    if (catDoc.user) {
        return { type: 'custom' };
    }

    // дефолтные: пытаемся понять по ключу/slug/заголовку
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

    // остальные дефолтные → как "прочие" (тоже только start)
    return { type: 'builtin-other' };
}

// === ПРАВИЛА УВЕДОМЛЕНИЙ ПО ТИПУ КАТЕГОРИИ ===
//
// Reminder    → только start
// Task        → start + end
// Arrangement → before15 + start
// Custom/other→ только start
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

// Собираем получателей с учётом активных календарей
// Собираем получателей с учётом активных календарей, но
// для внешних участников события всегда шлём e-mail
async function recipientsForEventOccurrence(ev, occStart) {
    // уникальный набор юзеров: владелец + участники
    const ids = new Set([String(ev.owner), ...ev.participants.map(String)]);
    const uidList = Array.from(ids);

    // карта userId -> calendarId (placement || базовый календарь события)
    const userCalIds = new Map();
    for (const uid of uidList) {
        userCalIds.set(uid, resolveUserCalendarId(ev, uid));
    }

    // подтягиваем все календари одним батчем
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

    // подтягиваем пользователей (для email)
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

        // === 1) Владелец события ===
        if (uid === String(ev.owner)) {
            // если есть календарь и там владелец "не активен" — не шлём
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

        // === 2) Участники события ===

        // Если у участника есть "свой" календарь с этим событием и он там активен —
        // норм, учитываем эту активность
        if (cal && isActiveForUser(cal, uid)) {
            recipients.push({
                uid,
                email: user.email,
                calId: String(cal._id),
            });
            continue;
        }

        // Во всех остальных случаях считаем его "внешним участником":
        // он пригашён на событие по e-mail, и у него нет UI, где он мог бы
        // выключить уведомления по календарю. Поэтому — шлём e-mail всегда.
        recipients.push({
            uid,
            email: user.email,
            calId: cal ? String(cal._id) : null,
        });
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

    try {
        const res = await EventNotification.updateOne(
            filter,
            { $setOnInsert: { sentAt: new Date() } },
            { upsert: true }
        );

        // В современных драйверах есть upsertedCount:
        //  - upsertedCount > 0 → была вставка (новое уведомление, можно слать)
        //  - иначе → уже было, не шлём
        if (typeof res.upsertedCount === 'number') {
            return res.upsertedCount > 0;
        }

        // Фолбэк на всякий случай
        if (typeof res.matchedCount === 'number' && res.matchedCount === 0) {
            return true;
        }

        return false;
    } catch (e) {
        // Если словили дубликат индекса — уже отправляли
        if (e && e.code === 11000) {
            return false;
        }
        console.error('[reminder] shouldSendAndLock error', e);
        // Лучше не ддосить юзера письмами если что-то странное
        return false;
    }
}
function windowBounds(base, offsetMin, widthSec) {
    const from = new Date(base.getTime() + offsetMin * 60 * 1000);
    const to = new Date(from.getTime() + widthSec * 1000);
    return { from, to };
}

// Окна:
//  - start:     сейчас..+interval+leeway (момент начала)
//  - before15:  now+15..+15+interval+leeway (за 15 минут до начала)
//  - end:       сейчас..+interval+leeway (момент конца)
function* makeWindows(now) {
    const width = REMINDERS_INTERVAL_SEC + SCAN_LEEWAY_SEC;

    // окно “start”
    yield {
        kind: 'start',
        ...windowBounds(now, 0, width),
    };

    // окно “за 15 минут”
    yield {
        kind: 'before15',
        ...windowBounds(now, 15, width),
    };

    // окно “end”
    yield {
        kind: 'end',
        ...windowBounds(now, 0, width),
    };
}

// Раскрываем рекуррентные события:
//  - mode 'start' → ищем start в [from, to)
//  - mode 'end'   → ищем такие start, у которых end (start+dur) попадает в [from, to)
function expandOccurrences(ev, from, to, mode = 'start') {
    const dur = new Date(ev.end) - new Date(ev.start) || 0;
    let fromAdj = from;
    let toAdj = to;

    if (mode === 'end') {
        fromAdj = new Date(from.getTime() - dur);
        toAdj = new Date(to.getTime() - dur);
    }

    if (ev.recurrence && ev.recurrence.rrule) {
        try {
            const rule = RRule.fromString(ev.recurrence.rrule);
            const dates = rule.between(fromAdj, toAdj, true);
            return dates.map((dt) => ({
                start: dt,
                end: new Date(dt.getTime() + dur),
            }));
        } catch {
            return [];
        }
    }

    // нерекуррентное
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

// Сканируем окно и шлём уведомления
// Сканируем окно и шлём уведомления
async function scanWindowAndNotify({ kind, from, to }) {
    // 1) кандидаты: простые события в окне + все рекуррентные
    //    для 'end' фильтруем по end, для остальных — по start
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

    // Можно временно раскомментировать для дебага:
    // console.log('[reminder] window', kind, 'from', from, 'to', to, 'candidates', candidates.length);

    // 2) обрабатываем каждого кандидата
    for (const ev of candidates) {
        const occStart = ev._occ ? ev._occ.start : ev.start;
        const occEnd = ev._occ ? ev._occ.end : ev.end;

        // категория события (populate('category') выше)
        const catDoc =
            ev.category && typeof ev.category === 'object' && ev.category._id
                ? ev.category
                : null;
        const { type: catType } = classifyCategory(catDoc);

        // фильтр по правилам для reminder/task/arrangement/custom
        if (!shouldSendForCategoryType(catType, kind)) continue;

        // аудитория с учётом активных календарей
        const recips = await recipientsForEventOccurrence(ev, occStart);
        if (!recips.length) continue;

        // человекочитаемое время в письме
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

        // Для idempotency-ключа:
        //  - для start / before15 → используем начало
        //  - для end             → используем конец
        const keyTime = kind === 'end' ? occEnd : occStart;

        // 3) по каждому получателю — идемпотентно послать
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
                    kind, // 'before15' | 'start' | 'end'
                    link,
                    minutes: kind === 'before15' ? 15 : 0,
                });
            } catch (e) {
                // если SMTP упал — откатим lock, чтобы можно было повторить следующим проходом
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
