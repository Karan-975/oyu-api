import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { createUserSchema, updateUserSchema, userStatusSchema, adminResetPasswordSchema, listUsersSchema, submitMyKycSchema } from './users.schema';

const router = Router();
router.use(authenticate);

router.get('/',             requirePermission(Permissions.USER_VIEW),   validate(listUsersSchema),           usersController.list.bind(usersController));
router.post('/',            requirePermission(Permissions.USER_CREATE), validate(createUserSchema),          auditLog('create', 'user'), usersController.create.bind(usersController));
router.get('/me/kyc',       usersController.getMyKyc.bind(usersController));
router.put('/me/kyc',       validate(submitMyKycSchema), auditLog('submit_kyc', 'user'), usersController.submitMyKyc.bind(usersController));
router.get('/:id',          requirePermission(Permissions.USER_VIEW),   usersController.getById.bind(usersController));
router.put('/:id',          requirePermission(Permissions.USER_EDIT),   validate(updateUserSchema),          auditLog('update', 'user'), usersController.update.bind(usersController));
router.patch('/:id/status', requirePermission(Permissions.USER_EDIT),   validate(userStatusSchema),          auditLog('status_change', 'user'), usersController.setStatus.bind(usersController));
router.post('/:id/reset-password', requirePermission(Permissions.USER_EDIT), validate(adminResetPasswordSchema), auditLog('reset_password', 'user'), usersController.resetPassword.bind(usersController));
router.delete('/:id',       requirePermission(Permissions.USER_DELETE), auditLog('delete', 'user'),          usersController.delete.bind(usersController));

export default router;
