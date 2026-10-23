import { Router } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { deleteDepartmentRecord, getDepartmentById, getDepartments, patchDepartment, postDepartment } from '../controllers/departmentController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
const denyItStaff = (req, res, next) => req.user.role?.key === 'IT_STAFF'
  ? next(new AppError(403, 'FORBIDDEN', 'IT Staff cannot access departments'))
  : next();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', denyItStaff, requirePermission('departments.view'), getDepartments);
router.post('/', requirePermission('departments.create'), postDepartment);
router.get('/:id', denyItStaff, requirePermission('departments.view'), getDepartmentById);
router.patch('/:id', requirePermission('departments.update'), patchDepartment);
router.delete('/:id', requirePermission('departments.delete'), deleteDepartmentRecord);

export default router;
