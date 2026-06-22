import { query } from '../../config/database';

export class DashboardService {
  async getSummary(ngoId?: string, userRoles?: string[]) {
    const isNgoAdmin = !!(ngoId && userRoles?.includes('ngo_admin') && !userRoles?.includes('super_admin'));
    const ngoFilter = ngoId ? ` AND b.assigned_ngo_id = '${ngoId}'` : '';
    const ngoFilterSimple = ngoId ? ` AND assigned_ngo_id = '${ngoId}'` : '';

    // FRS 9.2 — Super Admin: Total NGOs count
    const [ngos] = await query<any>(`SELECT COUNT(*) as c FROM ngos WHERE deleted_at IS NULL`);

    // Team members scoped to NGO for NGO Admin (FRS 8.2: Total Active Users)
    const teamScope = ngoId ? ` AND u.ngo_id = '${ngoId}'` : '';
    const [teamMembers] = await query<any>(
      `SELECT COUNT(DISTINCT u.id) as c
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.deleted_at IS NULL AND u.status = 'active' AND r.slug = 'ngo_team_member'${teamScope}`
    );

    // Boreholes
    const [totalBoreholes] = await query<any>(`SELECT COUNT(*) as c FROM boreholes WHERE deleted_at IS NULL${ngoFilterSimple}`);
    const [activeBoreholes] = await query<any>(`SELECT COUNT(*) as c FROM boreholes WHERE operational_status = 'active' AND deleted_at IS NULL${ngoFilterSimple}`);

    // ── FIXED: surveys in progress scoped by borehole's NGO (not only fs.ngo_id)
    // This fixes the mismatch: dashboard count == surveys list count for NGO Admin
    const surveyNgoClause = ngoId
      ? ` AND (fs.ngo_id = '${ngoId}' OR b.assigned_ngo_id = '${ngoId}')`
      : '';
    const [surveysInProgress] = await query<any>(
      `SELECT COUNT(*) as c
       FROM surveys s
       LEFT JOIN form_submissions fs ON fs.id = s.submission_id
       LEFT JOIN boreholes b ON b.id = s.borehole_id
       WHERE s.status IN ('draft','submitted')${surveyNgoClause}`
    );

    // Surveys completed
    const [surveysCompleted] = await query<any>(
      `SELECT COUNT(*) as c
       FROM surveys s
       LEFT JOIN form_submissions fs ON fs.id = s.submission_id
       LEFT JOIN boreholes b ON b.id = s.borehole_id
       WHERE s.status = 'approved'${surveyNgoClause}`
    );

    // Pending surveys (submitted, awaiting review)
    const [surveysPending] = await query<any>(
      `SELECT COUNT(*) as c
       FROM surveys s
       LEFT JOIN form_submissions fs ON fs.id = s.submission_id
       LEFT JOIN boreholes b ON b.id = s.borehole_id
       WHERE s.status = 'submitted'${surveyNgoClause}`
    );

    // Rehabilitation
    const rehabFilter = ngoId
      ? ` JOIN boreholes b ON b.id = rr.borehole_id WHERE b.assigned_ngo_id = '${ngoId}' AND`
      : ' WHERE';
    const [rehabInProgress] = await query<any>(
      `SELECT COUNT(*) as c FROM rehabilitation_records rr${rehabFilter} rr.status IN ('pending','in_progress')`
    );

    // Monitoring pending
    const [monitoringPending] = await query<any>(
      `SELECT COUNT(*) as c FROM boreholes WHERE operational_status = 'monitoring_pending' AND deleted_at IS NULL${ngoFilterSimple}`
    );

    // Open grievances
    const grievanceFilter = ngoId ? ` AND ngo_id = '${ngoId}'` : '';
    const [openGrievances] = await query<any>(
      `SELECT COUNT(*) as c FROM grievances WHERE status IN ('submitted','under_review')${grievanceFilter}`
    );

    // Closed grievances
    const [closedGrievances] = await query<any>(
      `SELECT COUNT(*) as c FROM grievances WHERE status IN ('resolved','closed')${grievanceFilter}`
    );

    // Assigned locations (FRS 8.2)
    // Count distinct districts/regions assigned to the NGO
    const [assignedLocations] = await query<any>(
      ngoId
        ? `SELECT COUNT(DISTINCT COALESCE(b.district, b.village)) as c FROM boreholes b WHERE b.assigned_ngo_id = '${ngoId}' AND b.deleted_at IS NULL`
        : `SELECT COUNT(DISTINCT COALESCE(district, village)) as c FROM boreholes WHERE deleted_at IS NULL`
    );

    // Water testing pending (FRS 8.2, 9.11)
    const waterTestingFilter = ngoId
      ? ` AND EXISTS (SELECT 1 FROM boreholes b WHERE b.id = wt.borehole_id AND b.assigned_ngo_id = '${ngoId}')`
      : '';
    const [waterTestingPending] = await query<any>(
      `SELECT COUNT(*) as c FROM water_testing_records wt WHERE wt.status IN ('submitted','sample_collected') ${waterTestingFilter}`
    ).catch(() => [{ c: 0 }]); // graceful fallback if table doesn't exist yet

    // Under Recce: boreholes that don't have an approved Recce survey
    const [boreholesUnderRecce] = await query<any>(
      `SELECT COUNT(*) as c FROM boreholes b WHERE b.deleted_at IS NULL${ngoFilter} AND b.id NOT IN (
        SELECT s.borehole_id FROM surveys s WHERE s.survey_type = 'recce' AND s.status = 'approved'
      )`
    );

    // Pending Analysis: boreholes with approved Recce and approved Baseline, but not yet in rehabilitation_records
    const [boreholesPendingAnalysis] = await query<any>(
      `SELECT COUNT(DISTINCT b.id) as c FROM boreholes b 
       JOIN surveys s1 ON s1.borehole_id = b.id AND s1.survey_type = 'recce' AND s1.status = 'approved'
       JOIN surveys s2 ON s2.borehole_id = b.id AND s2.survey_type = 'baseline' AND s2.status = 'approved'
       WHERE b.deleted_at IS NULL${ngoFilter} AND b.id NOT IN (
         SELECT rr.borehole_id FROM rehabilitation_records rr
       )`
    );

    // Approved for Rehab: rehab records that are pending
    const [boreholesApprovedRehab] = await query<any>(
      `SELECT COUNT(DISTINCT rr.borehole_id) as c FROM rehabilitation_records rr 
       JOIN boreholes b ON b.id = rr.borehole_id 
       WHERE rr.status = 'pending'${ngoFilter}`
    );

    // Under Rehab: rehab records that are in_progress
    const [boreholesUnderRehab] = await query<any>(
      `SELECT COUNT(DISTINCT rr.borehole_id) as c FROM rehabilitation_records rr 
       JOIN boreholes b ON b.id = rr.borehole_id 
       WHERE rr.status = 'in_progress'${ngoFilter}`
    );

    // Completed: operational_status = 'completed'
    const [boreholesCompleted] = await query<any>(
      `SELECT COUNT(*) as c FROM boreholes WHERE operational_status = 'completed' AND deleted_at IS NULL${ngoFilterSimple}`
    );

    // WCFT pending: water testing reports uploaded but not published (status report_uploaded or under_review)
    const [wcftPending] = await query<any>(
      `SELECT COUNT(*) as c FROM water_testing_records wt 
       JOIN boreholes b ON b.id = wt.borehole_id 
       WHERE wt.status IN ('report_uploaded', 'under_review')${ngoFilter}`
    ).catch(() => [{ c: 0 }]);

    if (isNgoAdmin) {
      // FRS 8.2: NGO Admin Dashboard summary cards
      return {
        totalActiveUsers: parseInt(teamMembers.c),
        totalAssignedLocations: parseInt(assignedLocations.c),
        totalAccessibleBoreholes: parseInt(totalBoreholes.c),
        activitiesInProgress: parseInt(surveysInProgress.c),
        completedActivities: parseInt(surveysCompleted.c),
        pendingActivities: parseInt(surveysPending.c),
        monitoringPending: parseInt(monitoringPending.c),
        openGrievances: parseInt(openGrievances.c),
        closedGrievances: parseInt(closedGrievances.c),
        waterTestingPending: parseInt(waterTestingPending?.c ?? 0),
        wcftPending: parseInt(wcftPending?.c ?? 0),
        boreholesUnderRecce: parseInt(boreholesUnderRecce.c),
        boreholesPendingAnalysis: parseInt(boreholesPendingAnalysis.c),
        boreholesApprovedRehab: parseInt(boreholesApprovedRehab.c),
        boreholesUnderRehab: parseInt(boreholesUnderRehab.c),
        boreholesCompleted: parseInt(boreholesCompleted.c),
        boreholesUnderMonitoring: parseInt(monitoringPending.c),
        // Keep these for backward-compat
        totalNgos: 0,
        totalTeamMembers: parseInt(teamMembers.c),
        totalBoreholes: parseInt(totalBoreholes.c),
        activeBoreholes: parseInt(activeBoreholes.c),
        surveysInProgress: parseInt(surveysInProgress.c),
        rehabilitationInProgress: parseInt(rehabInProgress.c),
      };
    }

    // FRS 9.2: Super Admin Dashboard summary cards
    return {
      totalNgos: parseInt(ngos.c),
      totalTeamMembers: parseInt(teamMembers.c),
      totalBoreholes: parseInt(totalBoreholes.c),
      activeBoreholes: parseInt(activeBoreholes.c),
      surveysInProgress: parseInt(surveysInProgress.c),
      surveysCompleted: parseInt(surveysCompleted.c),
      rehabilitationInProgress: parseInt(rehabInProgress.c),
      monitoringPending: parseInt(monitoringPending.c),
      openGrievances: parseInt(openGrievances.c),
      closedGrievances: parseInt(closedGrievances.c),
      waterTestingPending: parseInt(waterTestingPending?.c ?? 0),
      wcftPending: parseInt(wcftPending?.c ?? 0),
      assignedLocations: parseInt(assignedLocations.c),
      boreholesUnderRecce: parseInt(boreholesUnderRecce.c),
      boreholesPendingAnalysis: parseInt(boreholesPendingAnalysis.c),
      boreholesApprovedRehab: parseInt(boreholesApprovedRehab.c),
      boreholesUnderRehab: parseInt(boreholesUnderRehab.c),
      boreholesCompleted: parseInt(boreholesCompleted.c),
      boreholesUnderMonitoring: parseInt(monitoringPending.c),
      // NGO-admin compat aliases
      totalActiveUsers: parseInt(teamMembers.c),
      totalAssignedLocations: parseInt(assignedLocations.c),
      totalAccessibleBoreholes: parseInt(totalBoreholes.c),
      activitiesInProgress: parseInt(surveysInProgress.c),
      completedActivities: parseInt(surveysCompleted.c),
      pendingActivities: parseInt(surveysPending.c),
    };
  }

  async getCharts() {
    const boreholesByStatus = await query<any>(
      `SELECT functional_status as status, COUNT(*) as count FROM boreholes WHERE deleted_at IS NULL GROUP BY functional_status`
    );
    const ngoPerformance = await query<any>(
      `SELECT n.name, COUNT(b.id) as borehole_count,
              SUM(CASE WHEN b.operational_status = 'completed' THEN 1 ELSE 0 END) as completed_count
       FROM ngos n LEFT JOIN boreholes b ON b.assigned_ngo_id = n.id AND b.deleted_at IS NULL
       WHERE n.deleted_at IS NULL GROUP BY n.id ORDER BY borehole_count DESC LIMIT 10`
    );
    const rehabilitationPerformance = await query<any>(
      `SELECT n.name, COUNT(rr.id) as total_records,
              SUM(CASE WHEN rr.status = 'approved' THEN 1 ELSE 0 END) as approved_count
       FROM ngos n
       LEFT JOIN boreholes b ON b.assigned_ngo_id = n.id AND b.deleted_at IS NULL
       LEFT JOIN rehabilitation_records rr ON rr.borehole_id = b.id
       WHERE n.deleted_at IS NULL GROUP BY n.id ORDER BY total_records DESC LIMIT 10`
    );
    const monthlyProgress = await query<any>(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count
       FROM boreholes WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
       GROUP BY month ORDER BY month`
    );
    return { boreholesByStatus, ngoPerformance, rehabilitationPerformance, monthlyProgress };
  }

  async getRecentActivities(limit = 20, ngoId?: string) {
    const ngoClause = ngoId
      ? ` AND (al.entity_type = 'borehole' AND al.entity_id IN (SELECT id FROM boreholes WHERE assigned_ngo_id = '${ngoId}') OR al.user_id IN (SELECT id FROM users WHERE ngo_id = '${ngoId}'))`
      : '';
    return query<any>(
      `SELECT al.*, u.first_name, u.last_name FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE 1=1${ngoClause}
       ORDER BY al.created_at DESC LIMIT ?`, [limit]
    );
  }
}
export const dashboardService = new DashboardService();
