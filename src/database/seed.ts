import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db, execute, queryOne } from '../config/database';
import { logger } from '../shared/utils/logger';
import path from 'path';

const ROLES = [
  {
    name: 'Super Admin',
    slug: 'super_admin',
    description: 'OYU Green HQ staff with full platform control.',
  },
  {
    name: 'NGO Admin',
    slug: 'ngo_admin',
    description: 'NGO Administrator who manages users, boreholes, and surveys for their NGO.',
  },
  {
    name: 'NGO Team Member',
    slug: 'ngo_team_member',
    description: 'NGO Field team member performing borehole registrations, surveys, and inspections.',
  },
];

const PERMISSIONS = [
  ['user:view', 'User View', 'user'],
  ['user:create', 'User Create', 'user'],
  ['user:edit', 'User Edit', 'user'],
  ['user:delete', 'User Delete', 'user'],
  ['ngo:view', 'NGO View', 'ngo'],
  ['ngo:create', 'NGO Create', 'ngo'],
  ['ngo:edit', 'NGO Edit', 'ngo'],
  ['ngo:delete', 'NGO Delete', 'ngo'],
  ['borehole:view', 'Borehole View', 'borehole'],
  ['borehole:create', 'Borehole Create', 'borehole'],
  ['borehole:edit', 'Borehole Edit', 'borehole'],
  ['borehole:delete', 'Borehole Delete', 'borehole'],
  ['borehole:assign', 'Borehole Assign', 'borehole'],
  ['assignment:view', 'Assignment View', 'assignment'],
  ['assignment:create', 'Assignment Create', 'assignment'],
  ['assignment:edit', 'Assignment Edit', 'assignment'],
  ['form:view', 'Form View', 'form'],
  ['form:create', 'Form Create', 'form'],
  ['form:edit', 'Form Edit', 'form'],
  ['form:delete', 'Form Delete', 'form'],
  ['survey:view', 'Survey View', 'survey'],
  ['survey:create', 'Survey Create', 'survey'],
  ['survey:approve', 'Survey Approve', 'survey'],
  ['survey:reject', 'Survey Reject', 'survey'],
  ['survey:reopen', 'Survey Reopen', 'survey'],
  ['rehabilitation:view', 'Rehabilitation View', 'rehabilitation'],
  ['rehabilitation:edit', 'Rehabilitation Edit', 'rehabilitation'],
  ['rehabilitation:approve', 'Rehabilitation Approve', 'rehabilitation'],
  ['rehabilitation:reopen', 'Rehabilitation Reopen', 'rehabilitation'],
  ['grievance:view', 'Grievance View', 'grievance'],
  ['grievance:create', 'Grievance Create', 'grievance'],
  ['grievance:assign', 'Grievance Assign', 'grievance'],
  ['grievance:close', 'Grievance Close', 'grievance'],
  ['report:view', 'Report View', 'report'],
  ['report:export', 'Report Export', 'report'],
  ['audit:view', 'Audit View', 'audit'],
  ['settings:view', 'Settings View', 'settings'],
  ['settings:edit', 'Settings Edit', 'settings'],
  ['role:manage', 'Role Manage', 'settings'],
] as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: PERMISSIONS.map(([slug]) => slug),
  ngo_admin: [
    'user:view', 'user:create', 'user:edit', 'user:delete',
    'ngo:view',
    'borehole:view', 'borehole:create', 'borehole:edit',
    'assignment:view', 'assignment:create', 'assignment:edit',
    'form:view',
    'survey:view', 'survey:create', 'survey:approve', 'survey:reject', 'survey:reopen',
    'rehabilitation:view',
    'grievance:view', 'grievance:create', 'grievance:assign', 'grievance:close',
    'report:view', 'report:export',
    'settings:view', 'settings:edit'
  ],
  ngo_team_member: [
    'borehole:view', 'borehole:create',
    'assignment:view',
    'form:view',
    'survey:view', 'survey:create',
    'rehabilitation:view',
    'grievance:view', 'grievance:create',
    'settings:view'
  ]
};

export async function runSeed() {
  logger.info('Seeding database with super admin only...');

  const [tables] = await db.execute<any[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`
  );

  if (tables.length > 0) {
    await execute('SET FOREIGN_KEY_CHECKS = 0');
    for (const row of tables) {
      const tableName = row.TABLE_NAME || row.table_name;
      await execute(`TRUNCATE TABLE \`${tableName}\``);
    }
    await execute('SET FOREIGN_KEY_CHECKS = 1');
    logger.info(`Cleared ${tables.length} table(s) before seeding`);
  }

  for (const role of ROLES) {
    await execute(
      `INSERT INTO roles (id, name, slug, description, is_system)
       VALUES (UUID(), ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = 1`,
      [role.name, role.slug, role.description]
    );
  }

  for (const [slug, name, module] of PERMISSIONS) {
    await execute(
      `INSERT INTO permissions (id, name, slug, module)
       VALUES (UUID(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), module = VALUES(module)`,
      [name, slug, module]
    );
  }

  for (const [roleSlug, permissionSlugs] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permissionSlug of permissionSlugs) {
      await execute(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
         WHERE r.slug = ? AND p.slug = ?`,
        [roleSlug, permissionSlug]
      );
    }
  }

  const passwordHash = await bcrypt.hash('Admin@1234!', 12);
  const existingAdmin = await queryOne<any>(
    `SELECT id FROM users WHERE email = 'superadmin@oyugreen.com' AND deleted_at IS NULL`
  );
  const superAdminId = existingAdmin?.id ?? uuidv4();

  if (!existingAdmin) {
    await execute(
      `INSERT INTO users (id, first_name, last_name, email, phone, password_hash, status, email_verified)
       VALUES (?, 'Super', 'Admin', 'superadmin@oyugreen.com', '+2348000000001', ?, 'active', 1)`,
      [superAdminId, passwordHash]
    );
  } else {
    await execute(
      `UPDATE users SET password_hash = ?, status = 'active', email_verified = 1 WHERE id = ?`,
      [passwordHash, superAdminId]
    );
  }

  await execute(`DELETE FROM user_roles WHERE user_id = ?`, [superAdminId]);
  await execute(
    `INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by)
     SELECT ?, r.id, ? FROM roles r WHERE r.slug = 'super_admin'`,
    [superAdminId, superAdminId]
  );

  const [roles] = await db.execute(`SELECT slug FROM roles ORDER BY slug`);
  logger.info(`Seeded roles: ${(roles as any[]).map((role) => role.slug).join(', ')}`);
  logger.info('Super Admin Login: superadmin@oyugreen.com / Admin@1234!');
}

if (process.argv[1] === path.resolve(process.cwd(), 'src/database/seed.ts')) {
  runSeed().catch((err) => {
    logger.error('Seeding failed:', err);
    process.exit(1);
  });
}
