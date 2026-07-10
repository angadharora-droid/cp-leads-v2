import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  loginSchema,
  changePasswordSchema,
} from '../validation/auth.validation.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// PUBLIC
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authLimiter, authController.refresh);

// AUTH-OPTIONAL: logout works whether or not the access token is still valid;
// it only needs the refresh cookie, so it is left public to allow clean logout
// after the access token has expired.
router.post('/logout', authController.logout);

// AUTHENTICATED
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);
router.get('/me', authenticate, authController.me);

export default router;
