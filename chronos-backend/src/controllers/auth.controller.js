// src/controllers/auth.controller.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createMainCalendar } from '../services/calendar.service.js';
import {
    ensureHolidaysCalendar,
    ensureUserHolidaysSeed,
} from '../services/holidays.service.js';
import { attachPendingInvitesForEmail } from '../services/invite.service.js';

function signToken(userId, email) {
    return jwt.sign({ sub: userId, email }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
}

export async function register(req, res) {
    try {
        const { email, password, passwordConfirm, name, countryCode } =
            req.body || {};

        if (!email || !password || !passwordConfirm) {
            return res.status(400).json({ error: 'missing-fields' });
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ error: 'passwords-mismatch' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedName =
            typeof name === 'string' && name.trim()
                ? name.trim().toLowerCase()
                : undefined;

        // нормализуем страну (по умолчанию UA)
        let normalizedCountry = 'UA';
        if (typeof countryCode === 'string' && countryCode.trim()) {
            const cc = countryCode.trim().toUpperCase();
            if (/^[A-Z]{2}$/.test(cc)) {
                normalizedCountry = cc;
            }
        }

        // проверка email
        if (await User.findOne({ email: normalizedEmail }).lean()) {
            return res.status(409).json({ error: 'email already in use' });
        }
        // проверка name (если задан)
        if (normalizedName) {
            if (!/^[a-z0-9._-]{3,32}$/.test(normalizedName)) {
                return res.status(400).json({ error: 'name-invalid' });
            }
            if (await User.findOne({ name: normalizedName }).lean()) {
                return res.status(409).json({ error: 'name already in use' });
            }
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: normalizedEmail,
            name: normalizedName,
            passwordHash,
            countryCode: normalizedCountry,
        });

        await createMainCalendar(user._id);

        // вместо простого ensureHolidaysCalendar — полноценная сидировка
        await ensureUserHolidaysSeed(user._id, normalizedCountry);

        await attachPendingInvitesForEmail(normalizedEmail, user._id);

        const token = signToken(user._id.toString(), user.email);
        return res.json({ user: user.toJSON(), token });
    } catch (err) {
        if (err?.code === 11000) {
            if (err?.keyPattern?.email)
                return res.status(409).json({ error: 'email already in use' });
            if (err?.keyPattern?.name)
                return res.status(409).json({ error: 'name already in use' });
        }
        console.error('register.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function login(req, res) {
    try {
        const raw = req.body?.identifier ?? req.body?.email ?? req.body?.name;
        const { password } = req.body || {};
        if (!raw || !password)
            return res.status(400).json({ error: 'missing-fields' });

        const ident = String(raw).trim().toLowerCase();
        const query = ident.includes('@') ? { email: ident } : { name: ident };

        const user = await User.findOne(query);
        if (!user)
            return res.status(401).json({ error: 'invalid-credentials' });

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'invalid-credentials' });

        const token = signToken(user._id.toString(), user.email);
        return res.json({ token });
    } catch (err) {
        console.error('login.error:', err);
        return res.status(500).json({ error: 'internal' });
    }
}

export async function me(req, res) {
    try {
        const user = await User.findById(req.user.id)
            .select({
                email: 1,
                name: 1,
                avatar: 1,
                createdAt: 1,
                countryCode: 1,
            })
            .lean();

        if (!user) return res.status(404).json({ error: 'not-found' });

        return res.json({
            user: {
                id: user._id.toString(),
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                createdAt: user.createdAt,
                countryCode: user.countryCode || 'UA',
            },
        });
    } catch (e) {
        return res.status(500).json({ error: 'internal' });
    }
}
