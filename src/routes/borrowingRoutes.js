import { Router } from 'express';
import { getBorrowingById, getBorrowings, postBorrowing, postBorrowingCancel, postBorrowingCheckin, postBorrowingCheckout, postBorrowingDecision, postBorrowingReady } from '../controllers/borrowingController.js';
import { requireAnyPermission, requireAuth, requirePermission } from '../middleware/auth.js';
import { requirePasswordChangeComplete } from '../middleware/passwordChange.js';

const router = Router();
router.use(requireAuth, requirePasswordChangeComplete);
router.get('/', requireAnyPermission(['borrowing.view', 'borrowing.view.assigned']), getBorrowings);
router.post('/', requirePermission('borrowing.create'), requirePermission('employees.view'), requirePermission('assets.view'), postBorrowing);
router.get('/:id', requireAnyPermission(['borrowing.view', 'borrowing.view.assigned']), getBorrowingById);
router.post('/:id/approve', requirePermission('borrowing.approve'), postBorrowingDecision);
router.post('/:id/ready', requirePermission('borrowing.checkout'), postBorrowingReady);
router.post('/:id/checkout', requirePermission('borrowing.checkout'), postBorrowingCheckout);
router.post('/:id/checkin', requirePermission('borrowing.checkin'), postBorrowingCheckin);
router.post('/:id/cancel', requirePermission('borrowing.cancel'), postBorrowingCancel);

export default router;
