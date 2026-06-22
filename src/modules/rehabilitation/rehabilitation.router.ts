import { Router } from 'express';
import { rehabilitationController } from './rehabilitation.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions, scopeOrganization } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();
router.use(authenticate);
const c = rehabilitationController;

router.get('/',              requirePermission(Permissions.REHAB_VIEW),    scopeOrganization(), c.list.bind(c));
router.post('/',             requirePermission(Permissions.REHAB_EDIT),    auditLog('update', 'rehabilitation'), c.create.bind(c));
router.get('/:id',           requirePermission(Permissions.REHAB_VIEW),    c.getById.bind(c));
router.patch('/:id/approve', requirePermission(Permissions.REHAB_APPROVE), auditLog('approve', 'rehabilitation'), c.approve.bind(c));
router.patch('/:id/reject',  requirePermission(Permissions.REHAB_APPROVE), auditLog('reject', 'rehabilitation'),  c.reject.bind(c));
router.patch('/:id/reopen',  requirePermission(Permissions.REHAB_REOPEN),  auditLog('reopen', 'rehabilitation'),  c.reopen.bind(c));

export default router;
