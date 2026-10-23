import { Router } from 'express';
import { getMaintenanceById, getMaintenanceRecords, patchMaintenanceNotes, postMaintenance, postMaintenanceCancel, postMaintenanceComplete, postMaintenanceStart, postMaintenanceWaitingVendor } from '../controllers/maintenanceController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('maintenance.view'), getMaintenanceRecords);
router.post('/', requirePermission('maintenance.create'), postMaintenance);
router.post('/:id/start', requirePermission('maintenance.update'), postMaintenanceStart);
router.post('/:id/waiting-vendor', requirePermission('maintenance.update'), postMaintenanceWaitingVendor);
router.patch('/:id/notes', requirePermission('maintenance.update'), patchMaintenanceNotes);
router.post('/:id/complete', requirePermission('maintenance.update'), postMaintenanceComplete);
router.post('/:id/cancel', requirePermission('maintenance.update'), postMaintenanceCancel);
router.get('/:id', requirePermission('maintenance.view'), getMaintenanceById);

export default router;
