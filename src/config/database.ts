import mysql from 'mysql2/promise';
import { config } from './config';
import { logger } from '../shared/utils/logger';

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
});

export const db = pool;

export async function testDatabaseConnection(): Promise<void> {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    logger.info('✅ Database connection established successfully');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

function normalizeParams(params?: any[]) {
  if (!params || params.length === 0) return undefined;
  return params.map((value) => (value === undefined ? null : value));
}

export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  try {
    const normalizedParams = normalizeParams(params) || [];
    const [rows] = await pool.query(sql, normalizedParams);
    return rows as T[];
  } catch (error) {
    logger.error('Database query failed', { sql, params, error });
    throw error;
  }
}

export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  try {
    const normalizedParams = normalizeParams(params) || [];
    const [result] = await pool.query(sql, normalizedParams);
    return result as mysql.ResultSetHeader;
  } catch (error) {
    logger.error('Database execute failed', { sql, params, error });
    throw error;
  }
}
