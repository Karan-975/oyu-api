import { db } from '../config/database';
import { config } from '../config/config';
import { logger } from '../shared/utils/logger';
import { runMigrations } from './migrate';
import { runSeed } from './seed';

async function resetDatabase() {
  logger.info('🔄 Resetting database...');
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<any[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ?`,
      [config.db.database]
    );

    if (rows.length > 0) {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const row of rows) {
        const tableName = row.TABLE_NAME || row.table_name;
        await conn.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      }
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      logger.info(`✅ Dropped ${rows.length} existing table(s)`);
    } else {
      logger.info('✅ No tables found to drop');
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    logger.error('❌ Failed to reset database:', err);
    throw err;
  } finally {
    conn.release();
  }

  await runMigrations();
  await runSeed();
}

resetDatabase().catch((err) => {
  logger.error(err);
  process.exit(1);
});
