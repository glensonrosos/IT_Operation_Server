import { Router } from 'express';
import { deleteAssetTypeRecord, getAssetTypes, patchAssetType, postAssetType } from '../controllers/assetTypeController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('assets.view'), getAssetTypes);
router.post('/', requirePermission('assetTypes.manage'), postAssetType);
router.patch('/:id', requirePermission('assetTypes.manage'), patchAssetType);
router.delete('/:id', requirePermission('assetTypes.manage'), deleteAssetTypeRecord);

export default router;
