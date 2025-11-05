import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { acceptInvite } from "../controllers/invite.controller.js";

const router = Router();

router.use(requireAuth);

// Принять приглашение по токену
router.post("/accept", acceptInvite);

export default router;