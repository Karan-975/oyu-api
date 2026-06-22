import { Request, Response } from 'express';
import { formsService } from './forms.service';

export class FormsController {
  async listModules(_req: Request, res: Response) { res.json({ success: true, data: await formsService.listModules() }); }
  async getModule(req: Request, res: Response) { res.json({ success: true, data: await formsService.getModuleById(req.params.id) }); }
  async createModule(req: Request, res: Response) { res.status(201).json({ success: true, data: await formsService.createModule(req.body, req.user!.userId), message: 'Form module created' }); }
  async updateModule(req: Request, res: Response) { res.json({ success: true, data: await formsService.updateModule(req.params.id, req.body), message: 'Form module updated' }); }

  async addSection(req: Request, res: Response) { res.status(201).json({ success: true, data: await formsService.addSection(req.params.id, req.body) }); }
  async updateSection(req: Request, res: Response) { res.json({ success: true, data: await formsService.updateSection(req.params.id, req.body) }); }
  async deleteSection(req: Request, res: Response) { await formsService.deleteSection(req.params.id); res.json({ success: true, message: 'Section deleted' }); }

  async addField(req: Request, res: Response) { res.status(201).json({ success: true, data: await formsService.addField(req.params.id, req.body) }); }
  async updateField(req: Request, res: Response) { res.json({ success: true, data: await formsService.updateField(req.params.id, req.body) }); }
  async deleteField(req: Request, res: Response) { await formsService.deleteField(req.params.id); res.json({ success: true, message: 'Field deleted' }); }
  async reorderFields(req: Request, res: Response) { res.json({ success: true, data: await formsService.reorderFields(req.params.id, req.body.fieldOrders) }); }

  async addFieldOption(req: Request, res: Response) { res.status(201).json({ success: true, data: await formsService.addFieldOption(req.params.id, req.body) }); }
  async deleteFieldOption(req: Request, res: Response) { await formsService.deleteFieldOption(req.params.id); res.json({ success: true, message: 'Option deleted' }); }
  async addFieldValidation(req: Request, res: Response) { res.status(201).json({ success: true, data: await formsService.addFieldValidation(req.params.id, req.body) }); }
  async deleteFieldValidation(req: Request, res: Response) { await formsService.deleteFieldValidation(req.params.id); res.json({ success: true, message: 'Validation deleted' }); }
  async addFieldCondition(req: Request, res: Response) { res.status(201).json({ success: true, data: await formsService.addFieldCondition(req.params.id, req.body) }); }
  async deleteFieldCondition(req: Request, res: Response) { await formsService.deleteFieldCondition(req.params.id); res.json({ success: true, message: 'Condition deleted' }); }
}

export const formsController = new FormsController();
