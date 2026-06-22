import { Request, Response } from 'express';
import { boreholeService } from './boreholes.service';

export class BoreholeController {
  async list(req: Request, res: Response) {
    const result = await boreholeService.list(req.query as any);
    res.json({ success: true, ...result });
  }

  async getById(req: Request, res: Response) {
    const borehole = await boreholeService.getById(req.params.id, req.user);
    res.json({ success: true, data: borehole });
  }

  async create(req: Request, res: Response) {
    const borehole = await boreholeService.create(req.body, req.user!.userId);
    let result = borehole;
    if (req.body.assignedNgoAdminId) {
      result = await boreholeService.assignToNgoAdmin(
        borehole.id,
        req.body.assignedNgoAdminId,
        req.user!
      );
    }
    res.status(201).json({
      success: true,
      data: result,
      message: req.body.assignedNgoAdminId
        ? 'Borehole created and assigned successfully'
        : 'Borehole created successfully',
    });
  }

  async update(req: Request, res: Response) {
    const borehole = await boreholeService.update(req.params.id, req.body, req.user!.userId);
    res.json({ success: true, data: borehole, message: 'Borehole updated successfully' });
  }

  async assignNgo(req: Request, res: Response) {
    const borehole = await boreholeService.assignNgo(req.params.id, req.body.ngoId, req.user!.userId, req.body.reason);
    res.json({ success: true, data: borehole, message: 'NGO assigned successfully' });
  }

  async assignUser(req: Request, res: Response) {
    const borehole = await boreholeService.assignUser(
      req.params.id,
      req.body.userId,
      req.user!,
      req.body.reason,
      req.body.modules ?? req.body.module
    );
    res.json({ success: true, data: borehole, message: 'Field user assigned successfully' });
  }

  async reassign(req: Request, res: Response) {
    const borehole = await boreholeService.reassign(req.params.id, req.body.assigneeType, req.body.assigneeId, req.user!.userId, req.body.reason);
    res.json({ success: true, data: borehole, message: 'Borehole reassigned successfully' });
  }

  async getTimeline(req: Request, res: Response) {
    const timeline = await boreholeService.getTimeline(req.params.id, req.user);
    res.json({ success: true, data: timeline });
  }

  async getAssignments(req: Request, res: Response) {
    const assignments = await boreholeService.getAssignments(req.params.id, req.user);
    res.json({ success: true, data: assignments });
  }

  async getMapData(req: Request, res: Response) {
    const data = await boreholeService.getMapData(req.query);
    res.json({ success: true, data });
  }

  async getSurveys(req: Request, res: Response) {
    const surveys = await boreholeService.getSurveys(req.params.id, req.user);
    res.json({ success: true, data: surveys });
  }

  async getRehabilitation(req: Request, res: Response) {
    const records = await boreholeService.getRehabilitation(req.params.id, req.user);
    res.json({ success: true, data: records });
  }

  async delete(req: Request, res: Response) {
    await boreholeService.delete(req.params.id);
    res.json({ success: true, message: 'Borehole deleted successfully' });
  }

  async getMatrix(req: Request, res: Response) {
    const { page, limit, search, ngoId, regionId } = req.query as any;
    const result = await boreholeService.getMatrix({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search: typeof search === 'string' ? search.trim() : undefined,
      ngoId: typeof ngoId === 'string' ? ngoId.trim() : undefined,
      regionId: typeof regionId === 'string' ? regionId.trim() : undefined,
    });
    res.json({ success: true, ...result });
  }
}

export const boreholeController = new BoreholeController();
