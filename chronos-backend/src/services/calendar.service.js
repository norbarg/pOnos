import Calendar from "../models/Calendar.js";

/**
 * Создаёт основной календарь пользователю, если его ещё нет.
 * Идempotent: повторный вызов не создаст дубль.
 */
export async function createMainCalendar(userId) {
  const exists = await Calendar.findOne({ owner: userId, isMain: true });
  if (exists) return exists;

  const cal = await Calendar.create({
    name: "Main",
    owner: userId,
    isMain: true,
    color: "#22c55e",
  });

  return cal;
}