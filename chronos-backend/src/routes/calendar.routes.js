import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  listMyCalendars,
  createCalendar,
  getCalendar,
  updateCalendar,
  deleteCalendar,
  shareCalendar,
  listMembers,
  removeMember,
  leaveCalendar,
  updateMemberRole,
  listCalendarInvites,
} from "../controllers/calendar.controller.js";
import {
  loadCalendar,
  canAccessCalendar,
  isCalendarOwner,
  isCalendarOwnerOrEditor,
} from "../middlewares/calendarAcl.middleware.js";
import {
  resendCalendarInvite,
  revokeCalendarInvite,
} from "../controllers/invite.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/", listMyCalendars);
router.post("/", createCalendar);

router.get("/:id", loadCalendar, canAccessCalendar, getCalendar);
router.put("/:id", loadCalendar, isCalendarOwnerOrEditor, updateCalendar);
router.delete("/:id", loadCalendar, isCalendarOwner, deleteCalendar);

// Шаринг
router.post("/:id/share", loadCalendar, isCalendarOwner, shareCalendar);
router.get("/:id/members", loadCalendar, canAccessCalendar, listMembers);
router.patch("/:id/members/:userId", loadCalendar, isCalendarOwner, updateMemberRole);
router.delete("/:id/members/:userId", loadCalendar, isCalendarOwner, removeMember);

// Инвайты (owner-only)
router.get("/:id/invites", loadCalendar, isCalendarOwner, listCalendarInvites);
router.post("/:id/invites/:inviteId/resend", loadCalendar, isCalendarOwner, resendCalendarInvite);
router.delete("/:id/invites/:inviteId", loadCalendar, isCalendarOwner, revokeCalendarInvite);

// Выйти из календаря
router.post("/:id/leave", loadCalendar, canAccessCalendar, leaveCalendar);

export default router;