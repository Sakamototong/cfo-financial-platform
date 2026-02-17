import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { CreateBudgetLineItemDto, UpdateBudgetLineItemDto } from './dto/budget-line-item.dto';

@Injectable()
export class BudgetService {
  constructor(private databaseService: DatabaseService) {}

  // ===== BUDGET CRUD =====

  async findAll(tenantId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM budgets WHERE tenant_id = $1 ORDER BY fiscal_year DESC, created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async findOne(tenantId: string, budgetId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM budgets WHERE id = $1 AND tenant_id = $2`,
      [budgetId, tenantId]
    );
    if (result.rows.length === 0) {
      throw new Error('Budget not found');
    }
    return result.rows[0];
  }

  async create(tenantId: string, dto: CreateBudgetDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check for duplicate
    const existing = await pool.query(
      `SELECT id FROM budgets WHERE tenant_id = $1 AND fiscal_year = $2 AND budget_type = $3`,
      [tenantId, dto.fiscal_year, dto.budget_type]
    );
    
    if (existing.rows.length > 0) {
      throw new Error(`Budget already exists for FY${dto.fiscal_year} (${dto.budget_type})`);
    }

    const result = await pool.query(
      `INSERT INTO budgets (tenant_id, budget_name, fiscal_year, budget_type, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, dto.budget_name, dto.fiscal_year, dto.budget_type, dto.description, dto.created_by]
    );
    
    return result.rows[0];
  }

  async update(tenantId: string, budgetId: string, dto: UpdateBudgetDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check if budget exists and is not locked
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'locked') {
      throw new Error('Cannot update locked budget');
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (dto.budget_name !== undefined) {
      fields.push(`budget_name = $${idx++}`);
      values.push(dto.budget_name);
    }
    if (dto.description !== undefined) {
      fields.push(`description = $${idx++}`);
      values.push(dto.description);
    }
    if (dto.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(dto.status);
    }
    if (dto.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(dto.notes);
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    values.push(budgetId, tenantId);

    const result = await pool.query(
      `UPDATE budgets SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx++} RETURNING *`,
      values
    );
    
    return result.rows[0];
  }

  async remove(tenantId: string, budgetId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check if budget is locked
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'locked') {
      throw new Error('Cannot delete locked budget');
    }

    await pool.query(
      `DELETE FROM budgets WHERE id = $1 AND tenant_id = $2`,
      [budgetId, tenantId]
    );
    
    return { message: 'Budget deleted successfully' };
  }

  // ===== LINE ITEMS =====

  async getLineItems(tenantId: string, budgetId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT bli.*, coa.account_name, coa.account_type
       FROM budget_line_items bli
       LEFT JOIN chart_of_accounts coa ON bli.account_code = coa.account_code AND coa.tenant_id = $2
       WHERE bli.budget_id = $1
       ORDER BY bli.account_code, bli.department`,
      [budgetId, tenantId]
    );
    return result.rows;
  }

  async createLineItem(tenantId: string, budgetId: string, dto: CreateBudgetLineItemDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check if budget exists and is not locked
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'locked') {
      throw new Error('Cannot add line items to locked budget');
    }
    
    // Check if line item already exists
    const existing = await pool.query(
      `SELECT id FROM budget_line_items 
       WHERE budget_id = $1 AND account_code = $2 AND 
             COALESCE(department, '') = COALESCE($3, '') AND 
             COALESCE(cost_center, '') = COALESCE($4, '')`,
      [budgetId, dto.account_code, dto.department, dto.cost_center]
    );
    
    if (existing.rows.length > 0) {
      throw new Error('Line item already exists for this account/department/cost center');
    }

    const result = await pool.query(
      `INSERT INTO budget_line_items 
       (budget_id, account_code, department, cost_center, 
        january, february, march, april, may, june, july, august, september, october, november, december, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *`,
      [
        budgetId, dto.account_code, dto.department, dto.cost_center,
        dto.january || 0, dto.february || 0, dto.march || 0, dto.april || 0,
        dto.may || 0, dto.june || 0, dto.july || 0, dto.august || 0,
        dto.september || 0, dto.october || 0, dto.november || 0, dto.december || 0,
        dto.notes
      ]
    );
    
    return result.rows[0];
  }

  async updateLineItem(tenantId: string, budgetId: string, lineItemId: string, dto: UpdateBudgetLineItemDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check if budget is locked
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'locked') {
      throw new Error('Cannot update line items in locked budget');
    }

    const fields = [];
    const values = [];
    let idx = 1;

    const months = ['january', 'february', 'march', 'april', 'may', 'june', 
                    'july', 'august', 'september', 'october', 'november', 'december'];
    
    for (const month of months) {
      if (dto[month] !== undefined) {
        fields.push(`${month} = $${idx++}`);
        values.push(dto[month]);
      }
    }
    
    if (dto.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(dto.notes);
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    values.push(lineItemId, budgetId);

    const result = await pool.query(
      `UPDATE budget_line_items SET ${fields.join(', ')} 
       WHERE id = $${idx++} AND budget_id = $${idx++} 
       RETURNING *`,
      values
    );
    
    return result.rows[0];
  }

  async removeLineItem(tenantId: string, budgetId: string, lineItemId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check if budget is locked
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status === 'locked') {
      throw new Error('Cannot delete line items from locked budget');
    }

    await pool.query(
      `DELETE FROM budget_line_items WHERE id = $1 AND budget_id = $2`,
      [lineItemId, budgetId]
    );
    
    return { message: 'Line item deleted successfully' };
  }

  // ===== WORKFLOW =====

  async submitForApproval(tenantId: string, budgetId: string, userId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status !== 'draft') {
      throw new Error('Only draft budgets can be submitted');
    }

    const result = await pool.query(
      `UPDATE budgets SET status = 'submitted', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [budgetId, tenantId]
    );
    
    return result.rows[0];
  }

  async approve(tenantId: string, budgetId: string, userId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status !== 'submitted') {
      throw new Error('Only submitted budgets can be approved');
    }

    const result = await pool.query(
      `UPDATE budgets SET status = 'approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [userId, budgetId, tenantId]
    );
    
    return result.rows[0];
  }

  async reject(tenantId: string, budgetId: string, userId: string, reason: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status !== 'submitted') {
      throw new Error('Only submitted budgets can be rejected');
    }

    const result = await pool.query(
      `UPDATE budgets SET status = 'rejected', notes = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [reason, budgetId, tenantId]
    );
    
    return result.rows[0];
  }

  async lock(tenantId: string, budgetId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const budget = await this.findOne(tenantId, budgetId);
    if (budget.status !== 'approved') {
      throw new Error('Only approved budgets can be locked');
    }

    const result = await pool.query(
      `UPDATE budgets SET status = 'locked', locked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [budgetId, tenantId]
    );
    
    return result.rows[0];
  }

  // ===== COPY FROM PREVIOUS YEAR =====

  async copyFromPreviousYear(tenantId: string, sourceBudgetId: string, newFiscalYear: number, newBudgetType: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const sourceBudget = await this.findOne(tenantId, sourceBudgetId);
    
    // Create new budget
    const newBudget = await this.create(tenantId, {
      budget_name: `FY${newFiscalYear} ${newBudgetType} Budget (Copied from FY${sourceBudget.fiscal_year})`,
      fiscal_year: newFiscalYear,
      budget_type: newBudgetType as any,
      description: `Copied from FY${sourceBudget.fiscal_year} budget`,
      created_by: 'system'
    });
    
    // Copy all line items
    await pool.query(
      `INSERT INTO budget_line_items 
       (budget_id, account_code, department, cost_center, 
        january, february, march, april, may, june, july, august, september, october, november, december, notes)
       SELECT $1, account_code, department, cost_center,
              january, february, march, april, may, june, july, august, september, october, november, december, notes
       FROM budget_line_items
       WHERE budget_id = $2`,
      [newBudget.id, sourceBudgetId]
    );
    
    return newBudget;
  }

  // ===== ALLOCATIONS =====

  async getAllocations(tenantId: string, budgetId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM budget_allocations WHERE budget_id = $1 ORDER BY department, category`,
      [budgetId]
    );
    return result.rows;
  }

  // ===== SUMMARY & ANALYTICS =====

  async getSummary(tenantId: string, budgetId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const result = await pool.query(
      `SELECT 
         coa.account_type,
         SUM(bli.annual_total) as total_amount,
         COUNT(DISTINCT bli.department) as department_count,
         COUNT(*) as line_item_count
       FROM budget_line_items bli
       LEFT JOIN chart_of_accounts coa ON bli.account_code = coa.account_code AND coa.tenant_id = $2
       WHERE bli.budget_id = $1
       GROUP BY coa.account_type
       ORDER BY coa.account_type`,
      [budgetId, tenantId]
    );
    
    return result.rows;
  }

  async getDepartmentSummary(tenantId: string, budgetId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const result = await pool.query(
      `SELECT 
         bli.department,
         coa.account_type,
         SUM(bli.annual_total) as total_amount
       FROM budget_line_items bli
       LEFT JOIN chart_of_accounts coa ON bli.account_code = coa.account_code AND coa.tenant_id = $2
       WHERE bli.budget_id = $1 AND bli.department IS NOT NULL
       GROUP BY bli.department, coa.account_type
       ORDER BY bli.department, coa.account_type`,
      [budgetId, tenantId]
    );
    
    return result.rows;
  }
}
