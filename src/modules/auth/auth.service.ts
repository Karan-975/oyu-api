import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/config';
import { query, queryOne, execute } from '../../config/database';
import { AppError, AuthenticationError, NotFoundError } from '../../middleware/errorHandler';
import { JwtPayload } from '../../middleware/auth.middleware';
import { createAuditLog } from '../../middleware/audit.middleware';
import { emailService } from '../../shared/services/email.service';
import { logger } from '../../shared/utils/logger';

export class AuthService {
  async login(email: string, password: string) {
    const user = await queryOne<any>(
      `SELECT u.*, GROUP_CONCAT(DISTINCT r.slug) as role_slugs,
              GROUP_CONCAT(DISTINCT p.slug) as permission_slugs,
              n.name as ngo_name
       FROM users u
       LEFT JOIN ngos n ON n.id = u.ngo_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.email = ? AND u.deleted_at IS NULL
       GROUP BY u.id`,
      [email]
    );

    if (!user) throw new AuthenticationError('Invalid email or password');
    if (user.status !== 'active') throw new AuthenticationError('Your account is inactive. Contact your administrator.');

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) throw new AuthenticationError('Invalid email or password');

    const roles: string[] = user.role_slugs ? (user.role_slugs.split(',') as string[]) : [];

    // Check NGO status if user belongs to an NGO
    if (user.ngo_id && !roles.includes('ngo_admin')) {
      const ngo = await queryOne<any>(
        `SELECT status FROM ngos WHERE id = ? AND deleted_at IS NULL`,
        [user.ngo_id]
      );
      if (!ngo || ngo.status !== 'active') {
        throw new AuthenticationError('Access Denied: Your NGO has not completed KYC or is not active.');
      }
    }

    const permissions: string[] = user.permission_slugs ? [...new Set(user.permission_slugs.split(',') as string[])] : [];

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      roles,
      permissions,
      ngoId: user.ngo_id ?? undefined,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as any,
    });

    const refreshTokenRaw = uuidv4();
    const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await execute(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (UUID(), ?, ?, ?)`,
      [user.id, refreshTokenHash, expiresAt]
    );

    await execute(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [user.id]);

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress: '',
      userAgent: '',
    }).catch(() => {});

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: this.sanitizeUser(user, roles),
    };
  }

  async refreshToken(rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const stored = await queryOne<any>(
      `SELECT rt.*, u.status, u.deleted_at FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ? AND rt.revoked = 0 AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (!stored) throw new AuthenticationError('Invalid or expired refresh token');
    if (stored.status !== 'active' || stored.deleted_at) throw new AuthenticationError('User account inactive');

    const user = await queryOne<any>(
      `SELECT u.*, GROUP_CONCAT(DISTINCT r.slug) as role_slugs,
              GROUP_CONCAT(DISTINCT p.slug) as permission_slugs
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.id = ? GROUP BY u.id`,
      [stored.user_id]
    );

    if (!user) throw new AuthenticationError('User not found');

    const roles: string[] = user?.role_slugs ? (user.role_slugs.split(',') as string[]) : [];

    // Check NGO status if user belongs to an NGO
    if (user.ngo_id && !roles.includes('ngo_admin')) {
      const ngo = await queryOne<any>(
        `SELECT status FROM ngos WHERE id = ? AND deleted_at IS NULL`,
        [user.ngo_id]
      );
      if (!ngo || ngo.status !== 'active') {
        throw new AuthenticationError('Access Denied: Your NGO has not completed KYC or is not active.');
      }
    }

    const permissions: string[] = user?.permission_slugs ? [...new Set(user.permission_slugs.split(',') as string[])] : [];

    const payload: JwtPayload = {
      userId: stored.user_id,
      email: user?.email,
      roles,
      permissions,
      ngoId: user?.ngo_id ?? undefined,
    };

    const accessToken = jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as any,
    });

    // Rotate refresh token
    await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`, [tokenHash]);
    const newRefreshRaw = uuidv4();
    const newRefreshHash = crypto.createHash('sha256').update(newRefreshRaw).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await execute(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (UUID(), ?, ?, ?)`,
      [stored.user_id, newRefreshHash, expiresAt]
    );

    return { accessToken, refreshToken: newRefreshRaw };
  }

  async logout(userId: string, rawRefreshToken?: string) {
    if (rawRefreshToken) {
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`, [tokenHash]);
    } else {
      await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`, [userId]);
    }

    await createAuditLog({
      userId,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: userId,
      ipAddress: '',
      userAgent: '',
    }).catch(() => {});
  }

  async forgotPassword(email: string) {
    const user = await queryOne<any>(`SELECT id, first_name FROM users WHERE email = ? AND deleted_at IS NULL`, [email]);
    if (!user) {
      // Don't reveal if email exists
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await execute(`UPDATE password_resets SET used = 1 WHERE user_id = ?`, [user.id]);
    await execute(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (UUID(), ?, ?, ?)`,
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${config.app.frontendUrl}/reset-password?token=${resetToken}`;
    await emailService.sendPasswordReset(email, user.first_name, resetUrl);
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRecord = await queryOne<any>(
      `SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!resetRecord) throw new AppError('Invalid or expired reset token', 400, 'INVALID_TOKEN');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, resetRecord.user_id]);
    await execute(`UPDATE password_resets SET used = 1 WHERE id = ?`, [resetRecord.id]);
    // Revoke all refresh tokens
    await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`, [resetRecord.user_id]);

    await createAuditLog({
      userId: resetRecord.user_id,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: resetRecord.user_id,
      ipAddress: '',
      userAgent: '',
    }).catch(() => {});
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await queryOne<any>(`SELECT password_hash FROM users WHERE id = ?`, [userId]);
    if (!user) throw new NotFoundError('User not found');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new AppError('Current password is incorrect', 400, 'INVALID_PASSWORD');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await execute(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
    await execute(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`, [userId]);

    await createAuditLog({
      userId,
      action: 'PASSWORD_CHANGE',
      entityType: 'user',
      entityId: userId,
      ipAddress: '',
      userAgent: '',
    }).catch(() => {});
  }

  async getProfile(userId: string) {
    const user = await queryOne<any>(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
              u.status, u.last_login_at, u.created_at, u.ngo_id,
              n.name as ngo_name,
              GROUP_CONCAT(DISTINCT r.name) as role_names,
              GROUP_CONCAT(DISTINCT r.slug) as role_slugs
       FROM users u
       LEFT JOIN ngos n ON n.id = u.ngo_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ? GROUP BY u.id`,
      [userId]
    );
    if (!user) throw new NotFoundError('User not found');

    const role_slugs: string[] = user.role_slugs ? user.role_slugs.split(',') : [];

    return {
      ...user,
      role_names: user.role_names ? user.role_names.split(',') : [],
      role_slugs,
    };
  }

  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; phone?: string }) {
    await execute(
      `UPDATE users SET first_name = COALESCE(?, first_name),
                        last_name = COALESCE(?, last_name),
                        phone = COALESCE(?, phone)
       WHERE id = ?`,
      [data.firstName, data.lastName, data.phone, userId]
    );

    await createAuditLog({
      userId,
      action: 'PROFILE_UPDATED',
      entityType: 'user',
      entityId: userId,
      newValues: { firstName: data.firstName, lastName: data.lastName, phone: data.phone },
      ipAddress: '',
      userAgent: '',
    }).catch(() => {});

    return this.getProfile(userId);
  }

  private sanitizeUser(user: any, roles: string[]) {
    let kycData = user.kyc_data;
    if (kycData && typeof kycData === 'string') {
      try {
        kycData = JSON.parse(kycData);
      } catch {
        kycData = {};
      }
    }
    return {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      ngoId: user.ngo_id,
      ngoName: user.ngo_name,
      status: user.status,
      roles,
      kycData: kycData ?? {},
      kycStatus: kycData?.kycStatus ?? 'Pending KYC',
    };
  }
}

export const authService = new AuthService();
