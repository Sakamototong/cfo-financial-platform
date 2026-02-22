import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateCoaDto } from './dto/create-coa.dto';
import { UpdateCoaDto } from './dto/update-coa.dto';

@Injectable()
export class CoaService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Infer normal_balance from account_type when not provided
   */
  private inferNormalBalance(accountType: string): string {
    const creditTypes = ['liability', 'equity', 'revenue', 'income'];
    return creditTypes.some(t => (accountType || '').toLowerCase().includes(t)) ? 'credit' : 'debit';
  }

  /**
   * Get all accounts for a tenant, with parent_account_code resolved via JOIN
   */
  async findAll(tenantId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);

    const result = await pool.query(
      `SELECT c.*, p.account_code AS parent_account_code
       FROM chart_of_accounts c
       LEFT JOIN chart_of_accounts p ON c.parent_id = p.id
       WHERE c.tenant_id = $1
       ORDER BY c.sort_order, c.account_code`,
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
   * Get a single account by code, with parent_account_code resolved
   */
  async findOne(tenantId: string, accountCode: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);

    const result = await pool.query(
      `SELECT c.*, p.account_code AS parent_account_code
       FROM chart_of_accounts c
       LEFT JOIN chart_of_accounts p ON c.parent_id = p.id
       WHERE c.tenant_id = $1 AND c.account_code = $2`,
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

    // Resolve parent_account_code → parent_id (UUID)
    let parentId: string | null = null;
    if (createCoaDto.parent_account_code) {
      const parentRow = await pool.query(
        'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2',
        [tenantId, createCoaDto.parent_account_code]
      );
      if (parentRow.rows.length === 0) {
        throw new BadRequestException(`Parent account ${createCoaDto.parent_account_code} not found`);
      }
      parentId = parentRow.rows[0].id;
    }

    const normalBalance = createCoaDto.normal_balance || this.inferNormalBalance(createCoaDto.account_type);

    const result = await pool.query(
      `INSERT INTO chart_of_accounts
       (tenant_id, account_code, account_name, account_type, parent_id,
        normal_balance, description, level, sort_order, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        tenantId,
        createCoaDto.account_code,
        createCoaDto.account_name,
        createCoaDto.account_type,
        parentId,
        normalBalance,
        createCoaDto.description || null,
        createCoaDto.level || 1,
        createCoaDto.sort_order || 0,
        createCoaDto.is_active !== undefined ? createCoaDto.is_active : true,
      ]
    );

    return result.rows[0];
  }

  /**
   * Update an account
   */
  async update(tenantId: string, accountCode: string, updateCoaDto: UpdateCoaDto) {
    await this.findOne(tenantId, accountCode);

    const pool = await this.databaseService.getTenantPool(tenantId);

    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    // Handle parent_account_code → parent_id translation
    if (updateCoaDto.parent_account_code !== undefined) {
      if (updateCoaDto.parent_account_code === null || updateCoaDto.parent_account_code === '') {
        updateFields.push(`parent_id = $${paramIndex}`);
        updateValues.push(null);
        paramIndex++;
      } else {
        const parentRow = await pool.query(
          'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2',
          [tenantId, updateCoaDto.parent_account_code]
        );
        if (parentRow.rows.length === 0) {
          throw new BadRequestException(`Parent account ${updateCoaDto.parent_account_code} not found`);
        }
        updateFields.push(`parent_id = $${paramIndex}`);
        updateValues.push(parentRow.rows[0].id);
        paramIndex++;
      }
    }

    // Handle remaining fields (skip parent_account_code — already handled above)
    const skipFields = new Set(['parent_account_code']);
    Object.entries(updateCoaDto).forEach(([key, value]) => {
      if (!skipFields.has(key) && value !== undefined) {
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

    // Find account's own id first
    const accountRow = await pool.query(
      'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2',
      [tenantId, accountCode]
    );
    if (accountRow.rows.length === 0) {
      throw new NotFoundException(`Account ${accountCode} not found`);
    }
    const accountId = accountRow.rows[0].id;

    // Check if account has children (by parent_id UUID)
    const children = await pool.query(
      'SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND parent_id = $2',
      [tenantId, accountId]
    );

    if (children.rows.length > 0) {
      throw new BadRequestException('Cannot delete account with child accounts');
    }

    // Soft delete
    const result = await pool.query(
      'UPDATE chart_of_accounts SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND account_code = $2 RETURNING *',
      [tenantId, accountCode]
    );

    return { message: 'Account deactivated successfully' };
  }

  /**
   * Get all available templates (deduplicated by template_name+industry)
   */
  async getTemplates() {
    const pool = await this.databaseService.getTenantPool('admin');

    const result = await pool.query(
      `SELECT DISTINCT ON (template_name, industry)
         id, template_name, industry, description, is_active
       FROM coa_templates
       WHERE is_active = true
       ORDER BY template_name, industry, id`
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
   * Uses a two-pass approach: first insert all accounts (getting their UUIDs),
   * then update parent_id based on the code→id map.
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

    // Pass 1: insert all accounts without parent_id, collect code→UUID map
    // Template data may use short field names (code/name/type/balance/parent)
    // or long field names (account_code/account_name/account_type/normal_balance/parent_code)
    const codeToId: Record<string, string> = {};
    for (const account of templateAccounts) {
      const code = account.account_code || account.code;
      const name = account.account_name || account.name;
      const type = account.account_type || account.type;
      const normalBalance = account.normal_balance || account.balance || this.inferNormalBalance(type);
      const res = await pool.query(
        `INSERT INTO chart_of_accounts
         (tenant_id, account_code, account_name, account_type,
          normal_balance, level, sort_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          tenantId,
          code,
          name,
          type,
          normalBalance,
          account.level || 1,
          account.sort_order || 0,
        ]
      );
      codeToId[code] = res.rows[0].id;
    }

    // Pass 2: update parent_id for accounts that have a parent code
    for (const account of templateAccounts) {
      const code = account.account_code || account.code;
      const parentCode = account.parent_code || account.parent;
      if (parentCode && codeToId[parentCode]) {
        await pool.query(
          'UPDATE chart_of_accounts SET parent_id = $1 WHERE tenant_id = $2 AND account_code = $3',
          [codeToId[parentCode], tenantId, code]
        );
      }
    }

    return { message: 'Template applied successfully', accountsCreated: templateAccounts.length };
  }

  /**
   * Build tree structure from flat account list.
   * Requires accounts to have virtual `parent_account_code` field (from JOIN in findAll).
   */
  private buildTree(accounts: any[]): any[] {
    const map = new Map<string, any>();
    const roots: any[] = [];

    accounts.forEach(account => {
      map.set(account.account_code, { ...account, children: [] });
    });

    accounts.forEach(account => {
      const node = map.get(account.account_code);
      if (account.parent_account_code) {
        const parent = map.get(account.parent_account_code);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
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
      `SELECT c.*, p.account_code AS parent_account_code
       FROM chart_of_accounts c
       LEFT JOIN chart_of_accounts p ON c.parent_id = p.id
       WHERE c.tenant_id = $1
       AND (c.account_code ILIKE $2 OR c.account_name ILIKE $2)
       AND c.is_active = true
       ORDER BY c.account_code
       LIMIT 50`,
      [tenantId, `%${query}%`]
    );

    return result.rows;
  }
}
