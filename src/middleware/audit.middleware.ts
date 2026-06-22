import { Request, Response, NextFunction } from 'express';
import { execute } from '../config/database';
import { logger } from '../shared/utils/logger';

export interface AuditEntry {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: object;
  newValues?: object;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs 
       (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.userId ?? null,
        entry.action,
        entry.entityType,
        entry.entityId ?? null,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ]
    );
  } catch (err) {
    logger.error('Failed to write audit log:', err);
  }
}

export function auditLog(action: string, entityType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (res.statusCode < 400) {
        const entityId =
          req.params.id ?? body?.data?.id ?? body?.id ?? undefined;
        createAuditLog({
          userId: req.user?.userId,
          action,
          entityType,
          entityId: entityId?.toString(),
          ipAddress: req.ip ?? req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        }).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  };
}
