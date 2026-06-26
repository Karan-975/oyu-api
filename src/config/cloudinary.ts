import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';

export interface UploadResult {
  key: string;
  url: string;
  provider: 'cloudinary' | 'local';
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

function hasCloudinaryConfig() {
  return Boolean(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);
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

function getLocalFileExtension(originalName: string, mimeType: string) {
  const existingExt = path.extname(originalName).trim();
  if (existingExt) return existingExt.toLowerCase();

  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
  };

  return mimeMap[mimeType] ?? '';
}

async function uploadLocally(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  folder: string
): Promise<UploadResult> {
  const safeFolder = normalizeFolder(folder || config.cloudinary.uploadFolder);
  const relativeFolder = safeFolder.split('/').filter(Boolean);
  const fileId = uuidv4();
  const extension = getLocalFileExtension(originalName, mimeType);
  const fileName = `${fileId}${extension}`;
  const uploadRoot = path.resolve(process.cwd(), 'uploads');
  const targetDir = path.join(uploadRoot, ...relativeFolder);
  const targetPath = path.join(targetDir, fileName);

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetPath, buffer);

  const publicPath = ['uploads', ...relativeFolder, fileName].join('/');
  const url = `http://localhost:${config.app.port}/${publicPath}`;

  return {
    key: `local:${safeFolder}/${fileName}`,
    url,
    provider: 'local',
    size: buffer.length,
    mimeType,
    originalName,
  };
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
  if (!hasCloudinaryConfig()) {
    return uploadLocally(buffer, originalName, mimeType, folder || config.cloudinary.uploadFolder);
  }

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
  if (storageKey.startsWith('local:')) {
    const relativePath = storageKey.slice('local:'.length);
    const fullPath = path.resolve(process.cwd(), 'uploads', relativePath);
    await fs.unlink(fullPath).catch(() => {});
    return;
  }

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
