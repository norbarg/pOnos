import Calendar from '../models/Calendar.js';

export async function createMainCalendar(userId) {
    const exists = await Calendar.findOne({ owner: userId, isMain: true });
    if (exists) return exists;

    const cal = await Calendar.create({
        name: 'Main',
        owner: userId,
        isMain: true,
        color: '#151726',
        notifyActive: { [String(userId)]: true },
    });

    return cal;
}
