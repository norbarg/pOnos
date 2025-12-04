import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
} from '../controllers/category.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', listCategories);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
