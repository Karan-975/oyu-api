import { query, queryOne, execute } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';
import { createNotificationsForUsers } from '../notifications/notifications.router';

export class RolesService {
  async list() {
    return query<any>(
      `SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) as user_count,
              GROUP_CONCAT(p.slug ORDER BY p.module, p.slug) as permission_slugs
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY r.id ORDER BY r.name`
    );
  }

  async getById(id: string) {
    const role = await queryOne<any>(`SELECT * FROM roles WHERE id = ?`, [id]);
    if (!role) throw new NotFoundError('Role not found');
    const permissions = await query<any>(
      `SELECT p.* FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id WHERE rp.role_id = ? ORDER BY p.module, p.name`, [id]
    );
    return { ...role, permissions };
  }

  async listPermissions() {
    return query<any>(`SELECT * FROM permissions ORDER BY module, name`);
  }

  async updateRolePermissions(roleId: string, permissionIds: string[]) {
    const role = await queryOne<any>(`SELECT * FROM roles WHERE id = ?`, [roleId]);
    if (!role) throw new NotFoundError('Role not found');
    await execute(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);
    for (const pid of permissionIds) {
      await execute(`INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`, [roleId, pid]);
    }
    const affectedUsers = await query<any>(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       WHERE ur.role_id = ? AND u.status = 'active' AND u.deleted_at IS NULL`,
      [roleId]
    );
    await createNotificationsForUsers(affectedUsers.map((user) => user.id), {
      type: 'permission_change',
      title: 'Role Permissions Updated',
      message: `Permissions for your ${role.name} role have been updated. Sign in again if the new access is not immediately visible.`,
      referenceType: 'role',
      referenceId: roleId,
      details: { Role: role.name },
    });
    return this.getById(roleId);
  }
}

export const rolesService = new RolesService();
