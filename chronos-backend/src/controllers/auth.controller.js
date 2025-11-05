import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { createMainCalendar } from "../services/calendar.service.js";

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
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = typeof name !== "undefined" ? String(name).trim() : undefined;

    if (!normalizedEmail || !password || !passwordConfirm) {
      return res.status(400).json({ error: "email, password and passwordConfirm are required" });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: "passwords do not match" });
    }

    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ error: "email already in use" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      name: normalizedName,
    });

    // Автосоздание основного календаря (ждем завершения)
    try {
      await createMainCalendar(user._id);
    } catch (e) {
      console.error("Failed to create main calendar for user", user._id?.toString(), e);
    }

    const token = signToken(user._id.toString(), user.email);
    return res.status(201).json({ user: user.toJSON(), token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server error" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = signToken(user._id.toString(), user.email);
    return res.json({ user: user.toJSON(), token });
  } catch (err) {
    return res.status(500).json({ error: "server error" });
  }
}

export async function me(req, res) {
  // req.user ставится в requireAuth
  return res.json({
    user: {
      id: String(req.user.id),
      email: req.user.email,
      name: req.user.name,
    },
  });
}