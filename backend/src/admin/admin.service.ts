import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';

export interface SystemConfig {
  id?: string;
  tenant_id: string;
  config_key: string;
  config_value: any; // JSON
  description?: string;
  is_system: boolean; // true = system-wide, false = tenant-specific
  updated_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface EtlParameter {
  id?: string;
  tenant_id: string;
  parameter_name: string;
  parameter_type: 'fx_rate' | 'inflation_rate' | 'custom';
  currency_pair?: string; // For fx_rate: 'USD/THB'
  value: number;
  effective_date: Date;
  created_by: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface TenantApproval {
  id?: string;
  tenant_id: string;
  tenant_name: string;
  requested_by: string;
  request_date: Date;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  approval_date?: Date;
  rejection_reason?: string;
  metadata?: any;
}

export interface AuditLog {
  id?: string;
  tenant_id: string;
  user_email: string;
  action: string; // 'create', 'update', 'delete', 'approve', 'reject', etc.
  resource_type: string; // 'statement', 'scenario', 'user', etc.
  resource_id?: string;
  changes?: any; // JSON with before/after
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create admin schema (system-wide, in central DB)
   */
  async createAdminSchema(): Promise<void> {
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      // System config table
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255),
          config_key VARCHAR(255) UNIQUE NOT NULL,
          config_value JSONB NOT NULL,
          description TEXT,
          is_system BOOLEAN DEFAULT false,
          updated_by VARCHAR(255),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_config_key ON system_config(config_key);
        CREATE INDEX IF NOT EXISTS idx_config_tenant ON system_config(tenant_id);
      `);

      // Tenant approvals table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tenant_approvals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          tenant_name VARCHAR(255) NOT NULL,
          requested_by VARCHAR(255) NOT NULL,
          request_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
          approved_by VARCHAR(255),
          approval_date TIMESTAMPTZ,
          rejection_reason TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_approvals_status ON tenant_approvals(status);
        CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON tenant_approvals(tenant_id);
      `);

      await client.query('COMMIT');

      this.logger.info('Admin schema created successfully (central DB)');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create admin schema', {
        error: (error as any).message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create tenant-specific admin tables
   */
  async createTenantAdminSchema(tenantId: string): Promise<void> {
    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // ETL parameters table (tenant-specific)
      await client.query(`
        CREATE TABLE IF NOT EXISTS etl_parameters (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          parameter_name VARCHAR(255) NOT NULL,
          parameter_type VARCHAR(50) NOT NULL CHECK (parameter_type IN ('fx_rate', 'inflation_rate', 'custom')),
          currency_pair VARCHAR(20),
          value NUMERIC(18, 6) NOT NULL,
          effective_date DATE NOT NULL,
          created_by VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_etl_params_type ON etl_parameters(parameter_type);
        CREATE INDEX IF NOT EXISTS idx_etl_params_date ON etl_parameters(effective_date);
        CREATE INDEX IF NOT EXISTS idx_etl_params_currency ON etl_parameters(currency_pair);
      `);

      // Audit log table (tenant-specific)
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          user_email VARCHAR(255) NOT NULL,
          action VARCHAR(100) NOT NULL,
          resource_type VARCHAR(100) NOT NULL,
          resource_id VARCHAR(255),
          changes JSONB,
          ip_address VARCHAR(45),
          user_agent TEXT,
          timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_email);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
        CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      `);

      await client.query('COMMIT');

      this.logger.info('Tenant admin schema created successfully', { tenantId });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create tenant admin schema', {
        error: (error as any).message,
        tenantId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ============ System Config ============

  /**
   * Set system config
   */
  async setConfig(config: SystemConfig, adminUser: string): Promise<SystemConfig> {
    this.logger.info('Setting system config', {
      configKey: config.config_key,
      isSystem: config.is_system,
    });

    const result = await this.db.query(
      `INSERT INTO system_config 
       (tenant_id, config_key, config_value, description, is_system, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (config_key)
       DO UPDATE SET
         config_value = EXCLUDED.config_value,
         description = EXCLUDED.description,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        config.tenant_id || null,
        config.config_key,
        JSON.stringify(config.config_value),
        config.description || null,
        config.is_system === true,
        adminUser,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get config by key
   */
  async getConfig(configKey: string, tenantId?: string): Promise<SystemConfig | null> {
    let query = 'SELECT * FROM system_config WHERE config_key = $1';
    const params: any[] = [configKey];

    // If tenant-specific, filter by tenant
    if (tenantId) {
      query += ' AND (tenant_id = $2 OR is_system = true)';
      params.push(tenantId);
    }

    const result = await this.db.query(query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List all configs
   */
  async listConfigs(tenantId?: string, systemOnly: boolean = false): Promise<SystemConfig[]> {
    let query = 'SELECT * FROM system_config WHERE 1=1';
    const params: any[] = [];

    if (systemOnly) {
      query += ' AND is_system = true';
    } else if (tenantId) {
      query += ' AND (tenant_id = $1 OR is_system = true)';
      params.push(tenantId);
    }

    query += ' ORDER BY config_key';

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Delete config
   */
  async deleteConfig(configKey: string): Promise<void> {
    await this.db.query('DELETE FROM system_config WHERE config_key = $1', [configKey]);
    this.logger.info('Config deleted', { configKey });
  }

  // ============ ETL Parameters ============

  /**
   * Set ETL parameter
   */
  async setEtlParameter(tenantId: string, param: EtlParameter): Promise<EtlParameter> {
    this.logger.info('Setting ETL parameter', {
      tenantId,
      parameterName: param.parameter_name,
      parameterType: param.parameter_type,
    });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO etl_parameters 
       (tenant_id, parameter_name, parameter_type, currency_pair, value, effective_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        param.parameter_name,
        param.parameter_type,
        param.currency_pair || null,
        param.value,
        param.effective_date,
        param.created_by,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get latest ETL parameter
   */
  async getEtlParameter(
    tenantId: string,
    parameterName: string,
    effectiveDate?: Date,
  ): Promise<EtlParameter | null> {
    let query = `
      SELECT * FROM etl_parameters 
      WHERE parameter_name = $1
    `;
    const params: any[] = [parameterName];

    if (effectiveDate) {
      query += ' AND effective_date <= $2';
      params.push(effectiveDate);
    }

    query += ' ORDER BY effective_date DESC LIMIT 1';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List ETL parameters
   */
  async listEtlParameters(
    tenantId: string,
    parameterType?: string,
  ): Promise<EtlParameter[]> {
    let query = 'SELECT * FROM etl_parameters WHERE 1=1';
    const params: any[] = [];

    if (parameterType) {
      query += ' AND parameter_type = $1';
      params.push(parameterType);
    }

    query += ' ORDER BY effective_date DESC, parameter_name';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Delete ETL parameter
   */
  async deleteEtlParameter(tenantId: string, parameterId: string): Promise<void> {
    await this.db.queryTenant(
      tenantId,
      'DELETE FROM etl_parameters WHERE id = $1',
      [parameterId],
    );
    this.logger.info('ETL parameter deleted', { tenantId, parameterId });
  }

  // ============ Tenant Approvals ============

  /**
   * Create tenant approval request
   */
  async createApprovalRequest(
    tenantId: string,
    tenantName: string,
    requestedBy: string,
    metadata?: any,
  ): Promise<TenantApproval> {
    this.logger.info('Creating approval request', { tenantId, tenantName, requestedBy });

    const result = await this.db.query(
      `INSERT INTO tenant_approvals 
       (tenant_id, tenant_name, requested_by, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, tenantName, requestedBy, metadata ? JSON.stringify(metadata) : null],
    );

    return result.rows[0];
  }

  /**
   * List approval requests
   */
  async listApprovalRequests(status?: string): Promise<TenantApproval[]> {
    let query = 'SELECT * FROM tenant_approvals WHERE 1=1';
    const params: any[] = [];

    if (status) {
      query += ' AND status = $1';
      params.push(status);
    }

    query += ' ORDER BY request_date DESC';

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Approve tenant
   */
  async approveTenant(
    tenantId: string,
    approvedBy: string,
  ): Promise<TenantApproval> {
    this.logger.info('Approving tenant', { tenantId, approvedBy });

    const result = await this.db.query(
      `UPDATE tenant_approvals 
       SET status = 'approved', 
           approved_by = $1, 
           approval_date = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $2 AND status = 'pending'
       RETURNING *`,
      [approvedBy, tenantId],
    );

    if (result.rows.length === 0) {
      throw new Error('No pending approval found for tenant');
    }

    return result.rows[0];
  }

  /**
   * Reject tenant
   */
  async rejectTenant(
    tenantId: string,
    approvedBy: string,
    reason: string,
  ): Promise<TenantApproval> {
    this.logger.info('Rejecting tenant', { tenantId, approvedBy });

    const result = await this.db.query(
      `UPDATE tenant_approvals 
       SET status = 'rejected', 
           approved_by = $1, 
           approval_date = CURRENT_TIMESTAMP,
           rejection_reason = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $3 AND status = 'pending'
       RETURNING *`,
      [approvedBy, reason, tenantId],
    );

    if (result.rows.length === 0) {
      throw new Error('No pending approval found for tenant');
    }

    return result.rows[0];
  }

  // ============ Audit Logs ============

  /**
   * Write audit log
   */
  async writeAuditLog(tenantId: string, log: AuditLog): Promise<void> {
    await this.db.queryTenant(
      tenantId,
      `INSERT INTO audit_logs 
       (tenant_id, user_email, action, resource_type, resource_id, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId,
        log.user_email,
        log.action,
        log.resource_type,
        log.resource_id || null,
        log.changes ? JSON.stringify(log.changes) : null,
        log.ip_address || null,
        log.user_agent || null,
      ],
    );

    this.logger.debug('Audit log written', {
      tenantId,
      action: log.action,
      resourceType: log.resource_type,
    });
  }

  /**
   * Query audit logs
   */
  async queryAuditLogs(
    tenantId: string,
    filters: {
      userEmail?: string;
      action?: string;
      resourceType?: string;
      resourceId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    },
  ): Promise<AuditLog[]> {
    let query = 'SELECT * FROM audit_logs WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.userEmail) {
      query += ` AND user_email = $${paramIndex++}`;
      params.push(filters.userEmail);
    }

    if (filters.action) {
      query += ` AND action = $${paramIndex++}`;
      params.push(filters.action);
    }

    if (filters.resourceType) {
      query += ` AND resource_type = $${paramIndex++}`;
      params.push(filters.resourceType);
    }

    if (filters.resourceId) {
      query += ` AND resource_id = $${paramIndex++}`;
      params.push(filters.resourceId);
    }

    if (filters.startDate) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    query += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(filters.limit);
    }

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }
}
