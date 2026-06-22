import { query } from '../../config/database';
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requirePermission, Permissions } from '../../middleware/rbac.middleware';

async function generateReport(reportType: string, filters: any) {
  switch (reportType) {
    case 'borehole_progress':
      return query<any>(
        `SELECT b.borehole_code, b.name, b.village, b.district, b.functional_status, b.operational_status,
                n.name as ngo_name, b.created_at
         FROM boreholes b LEFT JOIN ngos n ON n.id = b.assigned_ngo_id
         WHERE b.deleted_at IS NULL ORDER BY b.created_at DESC`
      );
    case 'ngo_operational':
      return query<any>(
        `SELECT n.name, n.status, n.contact_person, n.email,
                (SELECT COUNT(*) FROM boreholes b WHERE b.assigned_ngo_id = n.id AND b.deleted_at IS NULL) as total_boreholes,
                (SELECT COUNT(*) FROM boreholes b WHERE b.assigned_ngo_id = n.id AND b.operational_status = 'completed' AND b.deleted_at IS NULL) as completed,
                (SELECT COUNT(*) FROM users u WHERE u.ngo_id = n.id AND u.deleted_at IS NULL) as total_users
         FROM ngos n WHERE n.deleted_at IS NULL ORDER BY n.name`
      );
    case 'rehabilitation':
      return query<any>(
        `SELECT CONCAT(u.first_name, ' ', u.last_name) as member_name, u.email,
                COUNT(rr.id) as total_records,
                SUM(CASE WHEN rr.status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN rr.status = 'rejected' THEN 1 ELSE 0 END) as rejected
         FROM rehabilitation_records rr
         LEFT JOIN users u ON u.id = rr.created_by
         GROUP BY u.id, u.first_name, u.last_name, u.email
         ORDER BY member_name`
      );
    case 'survey_completion':
      return query<any>(
        `SELECT s.survey_type, s.status, COUNT(*) as count FROM surveys s GROUP BY s.survey_type, s.status ORDER BY s.survey_type`
      );
    case 'grievance':
      return query<any>(
        `SELECT g.status, g.priority, COUNT(*) as count, AVG(TIMESTAMPDIFF(HOUR, g.created_at, COALESCE(g.resolved_at, NOW()))) as avg_resolution_hours
         FROM grievances g GROUP BY g.status, g.priority ORDER BY g.priority`
      );
    case 'water_testing':
      return query<any>(
        `SELECT b.borehole_code, b.name as borehole_name, b.village, b.district,
                wt.submission_date, wt.status, wt.param_ph as ph, wt.param_tds as tds,
                wt.param_turbidity as turbidity, wt.param_ec as conductivity,
                CONCAT(u.first_name, ' ', u.last_name) as tested_by
         FROM water_testing_records wt
         JOIN boreholes b ON b.id = wt.borehole_id
         LEFT JOIN users u ON u.id = wt.submitted_by
         WHERE wt.deleted_at IS NULL ORDER BY wt.submission_date DESC`
      );
    case 'user_performance':
      return query<any>(
        `SELECT u.email, CONCAT(u.first_name, ' ', u.last_name) as user_name,
                COUNT(al.id) as total_activities,
                SUM(CASE WHEN al.action = 'create' THEN 1 ELSE 0 END) as creations,
                SUM(CASE WHEN al.action = 'update' THEN 1 ELSE 0 END) as updates,
                SUM(CASE WHEN al.action = 'status_change' THEN 1 ELSE 0 END) as status_changes,
                MAX(al.created_at) as last_active_at
         FROM users u
         LEFT JOIN audit_logs al ON al.user_id = u.id
         WHERE u.deleted_at IS NULL
         GROUP BY u.id, u.email, u.first_name, u.last_name
         ORDER BY total_activities DESC`
      );
    case 'lsc_activity':
      return query<any>(
        `SELECT b.borehole_code, b.name as borehole_name, b.village, b.district,
                s.status, s.score, s.submitted_at,
                CONCAT(u.first_name, ' ', u.last_name) as submitted_by
         FROM surveys s
         JOIN boreholes b ON b.id = s.borehole_id
         LEFT JOIN users u ON u.id = s.assigned_to
         WHERE s.survey_type = 'lsc'
         ORDER BY s.submitted_at DESC`
      );
    case 'monitoring':
      return query<any>(
        `SELECT b.borehole_code, b.name as borehole_name, b.village, b.district,
                s.status, s.score, s.submitted_at,
                CONCAT(u.first_name, ' ', u.last_name) as submitted_by
         FROM surveys s
         JOIN boreholes b ON b.id = s.borehole_id
         LEFT JOIN users u ON u.id = s.assigned_to
         WHERE s.survey_type = 'monitoring'
         ORDER BY s.submitted_at DESC`
      );
    case 'assignment_access':
      return query<any>(
        `SELECT ba.assignee_type,
                CASE WHEN ba.assignee_type = 'ngo' THEN (SELECT name FROM ngos WHERE id = ba.assignee_id)
                     ELSE (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = ba.assignee_id) END as assignee_name,
                b.borehole_code, b.name as borehole_name,
                ba.module, ba.status, ba.assigned_at,
                CONCAT(u.first_name, ' ', u.last_name) as assigned_by
         FROM borehole_assignments ba
         JOIN boreholes b ON b.id = ba.borehole_id
         LEFT JOIN users u ON u.id = ba.assigned_by
         ORDER BY ba.assigned_at DESC`
      );
    case 'audit_summary':
      return query<any>(
        `SELECT al.action, al.entity_type, al.entity_id, al.created_at,
                CONCAT(u.first_name, ' ', u.last_name) as performed_by, u.email
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         ORDER BY al.created_at DESC LIMIT 500`
      );
    case 'carbon_compliance':
      return query<any>(
        `SELECT name as ngo_name, contact_person, email, phone,
                kyc_status, signature_status, status as compliance_status,
                created_at
         FROM ngos
         WHERE deleted_at IS NULL ORDER BY created_at DESC`
      );
    case 'borehole_lifecycle':
      return query<any>(
        `SELECT b.borehole_code, b.name as borehole_name, b.village, b.district,
                b.operational_status as current_stage,
                (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'recce' ORDER BY s.created_at DESC LIMIT 1) as recce_status,
                (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'baseline' ORDER BY s.created_at DESC LIMIT 1) as baseline_status,
                (SELECT rr.status FROM rehabilitation_records rr WHERE rr.borehole_id = b.id ORDER BY rr.created_at DESC LIMIT 1) as rehab_status,
                (SELECT wt.status FROM water_testing_records wt WHERE wt.borehole_id = b.id ORDER BY wt.submission_date DESC LIMIT 1) as water_testing_status,
                (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'monitoring' ORDER BY s.created_at DESC LIMIT 1) as monitoring_status
         FROM boreholes b
         WHERE b.deleted_at IS NULL ORDER BY b.created_at DESC`
      );
    default:
      return [];
  }
}

const router = Router();
router.use(authenticate);
router.get('/:type', requirePermission(Permissions.REPORT_VIEW), async (req: Request, res: Response) => {
  const data = await generateReport(req.params.type, req.query);
  res.json({ success: true, data, reportType: req.params.type });
});
export default router;
