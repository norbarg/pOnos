import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { updateMe, deleteMe } from '../controllers/user.controller.js';
import { uploadAvatar } from '../middlewares/uploadAvatar.middleware.js';

const router = Router();
router.use(requireAuth);

// multipart/form-data для аватара + JSON-поля можно слать вместе
router.patch('/me', uploadAvatar, updateMe);
router.delete('/me', deleteMe);

export default router;
