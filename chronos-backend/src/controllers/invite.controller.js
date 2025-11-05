import Invitation from "../models/Invitation.js";
import Calendar from "../models/Calendar.js";
import { acceptInviteByToken, resendInvite, revokeInvite } from "../services/invite.service.js";

// owner-only: список инвайтов по календарю
export async function listCalendarInvites(req, res) {
  const { calendar } = req;
  const list = await Invitation.find({ calendar: calendar._id })
    .sort({ createdAt: -1 })
    .lean();

  return res.json({
    invites: list.map((i) => ({
      id: String(i._id),
      email: i.email,
      role: i.role,
      status: i.status,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
    })),
  });
}

// owner-only: resend
export async function resendCalendarInvite(req, res) {
  const { inviteId } = req.params;
  try {
    const inv = await resendInvite(inviteId);
    return res.json({ ok: true, invite: { id: String(inv._id), status: inv.status } });
  } catch (e) {
    return res.status(400).json({ error: e.message || "resend failed" });
  }
}

// owner-only: revoke
export async function revokeCalendarInvite(req, res) {
  const { inviteId } = req.params;
  try {
    const inv = await revokeInvite(inviteId);
    return res.json({ ok: true, invite: { id: String(inv._id), status: inv.status } });
  } catch (e) {
    return res.status(400).json({ error: e.message || "revoke failed" });
  }
}

// user: принять инвайт по токену
export async function acceptInvite(req, res) {
  const { token } = req.body || {};
  const tok = String(token || "").trim();
  if (!tok) return res.status(400).json({ error: "token is required" });

  try {
    const inv = await acceptInviteByToken({
      userId: req.user.id,
      userEmail: req.user.email,
      token: tok,
    });

    const cal = await Calendar.findById(inv.calendar).lean();
    return res.json({
      ok: true,
      calendar: cal ? {
        id: String(cal._id),
        name: cal.name,
        owner: String(cal.owner),
      } : null,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "accept failed" });
  }
}