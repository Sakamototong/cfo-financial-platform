import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateImportTemplateDto, UpdateImportTemplateDto } from './dto/import-template.dto';
import { ProcessImportDto, UpdateTransactionDto } from './dto/import-transaction.dto';

@Injectable()
export class EtlEnhancedService {
  constructor(private databaseService: DatabaseService) {}

  // ===== IMPORT TEMPLATES =====

  async getTemplates() {
    const pool = await this.databaseService.getTenantPool('admin');
    const result = await pool.query(
      `SELECT id, template_name, template_type, description, file_format, 
              column_mappings, validation_rules, is_system, is_active
       FROM import_templates
       WHERE is_active = TRUE
       ORDER BY template_type, template_name`
    );
    return result.rows;
  }

  async getTemplate(templateId: string) {
    const pool = await this.databaseService.getTenantPool('admin');
    const result = await pool.query(
      `SELECT * FROM import_templates WHERE id = $1`,
      [templateId]
    );
    if (result.rows.length === 0) {
      throw new Error('Template not found');
    }
    return result.rows[0];
  }

  async createTemplate(dto: CreateImportTemplateDto) {
    const pool = await this.databaseService.getTenantPool('admin');
    const result = await pool.query(
      `INSERT INTO import_templates 
       (template_name, template_type, description, file_format, column_mappings, validation_rules, transformation_rules, sample_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        dto.template_name,
        dto.template_type,
        dto.description,
        dto.file_format || 'csv',
        JSON.stringify(dto.column_mappings),
        JSON.stringify(dto.validation_rules || {}),
        JSON.stringify(dto.transformation_rules || {}),
        JSON.stringify(dto.sample_data || {})
      ]
    );
    return result.rows[0];
  }

  async deleteTemplate(templateId: string) {
    const pool = await this.databaseService.getTenantPool('admin');
    await pool.query(`UPDATE import_templates SET is_active = FALSE WHERE id = $1`, [templateId]);
    return { success: true };
  }

  async downloadTemplate(templateId: string): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    let tpl: any = null;

    // Try admin tenant pool (new enhanced schema)
    try {
      const pool = await this.databaseService.getTenantPool('admin');
      const r = await pool.query(
        `SELECT id, template_name, template_type, file_format, column_mappings
         FROM import_templates WHERE id = $1 AND is_active = true`,
        [templateId],
      );
      if (r.rows.length > 0) tpl = r.rows[0];
    } catch (_) { /* ignore schema mismatch */ }

    // Fallback: admin tenant pool old schema (file_type / column_mapping)
    if (!tpl) {
      try {
        const pool = await this.databaseService.getTenantPool('admin');
        const r = await pool.query(
          `SELECT id, template_name, file_type AS file_format, column_mapping AS column_mappings
           FROM import_templates WHERE id = $1 AND is_active = true`,
          [templateId],
        );
        if (r.rows.length > 0) tpl = { template_type: 'custom', ...r.rows[0] };
      } catch (_) { /* ignore */ }
    }

    // Fallback: main postgres DB
    if (!tpl) {
      try {
        const r = await this.databaseService.query(
          `SELECT id, template_name, template_type, file_format, column_mappings
           FROM import_templates WHERE id = $1 AND is_active = true`,
          [templateId],
        );
        if (r.rows.length > 0) tpl = r.rows[0];
      } catch (_) { /* ignore */ }
    }

    if (!tpl) throw new Error('Template not found');

    const mappings: Record<string, any> = tpl.column_mappings || {};
    const headers: string[] = Object.values(mappings)
      .map((m: any) => m.source_column)
      .filter(Boolean);

    const sampleRows = this.buildSampleRows(tpl.template_type || 'custom', headers);
    const csvCell = (v: string) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [
      headers.map(csvCell).join(','),
      ...sampleRows.map(row => headers.map(h => csvCell(row[h] ?? '')).join(',')),
    ];
    const csv = '\uFEFF' + lines.join('\r\n');
    const safeName = (tpl.template_name || 'template').replace(/[^a-z0-9\u0e01-\u0e59 ]/gi, '_').trim().replace(/ +/g, '_');
    return { filename: `${safeName}_template.csv`, buffer: Buffer.from(csv, 'utf8'), contentType: 'text/csv; charset=utf-8' };
  }

  private buildSampleRows(templateType: string, headers: string[]): Record<string, string>[] {
    const today = new Date();
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    const d1 = fmt(today);
    const d2 = fmt(new Date(today.getTime() - 86400000));
    if (templateType === 'thai_accounting') {
      return [
        { '\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48': d1, '\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23': 'PV-001', '\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23': '\u0e08\u0e48\u0e32\u0e22\u0e04\u0e48\u0e32\u0e40\u0e0a\u0e48\u0e32', '\u0e23\u0e2b\u0e31\u0e2a\u0e1a\u0e31\u0e0d\u0e0a\u0e35': '6200', '\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e0d\u0e0a\u0e35': '\u0e04\u0e48\u0e32\u0e40\u0e0a\u0e48\u0e32', '\u0e40\u0e14\u0e1a\u0e34\u0e15': '25000.00', '\u0e40\u0e04\u0e23\u0e14\u0e34\u0e15': '', '\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07': 'RENT-001' },
        { '\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48': d2, '\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23': 'RC-001', '\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23': '\u0e23\u0e31\u0e1a\u0e0a\u0e33\u0e23\u0e30\u0e04\u0e48\u0e32\u0e1a\u0e23\u0e34\u0e01\u0e32\u0e23', '\u0e23\u0e2b\u0e31\u0e2a\u0e1a\u0e31\u0e0d\u0e0a\u0e35': '4100', '\u0e0a\u0e37\u0e48\u0e2d\u0e1a\u0e31\u0e0d\u0e0a\u0e35': '\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49', '\u0e40\u0e14\u0e1a\u0e34\u0e15': '', '\u0e40\u0e04\u0e23\u0e14\u0e34\u0e15': '150000.00', '\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07': 'INV-001' },
      ];
    }
    if (templateType === 'quickbooks') {
      return [
        { 'Date': d1, 'Transaction Type': 'Expense', 'Num': '1001', 'Name': 'Office Depot', 'Memo/Description': 'Office supplies', 'Account': '6300', 'Split': '-SPLIT-', 'Amount': '-250.50', 'Balance': '9749.50' },
        { 'Date': d2, 'Transaction Type': 'Income', 'Num': 'INV-001', 'Name': 'ABC Corp', 'Memo/Description': 'Consulting payment', 'Account': '4100', 'Split': '-SPLIT-', 'Amount': '8500.00', 'Balance': '18249.50' },
      ];
    }
    if (templateType === 'xero') {
      return [
        { 'Date': d1, 'Payee': 'ABC Corp', 'Amount': '5000.00', 'Reference': 'INV-001', 'Description': 'Payment received', 'Account Code': '4100', 'Check Number': '' },
        { 'Date': d2, 'Payee': 'Office Depot', 'Amount': '-250.00', 'Reference': 'EXP-001', 'Description': 'Office supplies', 'Account Code': '6300', 'Check Number': '1001' },
      ];
    }
    if (templateType === 'bank_statement') {
      return [
        { 'Date': d1, 'Description': 'Transfer from client', 'Amount': '50000.00', 'Balance': '150000.00', 'Reference': 'TRF-001', 'Account': '1000' },
        { 'Date': d2, 'Description': 'Supplier payment', 'Amount': '-15000.00', 'Balance': '135000.00', 'Reference': 'PAY-001', 'Account': '2000' },
      ];
    }
    if (templateType === 'journal') {
      return [
        { 'Date': d1, 'Account Code': '6000', 'Description': 'Salary expense', 'Debit': '85000.00', 'Credit': '', 'Reference': 'JV-001' },
        { 'Date': d1, 'Account Code': '1000', 'Description': 'Cash paid for salary', 'Debit': '', 'Credit': '85000.00', 'Reference': 'JV-001' },
      ];
    }
    if (templateType === 'pl_statement') {
      return [
        { 'Line Code': 'REV-001', 'Line Name': 'Sales Revenue', 'Amount': '500000.00', 'Currency': 'THB', 'Notes': '' },
        { 'Line Code': 'EXP-001', 'Line Name': 'Cost of Goods Sold', 'Amount': '200000.00', 'Currency': 'THB', 'Notes': '' },
        { 'Line Code': 'EXP-002', 'Line Name': 'Operating Expenses', 'Amount': '100000.00', 'Currency': 'THB', 'Notes': '' },
      ];
    }
    // generic / transaction / custom
    return [
      { 'Date': d1, 'Amount': '5000.00', 'Reference': 'REF-001', 'Description': 'Sample revenue entry', 'Account': '4100' },
      { 'Date': d2, 'Amount': '-1200.00', 'Reference': 'REF-002', 'Description': 'Sample expense entry', 'Account': '6300' },
    ];
  }

  async updateTemplate(templateId: string, dto: UpdateImportTemplateDto) {
    const pool = await this.databaseService.getTenantPool('admin');
    const fields = [];
    const values = [];
    let idx = 1;

    if (dto.template_name !== undefined) {
      fields.push(`template_name = $${idx++}`);
      values.push(dto.template_name);
    }
    if (dto.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(dto.description);
    }
    if (dto.column_mappings !== undefined) {
      fields.push(`column_mappings = $${idx++}`);
      values.push(JSON.stringify(dto.column_mappings));
    }
    if (dto.validation_rules !== undefined) {
      fields.push(`validation_rules = $${idx++}`);
      values.push(JSON.stringify(dto.validation_rules));
    }
    if (dto.transformation_rules !== undefined) {
      fields.push(`transformation_rules = $${idx++}`);
      values.push(JSON.stringify(dto.transformation_rules));
    }
    if (dto.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(dto.is_active);
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(templateId);

    const result = await pool.query(
      `UPDATE import_templates SET ${fields.join(', ')} WHERE id = $${idx++} RETURNING *`,
      values
    );
    
    return result.rows[0];
  }

  // ===== IMPORT LOGS =====

  async getImportLogs(tenantId: string, limit: number = 50) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT il.*, it.template_name
       FROM import_logs il
       LEFT JOIN import_templates it ON il.template_id = it.id
       WHERE il.tenant_id = $1
       ORDER BY il.started_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  async getImportLog(tenantId: string, logId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT il.*, it.template_name, it.template_type
       FROM import_logs il
       LEFT JOIN import_templates it ON il.template_id = it.id
       WHERE il.id = $1 AND il.tenant_id = $2`,
      [logId, tenantId]
    );
    if (result.rows.length === 0) {
      throw new Error('Import log not found');
    }
    return result.rows[0];
  }

  async createImportLog(tenantId: string, templateId: string, fileName: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `INSERT INTO import_logs (tenant_id, template_id, import_type, file_name, status)
       VALUES ($1, $2, 'manual', $3, 'processing')
       RETURNING *`,
      [tenantId, templateId, fileName]
    );
    return result.rows[0];
  }

  async updateImportLog(tenantId: string, logId: string, updates: any) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `UPDATE import_logs 
       SET status = $1, total_rows = $2, valid_rows = $3, invalid_rows = $4, 
           imported_rows = $5, validation_errors = $6, completed_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND tenant_id = $8
       RETURNING *`,
      [
        updates.status,
        updates.total_rows || 0,
        updates.valid_rows || 0,
        updates.invalid_rows || 0,
        updates.imported_rows || 0,
        JSON.stringify(updates.validation_errors || []),
        logId,
        tenantId
      ]
    );
    return result.rows[0];
  }

  // ===== IMPORTED TRANSACTIONS =====

  async getImportedTransactions(tenantId: string, logId?: string, status?: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    let query = `
      SELECT it.*, coa.account_name
      FROM imported_transactions it
      LEFT JOIN chart_of_accounts coa ON it.account_code = coa.account_code AND coa.tenant_id = $1
      WHERE it.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (logId) {
      query += ` AND it.import_log_id = $${paramIndex++}`;
      params.push(logId);
    }
    
    if (status) {
      query += ` AND it.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY it.transaction_date DESC, it.created_at DESC LIMIT 1000`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  async processImport(tenantId: string, dto: ProcessImportDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Get template
    const template = await this.getTemplate(dto.template_id);
    
    // Create import log
    const importLog = await this.createImportLog(tenantId, dto.template_id, 'manual_upload.csv');
    
    const validRows = [];
    const invalidRows = [];
    const errors = [];

    // Process each row
    for (const row of dto.file_data) {
      try {
        // Map columns based on template
        const mapped = this.mapRow(row, template.column_mappings);
        
        // Validate
        const validation = this.validateRow(mapped, template.validation_rules);
        
        if (validation.valid) {
          validRows.push(mapped);
        } else {
          invalidRows.push({ row: mapped, errors: validation.errors });
          errors.push(...validation.errors);
        }
      } catch (error: any) {
        invalidRows.push({ row, error: error.message });
        errors.push(error.message);
      }
    }

    // Insert valid transactions
    let importedCount = 0;
    for (const transaction of validRows) {
      try {
        await pool.query(
          `INSERT INTO imported_transactions 
           (tenant_id, import_log_id, transaction_date, description, amount, 
            account_code, department, cost_center, transaction_type, category,
            document_number, reference_number, vendor_customer, status, validation_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            tenantId,
            importLog.id,
            transaction.date || new Date(),
            transaction.description || '',
            transaction.amount || 0,
            transaction.account_code || null,
            transaction.department || null,
            transaction.cost_center || null,
            transaction.transaction_type || null,
            transaction.category || null,
            transaction.document_number || null,
            transaction.reference_number || null,
            transaction.vendor_customer || null,
            dto.auto_approve ? 'approved' : 'pending',
            'valid'
          ]
        );
        importedCount++;
      } catch (error: any) {
        errors.push(`Failed to insert transaction: ${error.message}`);
      }
    }

    // Update import log
    await this.updateImportLog(tenantId, importLog.id, {
      status: invalidRows.length > 0 ? 'partially_completed' : 'completed',
      total_rows: dto.file_data.length,
      valid_rows: validRows.length,
      invalid_rows: invalidRows.length,
      imported_rows: importedCount,
      validation_errors: errors
    });

    return {
      import_log_id: importLog.id,
      total_rows: dto.file_data.length,
      valid_rows: validRows.length,
      invalid_rows: invalidRows.length,
      imported_rows: importedCount,
      errors: errors.slice(0, 10) // Return first 10 errors
    };
  }

  private mapRow(row: any, columnMappings: any): any {
    const mapped: any = {};
    
    for (const [targetField, config] of Object.entries(columnMappings) as any) {
      const sourceColumn = config.source_column;
      const targetName = config.target || targetField;
      
      if (row[sourceColumn] !== undefined) {
        mapped[targetName] = row[sourceColumn];
      }
    }
    
    return mapped;
  }

  private validateRow(row: any, rules: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!rules) {
      return { valid: true, errors: [] };
    }

    for (const [field, rule] of Object.entries(rules) as any) {
      if (rule.required && !row[field]) {
        errors.push(`${field} is required`);
      }
      
      if (rule.type === 'number' && row[field] && isNaN(Number(row[field]))) {
        errors.push(`${field} must be a number`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async updateTransaction(tenantId: string, transactionId: string, dto: UpdateTransactionDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const fields = [];
    const values = [];
    let idx = 1;

    if (dto.account_code !== undefined) {
      fields.push(`account_code = $${idx++}`);
      values.push(dto.account_code);
    }
    if (dto.department !== undefined) {
      fields.push(`department = $${idx++}`);
      values.push(dto.department);
    }
    if (dto.cost_center !== undefined) {
      fields.push(`cost_center = $${idx++}`);
      values.push(dto.cost_center);
    }
    if (dto.transaction_type !== undefined) {
      fields.push(`transaction_type = $${idx++}`);
      values.push(dto.transaction_type);
    }
    if (dto.category !== undefined) {
      fields.push(`category = $${idx++}`);
      values.push(dto.category);
    }
    if (dto.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(dto.status);
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(transactionId, tenantId);

    const result = await pool.query(
      `UPDATE imported_transactions SET ${fields.join(', ')} 
       WHERE id = $${idx++} AND tenant_id = $${idx++} RETURNING *`,
      values
    );
    
    return result.rows[0];
  }

  async approveTransactions(tenantId: string, transactionIds: string[]) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `UPDATE imported_transactions 
       SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1) AND tenant_id = $2
       RETURNING *`,
      [transactionIds, tenantId]
    );
    return result.rows;
  }

  async deleteTransaction(tenantId: string, transactionId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    await pool.query(
      `DELETE FROM imported_transactions WHERE id = $1 AND tenant_id = $2`,
      [transactionId, tenantId]
    );
    return { message: 'Transaction deleted successfully' };
  }

  // ===== MAPPING RULES =====

  async getMappingRules(tenantId: string) {
    const pool = await this.databaseService.getTenantPool('admin');
    const result = await pool.query(
      `SELECT * FROM mapping_rules 
       WHERE (tenant_id = $1 OR tenant_id = 'admin') AND is_active = TRUE
       ORDER BY priority DESC, created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async applyMappingRules(tenantId: string, transactionId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Get transaction
    const txResult = await pool.query(
      `SELECT * FROM imported_transactions WHERE id = $1 AND tenant_id = $2`,
      [transactionId, tenantId]
    );
    
    if (txResult.rows.length === 0) {
      throw new Error('Transaction not found');
    }
    
    const transaction = txResult.rows[0];
    
    // Get mapping rules
    const rules = await this.getMappingRules(tenantId);
    
    // Apply matching rules
    for (const rule of rules) {
      if (this.matchesRule(transaction, rule.match_conditions)) {
        // Apply mapping
        const mapping = rule.mapping_result;
        await this.updateTransaction(tenantId, transactionId, mapping);
        
        // Update rule usage
        await pool.query(
          `UPDATE mapping_rules 
           SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [rule.id]
        );
        
        return { matched: true, rule: rule.rule_name, applied: mapping };
      }
    }
    
    return { matched: false };
  }

  private matchesRule(transaction: any, conditions: any): boolean {
    if (conditions.description_contains) {
      const desc = (transaction.description || '').toLowerCase();
      return conditions.description_contains.some((keyword: string) => 
        desc.includes(keyword.toLowerCase())
      );
    }
    
    if (conditions.amount_range) {
      const amount = transaction.amount;
      return amount >= conditions.amount_range.min && amount <= conditions.amount_range.max;
    }
    
    return false;
  }

  // ===== POST TO FINANCIALS =====

  async postTransactionsToFinancials(
    tenantId: string, 
    transactionIds: string[], 
    statementId: string
  ) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    try {
      // Verify all transactions are approved
      const checkResult = await pool.query(
        `SELECT COUNT(*) as count FROM imported_transactions 
         WHERE id = ANY($1) AND tenant_id = $2 AND status != 'approved'`,
        [transactionIds, tenantId]
      );
      
      if (parseInt(checkResult.rows[0].count) > 0) {
        throw new Error('All transactions must be approved before posting to financials');
      }

      // Update transactions with financial_statement_id
      const result = await pool.query(
        `UPDATE imported_transactions
         SET financial_statement_id = $1, posted_at = CURRENT_TIMESTAMP, status = 'posted'
         WHERE id = ANY($2) AND tenant_id = $3
         RETURNING *`,
        [statementId, transactionIds, tenantId]
      );

      return {
        posted_count: result.rows.length,
        statement_id: statementId,
        transactions: result.rows
      };
    } catch (error: any) {
      throw new Error(`Failed to post transactions: ${error.message}`);
    }
  }

  async getPostedTransactionsSummary(tenantId: string, statementId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const result = await pool.query(
      `SELECT 
        account_code,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount,
        MIN(transaction_date) as earliest_date,
        MAX(transaction_date) as latest_date
       FROM imported_transactions
       WHERE tenant_id = $1 AND financial_statement_id = $2
       GROUP BY account_code
       ORDER BY account_code`,
      [tenantId, statementId]
    );

    return {
      statement_id: statementId,
      summary: result.rows
    };
  }
}
