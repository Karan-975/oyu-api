import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { uploadAny } from '../../middleware/upload.middleware';
import { uploadToCloudinary, deleteFromCloudinary } from '../../config/cloudinary';
import { query, execute, queryOne } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';

const router = Router();
router.use(authenticate);

router.post('/upload', uploadAny.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
  const { entityType, entityId, documentField } = req.body;
  const allowedDocumentFields = new Set([
    'passportPhotoUrl',
    'idDocumentUrl',
    'addressProofUrl',
    'cancelledChequeUrl',
    'signatureUrl',
  ]);
  if (entityType === 'user_kyc' && documentField && !allowedDocumentFields.has(documentField)) {
    return res.status(400).json({ success: false, message: 'Invalid KYC document field' });
  }

  const folder = entityType || 'general';
  const result = await uploadToCloudinary(req.file.buffer, req.file.originalname, req.file.mimetype, folder);
  await execute(
    `INSERT INTO files (id, entity_type, entity_id, file_name, original_name, mime_type, size_bytes, s3_key, s3_url, file_type, document_field, uploaded_by)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [entityType || 'general', entityId || null, result.key.split(':').pop(), result.originalName,
     result.mimeType, result.size, result.key, result.url,
     result.mimeType.startsWith('image/') ? 'image' : 'document', documentField || null, req.user!.userId]
  );

  if (entityType === 'user_kyc' && documentField) {
    const targetUserId = entityId || req.user!.userId;
    if (targetUserId !== req.user!.userId && !req.user!.roles.includes('super_admin')) {
      return res.status(403).json({ success: false, message: 'You cannot upload KYC documents for another user' });
    }

    const user = await queryOne<any>(`SELECT kyc_data FROM users WHERE id = ? AND deleted_at IS NULL`, [targetUserId]);
    if (!user) throw new NotFoundError('KYC user not found');
    let currentKyc = user.kyc_data ?? {};
    if (typeof currentKyc === 'string') {
      try {
        currentKyc = JSON.parse(currentKyc || '{}');
      } catch {
        currentKyc = {};
      }
    }
    await execute(`UPDATE users SET kyc_data = ? WHERE id = ?`, [
      JSON.stringify({ ...currentKyc, [documentField]: result.url }),
      targetUserId,
    ]);
  }

  res.status(201).json({ success: true, data: result, message: 'File uploaded successfully' });
});

router.post('/upload-multiple', uploadAny.array('files', 10), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ success: false, message: 'No files provided' });
  const { entityType, entityId } = req.body;
  const results = [];
  for (const file of files) {
    const result = await uploadToCloudinary(file.buffer, file.originalname, file.mimetype, entityType || 'general');
    await execute(
      `INSERT INTO files (id, entity_type, entity_id, file_name, original_name, mime_type, size_bytes, s3_key, s3_url, file_type, document_field, uploaded_by)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [entityType || 'general', entityId || null, result.key.split(':').pop(), result.originalName,
       result.mimeType, result.size, result.key, result.url,
       result.mimeType.startsWith('image/') ? 'image' : 'document', req.user!.userId]
    );
    results.push(result);
  }
  res.status(201).json({ success: true, data: results, message: `${results.length} files uploaded` });
});

router.get('/:entityType/:entityId', async (req: Request, res: Response) => {
  const files = await query<any>(`SELECT * FROM files WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC`, [req.params.entityType, req.params.entityId]);
  res.json({ success: true, data: files });
});

router.delete('/:id', async (req: Request, res: Response) => {
  const file = await queryOne<any>(`SELECT * FROM files WHERE id = ?`, [req.params.id]);
  if (!file) throw new NotFoundError('File not found');
  await deleteFromCloudinary(file.s3_key);
  await execute(`DELETE FROM files WHERE id = ?`, [req.params.id]);
  res.json({ success: true, message: 'File deleted' });
});

export default router;
