import { Request, Response } from 'express';
import { usersService } from './users.service';

export class UsersController {
  async list(req: Request, res: Response) {
    const result = await usersService.list(req.query as any, req.user!);
    res.json({ success: true, ...result });
  }

  async getById(req: Request, res: Response) {
    const user = await usersService.getById(req.params.id, req.user!);
    res.json({ success: true, data: user });
  }

  async create(req: Request, res: Response) {
    const user = await usersService.create(req.body, req.user!);
    res.status(201).json({ success: true, data: user, message: 'User created successfully' });
  }

  async getMyKyc(req: Request, res: Response) {
    const data = await usersService.getMyKyc(req.user!);
    res.json({ success: true, data });
  }

  async submitMyKyc(req: Request, res: Response) {
    const data = await usersService.submitMyKyc(req.user!, req.body.kycData);
    res.json({
      success: true,
      data,
      message: 'KYC submitted successfully and is awaiting Super Admin verification.',
    });
  }

  async update(req: Request, res: Response) {
    const user = await usersService.update(req.params.id, req.body, req.user!);
    res.json({ success: true, data: user, message: 'User updated successfully' });
  }

  async setStatus(req: Request, res: Response) {
    const user = await usersService.setStatus(req.params.id, req.body.status, req.user!);
    res.json({ success: true, data: user, message: `User ${req.body.status} successfully` });
  }

  async resetPassword(req: Request, res: Response) {
    await usersService.adminResetPassword(req.params.id, req.body.password, req.user!);
    res.json({ success: true, message: 'Password reset successfully' });
  }

  async delete(req: Request, res: Response) {
    await usersService.delete(req.params.id, req.user!);
    res.json({ success: true, message: 'User deleted successfully' });
  }
}

export const usersController = new UsersController();
