import { Router } from 'express';
import { listRoles } from '../controllers/roleController.js';
import { patchRole } from '../controllers/userController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('roles.view'), listRoles);
router.patch('/:id', requirePermission('roles.update'), patchRole);

export default router;
