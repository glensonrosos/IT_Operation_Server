import { Router } from 'express';
import { getAssetTransferById, getAssetTransfers, postAssetTransferAcknowledgement, postAssetTransferCancel, postAssetTransferComplete, postAssetTransferDecision, postAssetTransferProcess } from '../controllers/assetLifecycleController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('assets.view'), getAssetTransfers);
router.get('/:id', requirePermission('assets.view'), getAssetTransferById);
router.post('/:id/approve', requirePermission('assets.transfer'), postAssetTransferDecision);
router.post('/:id/process', requirePermission('assets.transfer'), postAssetTransferProcess);
router.post('/:id/acknowledge', requirePermission('assets.transfer'), postAssetTransferAcknowledgement);
router.post('/:id/complete', requirePermission('assets.transfer'), postAssetTransferComplete);
router.post('/:id/cancel', requirePermission('assets.transfer'), postAssetTransferCancel);

export default router;
