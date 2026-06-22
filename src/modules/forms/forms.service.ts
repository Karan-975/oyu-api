import { query, queryOne, execute } from '../../config/database';
import { NotFoundError } from '../../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

export class FormsService {
  // ─── Modules ─────────────────────────────────────
  async listModules() {
    return query<any>(
      `SELECT fm.*, (SELECT COUNT(*) FROM form_sections fs WHERE fs.module_id = fm.id) as section_count,
              (SELECT COUNT(*) FROM form_fields ff JOIN form_sections fs2 ON fs2.id = ff.section_id WHERE fs2.module_id = fm.id) as field_count
       FROM form_modules fm ORDER BY fm.name`
    );
  }

  async getModuleById(id: string) {
    let module = await queryOne<any>(`SELECT * FROM form_modules WHERE id = ?`, [id]);
    if (!module) {
      let slug = id;
      if (slug === 'recce') slug = 'borehole_recce';
      if (slug === 'lsc') slug = 'lsc_survey';
      module = await queryOne<any>(`SELECT * FROM form_modules WHERE slug = ?`, [slug]);
    }
    if (!module) throw new NotFoundError('Form module not found');

    const sections = await query<any>(`SELECT * FROM form_sections WHERE module_id = ? ORDER BY order_index`, [module.id]);
    for (const section of sections) {
      section.fields = await query<any>(`SELECT * FROM form_fields WHERE section_id = ? ORDER BY order_index`, [section.id]);
      for (const field of section.fields) {
        field.options = await query<any>(`SELECT * FROM field_options WHERE field_id = ? ORDER BY order_index`, [field.id]);
        field.validations = await query<any>(`SELECT * FROM field_validations WHERE field_id = ?`, [field.id]);
        field.conditions = await query<any>(
          `SELECT fc.*, ff.label as depends_on_label, ff.field_key as depends_on_key
           FROM field_conditions fc LEFT JOIN form_fields ff ON ff.id = fc.depends_on_field_id WHERE fc.field_id = ?`, [field.id]
        );
      }
    }
    return { ...module, sections };
  }

  async createModule(data: any, createdBy: string) {
    const id = uuidv4();
    await execute(
      `INSERT INTO form_modules (id, name, slug, description, module_type, is_multi_step, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.slug, data.description ?? null, data.moduleType, data.isMultiStep ? 1 : 0, createdBy]
    );
    return this.getModuleById(id);
  }

  async updateModule(id: string, data: any) {
    const mod = await queryOne<any>(`SELECT id FROM form_modules WHERE id = ?`, [id]);
    if (!mod) throw new NotFoundError('Form module not found');
    await execute(
      `UPDATE form_modules SET name = COALESCE(?, name), description = COALESCE(?, description),
       is_active = COALESCE(?, is_active), is_multi_step = COALESCE(?, is_multi_step) WHERE id = ?`,
      [data.name, data.description, data.isActive, data.isMultiStep, id]
    );
    return this.getModuleById(id);
  }

  // ─── Sections ────────────────────────────────────
  async addSection(moduleId: string, data: any) {
    const mod = await queryOne<any>(`SELECT id FROM form_modules WHERE id = ?`, [moduleId]);
    if (!mod) throw new NotFoundError('Form module not found');
    const [maxOrder] = await query<any>(`SELECT COALESCE(MAX(order_index), -1) as mx FROM form_sections WHERE module_id = ?`, [moduleId]);
    const id = uuidv4();
    await execute(
      `INSERT INTO form_sections (id, module_id, title, description, order_index) VALUES (?, ?, ?, ?, ?)`,
      [id, moduleId, data.title, data.description ?? null, (maxOrder?.mx ?? 0) + 1]
    );
    return queryOne<any>(`SELECT * FROM form_sections WHERE id = ?`, [id]);
  }

  async updateSection(sectionId: string, data: any) {
    const section = await queryOne<any>(`SELECT id FROM form_sections WHERE id = ?`, [sectionId]);
    if (!section) throw new NotFoundError('Section not found');
    await execute(`UPDATE form_sections SET title = COALESCE(?, title), description = COALESCE(?, description),
      is_active = COALESCE(?, is_active), order_index = COALESCE(?, order_index) WHERE id = ?`,
      [data.title, data.description, data.isActive, data.orderIndex, sectionId]
    );
    return queryOne<any>(`SELECT * FROM form_sections WHERE id = ?`, [sectionId]);
  }

  async deleteSection(sectionId: string) {
    const section = await queryOne<any>(`SELECT id FROM form_sections WHERE id = ?`, [sectionId]);
    if (!section) throw new NotFoundError('Section not found');
    await execute(`DELETE FROM form_sections WHERE id = ?`, [sectionId]);
  }

  // ─── Fields ──────────────────────────────────────
  async addField(sectionId: string, data: any) {
    const section = await queryOne<any>(`SELECT id FROM form_sections WHERE id = ?`, [sectionId]);
    if (!section) throw new NotFoundError('Section not found');
    const [maxOrder] = await query<any>(`SELECT COALESCE(MAX(order_index), -1) as mx FROM form_fields WHERE section_id = ?`, [sectionId]);
    const id = uuidv4();
    await execute(
      `INSERT INTO form_fields (id, section_id, label, field_key, field_type, placeholder, help_text, is_required, has_scoring, order_index, default_value, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, sectionId, data.label, data.fieldKey, data.fieldType, data.placeholder ?? null, data.helpText ?? null,
       data.isRequired ? 1 : 0, data.hasScoring ? 1 : 0, (maxOrder?.mx ?? 0) + 1, data.defaultValue ?? null, data.meta ? JSON.stringify(data.meta) : null]
    );
    return queryOne<any>(`SELECT * FROM form_fields WHERE id = ?`, [id]);
  }

  async updateField(fieldId: string, data: any) {
    const field = await queryOne<any>(`SELECT id FROM form_fields WHERE id = ?`, [fieldId]);
    if (!field) throw new NotFoundError('Field not found');
    await execute(`UPDATE form_fields SET label = COALESCE(?, label), placeholder = COALESCE(?, placeholder),
      help_text = COALESCE(?, help_text), is_required = COALESCE(?, is_required), is_active = COALESCE(?, is_active),
      has_scoring = COALESCE(?, has_scoring), order_index = COALESCE(?, order_index), default_value = COALESCE(?, default_value),
      meta = COALESCE(?, meta) WHERE id = ?`,
      [data.label, data.placeholder, data.helpText, data.isRequired, data.isActive, data.hasScoring, data.orderIndex, data.defaultValue, data.meta ? JSON.stringify(data.meta) : null, fieldId]
    );
    return queryOne<any>(`SELECT * FROM form_fields WHERE id = ?`, [fieldId]);
  }

  async deleteField(fieldId: string) {
    const field = await queryOne<any>(`SELECT id FROM form_fields WHERE id = ?`, [fieldId]);
    if (!field) throw new NotFoundError('Field not found');
    await execute(`DELETE FROM form_fields WHERE id = ?`, [fieldId]);
  }

  async reorderFields(sectionId: string, fieldOrders: { fieldId: string; orderIndex: number }[]) {
    for (const fo of fieldOrders) {
      await execute(`UPDATE form_fields SET order_index = ? WHERE id = ? AND section_id = ?`, [fo.orderIndex, fo.fieldId, sectionId]);
    }
    return query<any>(`SELECT * FROM form_fields WHERE section_id = ? ORDER BY order_index`, [sectionId]);
  }

  // ─── Field Options ──────────────────────────────
  async addFieldOption(fieldId: string, data: any) {
    const id = uuidv4();
    const [maxOrder] = await query<any>(`SELECT COALESCE(MAX(order_index), -1) as mx FROM field_options WHERE field_id = ?`, [fieldId]);
    await execute(
      `INSERT INTO field_options (id, field_id, label, value, score, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, fieldId, data.label, data.value, data.score ?? null, (maxOrder?.mx ?? 0) + 1]
    );
    return queryOne<any>(`SELECT * FROM field_options WHERE id = ?`, [id]);
  }

  async deleteFieldOption(optionId: string) {
    await execute(`DELETE FROM field_options WHERE id = ?`, [optionId]);
  }

  // ─── Field Validations ──────────────────────────
  async addFieldValidation(fieldId: string, data: any) {
    const id = uuidv4();
    await execute(
      `INSERT INTO field_validations (id, field_id, rule_type, rule_value, message) VALUES (?, ?, ?, ?, ?)`,
      [id, fieldId, data.ruleType, data.ruleValue, data.message]
    );
    return queryOne<any>(`SELECT * FROM field_validations WHERE id = ?`, [id]);
  }

  async deleteFieldValidation(validationId: string) {
    await execute(`DELETE FROM field_validations WHERE id = ?`, [validationId]);
  }

  // ─── Field Conditions ───────────────────────────
  async addFieldCondition(fieldId: string, data: any) {
    const id = uuidv4();
    await execute(
      `INSERT INTO field_conditions (id, field_id, depends_on_field_id, operator, condition_value, action) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, fieldId, data.dependsOnFieldId, data.operator, data.conditionValue ?? null, data.action ?? 'show']
    );
    return queryOne<any>(`SELECT * FROM field_conditions WHERE id = ?`, [id]);
  }

  async deleteFieldCondition(conditionId: string) {
    await execute(`DELETE FROM field_conditions WHERE id = ?`, [conditionId]);
  }
}

export const formsService = new FormsService();
