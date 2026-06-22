import { query, queryOne, execute } from '../../config/database';
import { ConflictError, NotFoundError } from '../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import {
  createNotification,
  createNotificationsForRole,
  createNotificationsForUsers,
} from '../notifications/notifications.router';

export class RehabilitationService {
  async list({ page = 1, limit = 20, status, stage, boreholeId, ngoId, assignedUserId }: any) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status) { conditions.push('rr.status = ?'); params.push(status); }
    if (stage) { conditions.push('rr.stage = ?'); params.push(stage); }
    if (boreholeId) { conditions.push('rr.borehole_id = ?'); params.push(boreholeId); }
    if (assignedUserId) { conditions.push('rr.created_by = ?'); params.push(assignedUserId); }
    if (ngoId) { conditions.push('u.ngo_id = ?'); params.push(ngoId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [{ total }] = await query<any>(
      `SELECT COUNT(*) as total
       FROM rehabilitation_records rr
       LEFT JOIN users u ON u.id = rr.created_by
       ${where}`,
      params
    );
    const data = await query<any>(
      `SELECT rr.*, b.borehole_code, b.name as borehole_name,
              CONCAT(u.first_name, ' ', u.last_name) as created_by_name, u.ngo_id as creator_ngo_id
       FROM rehabilitation_records rr LEFT JOIN boreholes b ON b.id = rr.borehole_id
       LEFT JOIN users u ON u.id = rr.created_by
       ${where} ORDER BY rr.created_at DESC LIMIT ? OFFSET ?`, [...params, limitNumber, offset]
    );
    return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
  }

  async getById(id: string) {
    const record = await queryOne<any>(
      `SELECT rr.*, b.borehole_code, b.name as borehole_name,
              CONCAT(u.first_name, ' ', u.last_name) as created_by_name, u.ngo_id as creator_ngo_id,
              rv.first_name as reviewer_name
       FROM rehabilitation_records rr LEFT JOIN boreholes b ON b.id = rr.borehole_id
       LEFT JOIN users u ON u.id = rr.created_by
       LEFT JOIN users rv ON rv.id = rr.reviewed_by WHERE rr.id = ?`, [id]
    );
    if (!record) throw new NotFoundError('Rehabilitation record not found');
    return record;
  }

  async approve(id: string, reviewedBy: string, notes?: string) {
    const record = await this.getById(id);
    await execute(`UPDATE rehabilitation_records SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?`, [reviewedBy, notes ?? null, id]);
    await createNotification({
      userId: record.created_by,
      type: 'approval',
      title: 'Rehabilitation Approved',
      message: `Rehabilitation stage ${record.stage} for borehole ${record.borehole_code} has been approved.${notes ? ` Remarks: ${notes}` : ''}`,
      referenceId: id,
      referenceType: 'rehabilitation',
      details: {
        'Borehole ID': record.borehole_code,
        Stage: record.stage,
        Status: 'Approved',
        Remarks: notes,
      },
    });
    return this.getById(id);
  }

  async reject(id: string, reviewedBy: string, notes: string) {
    const record = await this.getById(id);
    await execute(`UPDATE rehabilitation_records SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?`, [reviewedBy, notes, id]);
    await createNotification({
      userId: record.created_by,
      type: 'rejection',
      title: 'Rehabilitation Returned',
      message: `Rehabilitation stage ${record.stage} for borehole ${record.borehole_code} requires correction. Remarks: ${notes}`,
      referenceId: id,
      referenceType: 'rehabilitation',
      details: {
        'Borehole ID': record.borehole_code,
        Stage: record.stage,
        Status: 'Returned',
        Remarks: notes,
      },
    });
    return this.getById(id);
  }

  async reopen(id: string, reviewedBy: string, notes?: string) {
    const record = await this.getById(id);
    await execute(`UPDATE rehabilitation_records SET status = 'reopened', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?`, [reviewedBy, notes ?? null, id]);
    await createNotification({
      userId: record.created_by,
      type: 'reopened',
      title: 'Rehabilitation Stage Reopened',
      message: `Rehabilitation stage ${record.stage} for borehole ${record.borehole_code} has been reopened.${notes ? ` Remarks: ${notes}` : ''}`,
      referenceId: id,
      referenceType: 'rehabilitation',
      details: {
        'Borehole ID': record.borehole_code,
        Stage: record.stage,
        Status: 'Reopened',
        Remarks: notes,
      },
    });
    return this.getById(id);
  }

  async create(data: any, userId: string) {
    const { borehole_id, stage, status, start_date, end_date, description } = data;
    const id = uuidv4();

    const baseline = await queryOne<any>(
      `SELECT id FROM surveys
       WHERE borehole_id = ? AND survey_type = 'baseline' AND status IN ('submitted', 'approved')
       LIMIT 1`,
      [borehole_id]
    );
    if (!baseline) {
      throw new ConflictError('Rehabilitation can start only after Baseline is submitted.');
    }

    await execute(
      `INSERT INTO rehabilitation_records (id, borehole_id, stage, status, start_date, end_date, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, borehole_id, stage, status || 'pending', start_date || null, end_date || null, description || null, userId]
    );

    if (stage === 'community_handover' && status === 'completed') {
      await execute(`UPDATE boreholes SET operational_status = 'monitoring_pending' WHERE id = ?`, [borehole_id]);
    }

    const createdRecord = await this.getById(id);
    const submitter = await queryOne<any>(`SELECT created_by FROM users WHERE id = ?`, [userId]);
    const notification = {
      type: 'rehabilitation',
      title: status === 'completed' ? 'Rehabilitation Stage Completed' : 'Rehabilitation Updated',
      message: `Rehabilitation stage ${stage} for borehole ${createdRecord.borehole_code} is now ${status || 'pending'}.`,
      referenceId: id,
      referenceType: 'rehabilitation',
      details: {
        'Borehole ID': createdRecord.borehole_code,
        Stage: stage,
        Status: status || 'pending',
      },
    };
    await createNotification({ userId, ...notification });
    await createNotificationsForUsers([submitter?.created_by], notification);
    await createNotificationsForRole('super_admin', notification);
    return createdRecord;
  }
}
export const rehabilitationService = new RehabilitationService();
