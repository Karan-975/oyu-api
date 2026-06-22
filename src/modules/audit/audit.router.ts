import { query } from '../../config/database';
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions } from '../../middleware/rbac.middleware';

async function listAuditLogs(queryParams: any) {
  const pageNumber = Number(queryParams.page ?? 1) || 1;
  const limitNumber = Number(queryParams.limit ?? 50) || 50;
  const offset = (pageNumber - 1) * limitNumber;
  const conditions: string[] = [];
  const params: any[] = [];
  if (queryParams.userId) { conditions.push('al.user_id = ?'); params.push(queryParams.userId); }
  if (queryParams.entityType) { conditions.push('al.entity_type = ?'); params.push(queryParams.entityType); }
  if (queryParams.action) { conditions.push('al.action = ?'); params.push(queryParams.action); }
  if (queryParams.startDate) { conditions.push('al.created_at >= ?'); params.push(queryParams.startDate); }
  if (queryParams.endDate) { conditions.push('al.created_at <= ?'); params.push(queryParams.endDate); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM audit_logs al ${where}`, params);
  const data = await query<any>(
    `SELECT al.*, u.first_name, u.last_name, u.email FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id
     ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`, [...params, limitNumber, offset]
  );
  return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
}

const router = Router();
router.use(authenticate);
router.get('/', requirePermission(Permissions.AUDIT_VIEW), async (req: Request, res: Response) => {
  res.json({ success: true, ...(await listAuditLogs(req.query as any)) });
});
export default router;
