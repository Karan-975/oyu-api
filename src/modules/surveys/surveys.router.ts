import { Router } from 'express';
import { surveysController } from './surveys.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions, scopeOrganization } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();
router.use(authenticate);
const c = surveysController;

router.get('/',             requirePermission(Permissions.SURVEY_VIEW),    scopeOrganization(), c.list.bind(c));
router.post('/',            requirePermission(Permissions.SURVEY_CREATE),  auditLog('submit', 'survey'), c.create.bind(c));
router.get('/:id',          requirePermission(Permissions.SURVEY_VIEW),    c.getById.bind(c));
router.patch('/:id/approve', requirePermission(Permissions.SURVEY_APPROVE), auditLog('approve', 'survey'), c.approve.bind(c));
router.patch('/:id/reject',  requirePermission(Permissions.SURVEY_REJECT),  auditLog('reject', 'survey'),  c.reject.bind(c));
router.patch('/:id/reopen',  requirePermission(Permissions.SURVEY_REOPEN),  auditLog('reopen', 'survey'),  c.reopen.bind(c));

export default router;
