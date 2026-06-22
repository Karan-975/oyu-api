import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { loginLimiter, passwordResetLimiter } from '../../middleware/rateLimiter';
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshTokenSchema,
  updateProfileSchema,
} from './auth.schema';

const router = Router();

// Public routes
router.post('/login',           loginLimiter,         validate(loginSchema),           authController.login.bind(authController));
router.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema),  authController.forgotPassword.bind(authController));
router.post('/reset-password',                        validate(resetPasswordSchema),   authController.resetPassword.bind(authController));
router.post('/refresh',                               validate(refreshTokenSchema),    authController.refreshToken.bind(authController));

// Protected routes
router.use(authenticate);
router.post('/logout',          authController.logout.bind(authController));
router.post('/change-password', validate(changePasswordSchema), authController.changePassword.bind(authController));
router.get('/me',               authController.getProfile.bind(authController));
router.put('/me',               validate(updateProfileSchema),  authController.updateProfile.bind(authController));

export default router;
