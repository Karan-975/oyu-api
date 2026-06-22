import { Router } from 'express';
import { formsController } from './forms.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();
router.use(authenticate);

const c = formsController;

// Modules
router.get('/modules',               requirePermission(Permissions.FORM_VIEW),   c.listModules.bind(c));
router.post('/modules',              requirePermission(Permissions.FORM_CREATE), auditLog('create', 'form_module'), c.createModule.bind(c));
router.get('/modules/:id',           requirePermission(Permissions.FORM_VIEW, Permissions.SURVEY_CREATE, Permissions.REHAB_EDIT),   c.getModule.bind(c));
router.put('/modules/:id',           requirePermission(Permissions.FORM_EDIT),   auditLog('update', 'form_module'), c.updateModule.bind(c));

// Sections
router.post('/modules/:id/sections', requirePermission(Permissions.FORM_CREATE), auditLog('create', 'form_section'), c.addSection.bind(c));
router.put('/sections/:id',          requirePermission(Permissions.FORM_EDIT),   auditLog('update', 'form_section'), c.updateSection.bind(c));
router.delete('/sections/:id',       requirePermission(Permissions.FORM_DELETE), auditLog('delete', 'form_section'), c.deleteSection.bind(c));

// Fields
router.post('/sections/:id/fields',  requirePermission(Permissions.FORM_CREATE), auditLog('create', 'form_field'), c.addField.bind(c));
router.put('/fields/:id',            requirePermission(Permissions.FORM_EDIT),   auditLog('update', 'form_field'), c.updateField.bind(c));
router.delete('/fields/:id',         requirePermission(Permissions.FORM_DELETE), auditLog('delete', 'form_field'), c.deleteField.bind(c));
router.patch('/sections/:id/reorder', requirePermission(Permissions.FORM_EDIT),  c.reorderFields.bind(c));

// Field Options
router.post('/fields/:id/options',          requirePermission(Permissions.FORM_EDIT), c.addFieldOption.bind(c));
router.delete('/options/:id',               requirePermission(Permissions.FORM_DELETE), c.deleteFieldOption.bind(c));

// Field Validations
router.post('/fields/:id/validations',      requirePermission(Permissions.FORM_EDIT), c.addFieldValidation.bind(c));
router.delete('/validations/:id',           requirePermission(Permissions.FORM_DELETE), c.deleteFieldValidation.bind(c));

// Field Conditions
router.post('/fields/:id/conditions',       requirePermission(Permissions.FORM_EDIT), c.addFieldCondition.bind(c));
router.delete('/conditions/:id',            requirePermission(Permissions.FORM_DELETE), c.deleteFieldCondition.bind(c));

export default router;
