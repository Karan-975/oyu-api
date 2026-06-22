import { Request, Response } from 'express';
import { rehabilitationService } from './rehabilitation.service';

export class RehabilitationController {
  async list(req: Request, res: Response) { res.json({ success: true, ...(await rehabilitationService.list(req.query as any)) }); }
  async getById(req: Request, res: Response) { res.json({ success: true, data: await rehabilitationService.getById(req.params.id) }); }
  async approve(req: Request, res: Response) { res.json({ success: true, data: await rehabilitationService.approve(req.params.id, req.user!.userId, req.body.notes), message: 'Record approved' }); }
  async reject(req: Request, res: Response) { res.json({ success: true, data: await rehabilitationService.reject(req.params.id, req.user!.userId, req.body.notes), message: 'Record rejected' }); }
  async reopen(req: Request, res: Response) { res.json({ success: true, data: await rehabilitationService.reopen(req.params.id, req.user!.userId, req.body.notes), message: 'Rehabilitation stage reopened' }); }
  async create(req: Request, res: Response) { res.status(201).json({ success: true, data: await rehabilitationService.create(req.body, req.user!.userId), message: 'Rehabilitation stage updated' }); }
}
export const rehabilitationController = new RehabilitationController();
