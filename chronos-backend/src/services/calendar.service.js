// chronos-backend/src/services/calendar.service.js
import Calendar from '../models/Calendar.js';

/**
 * Создаёт основной календарь пользователю, если его ещё нет.
 * Идемпотентно.
 */
export async function createMainCalendar(userId) {
    const exists = await Calendar.findOne({ owner: userId, isMain: true });
    if (exists) return exists;

    const cal = await Calendar.create({
        name: 'Main',
        owner: userId,
        isMain: true,
        color: '#151726',
        // владелец по умолчанию получает уведомления
        notifyActive: { [String(userId)]: true },
    });

    return cal;
}
