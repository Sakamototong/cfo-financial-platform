import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { FinancialService, FinancialStatement, LineItem } from '../financial/financial.service';

export interface ImportResult {
  import_id: string;
  status: 'completed' | 'failed';
  rows_imported: number;
  rows_failed: number;
  errors?: string[];
}

@Injectable()
export class EtlService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
    private readonly financialService: FinancialService,
  ) {}

  /**
   * Import financial data from Excel file
   * Expected format: Statement metadata in first sheet, line items in subsequent rows
   */
  async importExcel(
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
    userId: string,
    mapping?: any,
  ): Promise<ImportResult> {
    this.logger.info('Starting Excel import', { tenantId, fileName });

    // Create import history record
    const importId = await this.createImportHistory(
      tenantId,
      'excel',
      fileName,
      fileBuffer.length,
      userId,
    );

    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // If mapping is provided, parse as arrays so we can map column letters
      let data: any[]
      if (mapping && mapping.columns) {
        data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // array of arrays
      } else {
        data = XLSX.utils.sheet_to_json(worksheet);
      }

      if (data.length === 0) {
        throw new Error('Empty worksheet');
      }

      // Extract statement metadata from first row
      const firstRow: any = data[0];
      const statement: FinancialStatement = {
        tenant_id: tenantId,
        statement_type: this.parseStatementType(firstRow.statement_type || firstRow.type),
        period_type: firstRow.period_type || 'monthly',
        period_start: this.parseDate(firstRow.period_start),
        period_end: this.parseDate(firstRow.period_end),
        scenario: firstRow.scenario || 'actual',
        status: 'draft',
        created_by: userId,
      };

      // Parse line items (skip first row if it contains metadata)
      const lineItems: LineItem[] = [];
      let rowsImported = 0;
      let rowsFailed = 0;
      const errors: string[] = [];
      for (let i = 1; i < data.length; i++) {
        try {
          let parsedRow: any
          if (mapping && mapping.columns && Array.isArray(data[i])) {
            const arr = data[i] as any[]
            const getByCol = (colSpec: string) => {
              if (!colSpec) return null
              // support letters A..Z
              const letter = String(colSpec).trim().toUpperCase()
              const idx = letter.charCodeAt(0) - 65
              return arr[idx]
            }
            parsedRow = {
              line_code: getByCol(mapping.columns.line_code) || null,
              line_name: getByCol(mapping.columns.line_name) || null,
              amount: getByCol(mapping.columns.amount) || null,
              parent_code: getByCol(mapping.columns.parent_code) || null,
              currency: getByCol(mapping.columns.currency) || 'THB',
              notes: getByCol(mapping.columns.notes) || null,
            }
          } else {
            const row: any = data[i]
            parsedRow = row
          }

          if (!parsedRow.line_code && !parsedRow.line_name) continue

          lineItems.push({
            statement_id: '',
            line_code: parsedRow.line_code || `AUTO-${i}`,
            line_name: parsedRow.line_name || parsedRow.description || 'Unnamed',
            parent_code: parsedRow.parent_code || null,
            line_order: i,
            amount: parseFloat(parsedRow.amount || 0),
            currency: parsedRow.currency || 'THB',
            notes: parsedRow.notes || null,
          })
          rowsImported++
        } catch (err) {
          rowsFailed++
          errors.push(`Row ${i + 1}: ${(err as any).message}`)
        }
      }

      // Create financial statement with line items
      await this.financialService.createStatement(tenantId, statement, lineItems);

      // Update import history
      await this.updateImportHistory(importId, 'completed', rowsImported, rowsFailed, errors);

      this.logger.info('Excel import completed', {
        importId,
        rowsImported,
        rowsFailed,
      });

      return {
        import_id: importId,
        status: 'completed',
        rows_imported: rowsImported,
        rows_failed: rowsFailed,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      await this.updateImportHistory(importId, 'failed', 0, 0, [(error as any).message]);

      this.logger.error('Excel import failed', {
        importId,
        error: (error as any).message,
      });

      return {
        import_id: importId,
        status: 'failed',
        rows_imported: 0,
        rows_failed: 0,
        errors: [(error as any).message],
      };
    }
  }

  /**
   * Import financial data from CSV file
   */
  async importCsv(
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
    userId: string,
    mapping?: any,
  ): Promise<ImportResult> {
    this.logger.info('Starting CSV import', { tenantId, fileName });

    const importId = await this.createImportHistory(
      tenantId,
      'csv',
      fileName,
      fileBuffer.length,
      userId,
    );

    try {
      let records: any[]
      if (mapping && mapping.columns) {
        // parse as arrays so we can index by letter
        records = parse(fileBuffer, { columns: false, skip_empty_lines: true, trim: true })
      } else {
        records = parse(fileBuffer, { columns: true, skip_empty_lines: true, trim: true })
      }

      if (records.length === 0) {
        throw new Error('Empty CSV file');
      }

      // Extract statement metadata from first row
      const firstRow: any = records[0];
      const statement: FinancialStatement = {
        tenant_id: tenantId,
        statement_type: this.parseStatementType(firstRow.statement_type || firstRow.type),
        period_type: firstRow.period_type || 'monthly',
        period_start: this.parseDate(firstRow.period_start),
        period_end: this.parseDate(firstRow.period_end),
        scenario: firstRow.scenario || 'actual',
        status: 'draft',
        created_by: userId,
      };

      // Parse line items
      const lineItems: LineItem[] = [];
      let rowsImported = 0;
      let rowsFailed = 0;
      const errors: string[] = [];

      for (let i = 1; i < records.length; i++) {
        try {
          let parsedRow: any
          if (mapping && mapping.columns && Array.isArray(records[i])) {
            const arr = records[i]
            const getByCol = (colSpec: string) => {
              if (!colSpec) return null
              const letter = String(colSpec).trim().toUpperCase()
              const idx = letter.charCodeAt(0) - 65
              return arr[idx]
            }
            parsedRow = {
              line_code: getByCol(mapping.columns.line_code) || null,
              line_name: getByCol(mapping.columns.line_name) || null,
              amount: getByCol(mapping.columns.amount) || null,
              parent_code: getByCol(mapping.columns.parent_code) || null,
              currency: getByCol(mapping.columns.currency) || 'THB',
              notes: getByCol(mapping.columns.notes) || null,
            }
          } else {
            parsedRow = records[i]
          }

          if (!parsedRow.line_code && !parsedRow.line_name) continue

          lineItems.push({
            statement_id: '',
            line_code: parsedRow.line_code || `AUTO-${i}`,
            line_name: parsedRow.line_name || parsedRow.description || 'Unnamed',
            parent_code: parsedRow.parent_code || null,
            line_order: i,
            amount: parseFloat(parsedRow.amount || 0),
            currency: parsedRow.currency || 'THB',
            notes: parsedRow.notes || null,
          })
          rowsImported++
        } catch (err) {
          rowsFailed++
          errors.push(`Row ${i + 1}: ${(err as any).message}`)
        }
      }

      await this.financialService.createStatement(tenantId, statement, lineItems);
      await this.updateImportHistory(importId, 'completed', rowsImported, rowsFailed, errors);

      this.logger.info('CSV import completed', {
        importId,
        rowsImported,
        rowsFailed,
      });

      return {
        import_id: importId,
        status: 'completed',
        rows_imported: rowsImported,
        rows_failed: rowsFailed,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      await this.updateImportHistory(importId, 'failed', 0, 0, [(error as any).message]);

      this.logger.error('CSV import failed', {
        importId,
        error: (error as any).message,
      });

      return {
        import_id: importId,
        status: 'failed',
        rows_imported: 0,
        rows_failed: 0,
        errors: [(error as any).message],
      };
    }
  }

  /**
   * Preview Excel file: parse metadata and return first rows + validation
   */
  async previewExcel(
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
    mapping?: any,
  ): Promise<any> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    let data: any[]
    if (mapping && mapping.columns) data = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
    else data = XLSX.utils.sheet_to_json(worksheet)

    const previewRows: any[] = [];
    const errors: string[] = [];
    if (data.length === 0) return { previewRows, errors };

    const firstRow: any = data[0];
    const metadata = {
      statement_type: firstRow.statement_type || firstRow.type || null,
      period_type: firstRow.period_type || 'monthly',
      period_start: firstRow.period_start || null,
      period_end: firstRow.period_end || null,
      scenario: firstRow.scenario || 'actual',
    };

    // Validate metadata
    try {
      if (!metadata.statement_type) errors.push('Missing statement_type in metadata');
      if (!metadata.period_start) errors.push('Missing period_start in metadata');
      if (!metadata.period_end) errors.push('Missing period_end in metadata');
      // parse dates
      if (metadata.period_start) this.parseDate(metadata.period_start);
      if (metadata.period_end) this.parseDate(metadata.period_end);
    } catch (err) {
      errors.push((err as any).message);
    }

    // Collect first 10 line rows
    for (let i = 1; i < Math.min(data.length, 11); i++) {
      try {
        let parsed: any
        if (mapping && mapping.columns && Array.isArray(data[i])) {
          const arr = data[i]
          const getByCol = (colSpec: string) => {
            if (!colSpec) return null
            const letter = String(colSpec).trim().toUpperCase()
            const idx = letter.charCodeAt(0) - 65
            return arr[idx]
          }
          parsed = {
            line_code: getByCol(mapping.columns.line_code) || null,
            line_name: getByCol(mapping.columns.line_name) || null,
            amount: getByCol(mapping.columns.amount) != null ? parseFloat(getByCol(mapping.columns.amount)) : null,
            parent_code: getByCol(mapping.columns.parent_code) || null,
            currency: getByCol(mapping.columns.currency) || 'THB',
            notes: getByCol(mapping.columns.notes) || null,
          }
        } else {
          const row: any = data[i]
          parsed = {
            line_code: row.line_code || null,
            line_name: row.line_name || row.description || null,
            amount: row.amount != null ? parseFloat(row.amount) : null,
            parent_code: row.parent_code || null,
            currency: row.currency || 'THB',
            notes: row.notes || null,
          }
        }

        if (!parsed.line_code && !parsed.line_name) {
          errors.push(`Row ${i + 1}: missing line_code and line_name`)
        }
        if (parsed.amount != null && Number.isNaN(parsed.amount)) {
          errors.push(`Row ${i + 1}: invalid amount`)
        }

        previewRows.push(parsed)
      } catch (err) {
        errors.push(`Row ${i + 1}: ${(err as any).message}`)
      }
    }

    return { metadata, previewRows, errors };
  }

  /**
   * Preview CSV file
   */
  async previewCsv(
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
    mapping?: any,
  ): Promise<any> {
    let records: any[]
    if (mapping && mapping.columns) records = parse(fileBuffer, { columns: false, skip_empty_lines: true, trim: true })
    else records = parse(fileBuffer, { columns: true, skip_empty_lines: true, trim: true })

    const previewRows: any[] = [];
    const errors: string[] = [];
    if (records.length === 0) return { previewRows, errors };

    const firstRow: any = records[0];
    const metadata = {
      statement_type: firstRow.statement_type || firstRow.type || null,
      period_type: firstRow.period_type || 'monthly',
      period_start: firstRow.period_start || null,
      period_end: firstRow.period_end || null,
      scenario: firstRow.scenario || 'actual',
    };

    try {
      if (!metadata.statement_type) errors.push('Missing statement_type in metadata');
      if (!metadata.period_start) errors.push('Missing period_start in metadata');
      if (!metadata.period_end) errors.push('Missing period_end in metadata');
      if (metadata.period_start) this.parseDate(metadata.period_start);
      if (metadata.period_end) this.parseDate(metadata.period_end);
    } catch (err) {
      errors.push((err as any).message);
    }

    for (let i = 1; i < Math.min(records.length, 11); i++) {
      try {
        let parsed: any
        if (mapping && mapping.columns && Array.isArray(records[i])) {
          const arr = records[i]
          const getByCol = (colSpec: string) => {
            if (!colSpec) return null
            const letter = String(colSpec).trim().toUpperCase()
            const idx = letter.charCodeAt(0) - 65
            return arr[idx]
          }
          parsed = {
            line_code: getByCol(mapping.columns.line_code) || null,
            line_name: getByCol(mapping.columns.line_name) || null,
            amount: getByCol(mapping.columns.amount) != null ? parseFloat(getByCol(mapping.columns.amount)) : null,
            parent_code: getByCol(mapping.columns.parent_code) || null,
            currency: getByCol(mapping.columns.currency) || 'THB',
            notes: getByCol(mapping.columns.notes) || null,
          }
        } else {
          const row: any = records[i]
          parsed = {
            line_code: row.line_code || null,
            line_name: row.line_name || row.description || null,
            amount: row.amount != null ? parseFloat(row.amount) : null,
            parent_code: row.parent_code || null,
            currency: row.currency || 'THB',
            notes: row.notes || null,
          }
        }

        if (!parsed.line_code && !parsed.line_name) {
          errors.push(`Row ${i + 1}: missing line_code and line_name`)
        }
        if (parsed.amount != null && Number.isNaN(parsed.amount)) {
          errors.push(`Row ${i + 1}: invalid amount`)
        }

        previewRows.push(parsed)
      } catch (err) {
        errors.push(`Row ${i + 1}: ${(err as any).message}`)
      }
    }

    return { metadata, previewRows, errors };
  }

  /**
   * Get all import templates
   */
  async getTemplates(): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT id, template_name, template_type, description, file_format, column_mappings, validation_rules, is_active
         FROM import_templates
         WHERE is_active = true
         ORDER BY template_type`,
      );
      return result.rows;
    } catch (error) {
      this.logger.error('Error loading templates', { error: (error as any).message });
      return [];
    }
  }

  /**
   * Import with parsed JSON data (from frontend CSV parsing)
   */
  async importJson(
    tenantId: string,
    templateId: string,
    fileData: any[],
    autoApprove: boolean,
    userId: string,
  ): Promise<any> {
    this.logger.info('Starting JSON import', { tenantId, templateId, rows: fileData.length });

    const importId = await this.createImportHistory(tenantId, 'json', `template_${templateId}`, 0, userId);

    try {
      let validRows = 0;
      let invalidRows = 0;
      const errors: string[] = [];
      const transactionIds: string[] = [];

      for (let i = 0; i < fileData.length; i++) {
        try {
          const row = fileData[i];
          const txResult = await this.db.query(
            `INSERT INTO etl_transactions
             (tenant_id, import_log_id, transaction_date, description, amount, account_code, account_name, vendor_customer, department, category, document_number, status, validation_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [
              tenantId, importId,
              row.Date || row.date || row['วันที่'] || null,
              row.Description || row.description || row['Memo/Description'] || row['รายการ'] || '',
              parseFloat(row.Amount || row.amount || row['เดบิต'] || row['เครดิต'] || '0'),
              row.Account || row.account || row['Account Code'] || row.account_code || row['รหัสบัญชี'] || '',
              row['ชื่อบัญชี'] || row.account_name || '',
              row.Name || row.name || row.Payee || row.payee || row.vendor_customer || '',
              row.department || row.Department || '',
              row.category || row.Category || row['Transaction Type'] || row.transaction_type || '',
              row.Num || row.num || row.Reference || row.reference || row['Check Number'] || row['เลขที่เอกสาร'] || row.document_number || '',
              autoApprove ? 'approved' : 'pending',
              'valid',
            ],
          );
          transactionIds.push(txResult.rows[0].id);
          validRows++;
        } catch (err) {
          invalidRows++;
          errors.push(`Row ${i + 1}: ${(err as any).message}`);
        }
      }

      await this.updateImportHistory(importId, validRows > 0 ? 'completed' : 'failed', validRows, invalidRows, errors);

      return {
        import_log_id: importId,
        total_rows: fileData.length,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      await this.updateImportHistory(importId, 'failed', 0, 0, [(error as any).message]);
      throw error;
    }
  }

  /**
   * Get transactions, optionally filtered by import log
   */
  async getTransactions(tenantId: string, logId?: string): Promise<any[]> {
    try {
      let query = `SELECT id, transaction_date, description, amount, account_code, account_name, vendor_customer, department, category, document_number, status, validation_status, created_at
         FROM etl_transactions WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (logId) {
        query += ` AND import_log_id = $2`;
        params.push(logId);
      }
      query += ` ORDER BY created_at DESC LIMIT 200`;
      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Error loading transactions', { error: (error as any).message });
      return [];
    }
  }

  /**
   * Approve transactions
   */
  async approveTransactions(tenantId: string, transactionIds: string[]): Promise<{ approved: number }> {
    const result = await this.db.query(
      `UPDATE etl_transactions SET status = 'approved', updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status = 'pending'
       RETURNING id`,
      [tenantId, transactionIds],
    );
    return { approved: result.rows.length };
  }

  /**
   * Delete a transaction
   */
  async deleteTransaction(tenantId: string, transactionId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM etl_transactions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, transactionId],
    );
  }

  /**
   * Get import logs
   */
  async getImportLogs(tenantId: string): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT ih.id, ih.import_type, ih.file_name, ih.status, ih.rows_imported, ih.rows_failed,
                ih.created_at as started_at, ih.completed_at,
                ih.rows_imported as valid_rows, ih.rows_failed as invalid_rows,
                ih.rows_imported + ih.rows_failed as total_rows,
                COALESCE(it.template_name, ih.import_type) as template_name
         FROM import_history ih
         LEFT JOIN import_templates it ON it.id::text = ih.file_name
         WHERE ih.tenant_id = $1
         ORDER BY ih.created_at DESC
         LIMIT 50`,
        [tenantId],
      );
      return result.rows;
    } catch (error) {
      this.logger.error('Error loading import logs', { error: (error as any).message });
      return [];
    }
  }

  /**
   * Get import history for tenant
   */
  async getImportHistory(tenantId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT id, import_type, file_name, status, rows_imported, rows_failed, 
              error_log, created_at, completed_at
       FROM import_history 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC 
       LIMIT 100`,
      [tenantId],
    );

    return result.rows;
  }

  async getImportLog(tenantId: string, importId: string): Promise<string | null> {
    const result = await this.db.query(
      `SELECT error_log FROM import_history WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, importId],
    );

    if (!result.rows || result.rows.length === 0) return null;
    return result.rows[0].error_log || null;
  }

  // Helper methods

  private async createImportHistory(
    tenantId: string,
    importType: string,
    fileName: string,
    fileSize: number,
    userId: string,
  ): Promise<string> {
    const result = await this.db.query(
      `INSERT INTO import_history 
       (tenant_id, import_type, file_name, file_size, status, created_by)
       VALUES ($1, $2, $3, $4, 'processing', $5)
       RETURNING id`,
      [tenantId, importType, fileName, fileSize, userId],
    );

    return result.rows[0].id;
  }

  private async updateImportHistory(
    importId: string,
    status: string,
    rowsImported: number,
    rowsFailed: number,
    errors: string[],
  ): Promise<void> {
    await this.db.query(
      `UPDATE import_history 
       SET status = $1, rows_imported = $2, rows_failed = $3, 
           error_log = $4, completed_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [status, rowsImported, rowsFailed, errors.join('\n'), importId],
    );
  }

  private parseStatementType(type: string): 'PL' | 'BS' | 'CF' {
    if (!type) {
      throw new Error('Statement type is required');
    }
    const normalized = String(type).toUpperCase();
    if (['PL', 'P&L', 'PROFIT_LOSS', 'INCOME_STATEMENT'].includes(normalized)) return 'PL';
    if (['BS', 'BALANCE_SHEET'].includes(normalized)) return 'BS';
    if (['CF', 'CASH_FLOW', 'CASHFLOW'].includes(normalized)) return 'CF';
    throw new Error(`Invalid statement type: ${type}`);
  }

  private parseDate(dateStr: string): string {
    // Try parsing common date formats
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD
  }
}
