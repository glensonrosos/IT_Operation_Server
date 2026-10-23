import { Router } from 'express';
import { getAssetReturnById, getAssetReturns } from '../controllers/assetLifecycleController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('assets.view'), getAssetReturns);
router.get('/:id', requirePermission('assets.view'), getAssetReturnById);

export default router;
