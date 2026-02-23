import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { FinancialService, FinancialStatement, LineItem } from '../financial/financial.service';
import { ScenarioService, Scenario as ScenarioEntity, Assumption } from '../scenario/scenario.service';

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
    private readonly scenarioService: ScenarioService,
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
    if (data.length === 0) return { format: 'unknown', previewRows, errors, total_rows: 0 };

    const firstRow: any = data[0];
    const allKeys = Array.isArray(firstRow) ? [] : Object.keys(firstRow);

    // ── Transaction format ─────────────────────────────────────────────
    if (!mapping && this.isTransactionFormat(allKeys)) {
      const sampleRows = data.slice(0, 10);
      for (let i = 0; i < sampleRows.length; i++) {
        const row = this.normaliseTransactionRow(sampleRows[i]);
        if (!row.date) errors.push(`Row ${i + 1}: missing date`);
        if (row.amount == null || Number.isNaN(row.amount)) errors.push(`Row ${i + 1}: missing or invalid amount`);
        previewRows.push(row);
      }
      return { format: 'transaction', previewRows, errors, total_rows: data.length };
    }

    // ── Financial statement format ─────────────────────────────────────
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

        if (!parsed.line_code && !parsed.line_name) errors.push(`Row ${i + 1}: missing line_code and line_name`);
        if (parsed.amount != null && Number.isNaN(parsed.amount)) errors.push(`Row ${i + 1}: invalid amount`);

        previewRows.push(parsed)
      } catch (err) {
        errors.push(`Row ${i + 1}: ${(err as any).message}`)
      }
    }

    return { format: 'statement', metadata, previewRows, errors, total_rows: data.length };
  }

  /** Detect whether a set of column keys looks like transaction data */
  private isTransactionFormat(keys: string[]): boolean {
    const lower = keys.map(k => k.toLowerCase());
    const txCols = ['date', 'transaction_date', 'trans_date', 'txdate'];
    return txCols.some(c => lower.includes(c)) ||
      (lower.some(c => c.includes('date')) && lower.some(c => c.includes('amount') || c.includes('debit') || c.includes('credit')));
  }

  /** Normalise a raw row to a transaction preview row */
  private normaliseTransactionRow(row: any): any {
    const keys = Object.keys(row);
    const find = (...candidates: string[]) => {
      for (const c of candidates) {
        const k = keys.find(k => k.toLowerCase() === c.toLowerCase() || k.toLowerCase().replace(/[^a-z]/g, '') === c.replace(/[^a-z]/g, ''));
        if (k !== undefined && row[k] !== undefined && row[k] !== '') return row[k];
      }
      return '';
    };
    const amtRaw = find('amount', 'debit', 'credit', 'sum');
    return {
      date:            find('date', 'transaction_date', 'trans_date', 'txdate', 'Date'),
      description:     find('description', 'desc', 'memo', 'memo/description', 'narration', 'details'),
      amount:          amtRaw !== '' ? parseFloat(String(amtRaw).replace(/,/g, '')) : null,
      account_code:    find('account', 'account_code', 'account_no', 'gl_code', 'code'),
      account_name:    find('account_name', 'account name'),
      vendor_customer: find('name', 'vendor', 'customer', 'vendor_customer', 'payee'),
      department:      find('department', 'dept', 'cost_center'),
      category:        find('category', 'type', 'transaction_type'),
      document_number: find('reference', 'doc_no', 'document_number', 'ref', 'invoice'),
      currency:        find('currency', 'ccy') || 'THB',
    };
  }

  /**
   * Preview CSV file — auto-detects transaction vs financial-statement format
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
    if (records.length === 0) return { format: 'unknown', previewRows, errors, total_rows: 0 };

    const firstRow: any = records[0];
    const allKeys = Object.keys(firstRow);

    // ── Transaction format ────────────────────────────────────────────
    if (!mapping && this.isTransactionFormat(allKeys)) {
      const sampleRows = records.slice(0, 10);
      for (let i = 0; i < sampleRows.length; i++) {
        const row = this.normaliseTransactionRow(sampleRows[i]);
        if (!row.date) errors.push(`Row ${i + 1}: missing date`);
        if (row.amount == null || Number.isNaN(row.amount)) errors.push(`Row ${i + 1}: missing or invalid amount`);
        previewRows.push(row);
      }
      return { format: 'transaction', previewRows, errors, total_rows: records.length };
    }

    // ── Financial statement format ────────────────────────────────────
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

    return { format: 'statement', metadata, previewRows, errors, total_rows: records.length };
  }

  /**
   * Get all import templates (master / global — no tenant filter)
   */
  async getTemplates(): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT id, template_name, template_type, description, file_format, column_mappings, validation_rules, is_active, is_system
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
   * Generate and return a CSV template file for download.
   * Headers are taken from column_mappings[field].source_column.
   * Sample rows use realistic data based on template_type.
   */
  async downloadTemplate(templateId: string): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const result = await this.db.query(
      `SELECT id, template_name, template_type, file_format, column_mappings
       FROM import_templates WHERE id = $1 AND is_active = true`,
      [templateId],
    );
    if (result.rows.length === 0) throw new Error('Template not found');

    const tpl = result.rows[0];
    const mappings: Record<string, any> = tpl.column_mappings || {};

    // Build ordered header list from source_column values
    const headers: string[] = Object.values(mappings)
      .map((m: any) => m.source_column)
      .filter(Boolean);

    // Sample rows per template type
    const sampleRows = this.buildSampleRows(tpl.template_type, headers);

    // Escape CSV cell
    const csvCell = (v: string) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      headers.map(csvCell).join(','),
      ...sampleRows.map(row => headers.map(h => csvCell(row[h] ?? '')).join(',')),
    ];
    const csv = '\uFEFF' + lines.join('\r\n'); // UTF-8 BOM for Excel Thai character support

    const safeName = tpl.template_name.replace(/[^a-z0-9ก-๙ ]/gi, '_').trim().replace(/ +/g, '_');
    const filename = `${safeName}_template.csv`;
    return { filename, buffer: Buffer.from(csv, 'utf8'), contentType: 'text/csv; charset=utf-8' };
  }

  private buildSampleRows(templateType: string, headers: string[]): Record<string, string>[] {
    const today = new Date();
    const fmt = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const d1 = fmt(today);
    const d2 = fmt(new Date(today.getTime() - 86400000));

    if (templateType === 'thai_accounting') {
      return [
        { 'วันที่': d1, 'เลขที่เอกสาร': 'PV-2601-001', 'รายการ': 'จ่ายค่าเช่าสำนักงาน', 'รหัสบัญชี': '6200', 'ชื่อบัญชี': 'ค่าเช่า', 'เดบิต': '25000.00', 'เครดิต': '', 'อ้างอิง': 'RENT-001' },
        { 'วันที่': d2, 'เลขที่เอกสาร': 'RC-2601-001', 'รายการ': 'รับชำระค่าบริการ', 'รหัสบัญชี': '4100', 'ชื่อบัญชี': 'รายได้บริการ', 'เดบิต': '', 'เครดิต': '150000.00', 'อ้างอิง': 'INV-001' },
        { 'วันที่': d2, 'เลขที่เอกสาร': 'PV-2601-002', 'รายการ': 'จ่ายเงินเดือนพนักงาน', 'รหัสบัญชี': '6100', 'ชื่อบัญชี': 'เงินเดือนและค่าจ้าง', 'เดบิต': '85000.00', 'เครดิต': '', 'อ้างอิง': 'SALARY-001' },
      ];
    }
    if (templateType === 'quickbooks') {
      return [
        { 'Date': d1, 'Transaction Type': 'Expense', 'Num': '1001', 'Name': 'Office Depot', 'Memo/Description': 'Office supplies', 'Account': '6300', 'Split': '-SPLIT-', 'Amount': '-250.50', 'Balance': '9749.50' },
        { 'Date': d2, 'Transaction Type': 'Income', 'Num': 'INV-001', 'Name': 'ABC Corporation', 'Memo/Description': 'Consulting service payment', 'Account': '4100', 'Split': '-SPLIT-', 'Amount': '8500.00', 'Balance': '18249.50' },
        { 'Date': d2, 'Transaction Type': 'Expense', 'Num': '1002', 'Name': 'Jane Smith', 'Memo/Description': 'Salary January', 'Account': '6100', 'Split': '-SPLIT-', 'Amount': '-4200.00', 'Balance': '14049.50' },
      ];
    }
    if (templateType === 'xero') {
      return [
        { 'Date': d1, 'Payee': 'ABC Corp', 'Amount': '5000.00', 'Reference': 'INV-001', 'Description': 'Consulting payment received', 'Account Code': '4100', 'Check Number': '' },
        { 'Date': d2, 'Payee': 'Office Depot', 'Amount': '-250.00', 'Reference': 'EXP-001', 'Description': 'Office supplies', 'Account Code': '6300', 'Check Number': '1001' },
        { 'Date': d2, 'Payee': 'Starlink Internet', 'Amount': '-99.00', 'Reference': 'EXP-002', 'Description': 'Monthly internet service', 'Account Code': '6400', 'Check Number': '1002' },
      ];
    }
    // default / custom
    return [
      { 'Date': d1, 'Amount': '5000.00', 'Reference': 'REF-001', 'Description': 'Sales revenue', 'Account': '4100' },
      { 'Date': d2, 'Amount': '-1200.00', 'Reference': 'REF-002', 'Description': 'Office expenses', 'Account': '6300' },
      { 'Date': d2, 'Amount': '-3500.00', 'Reference': 'REF-003', 'Description': 'Salary payment', 'Account': '6100' },
    ];
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

    const importId = await this.createImportHistory(tenantId, 'csv', `template_${templateId}`, 0, userId);

    try {
      let validRows = 0;
      let invalidRows = 0;
      const errors: string[] = [];
      const transactionIds: string[] = [];

      for (let i = 0; i < fileData.length; i++) {
        try {
          const row = fileData[i];
          const accountName = row['ชื่อบัญชี'] || row.account_name || null;
          const txResult = await this.db.query(
            `INSERT INTO imported_transactions
             (tenant_id, import_log_id, transaction_date, description, amount, account_code, vendor_customer, department, category, document_number, status, validation_status, custom_fields)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id`,
            [
              tenantId, importId,
              row.Date || row.date || row['วันที่'] || null,
              row.Description || row.description || row['Memo/Description'] || row['รายการ'] || '',
              parseFloat(row.Amount || row.amount || row['เดบิต'] || row['เครดิต'] || '0'),
              row.Account || row.account || row['Account Code'] || row.account_code || row['รหัสบัญชี'] || '',
              row.Name || row.name || row.Payee || row.payee || row.vendor_customer || '',
              row.department || row.Department || '',
              row.category || row.Category || row['Transaction Type'] || row.transaction_type || '',
              row.Num || row.num || row.Reference || row.reference || row['Check Number'] || row['เลขที่เอกสาร'] || row.document_number || '',
              autoApprove ? 'approved' : 'pending',
              'valid',
              accountName ? JSON.stringify({ account_name: accountName }) : null,
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
      let query = `SELECT id, transaction_date, description, amount, account_code, vendor_customer, department, category, document_number, status, validation_status, created_at
         FROM imported_transactions WHERE tenant_id = $1`;
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
      `UPDATE imported_transactions SET status = 'approved', updated_at = CURRENT_TIMESTAMP
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
      `DELETE FROM imported_transactions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, transactionId],
    );
  }

  /**
   * Get import logs
   */
  async getImportLogs(tenantId: string): Promise<any[]> {
    try {
      const result = await this.db.query(
        `SELECT il.id, il.import_type, il.file_name, il.status,
                il.valid_rows, il.invalid_rows,
                COALESCE(il.valid_rows, 0) + COALESCE(il.invalid_rows, 0) as total_rows,
                il.started_at, il.completed_at,
                COALESCE(it.template_name, il.import_type) as template_name
         FROM import_logs il
         LEFT JOIN import_templates it ON it.id = il.template_id
         WHERE il.tenant_id = $1
         ORDER BY il.started_at DESC
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
      `SELECT id, import_type, file_name, status, valid_rows as rows_imported, invalid_rows as rows_failed,
              validation_errors as error_log, started_at as created_at, completed_at
       FROM import_logs
       WHERE tenant_id = $1
       ORDER BY started_at DESC
       LIMIT 100`,
      [tenantId],
    );

    return result.rows;
  }

  async getImportLog(tenantId: string, importId: string): Promise<string | null> {
    const result = await this.db.query(
      `SELECT validation_errors FROM import_logs WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, importId],
    );

    if (!result.rows || result.rows.length === 0) return null;
    const val = result.rows[0].validation_errors;
    if (!val) return null;
    return typeof val === 'string' ? val : JSON.stringify(val);
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
      `INSERT INTO import_logs
       (tenant_id, import_type, file_name, file_size, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING id`,
      [tenantId, importType, fileName, fileSize],
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
      `UPDATE import_logs
       SET status = $1, valid_rows = $2, invalid_rows = $3, total_rows = $2::int + $3::int,
           validation_errors = $4, completed_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [status, rowsImported, rowsFailed, errors.length > 0 ? JSON.stringify(errors) : null, importId],
    );
  }

  /**
   * Post approved transactions to Financial Statements
   * Groups by account_code, sums amounts, creates a FinancialStatement + LineItems in tenant DB
   */
  /**
   * List scenarios for a tenant (delegates to ScenarioService)
   */
  async listScenarios(tenantId: string): Promise<any[]> {
    return this.scenarioService.listScenarios(tenantId);
  }

  /**
   * Post approved transactions to Financial Statements
   * Groups by account_code, sums amounts, creates a FinancialStatement + LineItems in tenant DB
   */
  async postToFinancials(
    tenantId: string,
    statementType: 'PL' | 'BS' | 'CF',
    periodStart: string,
    periodEnd: string,
    transactionIds?: string[],
    userId?: string,
    scenarioName?: string,
    newScenario?: { name: string; type: string; description?: string },
  ): Promise<{ statement_id: string; posted_count: number; statement_type: string; period_start: string; period_end: string; scenario: string; scenario_id?: string }> {
    this.logger.info('Posting approved transactions to financials', { tenantId, statementType, periodStart, periodEnd, scenarioName });

    // Handle scenario: create new if requested, otherwise use provided name or default 'actual'
    let resolvedScenarioName = scenarioName || 'actual';
    let scenarioId: string | undefined;

    if (newScenario && newScenario.name) {
      const scenarioType = (newScenario.type || 'custom') as ScenarioEntity['scenario_type'];
      const created = await this.scenarioService.createScenario(
        tenantId,
        {
          tenant_id: tenantId,
          scenario_name: newScenario.name,
          scenario_type: scenarioType,
          description: newScenario.description || `Created from ETL Import on ${new Date().toISOString().split('T')[0]}`,
          is_active: true,
          created_by: userId || tenantId,
        },
        [], // no assumptions for ETL-created scenarios
      );
      resolvedScenarioName = newScenario.name;
      scenarioId = created.scenario.id;
      this.logger.info('Created new scenario for ETL post', { scenarioId, scenarioName: resolvedScenarioName });
    }

    // 1. Query approved transactions from central DB
    let query = `SELECT id, transaction_date, description, amount, account_code, vendor_customer, department, category, document_number, custom_fields
       FROM imported_transactions
       WHERE tenant_id = $1 AND status = 'approved'`;
    const params: any[] = [tenantId];

    if (transactionIds && transactionIds.length > 0) {
      query += ` AND id = ANY($2::uuid[])`;
      params.push(transactionIds);
    }
    query += ` ORDER BY transaction_date, account_code`;

    const result = await this.db.query(query, params);
    const transactions = result.rows;

    if (transactions.length === 0) {
      throw new Error('No approved transactions found to post');
    }

    // 2. Group by account_code and sum amounts
    const accountGroups: Record<string, { totalAmount: number; accountName: string; count: number }> = {};
    for (const tx of transactions) {
      const code = tx.account_code || 'UNCATEGORIZED';
      if (!accountGroups[code]) {
        // Try to get account_name from custom_fields
        let accountName = code;
        if (tx.custom_fields) {
          const cf = typeof tx.custom_fields === 'string' ? JSON.parse(tx.custom_fields) : tx.custom_fields;
          if (cf.account_name) accountName = cf.account_name;
        }
        accountGroups[code] = { totalAmount: 0, accountName, count: 0 };
      }
      accountGroups[code].totalAmount += parseFloat(tx.amount) || 0;
      accountGroups[code].count++;
    }

    // 3. Build LineItem[] from grouped data
    const lineItems: LineItem[] = Object.entries(accountGroups).map(([code, group], index) => ({
      statement_id: '', // will be set by createStatement
      line_code: code,
      line_name: group.accountName,
      line_order: index + 1,
      amount: Math.round(group.totalAmount * 100) / 100,
      currency: 'THB',
      notes: `${group.count} transaction(s) aggregated`,
    }));

    // 4. Derive period_type from date range
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    let periodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly';
    if (daysDiff > 92) periodType = 'yearly';
    else if (daysDiff > 31) periodType = 'quarterly';

    // 5. Build FinancialStatement
    const statement: FinancialStatement = {
      tenant_id: tenantId,
      statement_type: statementType,
      period_type: periodType,
      period_start: periodStart,
      period_end: periodEnd,
      scenario: resolvedScenarioName,
      status: 'draft',
      created_by: userId || tenantId,
    };

    // 6. Create in tenant DB via financialService
    const created = await this.financialService.createStatement(tenantId, statement, lineItems);
    const statementId = created.statement.id as string;

    // 7. Mark transactions as 'posted' in central DB
    const txIds = transactions.map((tx: any) => tx.id);
    await this.db.query(
      `UPDATE imported_transactions
       SET status = 'posted', financial_statement_id = $1, posted_at = CURRENT_TIMESTAMP, posted_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($3::uuid[])`,
      [statementId, userId || tenantId, txIds],
    );

    this.logger.info('Posted transactions to financials successfully', {
      statementId, postedCount: transactions.length, lineItemCount: lineItems.length,
    });

    return {
      statement_id: statementId,
      posted_count: transactions.length,
      statement_type: statementType,
      period_start: periodStart,
      period_end: periodEnd,
      scenario: resolvedScenarioName,
      scenario_id: scenarioId,
    };
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
