import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as userController from '../controllers/user.controller.js';
import {
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  userIdParamsSchema,
} from '../validation/user.validation.js';

const router = Router();

// Every user-management route is admin-only.
router.use(authenticate, requireRole('admin'));

router
  .route('/')
  .get(validate(listUsersQuerySchema, 'query'), userController.listUsers)
  .post(validate(createUserSchema), userController.createUser);

router
  .route('/:id')
  .get(validate(userIdParamsSchema, 'params'), userController.getUser)
  .patch(
    validate(userIdParamsSchema, 'params'),
    validate(updateUserSchema),
    userController.updateUser
  )
  .delete(validate(userIdParamsSchema, 'params'), userController.deactivateUser);

router.patch(
  '/:id/password',
  validate(userIdParamsSchema, 'params'),
  validate(resetPasswordSchema),
  userController.resetPassword
);

export default router;
