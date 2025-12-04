import Category from '../models/Category.js';
import { getUserVisibleCategories } from '../services/category.service.js';
import Event from '../models/Event.js';

function normalizeTitle(t) {
    const s = String(t || '').trim();
    if (!s) throw new Error('title is required');
    return s;
}
function normalizeHex(C) {
    const c = String(C || '').trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(c))
        throw new Error('color must be HEX like #aabbcc');
    return c.startsWith('#') ? c : `#${c}`;
}

export async function listCategories(req, res) {
    const cats = await getUserVisibleCategories(req.user.id);
    res.json({ categories: cats });
}

export async function createCategory(req, res) {
    try {
        const title = normalizeTitle(req.body?.title);
        const color = normalizeHex(req.body?.color);
        const doc = await Category.create({
            title,
            color,
            user: req.user.id,
            builtInKey: null,
        });
        res.status(201).json({
            category: {
                id: String(doc._id),
                title: doc.title,
                color: doc.color,
                isDefault: false,
            },
        });
    } catch (e) {
        return res
            .status(400)
            .json({ error: e.message || 'failed to create category' });
    }
}

export async function updateCategory(req, res) {
    const { id } = req.params;
    const cat = await Category.findById(id);
    if (!cat) return res.status(404).json({ error: 'not found' });
    if (cat.user === null)
        return res
            .status(403)
            .json({ error: 'built-in categories are read-only' });
    if (String(cat.user) !== req.user.id)
        return res.status(403).json({ error: 'forbidden' });

    const patch = {};
    if (typeof req.body?.title !== 'undefined')
        patch.title = normalizeTitle(req.body.title);
    if (typeof req.body?.color !== 'undefined')
        patch.color = normalizeHex(req.body.color);

    const upd = await Category.findByIdAndUpdate(id, patch, {
        new: true,
        runValidators: true,
    });
    res.json({
        category: {
            id: String(upd._id),
            title: upd.title,
            color: upd.color,
            isDefault: false,
        },
    });
}

export async function deleteCategory(req, res) {
    const { id } = req.params;

    const cat = await Category.findById(id);
    if (!cat) return res.status(404).json({ error: 'not found' });

    if (cat.user === null) {
        return res
            .status(403)
            .json({ error: 'cannot delete built-in category' });
    }

    if (String(cat.user) !== req.user.id) {
        return res.status(403).json({ error: 'forbidden' });
    }

    const del = await Event.deleteMany({ owner: req.user.id, category: id });
    const deletedEvents = del.deletedCount || 0;

    await Category.deleteOne({ _id: id });

    return res.json({ ok: true, deletedEvents });
}
