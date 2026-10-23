import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, currentUser, login, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, code: 'LOGIN_RATE_LIMITED', message: 'Too many login attempts. Try again later.' }
});

router.post('/login', loginLimiter, login);
router.post('/logout', logout);
router.get('/me', requireAuth, currentUser);
router.post('/change-password', requireAuth, changePassword);

export default router;
