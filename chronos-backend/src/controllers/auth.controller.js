// chronos-backend/src/controllers/auth.controller.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

function signToken(userId, email) {
    return jwt.sign({ sub: userId, email }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
}

export async function register(req, res) {
    try {
        const { email, password, passwordConfirm, name } = req.body || {};

        // базовая валидация
        if (!email || !password || !passwordConfirm) {
            return res
                .status(400)
                .json({
                    error: 'email, password and passwordConfirm are required',
                });
        }
        const normalizedEmail = String(email).trim().toLowerCase();

        if (password.length < 6) {
            return res
                .status(400)
                .json({ error: 'password must be at least 6 chars' });
        }
        if (password !== passwordConfirm) {
            return res.status(400).json({ error: 'passwords do not match' });
        }

        const exists = await User.findOne({ email: normalizedEmail });
        if (exists) {
            return res.status(409).json({ error: 'email already in use' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: normalizedEmail,
            passwordHash,
            name,
        });

        const token = signToken(user._id.toString(), user.email);
        return res.status(201).json({ user: user.toJSON(), token });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({ error: 'email already in use' });
        }
        return res.status(500).json({ error: 'server error' });
    }
}

export async function login(req, res) {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res
                .status(400)
                .json({ error: 'email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user)
            return res.status(401).json({ error: 'invalid credentials' });

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });

        const token = signToken(user._id.toString(), user.email);
        return res.json({ user: user.toJSON(), token });
    } catch (err) {
        return res.status(500).json({ error: 'server error' });
    }
}

export async function me(req, res) {
    // req.user кладёт middleware
    return res.json({ user: req.user });
}
