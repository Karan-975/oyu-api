import { query } from '../../config/database';
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions, scopeOrganization } from '../../middleware/rbac.middleware';

// Service
async function listAssignments(queryParams: any) {
  const pageNumber = Number(queryParams.page ?? 1) || 1;
  const limitNumber = Number(queryParams.limit ?? 20) || 20;
  const offset = (pageNumber - 1) * limitNumber;
  const conditions: string[] = [];
  const params: any[] = [];
  if (queryParams.boreholeId) { conditions.push('ba.borehole_id = ?'); params.push(queryParams.boreholeId); }
  if (queryParams.assigneeType) { conditions.push('ba.assignee_type = ?'); params.push(queryParams.assigneeType); }
  if (queryParams.status) { conditions.push('ba.status = ?'); params.push(queryParams.status); }
  if (queryParams.ngoId) {
    conditions.push(`(
      (ba.assignee_type = 'ngo' AND ba.assignee_id = ?) OR 
      (ba.assignee_type = 'user' AND ba.assignee_id IN (SELECT id FROM users WHERE ngo_id = ?)) OR
      (ba.borehole_id IN (SELECT id FROM boreholes WHERE assigned_ngo_id = ?))
    )`);
    params.push(queryParams.ngoId, queryParams.ngoId, queryParams.ngoId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM borehole_assignments ba ${where}`, params);
  const data = await query<any>(
    `SELECT ba.*, b.borehole_code, b.name as borehole_name, u.first_name as assigned_by_name,
            CASE WHEN ba.assignee_type = 'ngo' THEN (SELECT name FROM ngos WHERE id = ba.assignee_id)
                 ELSE (SELECT CONCAT(first_name,' ',last_name) FROM users WHERE id = ba.assignee_id) END as assignee_name
     FROM borehole_assignments ba LEFT JOIN boreholes b ON b.id = ba.borehole_id LEFT JOIN users u ON u.id = ba.assigned_by
     ${where} ORDER BY ba.assigned_at DESC LIMIT ? OFFSET ?`, [...params, limitNumber, offset]
  );
  return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
}

// Router
const router = Router();
router.use(authenticate);
router.get('/', requirePermission(Permissions.ASSIGNMENT_VIEW), scopeOrganization(), async (req: Request, res: Response) => {
  res.json({ success: true, ...(await listAssignments(req.query as any)) });
});
export default router;
