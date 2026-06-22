import { Request, Response } from 'express';
import { rolesService } from './roles.service';

export class RolesController {
  async list(_req: Request, res: Response) {
    const roles = await rolesService.list();
    res.json({ success: true, data: roles });
  }

  async getById(req: Request, res: Response) {
    const role = await rolesService.getById(req.params.id);
    res.json({ success: true, data: role });
  }

  async listPermissions(_req: Request, res: Response) {
    const permissions = await rolesService.listPermissions();
    res.json({ success: true, data: permissions });
  }

  async updatePermissions(req: Request, res: Response) {
    const role = await rolesService.updateRolePermissions(req.params.id, req.body.permissionIds);
    res.json({ success: true, data: role, message: 'Role permissions updated' });
  }
}

export const rolesController = new RolesController();
