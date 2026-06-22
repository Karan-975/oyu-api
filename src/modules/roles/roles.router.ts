import { Router } from 'express';
import { rolesController } from './roles.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();
router.use(authenticate);

router.get('/',               requirePermission(Permissions.SETTINGS_VIEW), rolesController.list.bind(rolesController));
router.get('/permissions',    requirePermission(Permissions.SETTINGS_VIEW), rolesController.listPermissions.bind(rolesController));
router.get('/:id',            requirePermission(Permissions.SETTINGS_VIEW), rolesController.getById.bind(rolesController));
router.put('/:id/permissions', requirePermission(Permissions.ROLE_MANAGE),  auditLog('update_permissions', 'role'), rolesController.updatePermissions.bind(rolesController));

export default router;
