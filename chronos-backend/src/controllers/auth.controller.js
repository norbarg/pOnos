// chronos-backend/src/controllers/auth.controller.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { createMainCalendar } from "../services/calendar.service.js";
import { ensureHolidaysCalendar } from "../services/holidays.service.js";
import { attachPendingInvitesForEmail } from "../services/invite.service.js";

function signToken(userId, email) {
  return jwt.sign(
    { sub: userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

export async function register(req, res) {
  try {
    const { email, password, passwordConfirm, name } = req.body || {};

    if (!email || !password || !passwordConfirm) {
      return res.status(400).json({ error: "missing-fields" });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: "passwords-mismatch" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = (name ?? "").trim();

    const exists = await User.findOne({ email: normalizedEmail }).lean();
    if (exists) {
      return res.status(409).json({ error: "email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: normalizedName || undefined,
    });

    // 1) Создаём главный календарь
    await createMainCalendar(user._id);

    // 2) Создаём системный праздников (UA)
    await ensureHolidaysCalendar(user._id, "UA");

    // 3) Автоматически присоединяем все висящие инвайты на этот email
    await attachPendingInvitesForEmail(normalizedEmail, user._id);

    const token = signToken(user._id.toString(), user.email);
    const safeUser = user.toJSON(); // passwordHash удаляется в toJSON()

    return res.json({ user: safeUser, token });
  } catch (err) {
    console.error("register.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "missing-fields" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ error: "invalid-credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid-credentials" });

    const token = signToken(user._id.toString(), user.email);
    return res.json({ token });
  } catch (err) {
    console.error("login.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function me(_req, res) {
  // requireAuth кладёт в req.user, но здесь уже возвращаем то, что он положил
  const { id, email, name } = res.req.user || {};
  return res.json({ user: { id, email, name } });
}