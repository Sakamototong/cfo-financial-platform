import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';

export interface Dimension {
  id?: string;
  tenant_id: string;
  dimension_code: string;
  dimension_name: string;
  dimension_type: 'account' | 'department' | 'product' | 'location' | 'project' | 'custom';
  description?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface DimensionHierarchy {
  id?: string;
  dimension_id: string;
  parent_code?: string; // null for root level
  node_code: string;
  node_name: string;
  level: number;
  sort_order: number;
  is_leaf: boolean; // true if has no children
  metadata?: any; // JSON for custom attributes
  created_at?: Date;
  updated_at?: Date;
}

export interface StatementTemplate {
  id?: string;
  tenant_id: string;
  template_name: string;
  statement_type: 'PL' | 'BS' | 'CF';
  description?: string;
  line_items: TemplateLineItem[];
  validation_rules?: any; // JSON for validation rules
  is_default: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface TemplateLineItem {
  line_code: string;
  line_name: string;
  parent_code?: string;
  level: number;
  line_order: number;
  data_type: 'input' | 'calculated' | 'subtotal' | 'total';
  formula?: string; // For calculated items
  required: boolean;
  default_value?: number;
  validation?: {
    min?: number;
    max?: number;
    allowNegative?: boolean;
  };
}

@Injectable()
export class DimService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create DIM schema in tenant database
   */
  async createDimSchema(tenantId: string): Promise<void> {
    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Dimensions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS dimensions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          dimension_code VARCHAR(50) UNIQUE NOT NULL,
          dimension_name VARCHAR(255) NOT NULL,
          dimension_type VARCHAR(50) NOT NULL,
          description TEXT,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_dimensions_tenant ON dimensions(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_dimensions_code ON dimensions(dimension_code);
      `);

      // Dimension hierarchies table
      await client.query(`
        CREATE TABLE IF NOT EXISTS dimension_hierarchies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          dimension_id UUID NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
          parent_code VARCHAR(50),
          node_code VARCHAR(50) NOT NULL,
          node_name VARCHAR(255) NOT NULL,
          level INTEGER NOT NULL,
          sort_order INTEGER DEFAULT 0,
          is_leaf BOOLEAN DEFAULT false,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(dimension_id, node_code)
        );

        CREATE INDEX IF NOT EXISTS idx_hierarchies_dimension ON dimension_hierarchies(dimension_id);
        CREATE INDEX IF NOT EXISTS idx_hierarchies_parent ON dimension_hierarchies(parent_code);
        CREATE INDEX IF NOT EXISTS idx_hierarchies_node ON dimension_hierarchies(node_code);
      `);

      // Statement templates table
      await client.query(`
        CREATE TABLE IF NOT EXISTS statement_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          template_name VARCHAR(255) NOT NULL,
          statement_type VARCHAR(10) NOT NULL CHECK (statement_type IN ('PL', 'BS', 'CF')),
          description TEXT,
          line_items JSONB NOT NULL,
          validation_rules JSONB,
          is_default BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_templates_tenant ON statement_templates(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_templates_type ON statement_templates(statement_type);
      `);

      await client.query('COMMIT');

      this.logger.info('DIM schema created successfully', { tenantId });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create DIM schema', {
        error: (error as any).message,
        tenantId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create or update dimension
   */
  async upsertDimension(tenantId: string, dimension: Dimension): Promise<Dimension> {
    this.logger.info('Upserting dimension', {
      tenantId,
      dimensionCode: dimension.dimension_code,
    });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO dimensions 
       (tenant_id, dimension_code, dimension_name, dimension_type, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (dimension_code) 
       DO UPDATE SET 
         dimension_name = EXCLUDED.dimension_name,
         dimension_type = EXCLUDED.dimension_type,
         description = EXCLUDED.description,
         is_active = EXCLUDED.is_active,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        tenantId,
        dimension.dimension_code,
        dimension.dimension_name,
        dimension.dimension_type,
        dimension.description || null,
        dimension.is_active !== false,
      ],
    );

    return result.rows[0];
  }

  /**
   * List all dimensions
   */
  async listDimensions(tenantId: string, activeOnly: boolean = true): Promise<Dimension[]> {
    let query = 'SELECT * FROM dimensions WHERE tenant_id = $1';
    const params: any[] = [tenantId];

    if (activeOnly) {
      query += ' AND is_active = true';
    }

    query += ' ORDER BY dimension_code';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Get dimension by code
   */
  async getDimension(tenantId: string, dimensionCode: string): Promise<Dimension | null> {
    const result = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM dimensions WHERE dimension_code = $1',
      [dimensionCode],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Add node to hierarchy
   */
  async addHierarchyNode(
    tenantId: string,
    dimensionCode: string,
    node: DimensionHierarchy,
  ): Promise<DimensionHierarchy> {
    // Get dimension ID
    const dimension = await this.getDimension(tenantId, dimensionCode);
    if (!dimension) {
      throw new Error('Dimension not found');
    }

    this.logger.info('Adding hierarchy node', {
      tenantId,
      dimensionCode,
      nodeCode: node.node_code,
    });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO dimension_hierarchies 
       (dimension_id, parent_code, node_code, node_name, level, sort_order, is_leaf, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (dimension_id, node_code)
       DO UPDATE SET
         parent_code = EXCLUDED.parent_code,
         node_name = EXCLUDED.node_name,
         level = EXCLUDED.level,
         sort_order = EXCLUDED.sort_order,
         is_leaf = EXCLUDED.is_leaf,
         metadata = EXCLUDED.metadata,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        dimension.id,
        node.parent_code || null,
        node.node_code,
        node.node_name,
        node.level,
        node.sort_order || 0,
        node.is_leaf !== false,
        node.metadata ? JSON.stringify(node.metadata) : null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get hierarchy tree for a dimension
   */
  async getHierarchy(tenantId: string, dimensionCode: string): Promise<DimensionHierarchy[]> {
    const dimension = await this.getDimension(tenantId, dimensionCode);
    if (!dimension) {
      throw new Error('Dimension not found');
    }

    const result = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM dimension_hierarchies 
       WHERE dimension_id = $1
       ORDER BY level, sort_order, node_code`,
      [dimension.id],
    );

    return result.rows;
  }

  /**
   * Get children of a node
   */
  async getChildNodes(
    tenantId: string,
    dimensionCode: string,
    parentCode: string,
  ): Promise<DimensionHierarchy[]> {
    const dimension = await this.getDimension(tenantId, dimensionCode);
    if (!dimension) {
      throw new Error('Dimension not found');
    }

    const result = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM dimension_hierarchies 
       WHERE dimension_id = $1 AND parent_code = $2
       ORDER BY sort_order, node_code`,
      [dimension.id, parentCode],
    );

    return result.rows;
  }

  /**
   * Delete hierarchy node
   */
  async deleteHierarchyNode(
    tenantId: string,
    dimensionCode: string,
    nodeCode: string,
  ): Promise<void> {
    const dimension = await this.getDimension(tenantId, dimensionCode);
    if (!dimension) {
      throw new Error('Dimension not found');
    }

    await this.db.queryTenant(
      tenantId,
      'DELETE FROM dimension_hierarchies WHERE dimension_id = $1 AND node_code = $2',
      [dimension.id, nodeCode],
    );

    this.logger.info('Hierarchy node deleted', { tenantId, dimensionCode, nodeCode });
  }

  /**
   * Create or update statement template
   */
  async upsertTemplate(tenantId: string, template: StatementTemplate): Promise<StatementTemplate> {
    this.logger.info('Upserting statement template', {
      tenantId,
      templateName: template.template_name,
    });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO statement_templates 
       (tenant_id, template_name, statement_type, description, line_items, validation_rules, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        template.template_name,
        template.statement_type,
        template.description || null,
        JSON.stringify(template.line_items),
        template.validation_rules ? JSON.stringify(template.validation_rules) : null,
        template.is_default === true,
      ],
    );

    // If this is default, unset other defaults
    if (template.is_default) {
      await this.db.queryTenant(
        tenantId,
        `UPDATE statement_templates 
         SET is_default = false 
         WHERE id != $1 AND statement_type = $2`,
        [result.rows[0].id, template.statement_type],
      );
    }

    return result.rows[0];
  }

  /**
   * List templates
   */
  async listTemplates(
    tenantId: string,
    statementType?: 'PL' | 'BS' | 'CF',
  ): Promise<StatementTemplate[]> {
    let query = 'SELECT * FROM statement_templates WHERE tenant_id = $1';
    const params: any[] = [tenantId];

    if (statementType) {
      query += ' AND statement_type = $2';
      params.push(statementType);
    }

    query += ' ORDER BY statement_type, template_name';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Get template by ID
   */
  async getTemplate(tenantId: string, templateId: string): Promise<StatementTemplate | null> {
    const result = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM statement_templates WHERE id = $1',
      [templateId],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get default template for statement type
   */
  async getDefaultTemplate(
    tenantId: string,
    statementType: 'PL' | 'BS' | 'CF',
  ): Promise<StatementTemplate | null> {
    const result = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM statement_templates WHERE statement_type = $1 AND is_default = true LIMIT 1',
      [statementType],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Validate statement against template
   */
  async validateStatement(
    tenantId: string,
    templateId: string,
    lineItems: any[],
  ): Promise<{ valid: boolean; errors: string[] }> {
    const template = await this.getTemplate(tenantId, templateId);
    if (!template) {
      return { valid: false, errors: ['Template not found'] };
    }

    const errors: string[] = [];
    const templateItems = template.line_items as TemplateLineItem[];

    // Check required fields
    for (const templateItem of templateItems) {
      if (templateItem.required && templateItem.data_type === 'input') {
        const actualItem = lineItems.find((li) => li.line_code === templateItem.line_code);
        if (!actualItem) {
          errors.push(`Missing required line item: ${templateItem.line_code} (${templateItem.line_name})`);
        } else {
          // Validate amount if present
          if (actualItem.amount !== undefined && templateItem.validation) {
            const amount = parseFloat(actualItem.amount);
            if (templateItem.validation.min !== undefined && amount < templateItem.validation.min) {
              errors.push(
                `${templateItem.line_code}: Amount ${amount} is below minimum ${templateItem.validation.min}`,
              );
            }
            if (templateItem.validation.max !== undefined && amount > templateItem.validation.max) {
              errors.push(
                `${templateItem.line_code}: Amount ${amount} exceeds maximum ${templateItem.validation.max}`,
              );
            }
            if (
              templateItem.validation.allowNegative === false &&
              amount < 0
            ) {
              errors.push(`${templateItem.line_code}: Negative amounts not allowed`);
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Delete template
   */
  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    await this.db.queryTenant(
      tenantId,
      'DELETE FROM statement_templates WHERE id = $1',
      [templateId],
    );

    this.logger.info('Template deleted', { tenantId, templateId });
  }
}
