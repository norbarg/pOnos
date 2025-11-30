// src/services/holidays.service.js
import mongoose from 'mongoose';
import Calendar from '../models/Calendar.js';
import Event from '../models/Event.js';
import Category from '../models/Category.js';

// date-holidays — CJS, поэтому такая обёртка
import HolidaysPkg from 'date-holidays';
const Holidays = HolidaysPkg.default || HolidaysPkg;

const DEFAULT_COUNTRY = 'UA';
const HOLIDAYS_CAL_COLOR = '#94a3b8'; // спокойный серый
const HOLIDAYS_CATEGORY_COLOR = '#dc2626'; // красный для праздников

/**
 * Создаёт (если не существует) системный календарь праздников для пользователя.
 * Иммутабельный (isSystem=true, systemType='holidays').
 */
export async function ensureHolidaysCalendar(
    userId,
    country = DEFAULT_COUNTRY
) {
    const existing = await Calendar.findOne({
        owner: userId,
        isSystem: true,
        systemType: 'holidays',
        countryCode: country,
    }).lean();

    if (existing) return existing;

    const created = await Calendar.create({
        name: `Holidays (${country})`,
        color: HOLIDAYS_CAL_COLOR,
        description: `National holidays for ${country}`,
        owner: userId,
        members: [],
        memberRoles: {},
        notifyActive: { [userId]: true }, // сразу активен для владельца
        isMain: false,
        isSystem: true,
        systemType: 'holidays',
        countryCode: country,
    });

    return created.toObject();
}

/**
 * Системная категория "Holiday" (общая для всех, user = null).
 * Нужна, т.к. Event.category обязательный.
 */
export async function ensureHolidayCategory() {
    let cat = await Category.findOne({
        builtInKey: 'holiday',
        user: null,
    }).lean();

    if (cat) return cat;

    const created = await Category.create({
        title: 'Holiday',
        color: HOLIDAYS_CATEGORY_COLOR,
        builtInKey: 'holiday',
        user: null, // системная категория
    });

    return created.toObject();
}

/**
 * Инстанс date-holidays для страны.
 */
function createHolidaysInstance(countryCode) {
    const hd = new Holidays();
    const ok = hd.init(countryCode);

    console.log('[holidays] init result:', countryCode, ok);

    if (!ok) {
        console.warn(`[holidays] unsupported country code: ${countryCode}`);
        return null;
    }
    return hd;
}

/**
 * Нормализуем диапазон лет (если не передали — вокруг текущего).
 */
function normalizeYearRange({ fromYear, toYear }) {
    const nowYear = new Date().getFullYear();

    const start = Number.isInteger(fromYear) ? fromYear : nowYear - 1;
    const end = Number.isInteger(toYear) ? toYear : nowYear + 3;

    if (end < start) {
        return { fromYear: end, toYear: start };
    }
    return { fromYear: start, toYear: end };
}

/**
 * Идемпотентно создаём/добавляем праздники в системный календарь юзера.
 *
 * Сейчас без RRULE:
 *  - каждый праздничный день = отдельное событие на конкретный год
 *  - дубликаты не создаём (по calendar + title + start)
 */
export async function syncHolidaysForUser({
    userId,
    countryCode = DEFAULT_COUNTRY,
    fromYear,
    toYear,
}) {
    // 1) системный календарь + категория
    const holidaysCal = await ensureHolidaysCalendar(userId, countryCode);
    const holidaysCategory = await ensureHolidayCategory();

    // 2) инстанс date-holidays
    const hd = createHolidaysInstance(countryCode);
    if (!hd) {
        console.warn(
            `[holidays] no holidays engine for country=${countryCode}`
        );
        return;
    }

    const { fromYear: yFrom, toYear: yTo } = normalizeYearRange({
        fromYear,
        toYear,
    });

    console.log(
        `[holidays] sync for user=${userId} country=${countryCode} years=${yFrom}-${yTo}`
    );

    const calId = holidaysCal._id || holidaysCal.id;
    const categoryId = holidaysCategory._id || holidaysCategory.id;

    const calObjId = new mongoose.Types.ObjectId(calId);
    const catObjId = new mongoose.Types.ObjectId(categoryId);
    const userObjId = new mongoose.Types.ObjectId(userId);

    for (let year = yFrom; year <= yTo; year++) {
        const yearHolidays = hd.getHolidays(year) || [];
        console.log(
            `[holidays] ${countryCode} ${year}: raw=${yearHolidays.length}`
        );

        // берём несколько типов, а не только строго "public"
        const filtered = yearHolidays.filter((h) => {
            // 1) тип праздника нам подходит?
            const typeOk = [
                'public',
                'bank',
                'public_holiday',
                'national',
                undefined,
            ].includes(h.type);
            if (!typeOk) return false;

            // 2) отбрасываем замещающие/переносимые дни
            // date-holidays часто помечает их флагом substitute
            if (h.substitute === true) return false;

            // 3) плюс подстрахуемся по названию
            if (
                typeof h.name === 'string' &&
                /\(замінити день\)/i.test(h.name)
            ) {
                return false;
            }

            return true;
        });

        console.log(
            `[holidays] ${countryCode} ${year}: filtered=${filtered.length}`
        );

        for (const h of filtered) {
            const start = new Date(h.start);
            const end = h.end
                ? new Date(h.end)
                : new Date(start.getTime() + 24 * 60 * 60 * 1000);

            const title = h.name;
            const note = h.note || '';

            // идемпотентность
            // идемпотентность: не создаём второй "тот же праздник",
            // если по этому календарю уже есть событие с таким же title,
            // чей интервал пересекается с (start, end)
            const existing = await Event.findOne({
                calendar: calObjId,
                title,
                start: { $lte: end },
                end: { $gte: start },
            }).lean();

            if (existing) {
                // уже есть "Новий Рік" примерно в этот же период — пропускаем
                continue;
            }

            await Event.create({
                title,
                description: note,
                start,
                end,
                category: catObjId,
                calendar: calObjId,
                owner: userObjId,
                participants: [],
                placements: [],
                recurrence: undefined,
            });
        }
    }
}

/**
 * Удобная обёртка: вызвать один раз при регистрации юзера
 * или, например, при смене региона.
 */
export async function ensureUserHolidaysSeed(userId, countryCode) {
    const cc = (countryCode || DEFAULT_COUNTRY).toUpperCase();
    await syncHolidaysForUser({
        userId,
        countryCode: cc,
        fromYear: new Date().getFullYear() - 1,
        toYear: new Date().getFullYear() + 3,
    });
}
