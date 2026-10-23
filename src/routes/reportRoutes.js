import { Router } from 'express';
import { exportReportCsv, getDashboard, getOperational } from '../controllers/reportController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/dashboard', requirePermission('reports.view'), getDashboard);
router.get('/operational', requirePermission('reports.view'), getOperational);
router.get('/export/:type.csv', requirePermission('reports.export'), exportReportCsv);

export default router;
