import { Router } from 'express';
import { waterTestingController } from './water-testing.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { Permissions } from '../../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);
const c = waterTestingController;

router.get('/',            requirePermission(Permissions.SURVEY_VIEW),    c.list.bind(c));
router.post('/',           requirePermission(Permissions.SURVEY_CREATE),  auditLog('submit', 'water_testing'), c.create.bind(c));
router.get('/:id',         requirePermission(Permissions.SURVEY_VIEW),    c.getById.bind(c));
router.patch('/:id/upload', requirePermission(Permissions.SURVEY_APPROVE), auditLog('upload_report', 'water_testing'), c.uploadReport.bind(c));
router.patch('/:id/publish', requirePermission(Permissions.SURVEY_APPROVE), auditLog('publish_report', 'water_testing'), c.publish.bind(c));
router.patch('/:id/reopen',  requirePermission(Permissions.SURVEY_REOPEN),  auditLog('reopen', 'water_testing'),  c.reopen.bind(c));

export default router;
