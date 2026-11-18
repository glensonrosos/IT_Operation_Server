import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, currentUser, login, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again later.'
});

router.post('/login', loginRateLimit, login);
router.post('/logout', logout);
router.get('/me', requireAuth, currentUser);
router.post('/change-password', requireAuth, changePassword);

export default router;
