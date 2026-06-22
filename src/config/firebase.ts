import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { logger } from '../shared/utils/logger';

let firebaseInitialized = false;

export function initFirebase(): void {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('[Firebase] Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY — push notifications disabled.');
    return;
  }

  if (getApps().length > 0) {
    firebaseInitialized = true;
    return;
  }

  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        // dotenv stores \n as literal \\n — convert back, and strip quotes if present
        privateKey: privateKey.replace(/\\n/g, '\n').replace(/"/g, ''),
      }),
    });
    firebaseInitialized = true;
    logger.info('[Firebase] Admin SDK initialized successfully.');
  } catch (err) {
    logger.error('[Firebase] Failed to initialize Admin SDK:', err);
  }
}

export function isFirebaseReady(): boolean {
  return firebaseInitialized && getApps().length > 0;
}
