import { Router } from 'express';
import { getCategories, patchCategory, postCategory, postCategoryArchive, postCategoryRestore } from '../controllers/ticketConfigController.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requireAnyPermission(['tickets.create', 'tickets.view', 'tickets.view.assigned']), getCategories);
router.post('/', requirePermission('ticketCategories.manage'), postCategory);
router.patch('/:id', requirePermission('ticketCategories.manage'), patchCategory);
router.post('/:id/archive', requirePermission('ticketCategories.manage'), postCategoryArchive);
router.post('/:id/restore', requirePermission('ticketCategories.manage'), postCategoryRestore);

export default router;
