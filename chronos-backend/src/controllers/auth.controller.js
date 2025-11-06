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
    const { email, password, passwordConfirm, name, username } = req.body || {};

    if (!email || !password || !passwordConfirm) {
      return res.status(400).json({ error: "missing-fields" });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: "passwords-mismatch" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = (name ?? "").trim();
    const normalizedUsername =
      typeof username === "string" && username.trim()
        ? username.trim().toLowerCase()
        : undefined;

    // Проверки уникальности
    const emailExists = await User.findOne({ email: normalizedEmail }).lean();
    if (emailExists) return res.status(409).json({ error: "email already in use" });

    if (normalizedUsername) {
      // лёгкая серверная валидация (дублирует валидатор схемы — для быстрого ответа 400)
      if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)) {
        return res.status(400).json({ error: "username-invalid" });
      }
      const usernameExists = await User.findOne({ username: normalizedUsername }).lean();
      if (usernameExists) return res.status(409).json({ error: "username already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      name: normalizedName || undefined,
    });

    // 1) Создаём главный календарь
    await createMainCalendar(user._id);

    // 2) Создаём системный праздников (UA)
    await ensureHolidaysCalendar(user._id, "UA");

    // 3) Автоподцепление висящих инвайтов по email
    await attachPendingInvitesForEmail(normalizedEmail, user._id);

    const token = signToken(user._id.toString(), user.email);
    const safeUser = user.toJSON(); // passwordHash удалён

    return res.json({ user: safeUser, token });
  } catch (err) {
    // ловим возможные уникальные индексы
    if (err?.code === 11000) {
      if (err?.keyPattern?.username) return res.status(409).json({ error: "username already in use" });
      if (err?.keyPattern?.email) return res.status(409).json({ error: "email already in use" });
    }
    console.error("register.error:", err);
    return res.status(500).json({ error: "internal" });
  }
}

export async function login(req, res) {
  try {
    // обратная совместимость: если пришёл email — тоже сработает
    const raw = req.body?.identifier ?? req.body?.email;
    const { password } = req.body || {};

    if (!raw || !password) {
      return res.status(400).json({ error: "missing-fields" });
    }

    const identifier = String(raw).trim().toLowerCase();
    const query = identifier.includes("@")
      ? { email: identifier }
      : { username: identifier };

    const user = await User.findOne(query);
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
  // requireAuth кладёт в req.user
  const { id, email, name, username } = res.req.user || {};
  return res.json({ user: { id, email, name, username } });
}