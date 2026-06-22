import { db } from '../config/database';
import { logger } from '../shared/utils/logger';
import fs from 'fs';
import path from 'path';

export async function runMigrations() {
  logger.info('🗄️  Running database migrations...');
  const schemaPath = path.resolve(process.cwd(), '../database/schema.sql');
  const rawSql = fs.readFileSync(schemaPath, 'utf8');
  const sql = rawSql.replace(/^\s*--.*$/gm, '');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
    await conn.commit();
    logger.info('✅ Database migrations completed successfully');
  } catch (err) {
    await conn.rollback();
    logger.error('❌ Migration failed:', err);
    throw err;
  } finally {
    conn.release();
  }
}

if (process.argv[1] === path.resolve(process.cwd(), 'src/database/migrate.ts')) {
  runMigrations().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
