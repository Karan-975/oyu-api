import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from './errorHandler';

/**
 * Require one or more permissions (OR logic — any one is enough)
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ForbiddenError('Not authenticated');

    const userPerms = req.user.permissions ?? [];
    const userRoles = req.user.roles ?? [];

    // Super admin bypasses all permission checks
    if (userRoles.includes('super_admin')) return next();

    const hasPermission = permissions.some((p) => userPerms.includes(p));
    if (!hasPermission) {
      throw new ForbiddenError(`Missing required permission: ${permissions.join(' or ')}`);
    }
    next();
  };
}

/**
 * Require all listed permissions (AND logic)
 */
export function requireAllPermissions(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ForbiddenError('Not authenticated');
    const userRoles = req.user.roles ?? [];
    if (userRoles.includes('super_admin')) return next();

    const userPerms = req.user.permissions ?? [];
    const missing = permissions.filter((p) => !userPerms.includes(p));
    if (missing.length) {
      throw new ForbiddenError(`Missing permissions: ${missing.join(', ')}`);
    }
    next();
  };
}

/**
 * Require a specific role
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ForbiddenError('Not authenticated');
    const userRoles = req.user.roles ?? [];
    if (userRoles.includes('super_admin')) return next();

    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      throw new ForbiddenError(`Required role: ${roles.join(' or ')}`);
    }
    next();
  };
}

/**
 * NGO-scoped access: ensure user belongs to the NGO referenced in the request
 */
export function requireNgoAccess(getNgoId: (req: Request) => string | undefined) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ForbiddenError('Not authenticated');
    const userRoles = req.user.roles ?? [];
    if (userRoles.includes('super_admin')) return next();

    const requestedNgoId = getNgoId(req);
    if (requestedNgoId && req.user.ngoId !== requestedNgoId) {
      throw new ForbiddenError('You do not have access to this NGO\'s data');
    }
    next();
  };
}

export const Permissions = {
  // Users
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_EDIT: 'user:edit',
  USER_DELETE: 'user:delete',
  // NGOs
  NGO_VIEW: 'ngo:view',
  NGO_CREATE: 'ngo:create',
  NGO_EDIT: 'ngo:edit',
  NGO_DELETE: 'ngo:delete',
  // Boreholes
  BOREHOLE_VIEW: 'borehole:view',
  BOREHOLE_CREATE: 'borehole:create',
  BOREHOLE_EDIT: 'borehole:edit',
  BOREHOLE_DELETE: 'borehole:delete',
  BOREHOLE_ASSIGN: 'borehole:assign',
  // Assignments
  ASSIGNMENT_VIEW: 'assignment:view',
  ASSIGNMENT_CREATE: 'assignment:create',
  ASSIGNMENT_EDIT: 'assignment:edit',
  // Forms
  FORM_VIEW: 'form:view',
  FORM_CREATE: 'form:create',
  FORM_EDIT: 'form:edit',
  FORM_DELETE: 'form:delete',
  // Surveys
  SURVEY_VIEW: 'survey:view',
  SURVEY_CREATE: 'survey:create',
  SURVEY_APPROVE: 'survey:approve',
  SURVEY_REJECT: 'survey:reject',
  SURVEY_REOPEN: 'survey:reopen',
  // Rehabilitation
  REHAB_VIEW: 'rehabilitation:view',
  REHAB_EDIT: 'rehabilitation:edit',
  REHAB_APPROVE: 'rehabilitation:approve',
  REHAB_REOPEN: 'rehabilitation:reopen',
  // Grievances
  GRIEVANCE_VIEW: 'grievance:view',
  GRIEVANCE_CREATE: 'grievance:create',
  GRIEVANCE_ASSIGN: 'grievance:assign',
  GRIEVANCE_CLOSE: 'grievance:close',
  // Reports
  REPORT_VIEW: 'report:view',
  REPORT_EXPORT: 'report:export',
  // Audit
  AUDIT_VIEW: 'audit:view',
  // Settings
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_EDIT: 'settings:edit',
  ROLE_MANAGE: 'role:manage',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

type ScopeOrganizationOptions = {
  includeAssignedUser?: boolean;
};

/**
 * Automatically scope queries by user's NGO.
 * When includeAssignedUser is false, the request is scoped to the
 * organization only and does not require a direct user assignment.
 */
export function scopeOrganization(options: ScopeOrganizationOptions = {}) {
  const { includeAssignedUser = true } = options;

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next();

    const userRoles = req.user.roles ?? [];
    if (userRoles.includes('super_admin')) {
      return next();
    }

    if (includeAssignedUser && userRoles.includes('ngo_team_member')) {
      req.query.assignedUserId = req.user.userId;
    }

    if (req.user.ngoId) {
      req.query.ngoId = req.user.ngoId;
    } else {
      req.query.ngoId = '00000000-0000-0000-0000-000000000000';
    }
    next();
  };
}
