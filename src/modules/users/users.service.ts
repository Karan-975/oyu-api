import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, execute } from '../../config/database';
import { NotFoundError, ConflictError, ForbiddenError } from '../../middleware/errorHandler';
import { emailService } from '../../shared/services/email.service';
import { config } from '../../config/config';
import { JwtPayload } from '../../middleware/auth.middleware';
import { createNotification, createNotificationsForRole } from '../notifications/notifications.router';

export class UsersService {
  async list({ page, limit, search, status, ngoId, roleSlug }: any, requester?: JwtPayload) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];

    if (search) { conditions.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (status) { conditions.push('u.status = ?'); params.push(status); }
    if (ngoId) { conditions.push('u.ngo_id = ?'); params.push(ngoId); }
    if (roleSlug) { conditions.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.slug = ?)'); params.push(roleSlug); }
    if (requester?.roles.includes('ngo_admin') && !requester.roles.includes('super_admin')) {
      // FRS 8.3: NGO Admin sees all team members in their NGO (not just ones they created)
      if (requester.ngoId) {
        conditions.push(`u.ngo_id = ? AND EXISTS (
          SELECT 1 FROM user_roles tur JOIN roles tr ON tr.id = tur.role_id
          WHERE tur.user_id = u.id AND tr.slug = 'ngo_team_member'
        )`);
        params.push(requester.ngoId);
      } else {
        // Fallback: only those the admin created
        conditions.push(`u.created_by = ? AND EXISTS (
          SELECT 1 FROM user_roles tur JOIN roles tr ON tr.id = tur.role_id
          WHERE tur.user_id = u.id AND tr.slug = 'ngo_team_member'
        )`);
        params.push(requester.userId);
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM users u ${where}`, params);
    const data = await query<any>(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.status, u.avatar_url, u.kyc_data,
              u.ngo_id, u.last_login_at, u.created_at, u.created_by,
              n.name as ngo_name,
              CONCAT(owner.first_name, ' ', owner.last_name) as responsible_admin_name,
              GROUP_CONCAT(DISTINCT r.name ORDER BY r.name) as role_names,
              GROUP_CONCAT(DISTINCT r.slug ORDER BY r.slug) as role_slugs
       FROM users u
       LEFT JOIN ngos n ON n.id = u.ngo_id
       LEFT JOIN users owner ON owner.id = u.created_by
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       ${where} GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNumber, offset]
    );
    return {
      data: data.map(this.formatUser),
      pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) },
    };
  }

  private async getAllowedAssignableRoleSlugs(requester: JwtPayload) {
    if (requester.roles.includes('super_admin')) {
      const rows = await query<any>(`SELECT slug FROM roles`);
      return rows.map((row) => row.slug as string);
    }

    if (requester.roles.includes('ngo_admin')) {
      return ['ngo_team_member'];
    }

    return [];
  }

  async getById(id: string, requester?: JwtPayload) {
    const user = await queryOne<any>(
      `SELECT u.*, n.name as ngo_name,
              CONCAT(owner.first_name, ' ', owner.last_name) as responsible_admin_name,
              GROUP_CONCAT(DISTINCT r.name) as role_names, GROUP_CONCAT(DISTINCT r.slug) as role_slugs,
              GROUP_CONCAT(DISTINCT r.id) as role_ids
       FROM users u
       LEFT JOIN ngos n ON n.id = u.ngo_id
       LEFT JOIN users owner ON owner.id = u.created_by
       LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ? AND u.deleted_at IS NULL GROUP BY u.id`, [id]
    );
    if (!user) throw new NotFoundError('User not found');
    this.assertCanAccessUser(user, requester);
    return this.formatUser(user);
  }

  async create(data: any, requester: JwtPayload) {
    const existing = await queryOne<any>(`SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`, [data.email]);
    if (existing) throw new ConflictError('A user with this email already exists');

    const roleIds: string[] = [...new Set((data.roleIds ?? []) as string[])];
    const roleSlugs = await this.getRoleSlugs(roleIds);
    const allowedRoleSlugs = await this.getAllowedAssignableRoleSlugs(requester);
    let responsibleUserId = requester.userId;
    if (!requester.roles.includes('super_admin')) {
      if (!requester.roles.includes('ngo_admin')) {
        throw new ForbiddenError('You cannot create users for this role.');
      }
      if (roleSlugs.length !== 1 || roleSlugs[0] !== 'ngo_team_member' || !allowedRoleSlugs.includes('ngo_team_member')) {
        throw new ForbiddenError('NGO Admins can only create NGO Team Members.');
      }
      data.ngoId = requester.ngoId || null;
    } else {
      if (roleSlugs.some((slug) => !allowedRoleSlugs.includes(slug))) {
        throw new ForbiddenError('You cannot assign one or more of the selected roles.');
      }
      if (roleSlugs.includes('ngo_team_member')) {
        if (!data.responsibleNgoAdminId) {
          throw new ConflictError('Select the NGO Admin responsible for this team member.');
        }
        const responsibleAdmin = await queryOne<any>(
          `SELECT u.id, u.ngo_id FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
           WHERE u.id = ? AND u.status = 'active' AND u.deleted_at IS NULL AND r.slug = 'ngo_admin'
           LIMIT 1`,
          [data.responsibleNgoAdminId]
        );
        if (!responsibleAdmin) throw new NotFoundError('Responsible NGO Admin not found');
        responsibleUserId = responsibleAdmin.id;
        data.ngoId = responsibleAdmin.ngo_id;
      } else {
        data.ngoId = data.ngoId || null;
      }
    }

    if (roleSlugs.includes('ngo_admin')) {
      data.kycData = {
        ...(data.kycData ?? {}),
        kycStatus: 'Pending KYC',
        reviewedBy: '',
        approvedBy: '',
        officeSignatureUrl: '',
        officeRemarks: '',
      };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const id = uuidv4();
    const kycDataStr = data.kycData ? JSON.stringify(data.kycData) : null;
    await execute(
      `INSERT INTO users (id, first_name, last_name, email, phone, password_hash, ngo_id, status, email_verified, created_by, kyc_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
      [id, data.firstName, data.lastName, data.email, data.phone ?? null, passwordHash, data.ngoId ?? null, responsibleUserId, kycDataStr]
    );

    // Assign roles
    for (const roleId of roleIds) {
      await execute(`INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)`, [id, roleId, requester.userId]);
    }

    await emailService.sendWelcome(data.email, data.firstName, `${config.app.frontendUrl}/login`, data.password).catch(() => {});
    if (roleSlugs.includes('ngo_admin')) {
      await createNotification({
        userId: id,
        type: 'system',
        title: 'KYC Completion Required',
        message: 'Your NGO Admin account has been created. Complete and submit your KYC profile before operational access can be enabled.',
        referenceType: 'user',
        referenceId: id,
        actionUrl: `${config.app.frontendUrl}/kyc`,
        actionLabel: 'Complete KYC',
        details: {
          Status: 'Pending KYC',
          Access: 'Operational access locked until approval',
        },
      });
    }
    return this.getById(id);
  }

  async getMyKyc(requester: JwtPayload) {
    if (!requester.roles.includes('ngo_admin')) {
      throw new ForbiddenError('KYC self-service is available only to NGO Admin users.');
    }
    const user = await this.getById(requester.userId);
    return {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone,
      kycData: user.kycData ?? { kycStatus: 'Pending KYC' },
    };
  }

  async submitMyKyc(requester: JwtPayload, kycData: Record<string, any>) {
    if (!requester.roles.includes('ngo_admin')) {
      throw new ForbiddenError('KYC self-service is available only to NGO Admin users.');
    }

    const user = await queryOne<any>(
      `SELECT id, first_name, last_name, email, phone, kyc_data
       FROM users WHERE id = ? AND deleted_at IS NULL`,
      [requester.userId]
    );
    if (!user) throw new NotFoundError('User not found');

    const currentKyc = this.parseKycData(user.kyc_data);
    if (this.isApprovedKycStatus(currentKyc.kycStatus)) {
      throw new ConflictError('Your KYC is already approved.');
    }

    const submittedKyc = {
      ...currentKyc,
      ...this.sanitizeApplicantKycData(kycData),
      kycStatus: 'Awaiting Document Verification',
      submittedAt: new Date().toISOString(),
      reviewedBy: currentKyc.reviewedBy ?? '',
      approvedBy: currentKyc.approvedBy ?? '',
      officeSignatureUrl: currentKyc.officeSignatureUrl ?? '',
      officeRemarks: currentKyc.officeRemarks ?? '',
    };

    await execute(`UPDATE users SET kyc_data = ? WHERE id = ?`, [
      JSON.stringify(submittedKyc),
      requester.userId,
    ]);

    await createNotification({
      userId: requester.userId,
      type: 'system',
      title: 'KYC Submitted for Verification',
      message: 'Your KYC profile has been submitted. Operational access will remain locked until Super Admin approval.',
      referenceType: 'user',
      referenceId: requester.userId,
      actionUrl: `${config.app.frontendUrl}/kyc`,
      details: { Status: 'Awaiting Document Verification' },
    });
    await createNotificationsForRole('super_admin', {
      type: 'approval',
      title: 'NGO Admin KYC Awaiting Review',
      message: `${user.first_name} ${user.last_name} has submitted an NGO Admin KYC profile for verification.`,
      referenceType: 'user',
      referenceId: requester.userId,
      actionUrl: `${config.app.frontendUrl}/settings/users/${requester.userId}/edit`,
      actionLabel: 'Review KYC',
      details: {
        Applicant: `${user.first_name} ${user.last_name}`,
        Email: user.email,
        Status: 'Awaiting Document Verification',
      },
    });

    return this.getMyKyc(requester);
  }

  async update(id: string, data: any, requester: JwtPayload) {
    const user = await queryOne<any>(`SELECT id, ngo_id, created_by, kyc_data FROM users WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!user) throw new NotFoundError('User not found');

    if (!requester.roles.includes('super_admin')) {
      if (!requester.roles.includes('ngo_admin') || user.created_by !== requester.userId) {
        throw new ForbiddenError('You can only update team members created by you.');
      }
      if (data.roleIds?.length) {
        const roleIds: string[] = [...new Set((data.roleIds as string[]) ?? [])];
        const roleSlugs = await this.getRoleSlugs(roleIds);
        if (roleSlugs.length !== 1 || roleSlugs[0] !== 'ngo_team_member') {
          throw new ForbiddenError('NGO Admins can only assign NGO Team Member role.');
        }
      }
      data.ngoId = requester.ngoId || null;
    } else {
      if (data.roleIds?.length) {
        const roleIds: string[] = [...new Set((data.roleIds as string[]) ?? [])];
        const roleSlugs = await this.getRoleSlugs(roleIds);
        const allowedRoleSlugs = await this.getAllowedAssignableRoleSlugs(requester);
        if (roleSlugs.some((slug) => !allowedRoleSlugs.includes(slug))) {
          throw new ForbiddenError('You cannot assign one or more of the selected roles.');
        }
      }
      if (data.ngoId === undefined) data.ngoId = user.ngo_id;
    }

    const previousKyc = this.parseKycData(user.kyc_data);
    const nextKyc = data.kycData
      ? requester.roles.includes('super_admin')
        ? { ...previousKyc, ...data.kycData }
        : { ...previousKyc, ...this.sanitizeApplicantKycData(data.kycData), kycStatus: previousKyc.kycStatus }
      : null;
    const kycDataStr = nextKyc ? JSON.stringify(nextKyc) : null;
    await execute(
      `UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
       phone = COALESCE(?, phone), ngo_id = ?, kyc_data = COALESCE(?, kyc_data) WHERE id = ?`,
      [data.firstName, data.lastName, data.phone, data.ngoId ?? null, kycDataStr, id]
    );

    if (data.roleIds?.length) {
      await execute(`DELETE FROM user_roles WHERE user_id = ?`, [id]);
      for (const roleId of new Set((data.roleIds ?? []) as string[])) {
        await execute(`INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)`, [id, roleId, requester.userId]);
      }
      const roleSlugs = await this.getRoleSlugs([...new Set(data.roleIds as string[])]);
      await createNotification({
        userId: id,
        type: 'permission_change',
        title: 'Account Permissions Updated',
        message: `Your OYU Green account roles have been updated to: ${roleSlugs.join(', ')}.`,
        referenceType: 'user',
        referenceId: id,
        details: {
          Roles: roleSlugs.join(', '),
        },
      });
    }
    if (
      requester.roles.includes('super_admin') &&
      nextKyc?.kycStatus &&
      nextKyc.kycStatus !== previousKyc.kycStatus
    ) {
      const approved = this.isApprovedKycStatus(nextKyc.kycStatus);
      await createNotification({
        userId: id,
        type: approved ? 'approval' : 'rejection',
        title: approved ? 'KYC Approved - Access Enabled' : 'KYC Status Updated',
        message: approved
          ? 'Your NGO Admin KYC has been approved. Operational access is now enabled.'
          : `Your NGO Admin KYC status is now ${nextKyc.kycStatus}.${nextKyc.officeRemarks ? ` Remarks: ${nextKyc.officeRemarks}` : ''}`,
        referenceType: 'user',
        referenceId: id,
        actionUrl: approved ? `${config.app.frontendUrl}/dashboard` : `${config.app.frontendUrl}/kyc`,
        actionLabel: approved ? 'Open Dashboard' : 'Review KYC',
        details: {
          Status: nextKyc.kycStatus,
          Remarks: nextKyc.officeRemarks,
        },
      });
    }
    return this.getById(id, requester);
  }

  async setStatus(id: string, status: string, requester: JwtPayload) {
    const user = await queryOne<any>(`SELECT id, email, first_name, ngo_id, created_by FROM users WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!user) throw new NotFoundError('User not found');
    this.assertCanAccessUser(user, requester);
    await execute(`UPDATE users SET status = ? WHERE id = ?`, [status, id]);
    if (status === 'active') {
      await createNotification({
        userId: id,
        type: 'system',
        title: 'Account Activated',
        message: 'Your OYU Green account is active and ready to use.',
        referenceType: 'user',
        referenceId: id,
      });
    } else {
      await emailService.sendOperationalNotification({
        email: user.email,
        firstName: user.first_name,
        title: `Account ${status === 'suspended' ? 'Suspended' : 'Deactivated'}`,
        message: `Your OYU Green account has been ${status}. Contact your administrator if you believe this is incorrect.`,
        category: 'Account status',
        details: { Status: status },
      }).catch(() => {});
    }
    return this.getById(id, requester);
  }

  async adminResetPassword(id: string, newPassword: string, requester: JwtPayload) {
    const user = await queryOne<any>(`SELECT id, email, first_name, ngo_id, created_by FROM users WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!user) throw new NotFoundError('User not found');
    this.assertCanAccessUser(user, requester);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
    await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`, [id]);
    await emailService.sendWelcome(user.email, user.first_name, `${config.app.frontendUrl}/login`, newPassword).catch(() => {});
  }

  async delete(id: string, requester: JwtPayload) {
    if (id === requester.userId) throw new ForbiddenError('You cannot delete your own account');
    const user = await queryOne<any>(`SELECT id, ngo_id, created_by FROM users WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!user) throw new NotFoundError('User not found');
    if (!requester.roles.includes('super_admin')) {
      if (!requester.roles.includes('ngo_admin') || user.created_by !== requester.userId) {
        throw new ForbiddenError('You can only delete team members created by you.');
      }
    }
    await execute(`UPDATE users SET deleted_at = NOW() WHERE id = ?`, [id]);
  }

  private async getRoleSlugs(roleIds: string[]) {
    if (!roleIds.length) return [];
    const placeholders = roleIds.map(() => '?').join(',');
    const rows = await query<any>(`SELECT id, slug FROM roles WHERE id IN (${placeholders})`, roleIds);
    if (rows.length !== roleIds.length) {
      throw new NotFoundError('One or more roles not found');
    }
    return rows.map((row) => row.slug as string).sort();
  }

  private assertCanAccessUser(user: any, requester?: JwtPayload) {
    if (!requester || requester.roles.includes('super_admin')) return;
    if (user.id === requester.userId) return;

    if (requester.roles.includes('ngo_admin') && user.created_by === requester.userId) {
      return;
    }

    throw new ForbiddenError('You can only access team members created by you.');
  }

  private formatUser(user: any) {
    const { password_hash, ...rest } = user;
    let kycData = user.kyc_data;
    if (kycData && typeof kycData === 'string') {
      try {
        kycData = JSON.parse(kycData);
      } catch (e) {}
    }
    return {
      ...rest,
      kycData,
      roleNames: user.role_names ? user.role_names.split(',') : [],
      roleSlugs: user.role_slugs ? user.role_slugs.split(',') : [],
      roleIds: user.role_ids ? user.role_ids.split(',') : [],
    };
  }

  private parseKycData(value: any): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  private sanitizeApplicantKycData(value: Record<string, any>) {
    const {
      kycStatus,
      reviewedBy,
      approvedBy,
      officeSignatureUrl,
      officeRemarks,
      ...applicantData
    } = value ?? {};
    return applicantData;
  }

  private isApprovedKycStatus(status?: string) {
    const normalized = (status ?? '').trim().toLowerCase();
    return normalized === 'approved' || normalized === 'completed';
  }
}

export const usersService = new UsersService();
