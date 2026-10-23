import { Router } from 'express';
import { archiveEmployeeRecord, getEmployeeById, getEmployees, patchEmployee, postEmployee, restoreEmployeeRecord } from '../controllers/employeeController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('employees.view'), getEmployees);
router.post('/', requirePermission('employees.create'), postEmployee);
router.get('/:id', requirePermission('employees.view'), getEmployeeById);
router.patch('/:id', requirePermission('employees.update'), patchEmployee);
router.post('/:id/archive', requirePermission('employees.archive'), archiveEmployeeRecord);
router.post('/:id/restore', requirePermission('employees.archive'), restoreEmployeeRecord);

export default router;
