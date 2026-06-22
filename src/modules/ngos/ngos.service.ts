import { query, queryOne, execute } from '../../config/database';
import { NotFoundError, ConflictError } from '../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { emailService } from '../../shared/services/email.service';
import { config } from '../../config/config';

interface PaginationOptions { page: number; limit: number; search?: string; status?: string; regionId?: string; }

export class NgoService {
  async list({ page, limit, search, status, regionId }: PaginationOptions) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = ['n.deleted_at IS NULL'];
    const params: any[] = [];

    if (search) { conditions.push('(n.name LIKE ? OR n.email LIKE ? OR n.contact_person LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { conditions.push('n.status = ?'); params.push(status); }
    if (regionId) { conditions.push('n.region_id = ?'); params.push(regionId); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM ngos n ${where}`, params);
    const data = await query<any>(
      `SELECT n.*, r.name as region_name,
              (SELECT COUNT(*) FROM users u WHERE u.ngo_id = n.id AND u.deleted_at IS NULL) as user_count,
              (SELECT COUNT(*) FROM boreholes b WHERE b.assigned_ngo_id = n.id AND b.deleted_at IS NULL) as borehole_count
       FROM ngos n LEFT JOIN regions r ON r.id = n.region_id
       ${where} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNumber, offset]
    );
    return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
  }

  async getById(id: string) {
    const ngo = await queryOne<any>(
      `SELECT n.*, r.name as region_name FROM ngos n LEFT JOIN regions r ON r.id = n.region_id
       WHERE n.id = ? AND n.deleted_at IS NULL`, [id]
    );
    if (!ngo) throw new NotFoundError('NGO not found');
    if (ngo.kyc_data && typeof ngo.kyc_data === 'string') {
      try {
        ngo.kyc_data = JSON.parse(ngo.kyc_data);
      } catch (e) {}
    }
    const users = await query<any>(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.status,
              GROUP_CONCAT(ro.name) as role_names
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles ro ON ro.id = ur.role_id
       WHERE u.ngo_id = ? AND u.deleted_at IS NULL GROUP BY u.id ORDER BY u.created_at DESC`, [id]
    );
    return { ...ngo, users };
  }

  async create(data: any, createdBy: string) {
    const existing = await queryOne<any>(`SELECT id FROM ngos WHERE email = ? AND deleted_at IS NULL`, [data.email]);
    if (existing) throw new ConflictError('An NGO with this email already exists');
    const id = uuidv4();
    const kycDataStr = data.kycData ? JSON.stringify(data.kycData) : null;
    await execute(
      `INSERT INTO ngos (id, name, registration_number, contact_person, email, phone, address, region_id, website, notes, created_by, kyc_status, signature_status, kyc_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.name, data.registrationNumber ?? null, data.contactPerson, data.email, data.phone, data.address,
        data.regionId ?? null, data.website ?? null, data.notes ?? null, createdBy,
        data.kycStatus || 'pending_kyc', data.signatureStatus || 'pending', kycDataStr
      ]
    );
    return this.getById(id);
  }

  async update(id: string, data: any) {
    const ngo = await queryOne<any>(`SELECT id FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    if (data.email) {
      const conflict = await queryOne<any>(`SELECT id FROM ngos WHERE email = ? AND id != ? AND deleted_at IS NULL`, [data.email, id]);
      if (conflict) throw new ConflictError('Email already in use by another NGO');
    }
    const kycDataStr = data.kycData ? JSON.stringify(data.kycData) : null;
    await execute(
      `UPDATE ngos SET name = COALESCE(?, name), registration_number = COALESCE(?, registration_number),
       contact_person = COALESCE(?, contact_person), email = COALESCE(?, email), phone = COALESCE(?, phone),
       address = COALESCE(?, address), region_id = COALESCE(?, region_id), website = COALESCE(?, website), notes = COALESCE(?, notes),
       kyc_status = COALESCE(?, kyc_status), signature_status = COALESCE(?, signature_status),
       kyc_data = COALESCE(?, kyc_data)
       WHERE id = ?`,
      [
        data.name, data.registrationNumber, data.contactPerson, data.email, data.phone, data.address,
        data.regionId, data.website, data.notes, data.kycStatus, data.signatureStatus, kycDataStr, id
      ]
    );
    return this.getById(id);
  }

  async setStatus(id: string, status: string) {
    const ngo = await queryOne<any>(`SELECT id FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    await execute(`UPDATE ngos SET status = ? WHERE id = ?`, [status, id]);
    return this.getById(id);
  }

  async sendKyc(id: string) {
    const ngo = await queryOne<any>(`SELECT id, name, email, contact_person FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    await execute(`UPDATE ngos SET kyc_status = 'pending_signature' WHERE id = ?`, [id]);
    await emailService.sendOperationalNotification({
      email: ngo.email,
      firstName: ngo.contact_person,
      title: 'KYC Signature Required',
      message: `The KYC profile for ${ngo.name} is ready for review and signature.`,
      category: 'KYC workflow',
      actionUrl: `${config.app.frontendUrl}/login`,
      actionLabel: 'Open OYU Green',
      details: { Organization: ngo.name, Status: 'Pending signature' },
    }).catch(() => {});
    return this.getById(id);
  }

  async signKyc(id: string) {
    const ngo = await queryOne<any>(`SELECT id FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    await execute(`UPDATE ngos SET signature_status = 'signed', kyc_status = 'pending_approval' WHERE id = ?`, [id]);
    return this.getById(id);
  }

  async approveKyc(id: string) {
    const ngo = await queryOne<any>(`SELECT id, name, email, contact_person FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    await execute(`UPDATE ngos SET kyc_status = 'approved', status = 'active' WHERE id = ?`, [id]);
    await emailService.sendOperationalNotification({
      email: ngo.email,
      firstName: ngo.contact_person,
      title: 'KYC Approved',
      message: `The KYC profile for ${ngo.name} has been approved. Authorized users can now access assigned operations.`,
      category: 'Approval',
      actionUrl: `${config.app.frontendUrl}/login`,
      actionLabel: 'Sign in',
      details: { Organization: ngo.name, Status: 'Approved' },
    }).catch(() => {});
    return this.getById(id);
  }

  async rejectKyc(id: string) {
    const ngo = await queryOne<any>(`SELECT id, name, email, contact_person FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    await execute(`UPDATE ngos SET kyc_status = 'rejected', status = 'inactive' WHERE id = ?`, [id]);
    await emailService.sendOperationalNotification({
      email: ngo.email,
      firstName: ngo.contact_person,
      title: 'KYC Requires Correction',
      message: `The KYC profile for ${ngo.name} was not approved. Please contact OYU Green support for the required corrections.`,
      category: 'KYC workflow',
      details: { Organization: ngo.name, Status: 'Rejected' },
    }).catch(() => {});
    return this.getById(id);
  }

  async delete(id: string) {
    const ngo = await queryOne<any>(`SELECT id FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    await execute(`UPDATE ngos SET deleted_at = NOW() WHERE id = ?`, [id]);
  }

  async getBoreholes(id: string) {
    const ngo = await queryOne<any>(`SELECT id FROM ngos WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!ngo) throw new NotFoundError('NGO not found');
    return query<any>(`SELECT b.*, r.name as region_name FROM boreholes b LEFT JOIN regions r ON r.id = b.region_id
      WHERE b.assigned_ngo_id = ? AND b.deleted_at IS NULL ORDER BY b.created_at DESC`, [id]);
  }
}

export const ngoService = new NgoService();
