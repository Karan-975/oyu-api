import { Request, Response } from 'express';
import { waterTestingService } from './water-testing.service';

export class WaterTestingController {
  async list(req: Request, res: Response) {
    const { page, limit, search, status, boreholeId } = req.query as any;
    const result = await waterTestingService.list({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: typeof search === 'string' ? search.trim() : undefined,
      status: typeof status === 'string' ? status.trim() : undefined,
      boreholeId: typeof boreholeId === 'string' ? boreholeId.trim() : undefined,
    });
    res.json({ success: true, ...result });
  }

  async getById(req: Request, res: Response) {
    const data = await waterTestingService.getById(req.params.id);
    res.json({ success: true, data });
  }

  async create(req: Request, res: Response) {
    const data = await waterTestingService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data, message: 'Water testing request created successfully' });
  }

  async uploadReport(req: Request, res: Response) {
    const { fileUrl } = req.body;
    const data = await waterTestingService.uploadReport(req.params.id, fileUrl, req.user!.userId);
    res.json({ success: true, data, message: 'Lab report uploaded and parameters extracted successfully' });
  }

  async publish(req: Request, res: Response) {
    const data = await waterTestingService.publish(req.params.id);
    res.json({ success: true, data, message: 'Water test report published successfully' });
  }

  async reopen(req: Request, res: Response) {
    const { notes } = req.body;
    const data = await waterTestingService.reopen(req.params.id, notes);
    res.json({ success: true, data, message: 'Water test submission reopened successfully' });
  }
}

export const waterTestingController = new WaterTestingController();
