import { Router } from 'express';
import { getAuditLogs } from '../controllers/auditController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('audit.view'), getAuditLogs);

export default router;
