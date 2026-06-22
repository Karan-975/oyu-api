import { query, queryOne, execute } from '../../config/database';
import { NotFoundError, ConflictError, ForbiddenError } from '../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { JwtPayload } from '../../middleware/auth.middleware';
import { createNotification, createNotificationsForUsers } from '../notifications/notifications.router';

export class BoreholeService {
  async list({ page, limit, search, functionalStatus, operationalStatus, ngoId, regionId, assignedUserId }: any) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = ['b.deleted_at IS NULL'];
    const params: any[] = [];
    const accessConditions: string[] = [];
    const accessParams: any[] = [];

    if (search) { conditions.push('(b.borehole_code LIKE ? OR b.name LIKE ? OR b.village LIKE ? OR b.district LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
    if (functionalStatus) { conditions.push('b.functional_status = ?'); params.push(functionalStatus); }
    if (operationalStatus) { conditions.push('b.operational_status = ?'); params.push(operationalStatus); }
    if (ngoId) { accessConditions.push('b.assigned_ngo_id = ?'); accessParams.push(ngoId); }
    if (regionId) { conditions.push('b.region_id = ?'); params.push(regionId); }
    if (assignedUserId) {
      accessConditions.push(`EXISTS (
        SELECT 1 FROM borehole_assignments ba
        WHERE ba.borehole_id = b.id
          AND ba.assignee_type = 'user'
          AND ba.assignee_id = ?
          AND ba.status = 'active'
      )`);
      accessParams.push(assignedUserId);
    }
    if (accessConditions.length) {
      conditions.push(`(${accessConditions.join(' OR ')})`);
      params.push(...accessParams);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM boreholes b ${where}`, params);
    const data = await query<any>(
      `SELECT b.*, r.name as region_name, n.name as ngo_name
       FROM boreholes b
       LEFT JOIN regions r ON r.id = b.region_id
       LEFT JOIN ngos n ON n.id = b.assigned_ngo_id
       ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNumber, offset]
    );
    return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
  }

  /**
   * FRS Section 1 — Auto-generate Borehole ID
   * Format: [First 4 of Village] + [4-digit sequence] + [First 2 of Province]
   * Example: Village=Mandela, Province=Gauteng → MAND0001GA
   */
  private async generateBoreholeCode(village: string, province?: string): Promise<string> {
    const villagePart = (village || 'BORE').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
    const provincePart = (province || 'NA').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 2).padEnd(2, 'X');
    const prefix = `${villagePart}%${provincePart}`;
    // Find the highest sequence for this village+province combination
    const [lastRow] = await query<any>(
      `SELECT borehole_code FROM boreholes WHERE borehole_code LIKE ? AND deleted_at IS NULL ORDER BY borehole_code DESC LIMIT 1`,
      [prefix]
    ).catch(() => [[]]);
    let sequence = 1;
    if (lastRow?.borehole_code) {
      const numPart = lastRow.borehole_code.substring(4, 8);
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed)) sequence = parsed + 1;
    }
    return `${villagePart}${String(sequence).padStart(4, '0')}${provincePart}`;
  }



  async getById(id: string, requester?: JwtPayload) {
    const borehole = await queryOne<any>(
      `SELECT b.*, r.name as region_name, n.name as ngo_name,
              (SELECT assignee_id FROM borehole_assignments
               WHERE borehole_id = b.id AND assignee_type = 'user' AND status = 'active'
               LIMIT 1) as assigned_user_id,
              (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'recce' ORDER BY s.created_at DESC LIMIT 1) as recce_status,
              (SELECT s.id FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'recce' ORDER BY s.created_at DESC LIMIT 1) as recce_id,
              (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'baseline' ORDER BY s.created_at DESC LIMIT 1) as baseline_status,
              (SELECT s.id FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'baseline' ORDER BY s.created_at DESC LIMIT 1) as baseline_id,
              (SELECT rr.status FROM rehabilitation_records rr WHERE rr.borehole_id = b.id ORDER BY rr.created_at DESC LIMIT 1) as rehab_status,
              (SELECT rr.id FROM rehabilitation_records rr WHERE rr.borehole_id = b.id ORDER BY rr.created_at DESC LIMIT 1) as rehab_id,
              (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'monitoring' ORDER BY s.created_at DESC LIMIT 1) as monitoring_status,
              (SELECT s.id FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'monitoring' ORDER BY s.created_at DESC LIMIT 1) as monitoring_id,
              (SELECT wt.status FROM water_testing_records wt WHERE wt.borehole_id = b.id ORDER BY wt.submission_date DESC LIMIT 1) as water_testing_status,
              (SELECT wt.id FROM water_testing_records wt WHERE wt.borehole_id = b.id ORDER BY wt.submission_date DESC LIMIT 1) as water_testing_id,
              (SELECT COUNT(*) FROM grievances g WHERE g.borehole_id = b.id) as grievance_count,
              (SELECT COUNT(*) FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'lsc') as lsc_count
       FROM boreholes b
       LEFT JOIN regions r ON r.id = b.region_id LEFT JOIN ngos n ON n.id = b.assigned_ngo_id
       WHERE b.id = ? AND b.deleted_at IS NULL`, [id]
    );
    if (!borehole) throw new NotFoundError('Borehole not found');
    this.assertCanAccessBorehole(borehole, requester);
    return borehole;
  }

  private assertCanAccessBorehole(borehole: any, requester?: JwtPayload) {
    if (!requester || requester.roles.includes('super_admin')) return;

    if (requester.roles.includes('ngo_admin')) {
      if (!requester.ngoId || borehole.assigned_ngo_id !== requester.ngoId) {
        throw new ForbiddenError('You can only access boreholes assigned to your NGO.');
      }
      return;
    }

    if (requester.roles.includes('ngo_team_member')) {
      if (!requester.ngoId || borehole.assigned_ngo_id !== requester.ngoId) {
        throw new ForbiddenError('You can only access boreholes assigned to your NGO.');
      }
    }
  }

  async create(data: any, createdBy: string) {
    // FRS §1: Auto-generate Borehole ID if not provided
    if (!data.boreholeCode) {
      data.boreholeCode = await this.generateBoreholeCode(data.village, data.province);
    }

    const existing = await queryOne<any>(`SELECT id FROM boreholes WHERE borehole_code = ? AND deleted_at IS NULL`, [data.boreholeCode]);
    if (existing) throw new ConflictError(`A borehole with code '${data.boreholeCode}' already exists`);

    // Duplicate detection by GPS proximity (within ~50m)
    const nearby = await query<any>(
      `SELECT id, borehole_code, name FROM boreholes
       WHERE ABS(latitude - ?) < 0.0005 AND ABS(longitude - ?) < 0.0005 AND deleted_at IS NULL LIMIT 5`,
      [data.latitude, data.longitude]
    );

    const id = uuidv4();
    await execute(
      `INSERT INTO boreholes (id, borehole_code, name, village, district, province, region_id, latitude, longitude, elevation, functional_status, water_source, depth_meters, static_water_level, yield_lps, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.boreholeCode, data.name, data.village, data.district,
        data.province ?? null, data.regionId ?? null,
        data.latitude, data.longitude, data.elevation ?? null,
        data.functionalStatus, data.waterSource ?? null,
        data.depthMeters ?? null, data.staticWaterLevel ?? null, data.yieldLps ?? null,
        data.notes ?? null, createdBy
      ]
    ).catch(async (err) => {
      // If province column doesn't exist yet, fall back without it
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        await execute(
          `INSERT INTO boreholes (id, borehole_code, name, village, district, region_id, latitude, longitude, elevation, functional_status, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, data.boreholeCode, data.name, data.village, data.district, data.regionId ?? null,
           data.latitude, data.longitude, data.elevation ?? null, data.functionalStatus, data.notes ?? null, createdBy]
        );
      } else throw err;
    });

    await this.addTimeline(id, createdBy, 'created', `Borehole ${data.boreholeCode} created`);
    const result = await this.getById(id);
    return { ...result, nearbyBoreholes: nearby.length ? nearby : undefined };
  }

  async update(id: string, data: any, updatedBy: string) {
    const borehole = await queryOne<any>(`SELECT id FROM boreholes WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!borehole) throw new NotFoundError('Borehole not found');

    if (data.boreholeCode) {
      const conflict = await queryOne<any>(`SELECT id FROM boreholes WHERE borehole_code = ? AND id != ? AND deleted_at IS NULL`, [data.boreholeCode, id]);
      if (conflict) throw new ConflictError('Borehole code already in use');
    }

    await execute(
      `UPDATE boreholes SET
       borehole_code = COALESCE(?, borehole_code), name = COALESCE(?, name), village = COALESCE(?, village),
       district = COALESCE(?, district), region_id = COALESCE(?, region_id),
       latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), elevation = COALESCE(?, elevation),
       functional_status = COALESCE(?, functional_status), notes = COALESCE(?, notes) WHERE id = ?`,
      [data.boreholeCode, data.name, data.village, data.district, data.regionId,
       data.latitude, data.longitude, data.elevation, data.functionalStatus, data.notes, id]
    );

    await this.addTimeline(id, updatedBy, 'updated', 'Borehole details updated');
    return this.getById(id);
  }

  async assignNgo(id: string, ngoId: string, assignedBy: string, reason?: string, notifyNgoAdmins = true) {
    const borehole = await this.getById(id);
    const oldNgoId = borehole.assigned_ngo_id;

    // Complete previous assignment
    if (oldNgoId) {
      await execute(
        `UPDATE borehole_assignments SET status = 'reassigned', unassigned_at = NOW() WHERE borehole_id = ? AND assignee_type = 'ngo' AND status = 'active'`, [id]
      );
    }

    await execute(`UPDATE boreholes SET assigned_ngo_id = ? WHERE id = ?`, [ngoId, id]);
    await execute(
      `INSERT INTO borehole_assignments (id, borehole_id, assignee_type, assignee_id, assigned_by, reason) VALUES (UUID(), ?, 'ngo', ?, ?, ?)`,
      [id, ngoId, assignedBy, reason ?? null]
    );

    const ngo = await queryOne<any>(`SELECT name FROM ngos WHERE id = ?`, [ngoId]);
    await this.addTimeline(id, assignedBy, oldNgoId ? 'ngo_reassigned' : 'ngo_assigned', `Assigned to NGO: ${ngo?.name ?? ngoId}`);
    if (notifyNgoAdmins) {
      const ngoAdmins = await query<any>(
        `SELECT DISTINCT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.ngo_id = ? AND r.slug = 'ngo_admin' AND u.status = 'active' AND u.deleted_at IS NULL`,
        [ngoId]
      );
      await createNotificationsForUsers(ngoAdmins.map((admin) => admin.id), {
        type: 'assignment',
        title: oldNgoId ? 'Borehole Reassigned' : 'New Borehole Assignment',
        message: `${borehole.borehole_code} in ${borehole.village}, ${borehole.district} has been assigned to your operations.`,
        referenceId: id,
        referenceType: 'borehole',
        details: {
          'Borehole ID': borehole.borehole_code,
          Location: `${borehole.village}, ${borehole.district}`,
          Reason: reason,
        },
      });
    }
    return this.getById(id);
  }

  async assignToNgoAdmin(id: string, ngoAdminId: string, requester: JwtPayload) {
    if (!requester.roles.includes('super_admin')) {
      throw new ConflictError('Only Super Admin can assign a borehole to an NGO Admin.');
    }

    const admin = await queryOne<any>(
      `SELECT u.id, u.ngo_id,
              JSON_UNQUOTE(JSON_EXTRACT(u.kyc_data, '$.kycStatus')) as kyc_status
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ? AND r.slug = 'ngo_admin'
         AND u.status = 'active' AND u.deleted_at IS NULL
       LIMIT 1`,
      [ngoAdminId]
    );
    if (!admin) throw new NotFoundError('Selected NGO Admin was not found');
    if (!admin.ngo_id) throw new ConflictError('Selected NGO Admin is not linked to an NGO.');

    const normalizedKycStatus = String(admin.kyc_status ?? '').trim().toLowerCase();
    if (normalizedKycStatus !== 'approved' && normalizedKycStatus !== 'completed') {
      throw new ConflictError('Selected NGO Admin must complete KYC before receiving boreholes.');
    }

    await this.assignNgo(
      id,
      admin.ngo_id,
      requester.userId,
      'Assigned during borehole registration',
      false
    );
    return this.assignUser(
      id,
      ngoAdminId,
      requester,
      'Assigned during borehole registration'
    );
  }

  async assignUser(id: string, userId: string | null | undefined, requester: JwtPayload, reason?: string, module?: string | string[]) {
    const borehole = await this.getById(id);
    if (!userId) {
      // Unassign any active user assignments
      await execute(
        `UPDATE borehole_assignments
         SET status = 'reassigned', unassigned_at = NOW()
         WHERE borehole_id = ? AND assignee_type = 'user' AND status = 'active'`,
        [id]
      );
      await this.addTimeline(
        id,
        requester.userId,
        'user_unassigned',
        `Unassigned from field user`
      );
      return this.getById(id);
    }

    const user = await queryOne<any>(
      `SELECT u.id, u.first_name, u.last_name, u.ngo_id,
              GROUP_CONCAT(r.slug) as role_slugs
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ? AND u.status = 'active' AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [userId]
    );
    if (!user) throw new NotFoundError('Assigned user not found');

    const roles = user.role_slugs ? String(user.role_slugs).split(',') : [];
    const isNgoTeamMember = roles.includes('ngo_team_member');
    const isNgoAdmin = roles.includes('ngo_admin');

    if (!isNgoTeamMember && !isNgoAdmin) {
      throw new ConflictError('Boreholes can only be assigned to NGO Admins or NGO Team Members.');
    }
    if (!requester.roles.includes('super_admin')) {
      if (!requester.roles.includes('ngo_admin') || !requester.ngoId) {
        throw new ConflictError('Only Super Admin or NGO Admin can assign field users.');
      }
      if (!isNgoTeamMember || user.ngo_id !== requester.ngoId || borehole.assigned_ngo_id !== requester.ngoId) {
        throw new ConflictError('NGO Admins can only assign their own NGO Team Members to their assigned boreholes.');
      }
    }
    if (user.ngo_id !== borehole.assigned_ngo_id) {
      throw new ConflictError('Assigned user must belong to the assigned NGO.');
    }

    const modules = this.normalizeAssignmentModules(module);
    if (!modules.length) {
      await this.upsertUserAssignment(id, userId, requester.userId, reason ?? null, null);
    } else {
      for (const normalizedModule of modules) {
        await this.upsertUserAssignment(id, userId, requester.userId, reason ?? null, normalizedModule);
      }
    }

    await this.addTimeline(
      id,
      requester.userId,
      'user_assigned',
      `Assigned to field user: ${user.first_name} ${user.last_name}`
    );
    const moduleLabel = modules.length ? modules.join(', ') : 'All assigned modules';
    await createNotification({
      userId,
      type: 'assignment',
      title: 'New Borehole Assignment',
      message: `You have been assigned ${borehole.borehole_code} for ${moduleLabel}.`,
      referenceId: id,
      referenceType: 'borehole',
      details: {
        'Borehole ID': borehole.borehole_code,
        Location: `${borehole.village}, ${borehole.district}`,
        Module: moduleLabel,
        Reason: reason,
      },
    });
    return this.getById(id);
  }

  private normalizeAssignmentModules(module?: string | string[]) {
    const rawModules = Array.isArray(module)
      ? module
      : typeof module === 'string'
        ? [module]
        : [];

    return [...new Set(
      rawModules
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )];
  }

  private async upsertUserAssignment(
    boreholeId: string,
    userId: string,
    assignedBy: string,
    reason: string | null,
    module: string | null,
  ) {
    const params = module === null ? [boreholeId, userId] : [boreholeId, userId, module];
    await execute(
      `UPDATE borehole_assignments
       SET status = 'reassigned', unassigned_at = NOW()
       WHERE borehole_id = ? AND assignee_type = 'user' AND assignee_id = ? AND status = 'active'
         AND ${module === null ? 'module IS NULL' : 'module = ?'}`,
      params
    );

    await execute(
      `INSERT INTO borehole_assignments (id, borehole_id, assignee_type, assignee_id, assigned_by, reason, module)
       VALUES (UUID(), ?, 'user', ?, ?, ?, ?)`,
      [boreholeId, userId, assignedBy, reason, module]
    );
  }

  async reassign(id: string, assigneeType: 'ngo', assigneeId: string, assignedBy: string, reason: string) {
    return this.assignNgo(id, assigneeId, assignedBy, reason);
  }

  async getTimeline(id: string, requester?: JwtPayload) {
    await this.getById(id, requester); // ensure exists and is accessible
    return query<any>(
      `SELECT bt.*, u.first_name, u.last_name FROM borehole_timeline bt
       LEFT JOIN users u ON u.id = bt.user_id WHERE bt.borehole_id = ? ORDER BY bt.created_at DESC`, [id]
    );
  }

  async getAssignments(id: string, requester?: JwtPayload) {
    await this.getById(id, requester);
    return query<any>(
      `SELECT ba.*, u.first_name as assigned_by_name, u.last_name as assigned_by_last,
              CASE WHEN ba.assignee_type = 'ngo' THEN (SELECT name FROM ngos WHERE id = ba.assignee_id)
                   ELSE (SELECT CONCAT(first_name, ' ', last_name) FROM users WHERE id = ba.assignee_id) END as assignee_name
       FROM borehole_assignments ba LEFT JOIN users u ON u.id = ba.assigned_by
       WHERE ba.borehole_id = ? ORDER BY ba.assigned_at DESC`, [id]
    );
  }

  async getMapData(filters: any) {
    const conditions: string[] = ['b.deleted_at IS NULL'];
    const params: any[] = [];
    const accessConditions: string[] = [];
    const accessParams: any[] = [];

    if (filters.ngoId) { accessConditions.push('b.assigned_ngo_id = ?'); accessParams.push(filters.ngoId); }
    if (filters.functionalStatus) { conditions.push('b.functional_status = ?'); params.push(filters.functionalStatus); }
    if (filters.operationalStatus) { conditions.push('b.operational_status = ?'); params.push(filters.operationalStatus); }
    if (filters.regionId) { conditions.push('b.region_id = ?'); params.push(filters.regionId); }
    if (filters.assignedUserId) {
      accessConditions.push(`EXISTS (
        SELECT 1 FROM borehole_assignments ba
        WHERE ba.borehole_id = b.id
          AND ba.assignee_type = 'user'
          AND ba.assignee_id = ?
          AND ba.status = 'active'
      )`);
      accessParams.push(filters.assignedUserId);
    }

    if (accessConditions.length) {
      conditions.push(`(${accessConditions.join(' OR ')})`);
      params.push(...accessParams);
    }

    return query<any>(
      `SELECT b.id, b.borehole_code, b.name, b.village, b.district, b.latitude, b.longitude,
              b.functional_status, b.operational_status, n.name as ngo_name
       FROM boreholes b LEFT JOIN ngos n ON n.id = b.assigned_ngo_id
       WHERE ${conditions.join(' AND ')}`, params
    );
  }

  async getSurveys(id: string, requester?: JwtPayload) {
    await this.getById(id, requester);
    return query<any>(
      `SELECT s.*, fs.status as submission_status, fm.name as module_name, fm.slug as module_slug,
              u.first_name, u.last_name
       FROM surveys s LEFT JOIN form_submissions fs ON fs.id = s.submission_id
       LEFT JOIN form_modules fm ON fm.id = fs.module_id
       LEFT JOIN users u ON u.id = s.assigned_to
       WHERE s.borehole_id = ? ORDER BY s.created_at DESC`, [id]
    );
  }

  async getRehabilitation(id: string, requester?: JwtPayload) {
    await this.getById(id, requester);
    return query<any>(
      `SELECT rr.*, CONCAT(u.first_name, ' ', u.last_name) as created_by_name
       FROM rehabilitation_records rr LEFT JOIN users u ON u.id = rr.created_by
       WHERE rr.borehole_id = ? ORDER BY rr.created_at DESC`, [id]
    );
  }

  async delete(id: string) {
    const borehole = await queryOne<any>(`SELECT id FROM boreholes WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!borehole) throw new NotFoundError('Borehole not found');
    await execute(`UPDATE boreholes SET deleted_at = NOW() WHERE id = ?`, [id]);
  }

  private async addTimeline(boreholeId: string, userId: string, action: string, description: string, meta?: object) {
    await execute(
      `INSERT INTO borehole_timeline (id, borehole_id, user_id, action, description, meta) VALUES (UUID(), ?, ?, ?, ?, ?)`,
      [boreholeId, userId, action, description, meta ? JSON.stringify(meta) : null]
    );
  }

  async getMatrix({ page = 1, limit = 20, search, ngoId, regionId }: any) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;

    const conditions: string[] = ['b.deleted_at IS NULL'];
    const params: any[] = [];

    if (search) {
      conditions.push('(b.borehole_code LIKE ? OR b.name LIKE ? OR b.village LIKE ? OR b.district LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (ngoId) {
      conditions.push('b.assigned_ngo_id = ?');
      params.push(ngoId);
    }
    if (regionId) {
      conditions.push('b.region_id = ?');
      params.push(regionId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM boreholes b ${where}`, params);
    
    const data = await query<any>(
      `SELECT b.id, b.borehole_code, b.name, b.village, b.district, n.name as ngo_name,
              -- Recce Status
              (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'recce' ORDER BY s.created_at DESC LIMIT 1) as recce_status,
              (SELECT s.id FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'recce' ORDER BY s.created_at DESC LIMIT 1) as recce_id,
              
              -- Baseline Status
              (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'baseline' ORDER BY s.created_at DESC LIMIT 1) as baseline_status,
              (SELECT s.id FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'baseline' ORDER BY s.created_at DESC LIMIT 1) as baseline_id,
              
              -- Rehab Status
              (SELECT rr.status FROM rehabilitation_records rr WHERE rr.borehole_id = b.id ORDER BY rr.created_at DESC LIMIT 1) as rehab_status,
              (SELECT rr.id FROM rehabilitation_records rr WHERE rr.borehole_id = b.id ORDER BY rr.created_at DESC LIMIT 1) as rehab_id,
              
              -- Monitoring Status
              (SELECT s.status FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'monitoring' ORDER BY s.created_at DESC LIMIT 1) as monitoring_status,
              (SELECT s.id FROM surveys s WHERE s.borehole_id = b.id AND s.survey_type = 'monitoring' ORDER BY s.created_at DESC LIMIT 1) as monitoring_id,
              
              -- Water Testing Status
              (SELECT wt.status FROM water_testing_records wt WHERE wt.borehole_id = b.id ORDER BY wt.submission_date DESC LIMIT 1) as water_testing_status,
              (SELECT wt.id FROM water_testing_records wt WHERE wt.borehole_id = b.id ORDER BY wt.submission_date DESC LIMIT 1) as water_testing_id
              
       FROM boreholes b
       LEFT JOIN ngos n ON n.id = b.assigned_ngo_id
       ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNumber, offset]
    );

    return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
  }
}

export const boreholeService = new BoreholeService();
