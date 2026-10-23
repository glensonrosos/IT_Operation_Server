import { Router } from 'express';
import { getSparePartTypes, patchSparePartType, postSparePartType } from '../controllers/sparePartTypeController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js'; import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';
const router = Router(); router.use(requireAuth, requirePasswordChangeComplete); router.get('/', requirePermission('spareParts.view'), getSparePartTypes); router.post('/', requirePermission('spareParts.manage'), postSparePartType); router.patch('/:id', requirePermission('spareParts.manage'), patchSparePartType); export default router;
