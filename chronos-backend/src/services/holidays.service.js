// chronos-backend/src/services/holidays.service.js
import Calendar from "../models/Calendar.js";

/**
 * Создаёт (если не существует) системный календарь праздников для пользователя.
 * По умолчанию — Holidays (UA). Иммутабельный (isSystem=true, systemType='holidays').
 */
export async function ensureHolidaysCalendar(userId, country = "UA") {
  const existing = await Calendar.findOne({
    owner: userId,
    isSystem: true,
    systemType: "holidays",
    countryCode: country,
  }).lean();

  if (existing) return existing;

  const created = await Calendar.create({
    name: `Holidays (${country})`,
    color: "#94a3b8", // спокойный серый (виден, но не спорит с Main)
    description: `National holidays for ${country}`,
    owner: userId,
    members: [],
    memberRoles: {},
    isMain: false,
    isSystem: true,
    systemType: "holidays",
    countryCode: country,
  });

  return created.toObject();
}