import { Injectable } from '@nestjs/common';
import { KmsService } from '../kms/kms.service';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { Client } from 'pg';
import { randomBytes } from 'crypto';

interface TenantRecord {
  id: string;
  name: string;
  dbName: string;
  dbUser: string;
  encryptedPassword: string;
  connectionString: string;
}

@Injectable()
export class TenantService {
  private readonly store = new Map<string, TenantRecord>();
  private rootConfig: { user: string; password: string; host: string; port: number };

  constructor(
    private readonly kms: KmsService,
    private readonly db: DatabaseService,
    private readonly logger: LoggerService
  ) {
    this.rootConfig = {
      user: process.env.PG_ROOT_USER || 'postgres',
      password: process.env.PG_ROOT_PASSWORD || 'postgres',
      host: process.env.PG_HOST || 'localhost',
      port: Number(process.env.PG_PORT || 5432)
    };
  }

  async createTenant(name: string, tenantId?: string) {
    this.logger.info('Creating tenant', { name, tenantId });
    const safeName = name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const id = tenantId || randomBytes(8).toString('hex');
    const dbName = `tenant_${safeName}_${id}`;
    const dbUser = `u_${safeName}_${id}`;
    const dbPassword = randomBytes(16).toString('hex');

    const rootClient = new Client({
      user: this.rootConfig.user,
      password: this.rootConfig.password,
      host: this.rootConfig.host,
      port: this.rootConfig.port,
      database: 'postgres'
    });

    await rootClient.connect();

    try {
      // Create database
      await rootClient.query(`CREATE DATABASE "${dbName}"`);
      this.logger.info('Created database', { dbName });
    } catch (e: any) {
      if (!/already exists/.test(e.message)) {
        await rootClient.end();
        throw e;
      }
    }

    try {
      // Create role/user
      await rootClient.query(`CREATE USER "${dbUser}" WITH PASSWORD '${dbPassword}'`);
      this.logger.info('Created user', { dbUser });
    } catch (e: any) {
      if (!/already exists/.test(e.message)) {
        await rootClient.end();
        throw e;
      }
    }

    await rootClient.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${dbUser}"`);
    // Also grant root user access to tenant database for admin operations
    await rootClient.query(`GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${this.rootConfig.user}"`);
    
    // Ensure the tenant user owns the public schema in the newly created database
    const adminTenantClient = new Client({
      user: this.rootConfig.user,
      password: this.rootConfig.password,
      host: this.rootConfig.host,
      port: this.rootConfig.port,
      database: dbName
    });
    await adminTenantClient.connect();
    try {
      await adminTenantClient.query(`ALTER SCHEMA public OWNER TO "${dbUser}"`);
      // Grant root user full access to public schema
      await adminTenantClient.query(`GRANT ALL ON SCHEMA public TO "${this.rootConfig.user}"`);
      await adminTenantClient.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO "${this.rootConfig.user}"`);
      await adminTenantClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "${this.rootConfig.user}"`);
    } catch (err) {
      this.logger.warn('Could not set schema permissions', { error: (err as any)?.message });
    } finally {
      await adminTenantClient.end();
    }
    await rootClient.end();

    // Connect to tenant DB and create a minimal schema
    const tenantClient = new Client({
      user: dbUser,
      password: dbPassword,
      host: this.rootConfig.host,
      port: this.rootConfig.port,
      database: dbName
    });

    await tenantClient.connect();
    
    // Create basic tenant_data table
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS tenant_data (
        id serial PRIMARY KEY,
        key text,
        value text,
        created_at timestamptz DEFAULT now()
      )
    `);

    // Create financial schema tables for Phase 1
    await this.createFinancialSchema(tenantClient);
    
    await tenantClient.end();

    // Encrypt password and store
    const encryptedPassword = await this.kms.encrypt(dbPassword);
    const connectionString = `postgresql://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@${this.rootConfig.host}:${this.rootConfig.port}/${dbName}`;

    const rec: TenantRecord = {
      id,
      name,
      dbName,
      dbUser,
      encryptedPassword,
      connectionString
    };
    this.store.set(id, rec);

    // Persist tenant metadata to central tenants table using pool
    try {
      await this.db.query(
        `INSERT INTO tenants(id, name, db_name, db_user, encrypted_password) VALUES($1,$2,$3,$4,$5)`,
        [id, name, dbName, dbUser, encryptedPassword]
      );
      this.logger.info('Tenant metadata persisted', { tenantId: id });
    } catch (err) {
      this.logger.error('Could not persist tenant metadata', { error: (err as any)?.message });
    }

    return {
      id,
      name,
      dbName,
      dbUser,
      message: 'Tenant database created successfully'
    };
  }

  /**
   * Create financial schema tables in tenant database
   */
  private async createFinancialSchema(tenantClient: Client): Promise<void> {
    this.logger.info('Creating financial schema for tenant');

    // Financial Statements
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS financial_statements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        statement_type VARCHAR(50) NOT NULL CHECK (statement_type IN ('PL', 'BS', 'CF')),
        period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        scenario VARCHAR(50) DEFAULT 'actual',
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'locked')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),
        UNIQUE (tenant_id, statement_type, period_start, period_end, scenario)
      )
    `);

    // Line Items
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS financial_line_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        statement_id UUID NOT NULL REFERENCES financial_statements(id) ON DELETE CASCADE,
        line_code VARCHAR(50) NOT NULL,
        line_name VARCHAR(255) NOT NULL,
        parent_code VARCHAR(50),
        line_order INTEGER DEFAULT 0,
        amount NUMERIC(20, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(3) DEFAULT 'THB',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_line_items_statement ON financial_line_items(statement_id);
      CREATE INDEX IF NOT EXISTS idx_line_items_code ON financial_line_items(line_code);
    `);

    // Scenarios
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        scenario_name VARCHAR(100) NOT NULL,
        scenario_type VARCHAR(50) NOT NULL CHECK (scenario_type IN ('best', 'base', 'worst', 'custom', 'ai_generated')),
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(255),
        UNIQUE (tenant_id, scenario_name)
      )
    `);

    // If an older check constraint exists that restricts scenario values, drop it so arbitrary scenario names are allowed
    try {
      await tenantClient.query(`ALTER TABLE financial_statements DROP CONSTRAINT IF EXISTS financial_statements_scenario_check`);
      this.logger.info('Dropped legacy scenario check constraint if it existed');
    } catch (err) {
      this.logger.warn('Could not drop legacy scenario check constraint', { error: (err as any)?.message });
    }

    // Scenario Assumptions
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS scenario_assumptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scenario_id UUID NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        assumption_category VARCHAR(50) NOT NULL CHECK (assumption_category IN ('revenue', 'expense', 'asset', 'liability', 'depreciation', 'tax', 'other')),
        assumption_key VARCHAR(100) NOT NULL,
        assumption_value NUMERIC(20, 4),
        assumption_unit VARCHAR(20),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_assumptions_scenario ON scenario_assumptions(scenario_id);
    `);

    // Import History
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS import_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        import_type VARCHAR(50) NOT NULL CHECK (import_type IN ('excel', 'csv', 'api', 'manual')),
        file_name VARCHAR(255),
        file_size INTEGER,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        rows_imported INTEGER DEFAULT 0,
        rows_failed INTEGER DEFAULT 0,
        error_log TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        created_by VARCHAR(255)
      );
      CREATE INDEX IF NOT EXISTS idx_import_history_tenant ON import_history(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_import_history_status ON import_history(status);
    `);

    // Audit Log
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID NOT NULL,
        action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete', 'approve', 'lock')),
        changes JSONB,
        performed_by VARCHAR(255) NOT NULL,
        performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ip_address INET
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_performed ON audit_log(performed_at DESC);
    `);

    // Dimension Configuration
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS dimension_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        dimension_type VARCHAR(50) NOT NULL CHECK (dimension_type IN ('row', 'column')),
        dimension_name VARCHAR(100) NOT NULL,
        hierarchy_level INTEGER DEFAULT 0,
        parent_id UUID REFERENCES dimension_config(id) ON DELETE CASCADE,
        is_custom BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tenant_id, dimension_type, dimension_name)
      );
      CREATE INDEX IF NOT EXISTS idx_dimension_tenant ON dimension_config(tenant_id);
    `);

    // DIM: dimensions, hierarchies and statement templates used by DIM feature
    await tenantClient.query(`
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

    // Projections (for storing generated projections)
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS projections (
        id VARCHAR(100) PRIMARY KEY,
        tenant_id VARCHAR(255),
        base_statement_id VARCHAR(100),
        scenario_id VARCHAR(100),
        projection_periods INTEGER,
        period_type VARCHAR(20),
        statement_count INTEGER,
        ratios JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_projections_tenant ON projections(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_projections_scenario ON projections(scenario_id);
    `);

    // Projected Statements (detailed projection results)
    await tenantClient.query(`
      CREATE TABLE IF NOT EXISTS projected_statements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        projection_id VARCHAR(100) NOT NULL,
        statement_type VARCHAR(50) NOT NULL,
        period_number INTEGER NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        line_items JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_projected_statements_projection ON projected_statements(projection_id);
    `);

    this.logger.info('Financial schema created successfully');
  }

  async getTenant(id: string) {
    // Try in-memory first
    let rec = this.store.get(id);
    if (!rec) {
      // Fallback: load from central DB using pool
      try {
        const res = await this.db.query('SELECT id, name, db_name, db_user, encrypted_password FROM tenants WHERE id=$1', [id]);
        if (res.rowCount === 0) return null;
        const row = res.rows[0];
        rec = {
          id: row.id,
          name: row.name,
          dbName: row.db_name,
          dbUser: row.db_user,
          encryptedPassword: row.encrypted_password,
          connectionString: `postgresql://${encodeURIComponent(row.db_user)}:REDACTED@${this.rootConfig.host}:${this.rootConfig.port}/${row.db_name}`
        };
        this.store.set(id, rec);
        this.logger.info('Tenant loaded from DB', { tenantId: id });
      } catch (err) {
        this.logger.error('Could not load tenant from DB', { tenantId: id, error: (err as any)?.message });
        return null;
      }
    }
    let decryptedPassword = '***';
    try {
      decryptedPassword = await this.kms.decrypt(rec.encryptedPassword);
    } catch (err) {
      this.logger.warn('Could not decrypt tenant password (ephemeral key mismatch)', { tenantId: id });
    }
    return {
      id: rec.id,
      name: rec.name,
      dbName: rec.dbName,
      dbUser: rec.dbUser,
      password: decryptedPassword,
      connectionString: rec.connectionString
    };
  }

  async listTenants() {
    try {
      const res = await this.db.query(
        'SELECT id, name, db_name, db_user, created_at FROM tenants ORDER BY created_at DESC'
      );
      return res.rows.map(row => ({
        id: row.id,
        name: row.name,
        dbName: row.db_name,
        dbUser: row.db_user,
        createdAt: row.created_at
      }));
    } catch (err) {
      this.logger.error('Could not list tenants', { error: (err as any)?.message });
      return [];
    }
  }

  async updateTenant(id: string, data: { name?: string }) {
    try {
      if (data.name) {
        await this.db.query(
          'UPDATE tenants SET name = $1 WHERE id = $2',
          [data.name, id]
        );
        
        // Update in-memory store
        const rec = this.store.get(id);
        if (rec) {
          rec.name = data.name;
        }
        
        this.logger.info('Tenant updated', { tenantId: id, name: data.name });
      }
      
      return { success: true, message: 'Tenant updated successfully' };
    } catch (err) {
      this.logger.error('Could not update tenant', { tenantId: id, error: (err as any)?.message });
      throw new Error(`Failed to update tenant: ${(err as any)?.message}`);
    }
  }

  async deleteTenant(id: string) {
    const rec = await this.getTenant(id);
    if (!rec) {
      throw new Error('Tenant not found');
    }

    const rootClient = new Client({
      user: this.rootConfig.user,
      password: this.rootConfig.password,
      host: this.rootConfig.host,
      port: this.rootConfig.port,
      database: 'postgres'
    });

    await rootClient.connect();

    try {
      // Terminate all connections to the tenant database
      await rootClient.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
      `, [rec.dbName]);

      // Drop database
      await rootClient.query(`DROP DATABASE IF EXISTS "${rec.dbName}"`);
      this.logger.info('Dropped tenant database', { dbName: rec.dbName });

      // Drop user
      await rootClient.query(`DROP USER IF EXISTS "${rec.dbUser}"`);
      this.logger.info('Dropped tenant user', { dbUser: rec.dbUser });

      // Remove from central DB
      await this.db.query('DELETE FROM tenants WHERE id = $1', [id]);
      
      // Remove from in-memory store
      this.store.delete(id);

      this.logger.info('Tenant deleted successfully', { tenantId: id });

      return { success: true, message: 'Tenant deleted successfully' };
    } catch (err) {
      this.logger.error('Could not delete tenant', { tenantId: id, error: (err as any)?.message });
      throw new Error(`Failed to delete tenant: ${(err as any)?.message}`);
    } finally {
      await rootClient.end();
    }
  }
}
