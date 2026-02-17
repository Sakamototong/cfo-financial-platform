import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateCoaDto } from './dto/create-coa.dto';
import { UpdateCoaDto } from './dto/update-coa.dto';

@Injectable()
export class CoaService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get all accounts for a tenant
   */
  async findAll(tenantId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const result = await pool.query(
      `SELECT * FROM chart_of_accounts 
       WHERE tenant_id = $1 
       ORDER BY sort_order, account_code`,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Get account hierarchy as tree structure
   */
  async getHierarchy(tenantId: string) {
    const accounts = await this.findAll(tenantId);
    return this.buildTree(accounts);
  }

  /**
   * Get a single account by code
   */
  async findOne(tenantId: string, accountCode: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const result = await pool.query(
      'SELECT * FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2',
      [tenantId, accountCode]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Account ${accountCode} not found`);
    }

    return result.rows[0];
  }

  /**
   * Create a new account
   */
  async create(tenantId: string, createCoaDto: CreateCoaDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);

    // Check if account code already exists
    const existing = await pool.query(
      'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2',
      [tenantId, createCoaDto.account_code]
    );

    if (existing.rows.length > 0) {
      throw new ConflictException(`Account code ${createCoaDto.account_code} already exists`);
    }

    // Validate parent account if specified
    if (createCoaDto.parent_account_code) {
      try {
        await this.findOne(tenantId, createCoaDto.parent_account_code);
      } catch {
        throw new BadRequestException(`Parent account ${createCoaDto.parent_account_code} not found`);
      }
    }

    const result = await pool.query(
      `INSERT INTO chart_of_accounts 
       (tenant_id, account_code, account_name, account_type, parent_account_code, 
        normal_balance, description, level, sort_order, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        tenantId,
        createCoaDto.account_code,
        createCoaDto.account_name,
        createCoaDto.account_type,
        createCoaDto.parent_account_code || null,
        createCoaDto.normal_balance,
        createCoaDto.description || null,
        createCoaDto.level || 1,
        createCoaDto.sort_order || 0,
        createCoaDto.is_active !== undefined ? createCoaDto.is_active : true
      ]
    );

    return result.rows[0];
  }

  /**
   * Update an account
   */
  async update(tenantId: string, accountCode: string, updateCoaDto: UpdateCoaDto) {
    // Verify account exists
    await this.findOne(tenantId, accountCode);

    const pool = await this.databaseService.getTenantPool(tenantId);

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    Object.entries(updateCoaDto).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    });

    if (updateFields.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(tenantId, accountCode);

    const result = await pool.query(
      `UPDATE chart_of_accounts 
       SET ${updateFields.join(', ')}
       WHERE tenant_id = $${paramIndex} AND account_code = $${paramIndex + 1}
       RETURNING *`,
      updateValues
    );

    return result.rows[0];
  }

  /**
   * Delete an account (soft delete by setting is_active = false)
   */
  async remove(tenantId: string, accountCode: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);

    // Check if account has children
    const children = await pool.query(
      'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND parent_account_code = $2',
      [tenantId, accountCode]
    );

    if (children.rows.length > 0) {
      throw new BadRequestException('Cannot delete account with child accounts');
    }

    // Soft delete
    const result = await pool.query(
      'UPDATE chart_of_accounts SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND account_code = $2 RETURNING *',
      [tenantId, accountCode]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Account ${accountCode} not found`);
    }

    return { message: 'Account deactivated successfully' };
  }

  /**
   * Get all available templates
   */
  async getTemplates() {
    const pool = await this.databaseService.getTenantPool('admin'); // Templates are global
    
    const result = await pool.query(
      'SELECT id, template_name, industry, description, is_active FROM coa_templates WHERE is_active = true'
    );

    return result.rows;
  }

  /**
   * Get accounts from a specific template
   */
  async getTemplateAccounts(templateId: string) {
    const pool = await this.databaseService.getTenantPool('admin');
    
    const result = await pool.query(
      'SELECT accounts FROM coa_templates WHERE id = $1',
      [templateId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    return result.rows[0].accounts;
  }

  /**
   * Apply a template to a tenant's COA
   */
  async applyTemplate(tenantId: string, templateId: string) {
    const templateAccounts = await this.getTemplateAccounts(templateId);
    const pool = await this.databaseService.getTenantPool(tenantId);

    // Check if tenant already has accounts
    const existing = await pool.query(
      'SELECT COUNT(*) as count FROM chart_of_accounts WHERE tenant_id = $1',
      [tenantId]
    );

    if (parseInt(existing.rows[0].count) > 0) {
      throw new BadRequestException('Tenant already has accounts. Clear existing accounts first.');
    }

    // Insert all accounts from template
    const insertPromises = templateAccounts.map((account: any) =>
      pool.query(
        `INSERT INTO chart_of_accounts 
         (tenant_id, account_code, account_name, account_type, parent_account_code, 
          normal_balance, level, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          tenantId,
          account.code,
          account.name,
          account.type,
          account.parent || null,
          account.balance,
          account.level || 1,
          0
        ]
      )
    );

    await Promise.all(insertPromises);

    return { message: 'Template applied successfully', accountsCreated: templateAccounts.length };
  }

  /**
   * Build tree structure from flat account list
   */
  private buildTree(accounts: any[]): any[] {
    const map = new Map();
    const roots: any[] = [];

    // Create map of all accounts
    accounts.forEach(account => {
      map.set(account.account_code, { ...account, children: [] });
    });

    // Build tree
    accounts.forEach(account => {
      const node = map.get(account.account_code);
      if (account.parent_account_code) {
        const parent = map.get(account.parent_account_code);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node); // Parent not found, treat as root
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * Search accounts by code or name
   */
  async search(tenantId: string, query: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const result = await pool.query(
      `SELECT * FROM chart_of_accounts 
       WHERE tenant_id = $1 
       AND (account_code ILIKE $2 OR account_name ILIKE $2)
       AND is_active = true
       ORDER BY account_code
       LIMIT 50`,
      [tenantId, `%${query}%`]
    );

    return result.rows;
  }
}
