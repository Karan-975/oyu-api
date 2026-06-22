import { Request, Response } from 'express';
import { ngoService } from './ngos.service';

export class NgoController {
  async list(req: Request, res: Response) {
    const { page, limit, search, status, regionId } = req.query as any;
    const result = await ngoService.list({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
      status: typeof status === 'string' && status.trim() ? status.trim() : undefined,
      regionId: typeof regionId === 'string' && regionId.trim() ? regionId.trim() : undefined,
    });
    res.json({ success: true, ...result });
  }

  async getById(req: Request, res: Response) {
    const ngo = await ngoService.getById(req.params.id);
    res.json({ success: true, data: ngo });
  }

  async create(req: Request, res: Response) {
    const ngo = await ngoService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: ngo, message: 'NGO created successfully' });
  }

  async update(req: Request, res: Response) {
    const ngo = await ngoService.update(req.params.id, req.body);
    res.json({ success: true, data: ngo, message: 'NGO updated successfully' });
  }

  async setStatus(req: Request, res: Response) {
    const ngo = await ngoService.setStatus(req.params.id, req.body.status);
    res.json({ success: true, data: ngo, message: `NGO ${req.body.status === 'active' ? 'activated' : 'deactivated'} successfully` });
  }

  async sendKyc(req: Request, res: Response) {
    const ngo = await ngoService.sendKyc(req.params.id);
    res.json({ success: true, data: ngo, message: 'KYC sent to NGO successfully' });
  }

  async signKyc(req: Request, res: Response) {
    const ngo = await ngoService.signKyc(req.params.id);
    res.json({ success: true, data: ngo, message: 'NGO KYC signed successfully' });
  }

  async approveKyc(req: Request, res: Response) {
    const ngo = await ngoService.approveKyc(req.params.id);
    res.json({ success: true, data: ngo, message: 'NGO KYC approved successfully' });
  }

  async rejectKyc(req: Request, res: Response) {
    const ngo = await ngoService.rejectKyc(req.params.id);
    res.json({ success: true, data: ngo, message: 'NGO KYC rejected successfully' });
  }

  async delete(req: Request, res: Response) {
    await ngoService.delete(req.params.id);
    res.json({ success: true, message: 'NGO deleted successfully' });
  }

  async getBoreholes(req: Request, res: Response) {
    const boreholes = await ngoService.getBoreholes(req.params.id);
    res.json({ success: true, data: boreholes });
  }
}

export const ngoController = new NgoController();
