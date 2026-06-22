import { Request, Response } from 'express';
import { dashboardService } from './dashboard.service';
export class DashboardController {
  async getSummary(req: Request, res: Response) {
    const data = await dashboardService.getSummary(req.user?.ngoId, req.user?.roles ?? []);
    res.json({ success: true, data });
  }
  async getCharts(_req: Request, res: Response) { res.json({ success: true, data: await dashboardService.getCharts() }); }
  async getActivities(req: Request, res: Response) {
    const limit = parseInt(req.query.limit as string) || 20;
    const data = await dashboardService.getRecentActivities(limit, req.user?.ngoId);
    res.json({ success: true, data });
  }
}
export const dashboardController = new DashboardController();
