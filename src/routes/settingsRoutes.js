import { Router } from 'express';
import { getSystemSettings, patchSystemSettings } from '../controllers/settingsController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('settings.view'), getSystemSettings);
router.patch('/', requirePermission('settings.update'), patchSystemSettings);
export default router;
