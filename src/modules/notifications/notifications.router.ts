import { query, queryOne, execute } from '../../config/database';
import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { sendPushToToken } from '../../shared/utils/push';
import { logger } from '../../shared/utils/logger';
import { emailService } from '../../shared/services/email.service';
import { config } from '../../config/config';
import { v4 as uuidv4 } from 'uuid';

// ─── Notification DB helpers ──────────────────────────────────────────────────

async function listNotifications(userId: string, queryParams: any) {
  const pageNumber = Number(queryParams.page ?? 1) || 1;
  const limitNumber = Number(queryParams.limit ?? 20) || 20;
  const offset = (pageNumber - 1) * limitNumber;
  const conditions = ['(user_id = ? OR user_id IS NULL)'];
  const params: any[] = [userId];
  if (queryParams.unreadOnly === 'true') { conditions.push('is_read = 0'); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [{ total }] = await query(`SELECT COUNT(*) as total FROM notifications ${where}`, params);
  const data = await query(
    `SELECT n.*, n.body as message, n.entity_id as reference_id, n.entity_type as reference_type
     FROM notifications n ${where} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limitNumber, offset]
  );
  const [{ unread }] = await query(`SELECT COUNT(*) as unread FROM notifications WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`, [userId]);
  return {
    data,
    unreadCount: parseInt(unread),
    pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) },
  };
}

async function markRead(id: string, userId: string) {
  await execute(`UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND (user_id = ? OR user_id IS NULL)`, [id, userId]);
}

async function markAllRead(userId: string) {
  await execute(`UPDATE notifications SET is_read = 1, read_at = NOW() WHERE (user_id = ? OR user_id IS NULL) AND is_read = 0`, [userId]);
}

// ─── FCM Token helpers ────────────────────────────────────────────────────────

async function saveFcmToken(userId: string, token: string, deviceInfo?: string) {
  // Upsert: one row per (user_id, token) — update timestamp if already exists
  const existing = await query(
    `SELECT id FROM fcm_tokens WHERE user_id = ? AND token = ?`,
    [userId, token]
  );
  if (existing.length > 0) {
    await execute(
      `UPDATE fcm_tokens SET updated_at = NOW(), device_info = ? WHERE user_id = ? AND token = ?`,
      [deviceInfo ?? null, userId, token]
    );
  } else {
    await execute(
      `INSERT INTO fcm_tokens (user_id, token, device_info, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
      [userId, token, deviceInfo ?? null]
    );
  }
}

async function removeFcmToken(userId: string, token: string) {
  await execute(`DELETE FROM fcm_tokens WHERE user_id = ? AND token = ?`, [userId, token]);
}

async function getUserFcmTokens(userId: string): Promise<string[]> {
  const rows = await query(`SELECT token FROM fcm_tokens WHERE user_id = ?`, [userId]);
  return rows.map((r: any) => r.token);
}

// ─── Notification creation + push helper ─────────────────────────────────────

export interface CreateNotificationOptions {
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
  sendPush?: boolean;
  sendEmail?: boolean;
  actionUrl?: string;
  actionLabel?: string;
  details?: Record<string, string | undefined>;
}

/**
 * Create an in-app notification record and optionally fire a push notification.
 * Import and call this from other modules (surveys, rehab, grievances, assignments, etc.)
 */
export async function createNotification(opts: CreateNotificationOptions): Promise<void> {
  const notificationId = uuidv4();
  const type = normalizeNotificationType(opts.type);

  try {
    await execute(
      `INSERT INTO notifications (id, user_id, type, title, body, entity_id, entity_type, is_read, sent_email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, NOW())`,
      [notificationId, opts.userId, type, opts.title, opts.message, opts.referenceId ?? null, opts.referenceType ?? null]
    );
  } catch (err) {
    logger.error('[Notifications] Failed to create in-app notification:', err);
    return;
  }

  try {
    if (opts.sendPush !== false) {
      const tokens = await getUserFcmTokens(opts.userId);
      for (const token of tokens) {
        const sent = await sendPushToToken(token, {
          title: opts.title,
          body: opts.message,
          data: {
            type: opts.type,
            referenceId: opts.referenceId ?? '',
            referenceType: opts.referenceType ?? '',
          },
        });
        if (!sent) {
          // Invalid token — clean it up
          await removeFcmToken(opts.userId, token);
        }
      }
    }
  } catch (err) {
    logger.error('[Notifications] Push delivery failed:', err);
  }

  if (opts.sendEmail === false) return;

  try {
    const user = await queryOne<any>(
      `SELECT email, first_name FROM users
       WHERE id = ? AND status = 'active' AND deleted_at IS NULL`,
      [opts.userId]
    );
    if (!user?.email) return;

    const actionUrl = opts.actionUrl ?? buildNotificationUrl(opts.referenceType, opts.referenceId);
    await emailService.sendOperationalNotification({
      email: user.email,
      firstName: user.first_name,
      title: opts.title,
      message: opts.message,
      category: type,
      actionUrl,
      actionLabel: opts.actionLabel,
      details: opts.details,
    });
    await execute(`UPDATE notifications SET sent_email = 1 WHERE id = ?`, [notificationId]);
  } catch (err) {
    logger.error('[Notifications] Email delivery failed:', err);
  }
}

export async function createNotificationsForUsers(
  userIds: Array<string | null | undefined>,
  options: Omit<CreateNotificationOptions, 'userId'>
) {
  const uniqueUserIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(uniqueUserIds.map((userId) => createNotification({ ...options, userId })));
}

export async function createNotificationsForRole(
  roleSlug: string,
  options: Omit<CreateNotificationOptions, 'userId'>
) {
  const users = await query<any>(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.slug = ? AND u.status = 'active' AND u.deleted_at IS NULL`,
    [roleSlug]
  );
  await createNotificationsForUsers(users.map((user) => user.id), options);
}

function normalizeNotificationType(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes('assign')) return 'assignment';
  if (normalized.includes('approv')) return 'approval';
  if (normalized.includes('reject') || normalized.includes('return') || normalized.includes('reopen')) return 'rejection';
  if (normalized.includes('rehab')) return 'rehabilitation';
  if (normalized.includes('grievance')) return 'grievance';
  return 'system';
}

function buildNotificationUrl(referenceType?: string, referenceId?: string) {
  if (!referenceType || !referenceId) return `${config.app.frontendUrl}/notifications`;

  switch (referenceType) {
    case 'borehole':
      return `${config.app.frontendUrl}/boreholes/${referenceId}`;
    case 'survey':
      return `${config.app.frontendUrl}/surveys/${referenceId}`;
    case 'rehabilitation':
      return `${config.app.frontendUrl}/rehabilitation/${referenceId}`;
    case 'grievance':
      return `${config.app.frontendUrl}/grievances/${referenceId}`;
    default:
      return `${config.app.frontendUrl}/notifications`;
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

const router = Router();
router.use(authenticate);

/** GET /api/notifications — list notifications for current user */
router.get('/', async (req: Request, res: Response) => {
  const result = await listNotifications(req.user!.userId, req.query as any);
  res.json({ success: true, ...result });
});

/** PATCH /api/notifications/read-all — mark all as read */
router.patch('/read-all', async (req: Request, res: Response) => {
  await markAllRead(req.user!.userId);
  res.json({ success: true, message: 'All notifications marked as read' });
});

/** PATCH /api/notifications/:id/read — mark one as read */
router.post('/broadcast', requireRole('super_admin'), async (req: Request, res: Response) => {
  const { title, message, roleSlug, actionUrl, actionLabel, details } = req.body;
  if (!title || !message) {
    res.status(400).json({ success: false, message: 'title and message are required' });
    return;
  }

  const options = {
    type: 'system',
    title: String(title),
    message: String(message),
    referenceType: 'system',
    actionUrl: typeof actionUrl === 'string' ? actionUrl : undefined,
    actionLabel: typeof actionLabel === 'string' ? actionLabel : undefined,
    details: details && typeof details === 'object' ? details : undefined,
  };

  if (typeof roleSlug === 'string' && roleSlug.trim()) {
    await createNotificationsForRole(roleSlug.trim(), options);
  } else {
    const users = await query<any>(
      `SELECT id FROM users WHERE status = 'active' AND deleted_at IS NULL`
    );
    await createNotificationsForUsers(users.map((user) => user.id), options);
  }

  res.status(201).json({ success: true, message: 'Notification broadcast queued successfully' });
});

router.patch('/:id/read', async (req: Request, res: Response) => {
  await markRead(req.params.id, req.user!.userId);
  res.json({ success: true, message: 'Marked as read' });
});

/** POST /api/notifications/fcm-token — register device FCM token */
router.post('/fcm-token', async (req: Request, res: Response) => {
  const { token, deviceInfo } = req.body;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ success: false, message: 'token is required' });
    return;
  }
  await saveFcmToken(req.user!.userId, token.trim(), deviceInfo);
  res.json({ success: true, message: 'FCM token registered' });
});

/** DELETE /api/notifications/fcm-token — unregister device FCM token (on logout) */
router.delete('/fcm-token', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ success: false, message: 'token is required' });
    return;
  }
  await removeFcmToken(req.user!.userId, token.trim());
  res.json({ success: true, message: 'FCM token removed' });
});

export default router;
