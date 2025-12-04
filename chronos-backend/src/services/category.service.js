import Category from '../models/Category.js';

const DEFAULTS = [
    { builtInKey: 'task', title: 'Task', color: '#D86497' },
    { builtInKey: 'reminder', title: 'Reminder', color: '#A7BBEE' },
    { builtInKey: 'arrangement', title: 'Arrangement', color: '#D8AC89' },
];

export async function ensureDefaultCategories() {
    for (const d of DEFAULTS) {
        await Category.updateOne(
            { builtInKey: d.builtInKey, user: null },
            {
                $setOnInsert: {
                    title: d.title,
                    color: d.color,
                    user: null,
                    builtInKey: d.builtInKey,
                },
            },
            { upsert: true }
        );
    }
}

export async function getUserVisibleCategories(userId) {
    await ensureDefaultCategories();
    const list = await Category.find({
        $or: [{ user: null }, { user: userId }],
    })
        .sort({ user: 1, title: 1 })
        .lean();

    return list.map((c) => ({
        id: String(c._id),
        title: c.title,
        color: c.color,
        isDefault: c.user === null,
        builtInKey: c.builtInKey,
    }));
}
