import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';

export interface FinancialStatement {
  id?: string;
  tenant_id: string;
  statement_type: 'PL' | 'BS' | 'CF';
  period_type: 'monthly' | 'quarterly' | 'yearly';
  period_start: string; // ISO date
  period_end: string;
  scenario: string;
  status: 'draft' | 'approved' | 'locked';
  created_by?: string;
}

export interface LineItem {
  id?: string;
  statement_id: string;
  line_code: string;
  line_name: string;
  parent_code?: string;
  line_order: number;
  amount: number;
  currency: string;
  notes?: string;
}

@Injectable()
export class FinancialService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create financial statement with line items
   */
  async createStatement(
    tenantId: string,
    statement: FinancialStatement,
    lineItems: LineItem[],
  ): Promise<{ statement: FinancialStatement; lineItems: LineItem[] }> {
    this.logger.info('Creating financial statement', {
      tenantId,
      type: statement.statement_type,
      period: `${statement.period_start} to ${statement.period_end}`,
    });

    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Insert statement
      const stmtResult = await client.query(
        `INSERT INTO financial_statements 
         (tenant_id, statement_type, period_type, period_start, period_end, scenario, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          tenantId,
          statement.statement_type,
          statement.period_type,
          statement.period_start,
          statement.period_end,
          statement.scenario,
          statement.status || 'draft',
          statement.created_by,
        ],
      );

      const createdStatement = stmtResult.rows[0];

      // Insert line items
      const createdLineItems: LineItem[] = [];
      for (const item of lineItems) {
        const itemResult = await client.query(
          `INSERT INTO financial_line_items
           (statement_id, line_code, line_name, parent_code, line_order, amount, currency, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            createdStatement.id,
            item.line_code,
            item.line_name,
            item.parent_code || null,
            item.line_order,
            item.amount,
            item.currency || 'THB',
            item.notes || null,
          ],
        );
        createdLineItems.push(itemResult.rows[0]);
      }

      await client.query('COMMIT');

      this.logger.info('Financial statement created successfully', {
        statementId: createdStatement.id,
        lineItemCount: createdLineItems.length,
      });

      return {
        statement: createdStatement,
        lineItems: createdLineItems,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create financial statement', {
        error: (error as any).message,
        tenantId,
      });
      // Handle unique constraint violation for statement uniqueness
      if (error?.code === '23505') {
        throw new HttpException(
          'A statement for this tenant, statement type and period already exists',
          HttpStatus.CONFLICT,
        );
      }
      // Handle check constraint violations (e.g. invalid scenario value)
      if (error?.code === '23514') {
        // Return a bad request with the database message (constraint name)
        throw new HttpException(
          `Invalid value: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get statement by ID with line items
   */
  async getStatement(
    tenantId: string,
    statementId: string,
  ): Promise<{ statement: FinancialStatement; lineItems: LineItem[] } | null> {
    const stmtResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM financial_statements WHERE id = $1',
      [statementId],
    );

    if (stmtResult.rows.length === 0) {
      return null;
    }

    const lineItemsResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM financial_line_items WHERE statement_id = $1 ORDER BY line_order',
      [statementId],
    );

    return {
      statement: stmtResult.rows[0],
      lineItems: lineItemsResult.rows,
    };
  }

  /**
   * List statements for tenant with filters
   */
  async listStatements(
    tenantId: string,
    filters?: {
      statement_type?: 'PL' | 'BS' | 'CF';
      scenario?: string;
      period_start?: string;
      period_end?: string;
    },
  ): Promise<FinancialStatement[]> {
    let query = 'SELECT * FROM financial_statements WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.statement_type) {
      query += ` AND statement_type = $${paramIndex}`;
      params.push(filters.statement_type);
      paramIndex++;
    }

    if (filters?.scenario) {
      query += ` AND scenario = $${paramIndex}`;
      params.push(filters.scenario);
      paramIndex++;
    }

    if (filters?.period_start) {
      query += ` AND period_start >= $${paramIndex}`;
      params.push(filters.period_start);
      paramIndex++;
    }

    if (filters?.period_end) {
      query += ` AND period_end <= $${paramIndex}`;
      params.push(filters.period_end);
      paramIndex++;
    }

    query += ' ORDER BY period_start DESC, created_at DESC';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Update statement status (draft -> approved -> locked)
   */
  async updateStatementStatus(
    tenantId: string,
    statementId: string,
    status: 'draft' | 'approved' | 'locked',
    userId: string,
  ): Promise<FinancialStatement> {
    const result = await this.db.queryTenant(
      tenantId,
      `UPDATE financial_statements 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, statementId],
    );

    if (result.rows.length === 0) {
      throw new Error('Statement not found');
    }

    this.logger.info('Statement status updated', {
      statementId,
      newStatus: status,
      userId,
    });

    return result.rows[0];
  }

  /**
   * Delete statement (cascade deletes line items)
   */
  async deleteStatement(tenantId: string, statementId: string): Promise<void> {
    await this.db.queryTenant(tenantId, 'DELETE FROM financial_statements WHERE id = $1', [
      statementId,
    ]);

    this.logger.info('Statement deleted', { statementId });
  }

  /**
   * Update an existing statement and replace its line items transactionally
   */
  async updateStatement(
    tenantId: string,
    statementId: string,
    statement: Partial<FinancialStatement>,
    lineItems?: LineItem[] | undefined,
  ): Promise<{ statement: FinancialStatement; lineItems: LineItem[] }> {
    const client = await this.db.getTenantClient(tenantId);
    try {
      await client.query('BEGIN');

      // Build dynamic update query so we don't overwrite fields with undefined
      const setClauses: string[] = [];
      const params: any[] = [];
      let idx = 1;

      if (statement.statement_type !== undefined) {
        setClauses.push(`statement_type = $${idx++}`);
        params.push(statement.statement_type);
      }
      if (statement.period_type !== undefined) {
        setClauses.push(`period_type = $${idx++}`);
        params.push(statement.period_type);
      }
      if (statement.period_start !== undefined) {
        setClauses.push(`period_start = $${idx++}`);
        params.push(statement.period_start);
      }
      if (statement.period_end !== undefined) {
        setClauses.push(`period_end = $${idx++}`);
        params.push(statement.period_end);
      }
      if (statement.scenario !== undefined) {
        setClauses.push(`scenario = $${idx++}`);
        params.push(statement.scenario);
      }
      if (statement.status !== undefined) {
        setClauses.push(`status = $${idx++}`);
        params.push(statement.status);
      }

      // Always update updated_at
      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

      const query = `UPDATE financial_statements SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
      params.push(statementId);

      const updateRes = await client.query(query, params);

      if (updateRes.rows.length === 0) {
        throw new Error('Statement not found');
      }

      let resultingLineItems: LineItem[] = [];
      if (lineItems && lineItems.length > 0) {
        // remove existing line items and insert new ones
        await client.query('DELETE FROM financial_line_items WHERE statement_id = $1', [statementId]);
        for (const item of lineItems) {
          const itemResult = await client.query(
            `INSERT INTO financial_line_items
             (statement_id, line_code, line_name, parent_code, line_order, amount, currency, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
              statementId,
              item.line_code,
              item.line_name,
              item.parent_code || null,
              item.line_order,
              item.amount,
              item.currency || 'THB',
              item.notes || null,
            ],
          );
          resultingLineItems.push(itemResult.rows[0]);
        }
      } else {
        // fetch existing line items to return
        const liRes = await client.query('SELECT * FROM financial_line_items WHERE statement_id = $1 ORDER BY line_order', [statementId]);
        resultingLineItems = liRes.rows;
      }

      await client.query('COMMIT');

      const updatedStatement = updateRes.rows[0];
      this.logger.info('Statement updated', { statementId: updatedStatement.id, lineItemCount: resultingLineItems.length });
      return { statement: updatedStatement, lineItems: resultingLineItems };
    } catch (error: any) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to update financial statement', { error: (error as any).message, tenantId });
      if (error?.code === '23505') {
        throw new HttpException('A statement for this tenant, statement type and period already exists', HttpStatus.CONFLICT);
      }
      if (error?.code === '23514') {
        throw new HttpException(`Invalid value: ${error.message}`, HttpStatus.BAD_REQUEST);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get imported transactions for a specific line item (drill-down)
   */
  async getLineItemTransactions(tenantId: string, statementId: string, lineCode: string) {
    this.logger.info('Getting line item transactions for drill-down', { tenantId, statementId, lineCode });

    const pool = await this.db.getTenantPool(tenantId);

    try {
      // Get transactions that match the line code (account code)
      const result = await pool.query(
        `SELECT 
          it.id,
          it.transaction_date,
          it.description,
          it.amount,
          it.account_code,
          it.department,
          it.cost_center,
          it.transaction_type,
          it.category,
          it.document_number,
          it.reference_number,
          it.vendor_customer,
          it.status,
          it.posted_at,
          il.file_name,
          il.started_at as import_date,
          temp.template_name
         FROM imported_transactions it
         LEFT JOIN import_logs il ON it.import_log_id = il.id
         LEFT JOIN import_templates temp ON il.template_id = temp.id
         WHERE it.tenant_id = $1 
           AND it.financial_statement_id = $2
           AND it.account_code = $3
         ORDER BY it.transaction_date DESC, it.created_at DESC`,
        [tenantId, statementId, lineCode]
      );

      return {
        line_code: lineCode,
        statement_id: statementId,
        transaction_count: result.rows.length,
        transactions: result.rows
      };
    } catch (error: any) {
      this.logger.error('Failed to get line item transactions', { error: error.message, tenantId, lineCode });
      throw error;
    }
  }

  /**
   * Get all imported transactions for a financial statement
   */
  async getStatementTransactions(tenantId: string, statementId: string) {
    this.logger.info('Getting all statement transactions', { tenantId, statementId });

    const pool = await this.db.getTenantPool(tenantId);

    try {
      const result = await pool.query(
        `SELECT 
          it.id,
          it.transaction_date,
          it.description,
          it.amount,
          it.account_code,
          coa.account_name,
          it.department,
          it.cost_center,
          it.transaction_type,
          it.category,
          it.document_number,
          it.reference_number,
          it.vendor_customer,
          it.status,
          it.posted_at,
          il.file_name,
          il.started_at as import_date,
          temp.template_name
         FROM imported_transactions it
         LEFT JOIN import_logs il ON it.import_log_id = il.id
         LEFT JOIN import_templates temp ON il.template_id = temp.id
         LEFT JOIN chart_of_accounts coa ON it.account_code = coa.account_code AND coa.tenant_id = $1
         WHERE it.tenant_id = $1 
           AND it.financial_statement_id = $2
         ORDER BY it.transaction_date DESC, it.created_at DESC`,
        [tenantId, statementId]
      );

      return {
        statement_id: statementId,
        transaction_count: result.rows.length,
        total_amount: result.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0),
        transactions: result.rows
      };
    } catch (error: any) {
      this.logger.error('Failed to get statement transactions', { error: error.message, tenantId, statementId });
      throw error;
    }
  }
}
