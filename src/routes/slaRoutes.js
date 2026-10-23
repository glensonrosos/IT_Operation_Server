import { Router } from 'express';
import { getSlaPolicies, patchSlaPolicy } from '../controllers/ticketConfigController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('tickets.create'), getSlaPolicies);
router.patch('/:priority', requirePermission('sla.manage'), patchSlaPolicy);

export default router;
