import { Request, Response } from 'express';
import { surveysService } from './surveys.service';

export class SurveysController {
  async list(req: Request, res: Response) { res.json({ success: true, ...(await surveysService.list(req.query as any)) }); }
  async getById(req: Request, res: Response) { res.json({ success: true, data: await surveysService.getById(req.params.id) }); }
  async approve(req: Request, res: Response) { res.json({ success: true, data: await surveysService.approve(req.params.id, req.user!.userId, req.body.notes), message: 'Survey approved' }); }
  async reject(req: Request, res: Response) { res.json({ success: true, data: await surveysService.reject(req.params.id, req.user!.userId, req.body.notes), message: 'Survey rejected' }); }
  async reopen(req: Request, res: Response) { res.json({ success: true, data: await surveysService.reopen(req.params.id, req.user!.userId, req.body.notes), message: 'Survey reopened' }); }
  async create(req: Request, res: Response) { res.status(201).json({ success: true, data: await surveysService.create(req.body, req.user!.userId, req.user!.ngoId), message: 'Survey submitted successfully' }); }
}
export const surveysController = new SurveysController();
