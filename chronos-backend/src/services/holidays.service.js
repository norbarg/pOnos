import mongoose from 'mongoose';
import Calendar from '../models/Calendar.js';
import Event from '../models/Event.js';
import Category from '../models/Category.js';

import HolidaysPkg from 'date-holidays';
const Holidays = HolidaysPkg.default || HolidaysPkg;

const DEFAULT_COUNTRY = 'UA';
const HOLIDAYS_CAL_COLOR = '#94a3b8';
const HOLIDAYS_CATEGORY_COLOR = '#dc2626';

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
        notifyActive: { [userId]: true },
        isMain: false,
        isSystem: true,
        systemType: 'holidays',
        countryCode: country,
    });

    return created.toObject();
}

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
        user: null,
    });

    return created.toObject();
}

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

function normalizeYearRange({ fromYear, toYear }) {
    const nowYear = new Date().getFullYear();

    const start = Number.isInteger(fromYear) ? fromYear : nowYear - 1;
    const end = Number.isInteger(toYear) ? toYear : nowYear + 3;

    if (end < start) {
        return { fromYear: end, toYear: start };
    }
    return { fromYear: start, toYear: end };
}

export async function syncHolidaysForUser({
    userId,
    countryCode = DEFAULT_COUNTRY,
    fromYear,
    toYear,
}) {
    const holidaysCal = await ensureHolidaysCalendar(userId, countryCode);
    const holidaysCategory = await ensureHolidayCategory();

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

        const filtered = yearHolidays.filter((h) => {
            const typeOk = [
                'public',
                'bank',
                'public_holiday',
                'national',
                undefined,
            ].includes(h.type);
            if (!typeOk) return false;

            if (h.substitute === true) return false;

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

            const existing = await Event.findOne({
                calendar: calObjId,
                title,
                start: { $lte: end },
                end: { $gte: start },
            }).lean();

            if (existing) {
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

export async function ensureUserHolidaysSeed(userId, countryCode) {
    const cc = (countryCode || DEFAULT_COUNTRY).toUpperCase();
    await syncHolidaysForUser({
        userId,
        countryCode: cc,
        fromYear: new Date().getFullYear() - 1,
        toYear: new Date().getFullYear() + 3,
    });
}
