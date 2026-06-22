import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { AuthenticationError, ForbiddenError } from './errorHandler';
import { query } from '../config/database';

export interface JwtPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  ngoId?: string;
  kycStatus?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('No token provided');
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

    // Verify user is still active in DB
    const users = await query<any>(
      `SELECT u.id, u.status,
              JSON_UNQUOTE(JSON_EXTRACT(u.kyc_data, '$.kycStatus')) as kyc_status
       FROM users u WHERE u.id = ? AND u.deleted_at IS NULL`,
      [payload.userId]
    );
    if (!users.length || users[0].status !== 'active') {
      throw new AuthenticationError('User account is inactive or not found');
    }

    const kycStatus = users[0].kyc_status || 'Pending KYC';
    req.user = { ...payload, kycStatus };

    if (
      payload.roles.includes('ngo_admin') &&
      !isApprovedKycStatus(kycStatus) &&
      !isKycExemptRequest(req)
    ) {
      throw new ForbiddenError(
        'KYC approval is required before you can perform this operation. Complete your KYC profile and wait for Super Admin approval.'
      );
    }
    next();
  } catch (err: any) {
    if (err instanceof AuthenticationError) throw err;
    if (err.name === 'TokenExpiredError') throw new AuthenticationError('Token expired');
    throw new AuthenticationError('Invalid token');
  }
}

function isApprovedKycStatus(status?: string) {
  const normalized = (status ?? '').trim().toLowerCase();
  return normalized === 'approved' || normalized === 'completed';
}

function isKycExemptRequest(req: Request) {
  const path = req.originalUrl.split('?')[0];
  return (
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/notifications') ||
    path === '/api/users/me/kyc' ||
    path.startsWith('/api/files/')
  );
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
  } catch {
    // ignore optional auth
  }
  next();
}
