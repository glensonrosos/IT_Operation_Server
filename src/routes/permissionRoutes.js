import { Router } from 'express';
import { getPermissions } from '../controllers/permissionController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete, requirePermission('roles.view'));
router.get('/', getPermissions);

export default router;
