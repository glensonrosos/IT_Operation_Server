import { Router } from 'express';
import { getWarrantyAssets } from '../controllers/warrantyController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('maintenance.view'), getWarrantyAssets);

export default router;
