import { query, queryOne, execute } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import {
  createNotification,
  createNotificationsForRole,
  createNotificationsForUsers,
} from '../notifications/notifications.router';

export class GrievancesService {
  async list({ page = 1, limit = 20, status, priority, boreholeId, ngoId }: any) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = [];
    const params: any[] = [];
    if (status) { conditions.push('g.status = ?'); params.push(status); }
    if (priority) { conditions.push('g.priority = ?'); params.push(priority); }
    if (boreholeId) { conditions.push('g.borehole_id = ?'); params.push(boreholeId); }
    if (ngoId) { conditions.push('g.ngo_id = ?'); params.push(ngoId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM grievances g ${where}`, params);
    const data = await query<any>(
      `SELECT g.*, b.borehole_code, b.name as borehole_name, u.first_name as submitted_by_name,
              u.last_name as submitted_by_last, a.first_name as assigned_to_name
       FROM grievances g LEFT JOIN boreholes b ON b.id = g.borehole_id LEFT JOIN users u ON u.id = g.submitted_by
       LEFT JOIN users a ON a.id = g.assigned_to
       ${where} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`, [...params, limitNumber, offset]
    );
    return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
  }

  async getById(id: string) {
    const g = await queryOne<any>(
      `SELECT g.*, b.borehole_code, b.name as borehole_name, u.first_name as submitted_by_name, a.first_name as assigned_to_name
       FROM grievances g LEFT JOIN boreholes b ON b.id = g.borehole_id LEFT JOIN users u ON u.id = g.submitted_by
       LEFT JOIN users a ON a.id = g.assigned_to WHERE g.id = ?`, [id]
    );
    if (!g) throw new NotFoundError('Grievance not found');
    g.comments = await query<any>(`SELECT gc.*, u.first_name, u.last_name FROM grievance_comments gc LEFT JOIN users u ON u.id = gc.user_id WHERE gc.grievance_id = ? ORDER BY gc.created_at`, [id]);
    return g;
  }

  async assign(id: string, assignedTo: string) {
    const grievance = await this.getById(id);
    await execute(`UPDATE grievances SET assigned_to = ?, status = 'under_review' WHERE id = ?`, [assignedTo, id]);
    await createNotification({
      userId: assignedTo,
      type: 'grievance_assignment',
      title: 'Grievance Assigned',
      message: `Grievance "${grievance.title}"${grievance.borehole_code ? ` for borehole ${grievance.borehole_code}` : ''} has been assigned to you.`,
      referenceId: id,
      referenceType: 'grievance',
      details: {
        'Borehole ID': grievance.borehole_code,
        Priority: grievance.priority,
        Status: 'Under review',
      },
    });
    await createNotification({
      userId: grievance.submitted_by,
      type: 'grievance',
      title: 'Grievance Under Review',
      message: `Your grievance "${grievance.title}" is now under review.`,
      referenceId: id,
      referenceType: 'grievance',
    });
    return this.getById(id);
  }

  async updateStatus(id: string, status: string, userId: string, notes?: string) {
    const grievance = await this.getById(id);
    if (status === 'closed') {
      await execute(`UPDATE grievances SET status = 'closed', resolved_by = ?, resolved_at = NOW(), resolution = ? WHERE id = ?`, [userId, notes ?? null, id]);
    } else {
      await execute(`UPDATE grievances SET status = ? WHERE id = ?`, [status, id]);
    }
    if (notes) {
      await execute(`INSERT INTO grievance_comments (id, grievance_id, user_id, comment, is_internal) VALUES (UUID(), ?, ?, ?, 1)`, [id, userId, notes]);
    }
    await createNotificationsForUsers([grievance.submitted_by, grievance.assigned_to], {
      type: 'grievance',
      title: status === 'closed' ? 'Grievance Closed' : 'Grievance Status Updated',
      message: `Grievance "${grievance.title}" is now ${status.replace(/_/g, ' ')}.${notes ? ` Update: ${notes}` : ''}`,
      referenceId: id,
      referenceType: 'grievance',
      details: {
        'Borehole ID': grievance.borehole_code,
        Status: status.replace(/_/g, ' '),
        Update: notes,
      },
    });
    return this.getById(id);
  }

  async addComment(id: string, userId: string, comment: string, isInternal = false) {
    const grievance = await this.getById(id);
    await execute(`INSERT INTO grievance_comments (id, grievance_id, user_id, comment, is_internal) VALUES (UUID(), ?, ?, ?, ?)`, [id, userId, comment, isInternal ? 1 : 0]);
    if (!isInternal) {
      await createNotificationsForUsers(
        [grievance.submitted_by, grievance.assigned_to].filter((recipientId) => recipientId !== userId),
        {
          type: 'grievance',
          title: 'New Grievance Update',
          message: `A new update was added to grievance "${grievance.title}": ${comment}`,
          referenceId: id,
          referenceType: 'grievance',
        }
      );
    }
    return this.getById(id);
  }

  async create(data: any, userId: string, userNgoId?: string) {
    const { borehole_id, title, description, category, priority } = data;
    const id = uuidv4();
    
    let ngoId = userNgoId;
    if (!ngoId && borehole_id) {
      const bh = await queryOne<any>('SELECT assigned_ngo_id FROM boreholes WHERE id = ?', [borehole_id]);
      if (bh) ngoId = bh.assigned_ngo_id;
    }

    await execute(
      `INSERT INTO grievances (id, borehole_id, ngo_id, submitted_by, title, description, category, priority, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      [id, borehole_id || null, ngoId || null, userId, title, description, category || null, priority || 'medium']
    );

    const createdGrievance = await this.getById(id);
    const submitter = await queryOne<any>(`SELECT created_by FROM users WHERE id = ?`, [userId]);
    const notification = {
      type: 'grievance',
      title: 'New Grievance Submitted',
      message: `Grievance "${title}"${createdGrievance.borehole_code ? ` for borehole ${createdGrievance.borehole_code}` : ''} has been submitted.`,
      referenceId: id,
      referenceType: 'grievance',
      details: {
        'Borehole ID': createdGrievance.borehole_code,
        Category: category,
        Priority: priority || 'medium',
        Status: 'Submitted',
      },
    };
    await createNotification({ userId, ...notification });
    await createNotificationsForUsers([submitter?.created_by], notification);
    await createNotificationsForRole('super_admin', notification);
    return createdGrievance;
  }
}
export const grievancesService = new GrievancesService();
