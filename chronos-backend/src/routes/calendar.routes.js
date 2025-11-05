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
} from "../controllers/calendar.controller.js";
import {
  loadCalendar,
  canAccessCalendar,
  isCalendarOwner,
} from "../middlewares/calendarAcl.middleware.js";

const router = Router();

// Все маршруты защищены
router.use(requireAuth);

// Мои календари (owner + member)
router.get("/", listMyCalendars);

// Создать календарь
router.post("/", createCalendar);

// Дальше маршруты конкретного календаря
router.get("/:id", loadCalendar, canAccessCalendar, getCalendar);
router.put("/:id", loadCalendar, isCalendarOwner, updateCalendar);
router.delete("/:id", loadCalendar, isCalendarOwner, deleteCalendar);

// Шаринг
router.post("/:id/share", loadCalendar, isCalendarOwner, shareCalendar);
router.get("/:id/members", loadCalendar, canAccessCalendar, listMembers);
router.delete("/:id/members/:userId", loadCalendar, isCalendarOwner, removeMember);

export default router;

/**
 * Подключение в app.js (СДЕЛАЕМ ПОТОМ):
 *   import calendarRouter from "./routes/calendar.routes.js";
 *   app.use("/calendars", calendarRouter);
 */