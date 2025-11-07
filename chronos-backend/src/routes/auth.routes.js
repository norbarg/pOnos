//chronos-backend/src/routes/auth.routes.js
import { Router } from 'express';
import { login, register, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);

export default router;
