import { Router } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { getWarrantyAssets } from '../controllers/warrantyController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
const denyItStaff = (req, res, next) => req.user.role?.key === 'IT_STAFF'
  ? next(new AppError(403, 'FORBIDDEN', 'IT Staff cannot access warranties'))
  : next();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', denyItStaff, requirePermission('maintenance.view'), getWarrantyAssets);

export default router;
