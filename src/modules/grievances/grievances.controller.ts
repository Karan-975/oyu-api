import { Request, Response } from 'express';
import { grievancesService } from './grievances.service';
export class GrievancesController {
  async list(req: Request, res: Response) { res.json({ success: true, ...(await grievancesService.list(req.query as any)) }); }
  async getById(req: Request, res: Response) { res.json({ success: true, data: await grievancesService.getById(req.params.id) }); }
  async assign(req: Request, res: Response) { res.json({ success: true, data: await grievancesService.assign(req.params.id, req.body.assignedTo), message: 'Grievance assigned' }); }
  async updateStatus(req: Request, res: Response) { res.json({ success: true, data: await grievancesService.updateStatus(req.params.id, req.body.status, req.user!.userId, req.body.notes), message: 'Status updated' }); }
  async addComment(req: Request, res: Response) { res.json({ success: true, data: await grievancesService.addComment(req.params.id, req.user!.userId, req.body.comment, req.body.isInternal) }); }
  async create(req: Request, res: Response) { res.status(201).json({ success: true, data: await grievancesService.create(req.body, req.user!.userId, req.user!.ngoId), message: 'Grievance submitted successfully' }); }
}
export const grievancesController = new GrievancesController();
