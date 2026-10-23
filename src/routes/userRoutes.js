import { Router } from 'express';
import { getUsers, patchUser, postUser, postUserPasswordReset } from '../controllers/userController.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requirePermission('users.view'), getUsers);
router.post('/', requirePermission('users.create'), postUser);
router.patch('/:id', requirePermission('users.update'), patchUser);
router.post('/:id/reset-password', requirePermission('users.update'), postUserPasswordReset);

export default router;
