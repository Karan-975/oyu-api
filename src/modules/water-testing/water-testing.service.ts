import { query, queryOne, execute } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import {
  createNotification,
  createNotificationsForRole,
  createNotificationsForUsers,
} from '../notifications/notifications.router';

export class WaterTestingService {
  async list({ page = 1, limit = 20, search, status, boreholeId }: any) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;

    const conditions: string[] = ['wt.deleted_at IS NULL'];
    const params: any[] = [];

    if (search) {
      conditions.push('(b.borehole_code LIKE ? OR b.name LIKE ? OR b.village LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      conditions.push('wt.status = ?');
      params.push(status);
    }
    if (boreholeId) {
      conditions.push('wt.borehole_id = ?');
      params.push(boreholeId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const [{ total }] = await query<any>(
      `SELECT COUNT(*) as total FROM water_testing_records wt 
       JOIN boreholes b ON b.id = wt.borehole_id
       ${where}`,
      params
    );

    const data = await query<any>(
      `SELECT wt.*, b.borehole_code, b.name as borehole_name, b.village, b.district,
              CONCAT(u.first_name, ' ', u.last_name) as submitted_by_name
       FROM water_testing_records wt
       JOIN boreholes b ON b.id = wt.borehole_id
       LEFT JOIN users u ON u.id = wt.submitted_by
       ${where} ORDER BY wt.submission_date DESC LIMIT ? OFFSET ?`,
      [...params, limitNumber, offset]
    );

    return {
      data,
      pagination: {
        total: parseInt(total),
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  async getById(id: string) {
    const record = await queryOne<any>(
      `SELECT wt.*, b.borehole_code, b.name as borehole_name, b.village, b.district, b.latitude as b_lat, b.longitude as b_lng,
              CONCAT(u.first_name, ' ', u.last_name) as submitted_by_name, u.email as submitted_by_email,
              CONCAT(rv.first_name, ' ', rv.last_name) as reviewer_name
       FROM water_testing_records wt
       JOIN boreholes b ON b.id = wt.borehole_id
       LEFT JOIN users u ON u.id = wt.submitted_by
       LEFT JOIN users rv ON rv.id = wt.reviewed_by
       WHERE wt.id = ? AND wt.deleted_at IS NULL`,
      [id]
    );
    if (!record) throw new NotFoundError('Water testing record not found');
    return record;
  }

  async create(data: any, userId: string) {
    const id = uuidv4();
    await execute(
      `INSERT INTO water_testing_records (id, borehole_id, submitted_by, status, submission_date)
       VALUES (?, ?, ?, 'submitted', NOW())`,
      [id, data.borehole_id, userId]
    );
    const record = await this.getById(id);
    const submitter = await queryOne<any>(`SELECT created_by FROM users WHERE id = ?`, [userId]);
    const notification = {
      type: 'water_testing',
      title: 'Water Test Submitted',
      message: `A water testing request for borehole ${record.borehole_code} has been submitted.`,
      referenceId: record.borehole_id,
      referenceType: 'borehole',
      details: {
        'Borehole ID': record.borehole_code,
        Location: `${record.village}, ${record.district}`,
        Status: 'Submitted',
      },
    };
    await createNotification({ userId, ...notification });
    await createNotificationsForUsers([submitter?.created_by], notification);
    await createNotificationsForRole('super_admin', notification);
    return record;
  }

  async uploadReport(id: string, fileUrl: string, uploadedBy: string) {
    await this.getById(id);

    // Mock PDF parameters extraction (as specified in §9.11)
    const ph = 6.8 + Math.random() * 1.2; // 6.8 to 8.0
    const ec = 350 + Math.floor(Math.random() * 200); // 350 to 550
    const tds = 200 + Math.floor(Math.random() * 150); // 200 to 350
    const turbidity = 0.5 + Math.random() * 2.5; // 0.5 to 3.0
    const temp = 20 + Math.floor(Math.random() * 6); // 20 to 26
    const hardness = 100 + Math.floor(Math.random() * 80); // 100 to 180
    const chlorine = 0.1 + Math.random() * 0.4;
    const fluoride = 0.2 + Math.random() * 0.6;
    const iron = 0.05 + Math.random() * 0.2;

    await execute(
      `UPDATE water_testing_records 
       SET report_file_url = ?, report_uploaded_at = NOW(), status = 'report_uploaded',
           param_ph = ?, param_ec = ?, param_tds = ?, param_turbidity = ?, param_temperature = ?, 
           param_hardness = ?, param_chlorine = ?, param_fluoride = ?, param_iron = ?,
           reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [fileUrl, ph, ec, tds, turbidity, temp, hardness, chlorine, fluoride, iron, uploadedBy, id]
    );

    const updated = await this.getById(id);
    await createNotification({
      userId: updated.submitted_by,
      type: 'water_testing',
      title: 'Water Test Report Uploaded',
      message: `The laboratory report for borehole ${updated.borehole_code} has been uploaded and is under review.`,
      referenceId: updated.borehole_id,
      referenceType: 'borehole',
      details: {
        'Borehole ID': updated.borehole_code,
        Status: 'Report uploaded',
      },
    });
    return updated;
  }

  async publish(id: string) {
    const record = await this.getById(id);
    await execute(`UPDATE water_testing_records SET status = 'published' WHERE id = ?`, [id]);
    await createNotification({
      userId: record.submitted_by,
      type: 'approval',
      title: 'Water Test Report Published',
      message: `The water testing report for borehole ${record.borehole_code} has been published.`,
      referenceId: record.borehole_id,
      referenceType: 'borehole',
      details: {
        'Borehole ID': record.borehole_code,
        Status: 'Published',
      },
    });
    return this.getById(id);
  }

  async reopen(id: string, notes: string) {
    const record = await this.getById(id);
    await execute(`UPDATE water_testing_records SET status = 'under_review', review_notes = ? WHERE id = ?`, [notes, id]);
    await createNotification({
      userId: record.submitted_by,
      type: 'reopened',
      title: 'Water Test Requires Attention',
      message: `The water test for borehole ${record.borehole_code} requires attention. Remarks: ${notes}`,
      referenceId: record.borehole_id,
      referenceType: 'borehole',
      details: {
        'Borehole ID': record.borehole_code,
        Status: 'Under review',
        Remarks: notes,
      },
    });
    return this.getById(id);
  }
}

export const waterTestingService = new WaterTestingService();
