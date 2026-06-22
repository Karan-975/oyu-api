import { query, queryOne, execute } from '../../config/database';
import { ConflictError, NotFoundError } from '../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import {
  createNotification,
  createNotificationsForRole,
  createNotificationsForUsers,
} from '../notifications/notifications.router';

export class SurveysService {
  async list({ page = 1, limit = 20, search, status, surveyType, boreholeId, ngoId }: any) {
    const pageNumber = Number(page ?? 1) || 1;
    const limitNumber = Number(limit ?? 20) || 20;
    const offset = (pageNumber - 1) * limitNumber;
    const conditions: string[] = [];
    const params: any[] = [];
    if (search) { conditions.push('(b.borehole_code LIKE ? OR b.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (status) { conditions.push('s.status = ?'); params.push(status); }
    if (surveyType) { conditions.push('s.survey_type = ?'); params.push(surveyType); }
    if (boreholeId) { conditions.push('s.borehole_id = ?'); params.push(boreholeId); }
    if (ngoId) {
      // Check fs.ngo_id OR the borehole's assigned NGO (handles cases where mobile app doesn't send ngo_id)
      conditions.push('(fs.ngo_id = ? OR b.assigned_ngo_id = ?)');
      params.push(ngoId, ngoId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [{ total }] = await query<any>(`SELECT COUNT(*) as total FROM surveys s LEFT JOIN boreholes b ON b.id = s.borehole_id LEFT JOIN form_submissions fs ON fs.id = s.submission_id ${where}`, params);
    const data = await query<any>(
      `SELECT s.*, b.borehole_code, b.name as borehole_name, b.village, fm.name as module_name,
              u.first_name, u.last_name, fs.submitted_at, fs.reviewed_by, fs.score,
              n.name as ngo_name
       FROM surveys s
       LEFT JOIN boreholes b ON b.id = s.borehole_id
       LEFT JOIN form_submissions fs ON fs.id = s.submission_id
       LEFT JOIN form_modules fm ON fm.id = fs.module_id
       LEFT JOIN users u ON u.id = s.assigned_to
       LEFT JOIN ngos n ON n.id = COALESCE(fs.ngo_id, b.assigned_ngo_id)
       ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`, [...params, limitNumber, offset]
    );
    return { data, pagination: { total: parseInt(total), page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) } };
  }

  async getById(id: string) {
    const survey = await queryOne<any>(
      `SELECT s.*, b.borehole_code, b.name as borehole_name, fm.name as module_name, fm.slug as module_slug,
              u.first_name, u.last_name, fs.status as submission_status, fs.submitted_at, fs.reviewed_by,
              fs.review_notes, fs.score, rv.first_name as reviewer_first, rv.last_name as reviewer_last
       FROM surveys s LEFT JOIN boreholes b ON b.id = s.borehole_id LEFT JOIN form_submissions fs ON fs.id = s.submission_id
       LEFT JOIN form_modules fm ON fm.id = fs.module_id LEFT JOIN users u ON u.id = s.assigned_to
       LEFT JOIN users rv ON rv.id = fs.reviewed_by
       WHERE s.id = ?`, [id]
    );
    if (!survey) throw new NotFoundError('Survey not found');
    const values = await query<any>(`SELECT * FROM form_submission_values WHERE submission_id = ?`, [survey.submission_id]);
    return { ...survey, values };
  }

  async approve(id: string, reviewedBy: string, notes?: string) {
    const survey = await this.getById(id);
    await execute(`UPDATE surveys SET status = 'approved' WHERE id = ?`, [id]);
    await execute(`UPDATE form_submissions SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?`, [reviewedBy, notes ?? null, survey.submission_id]);
    await createNotification({
      userId: survey.assigned_to,
      type: 'approval',
      title: 'Survey Approved',
      message: `${survey.module_name ?? 'Survey'} for borehole ${survey.borehole_code} has been approved.${notes ? ` Remarks: ${notes}` : ''}`,
      referenceId: id,
      referenceType: 'survey',
      details: {
        'Borehole ID': survey.borehole_code,
        Module: survey.module_name,
        Status: 'Approved',
        Remarks: notes,
      },
    });
    return this.getById(id);
  }

  async reject(id: string, reviewedBy: string, notes: string) {
    const survey = await this.getById(id);
    await execute(`UPDATE surveys SET status = 'rejected' WHERE id = ?`, [id]);
    await execute(`UPDATE form_submissions SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?`, [reviewedBy, notes, survey.submission_id]);
    await createNotification({
      userId: survey.assigned_to,
      type: 'rejection',
      title: 'Survey Returned for Correction',
      message: `${survey.module_name ?? 'Survey'} for borehole ${survey.borehole_code} requires correction. Remarks: ${notes}`,
      referenceId: id,
      referenceType: 'survey',
      details: {
        'Borehole ID': survey.borehole_code,
        Module: survey.module_name,
        Status: 'Returned',
        Remarks: notes,
      },
    });
    return this.getById(id);
  }

  async reopen(id: string, reviewedBy: string, notes?: string) {
    const survey = await this.getById(id);
    await execute(`UPDATE surveys SET status = 'reopened' WHERE id = ?`, [id]);
    await execute(`UPDATE form_submissions SET status = 'reopened', reviewed_by = ?, reviewed_at = NOW(), review_notes = ? WHERE id = ?`, [reviewedBy, notes ?? null, survey.submission_id]);
    await createNotification({
      userId: survey.assigned_to,
      type: 'reopened',
      title: 'Survey Reopened',
      message: `${survey.module_name ?? 'Survey'} for borehole ${survey.borehole_code} has been reopened.${notes ? ` Remarks: ${notes}` : ''}`,
      referenceId: id,
      referenceType: 'survey',
      details: {
        'Borehole ID': survey.borehole_code,
        Module: survey.module_name,
        Status: 'Reopened',
        Remarks: notes,
      },
    });
    return this.getById(id);
  }

  async create(data: any, userId: string, userNgoId?: string) {
    const { borehole_id, survey_module_id, form_data = {}, latitude, longitude, status } = data;
    
    // Resolve module
    let slug = survey_module_id;
    if (slug === 'recce') slug = 'borehole_recce';
    if (slug === 'lsc') slug = 'lsc_survey';
    
    const mod = await queryOne<any>('SELECT id, slug FROM form_modules WHERE id = ? OR slug = ?', [survey_module_id, slug]);
    if (!mod) throw new NotFoundError('Form module not found');

    await this.assertFlowTwoOrder(borehole_id, mod.slug);

    const submissionId = uuidv4();
    const surveyId = uuidv4();

    // Calculate score
    let score = 0;
    const fields = await query<any>(
      `SELECT ff.id, ff.field_key FROM form_fields ff 
       JOIN form_sections fs ON fs.id = ff.section_id 
       WHERE fs.module_id = ? AND ff.has_scoring = 1`,
      [mod.id]
    );
    for (const field of fields) {
      const userVal = form_data[field.field_key];
      if (userVal !== undefined && userVal !== null) {
        const option = await queryOne<any>(
          `SELECT score FROM field_options WHERE field_id = ? AND (value = ? OR label = ?)`,
          [field.id, String(userVal), String(userVal)]
        );
        if (option && option.score !== null) {
          score += parseFloat(option.score);
        }
      }
    }

    // Insert form submission
    await execute(
      `INSERT INTO form_submissions (id, module_id, borehole_id, submitted_by, ngo_id, status, submitted_at, score, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)`,
      [submissionId, mod.id, borehole_id, userId, userNgoId || null, status || 'submitted', score, latitude || null, longitude || null]
    );

    // Insert form values
    for (const [key, val] of Object.entries(form_data)) {
      const field = await queryOne<any>(
        `SELECT ff.id FROM form_fields ff JOIN form_sections fs ON fs.id = ff.section_id WHERE fs.module_id = ? AND ff.field_key = ?`,
        [mod.id, key]
      );
      if (field) {
        const isObj = typeof val === 'object' && val !== null;
        await execute(
          `INSERT INTO form_submission_values (id, submission_id, field_id, field_key, value_text, value_json)
           VALUES (UUID(), ?, ?, ?, ?, ?)`,
          [submissionId, field.id, key, isObj ? null : String(val), isObj ? JSON.stringify(val) : null]
        );
      }
    }

    // Map module slug to survey_type ENUM. Grievance and rehabilitation are stored in
    // their dedicated tables, not this surveys wrapper.
    let surveyType = 'recce';
    if (mod.slug === 'baseline_survey') surveyType = 'baseline';
    if (mod.slug === 'lsc_survey') surveyType = 'lsc';
    if (mod.slug === 'monitoring_survey') surveyType = 'monitoring';
    if (mod.slug === 'grievance' || mod.slug === 'rehabilitation') {
      throw new ConflictError(`${mod.slug} must be submitted through its dedicated endpoint.`);
    }

    // Insert survey wrapper
    await execute(
      `INSERT INTO surveys (id, submission_id, borehole_id, survey_type, assigned_to, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [surveyId, submissionId, borehole_id, surveyType, userId, status || 'submitted']
    );

    // Update borehole operational status & score
    if (mod.slug === 'borehole_recce') {
      const funcStatus = form_data.functional_status || 'non_functional';
      await execute(
        `UPDATE boreholes SET score = ?, functional_status = ?, operational_status = 'monitoring_pending' WHERE id = ?`,
        [score, funcStatus, borehole_id]
      );
      await execute(
        `INSERT INTO borehole_timeline (id, borehole_id, user_id, action, description)
         VALUES (UUID(), ?, ?, 'recce_submitted', ?)`,
        [borehole_id, userId, `Recce survey submitted with score ${score}`]
      );
    } else if (mod.slug === 'baseline_survey') {
      await execute(
        `UPDATE boreholes SET operational_status = 'under_rehabilitation' WHERE id = ?`,
        [borehole_id]
      );
      await execute(
        `INSERT INTO borehole_timeline (id, borehole_id, user_id, action, description)
         VALUES (UUID(), ?, ?, 'baseline_submitted', 'Baseline survey submitted')`,
        [borehole_id, userId]
      );
    } else if (mod.slug === 'monitoring_survey') {
      await execute(
        `UPDATE boreholes SET operational_status = 'completed' WHERE id = ?`,
        [borehole_id]
      );
      await execute(
        `INSERT INTO borehole_timeline (id, borehole_id, user_id, action, description)
         VALUES (UUID(), ?, ?, 'monitoring_submitted', 'Monitoring survey submitted')`,
        [borehole_id, userId]
      );
    }

    const createdSurvey = await this.getById(surveyId);
    const submitter = await queryOne<any>(`SELECT created_by FROM users WHERE id = ?`, [userId]);
    const notification = {
      type: `${surveyType}_submitted`,
      title: `${createdSurvey.module_name ?? 'Survey'} Submitted`,
      message: `${createdSurvey.module_name ?? 'Survey'} for borehole ${createdSurvey.borehole_code} was submitted and is ready for review.`,
      referenceId: surveyId,
      referenceType: 'survey',
      details: {
        'Borehole ID': createdSurvey.borehole_code,
        Module: createdSurvey.module_name,
        Status: 'Submitted',
      },
    };
    await createNotification({ userId, ...notification });
    await createNotificationsForUsers([submitter?.created_by], notification);
    await createNotificationsForRole('super_admin', notification);
    return createdSurvey;
  }

  private async assertFlowTwoOrder(boreholeId: string, moduleSlug: string) {
    if (moduleSlug === 'lsc_survey' || moduleSlug === 'grievance') return;
    if (moduleSlug === 'borehole_recce') return;

    if (moduleSlug === 'baseline_survey') {
      await this.requireCompletedSurvey(boreholeId, 'recce', 'Baseline can start only after Recce is submitted.');
      return;
    }

    if (moduleSlug === 'monitoring_survey') {
      await this.requireCompletedSurvey(boreholeId, 'recce', 'Monitoring can start only after Recce is submitted.');
      await this.requireCompletedSurvey(boreholeId, 'baseline', 'Monitoring can start only after Baseline is submitted.');
      await this.requireCompletedRehabilitation(boreholeId);
    }
  }

  private async requireCompletedSurvey(boreholeId: string, surveyType: string, message: string) {
    const survey = await queryOne<any>(
      `SELECT id FROM surveys
       WHERE borehole_id = ? AND survey_type = ? AND status IN ('submitted', 'approved')
       LIMIT 1`,
      [boreholeId, surveyType]
    );
    if (!survey) throw new ConflictError(message);
  }

  private async requireCompletedRehabilitation(boreholeId: string) {
    const rehab = await queryOne<any>(
      `SELECT id FROM rehabilitation_records
       WHERE borehole_id = ? AND status IN ('completed', 'approved')
       LIMIT 1`,
      [boreholeId]
    );
    if (!rehab) {
      throw new ConflictError('Monitoring can start only after Rehabilitation is completed.');
    }
  }
}

export const surveysService = new SurveysService();
