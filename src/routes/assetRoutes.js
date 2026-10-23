import { Router } from 'express';
import { getAssetAssignments, getAssetById, getAssetCurrentAssignment, getAssetHistory, getAssetImage, getAssetImages, getAssetSpareParts, getAssets, getEmployeeAssetAssignments, patchAsset, postAsset, postAssetArchive, postAssetAssignment, postAssetImages, postAssetRestore } from '../controllers/assetController.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { uploadAssetImages } from '../middleware/assetImageUpload.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';
import { postAssetReturn, postAssetReturnResume, postAssetTransferRequest } from '../controllers/assetLifecycleController.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('assets.view'), getAssets);
router.get('/assignments/by-employee/:employeeId', requirePermission('assets.view'), getEmployeeAssetAssignments);
router.post('/', requirePermission('assets.create'), postAsset);
router.get('/:id/spare-parts', requirePermission('assets.view'), getAssetSpareParts);
router.get('/:id/images', requirePermission('assets.view'), getAssetImages);
router.get('/:id/images/:imageId', requirePermission('assets.view'), getAssetImage);
router.post('/:id/images', requireAnyPermission(['assets.create', 'assets.update', 'assets.transfer', 'assets.return']), uploadAssetImages, postAssetImages);
router.post('/:id/transfers', requirePermission('assets.transfer'), postAssetTransferRequest);
router.post('/:id/returns/resume', requirePermission('assets.return'), postAssetReturnResume);
router.post('/:id/returns', requirePermission('assets.return'), postAssetReturn);
router.get('/:id/history', requirePermission('assets.view'), getAssetHistory);
router.get('/:id/assignments', requirePermission('assets.view'), getAssetAssignments);
router.get('/:id/current-assignment', requirePermission('assets.view'), getAssetCurrentAssignment);
router.post('/:id/assign', requirePermission('assets.assign'), postAssetAssignment);
router.post('/:id/archive', requirePermission('assets.archive'), postAssetArchive);
router.post('/:id/restore', requirePermission('assets.archive'), postAssetRestore);
router.get('/:id', requirePermission('assets.view'), getAssetById);
router.patch('/:id', requirePermission('assets.update'), patchAsset);

export default router;
