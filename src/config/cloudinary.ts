import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';

export interface UploadResult {
  key: string;
  url: string;
  provider: 'cloudinary';
  size: number;
  mimeType: string;
  originalName: string;
}

type CloudinaryUploadResponse = {
  public_id?: string;
  secure_url?: string;
  bytes?: number;
  resource_type?: string;
  original_filename?: string;
  format?: string;
};

function ensureCloudinaryConfig() {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }
}

function buildSignature(params: Record<string, string>, apiSecret: string) {
  const signPayload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(signPayload + apiSecret).digest('hex');
}

function toDataUri(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function normalizeFolder(folder: string) {
  return folder
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '') || 'general';
}

function parseStorageKey(storageKey: string) {
  const [resourceType, ...rest] = storageKey.split(':');
  if (!resourceType || !rest.length) {
    return { resourceType: 'image', publicId: storageKey };
  }
  return { resourceType, publicId: rest.join(':') };
}

async function postToCloudinary(
  endpoint: string,
  body: URLSearchParams
): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload.error === 'object' && payload.error && 'message' in payload.error
      ? String((payload.error as { message?: string }).message ?? 'Cloudinary request failed')
      : 'Cloudinary request failed';
    throw new Error(message);
  }

  return payload;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: string = 'uploads'
): Promise<UploadResult> {
  ensureCloudinaryConfig();

  const safeFolder = normalizeFolder(folder || config.cloudinary.uploadFolder);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = uuidv4();
  const signature = buildSignature(
    {
      folder: safeFolder,
      public_id: publicId,
      timestamp,
    },
    config.cloudinary.apiSecret
  );

  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/auto/upload`;
  const body = new URLSearchParams({
    file: toDataUri(buffer, mimeType),
    api_key: config.cloudinary.apiKey,
    timestamp,
    folder: safeFolder,
    public_id: publicId,
    signature,
  });

  const result = (await postToCloudinary(endpoint, body)) as CloudinaryUploadResponse;
  const resourceType = result.resource_type ?? 'image';
  const storedKey = `${resourceType}:${result.public_id ?? publicId}`;

  return {
    key: storedKey,
    url: String(result.secure_url ?? ''),
    provider: 'cloudinary',
    size: Number(result.bytes ?? buffer.length),
    mimeType,
    originalName,
  };
}

export async function deleteFromCloudinary(storageKey: string): Promise<void> {
  ensureCloudinaryConfig();

  const { resourceType, publicId } = parseStorageKey(storageKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = buildSignature(
    { invalidate: 'true', public_id: publicId, timestamp },
    config.cloudinary.apiSecret
  );

  const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${resourceType}/destroy`;
  await postToCloudinary(
    endpoint,
    new URLSearchParams({
      public_id: publicId,
      api_key: config.cloudinary.apiKey,
      timestamp,
      signature,
      invalidate: 'true',
    })
  );
}
