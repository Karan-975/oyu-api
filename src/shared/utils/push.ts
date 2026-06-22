import { isFirebaseReady } from '../../config/firebase';
import { getMessaging, Message } from 'firebase-admin/messaging';
import { logger } from './logger';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

/**
 * Send push notification to a single FCM device token.
 */
export async function sendPushToToken(token: string, payload: PushPayload): Promise<boolean> {
  if (!isFirebaseReady()) return false;
  if (!token || token.trim() === '') return false;

  try {
    const message: Message = {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
      },
      data: payload.data ?? {},
      android: {
        priority: 'high',
        notification: {
          channelId: 'oyu_green_channel',
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    };

    const response = await getMessaging().send(message);
    logger.info(`[FCM] Sent to token ...${token.slice(-6)}: ${response}`);
    return true;
  } catch (err: any) {
    // Invalid / expired token — caller should handle removing it
    if (err?.code === 'messaging/registration-token-not-registered' ||
        err?.code === 'messaging/invalid-registration-token') {
      logger.warn(`[FCM] Invalid token ...${token.slice(-6)} — should be removed.`);
      return false;
    }
    logger.error('[FCM] Error sending push:', err);
    return false;
  }
}

/**
 * Send push to multiple FCM tokens (multicast, up to 500 at a time).
 */
export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<void> {
  if (!isFirebaseReady() || tokens.length === 0) return;

  const CHUNK_SIZE = 500;
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);
    try {
      const response = await getMessaging().sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
        },
        data: payload.data ?? {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'oyu_green_channel',
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      });
      logger.info(`[FCM] Multicast sent: ${response.successCount} OK, ${response.failureCount} failed.`);
    } catch (err) {
      logger.error('[FCM] Multicast error:', err);
    }
  }
}

/**
 * Send push to a Firebase topic (e.g. 'super_admin', 'ngo_{id}').
 */
export async function sendPushToTopic(topic: string, payload: PushPayload): Promise<void> {
  if (!isFirebaseReady()) return;

  try {
    await getMessaging().send({
      topic,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: {
        priority: 'high',
        notification: { channelId: 'oyu_green_channel', sound: 'default' },
      },
    });
    logger.info(`[FCM] Topic "${topic}" notified.`);
  } catch (err) {
    logger.error(`[FCM] Topic "${topic}" error:`, err);
  }
}
