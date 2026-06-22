import { Router } from 'express';
import { ngoController } from './ngos.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { createNgoSchema, updateNgoSchema, ngoStatusSchema, listNgoSchema } from './ngos.schema';
import { Permissions } from '../../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/',        requirePermission(Permissions.NGO_VIEW),   validate(listNgoSchema),      ngoController.list.bind(ngoController));
router.post('/',       requirePermission(Permissions.NGO_CREATE), validate(createNgoSchema),     auditLog('create', 'ngo'), ngoController.create.bind(ngoController));
router.get('/:id',     requirePermission(Permissions.NGO_VIEW),   ngoController.getById.bind(ngoController));
router.put('/:id',     requirePermission(Permissions.NGO_EDIT),   validate(updateNgoSchema),     auditLog('update', 'ngo'), ngoController.update.bind(ngoController));
router.patch('/:id/status', requirePermission(Permissions.NGO_EDIT), validate(ngoStatusSchema),  auditLog('status_change', 'ngo'), ngoController.setStatus.bind(ngoController));
router.patch('/:id/send-kyc',    requirePermission(Permissions.NGO_EDIT), auditLog('send_kyc', 'ngo'),    ngoController.sendKyc.bind(ngoController));
router.patch('/:id/sign-kyc',    requirePermission(Permissions.NGO_EDIT), auditLog('sign_kyc', 'ngo'),    ngoController.signKyc.bind(ngoController));
router.patch('/:id/approve-kyc', requirePermission(Permissions.NGO_EDIT), auditLog('approve_kyc', 'ngo'), ngoController.approveKyc.bind(ngoController));
router.patch('/:id/reject-kyc',  requirePermission(Permissions.NGO_EDIT), auditLog('reject_kyc', 'ngo'),  ngoController.rejectKyc.bind(ngoController));
router.delete('/:id',  requirePermission(Permissions.NGO_DELETE), auditLog('delete', 'ngo'),     ngoController.delete.bind(ngoController));
router.get('/:id/boreholes', requirePermission(Permissions.NGO_VIEW), ngoController.getBoreholes.bind(ngoController));

export default router;
