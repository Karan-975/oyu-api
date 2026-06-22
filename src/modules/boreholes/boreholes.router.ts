import { Router } from 'express';
import { boreholeController } from './boreholes.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, requireRole, Permissions, scopeOrganization } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { createBoreholeSchema, updateBoreholeSchema, assignNgoSchema, assignUserSchema, reassignSchema, listBoreholeSchema, mapBoreholeSchema } from './boreholes.schema';

const router = Router();
router.use(authenticate);

router.get('/',               requirePermission(Permissions.BOREHOLE_VIEW),   scopeOrganization(), validate(listBoreholeSchema),    boreholeController.list.bind(boreholeController));
router.get('/map',            requirePermission(Permissions.BOREHOLE_VIEW),   scopeOrganization(), validate(mapBoreholeSchema),     boreholeController.getMapData.bind(boreholeController));
router.get('/matrix',         requirePermission(Permissions.BOREHOLE_VIEW),   scopeOrganization(), boreholeController.getMatrix.bind(boreholeController));
router.post('/',              requirePermission(Permissions.BOREHOLE_CREATE), validate(createBoreholeSchema),  auditLog('create', 'borehole'), boreholeController.create.bind(boreholeController));
router.get('/:id',            requirePermission(Permissions.BOREHOLE_VIEW),   boreholeController.getById.bind(boreholeController));
router.put('/:id',            requirePermission(Permissions.BOREHOLE_EDIT),   validate(updateBoreholeSchema),  auditLog('update', 'borehole'), boreholeController.update.bind(boreholeController));
router.post('/:id/assign-ngo',        requireRole('super_admin'), requirePermission(Permissions.BOREHOLE_ASSIGN), validate(assignNgoSchema),        auditLog('assign_ngo', 'borehole'), boreholeController.assignNgo.bind(boreholeController));
router.post(
  '/:id/assign-user',
  requirePermission(Permissions.BOREHOLE_ASSIGN, Permissions.ASSIGNMENT_CREATE),
  validate(assignUserSchema),
  auditLog('assign_user', 'borehole'),
  boreholeController.assignUser.bind(boreholeController)
);
router.post('/:id/reassign',  requirePermission(Permissions.BOREHOLE_ASSIGN), validate(reassignSchema),        auditLog('reassign', 'borehole'), boreholeController.reassign.bind(boreholeController));
router.get('/:id/timeline',   requirePermission(Permissions.BOREHOLE_VIEW),   boreholeController.getTimeline.bind(boreholeController));
router.get('/:id/assignments', requirePermission(Permissions.BOREHOLE_VIEW),  boreholeController.getAssignments.bind(boreholeController));
router.get('/:id/surveys',    requirePermission(Permissions.SURVEY_VIEW),     boreholeController.getSurveys.bind(boreholeController));
router.get('/:id/rehabilitation', requirePermission(Permissions.REHAB_VIEW),  boreholeController.getRehabilitation.bind(boreholeController));
router.delete('/:id',         requirePermission(Permissions.BOREHOLE_DELETE), auditLog('delete', 'borehole'),  boreholeController.delete.bind(boreholeController));

export default router;
