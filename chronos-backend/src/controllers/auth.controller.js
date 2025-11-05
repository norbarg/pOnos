import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { createMainCalendar } from '../services/calendar.service.js';
import { attachPendingInvitesForEmail } from '../services/invite.service.js';

function signToken(userId, email) {
  return jwt.sign({ sub: userId, email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export async function register(req, res) {
  try {
    const { email, password, passwordConfirm, name } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedName = String(name || '').trim();

    if (!normalizedEmail || !password || !passwordConfirm) {
      return res.status(400).json({ error: 'email, password, passwordConfirm are required' });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: 'passwords do not match' });
    }

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ error: 'email already in use' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({ email: normalizedEmail, passwordHash, name: normalizedName });

    // 1) создаём основной календарь
    await createMainCalendar(user._id);

    // 2) автоподключаем все pending-инвайты на этот email
    await attachPendingInvitesForEmail({ userId: user._id, email: user.email });

    const token = signToken(user._id, user.email);
    return res.status(201).json({ user: user.toJSON(), token });
  } catch (e) {
    return res.status(500).json({ error: 'failed to register' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken(user._id, user.email);
    return res.json({ user: user.toJSON(), token });
  } catch {
    return res.status(500).json({ error: 'failed to login' });
  }
}

export async function me(req, res) {
  return res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name },
  });
}