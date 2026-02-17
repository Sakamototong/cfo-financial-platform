import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private pool: Pool;
  private tenantPools: Map<string, Pool> = new Map();

  constructor(private readonly logger: LoggerService) {
    this.pool = new Pool({
      user: process.env.PG_ROOT_USER || 'postgres',
      password: process.env.PG_ROOT_PASSWORD || 'postgres',
      host: process.env.PG_HOST || 'localhost',
      port: Number(process.env.PG_PORT || 5432),
      database: 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
    this.logger.info('Database connection pool initialized', {
      host: this.pool.options.host,
      port: this.pool.options.port,
      max: this.pool.options.max
    });
  }

  async query(text: string, params?: any[]) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      this.logger.debug('Query executed', { text, duration, rows: res.rowCount });
      return res;
    } catch (err) {
      this.logger.error('Query failed', { text, error: (err as any).message });
      throw err;
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Get system client (for central postgres database)
   * Used for system_users, subscription_plans, etc.
   */
  async getSystemClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Get tenant-specific database pool
   * Creates a new pool if not exists
   */
  async getTenantPool(tenantId: string): Promise<Pool> {
    if (this.tenantPools.has(tenantId)) {
      return this.tenantPools.get(tenantId)!;
    }

    // Query central database for tenant connection info
    const result = await this.query(
      'SELECT db_name, db_user, encrypted_password FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const { db_name, db_user, encrypted_password } = result.rows[0];
    
    // Use root credentials to connect (root user has been granted access during tenant creation)
    const tenantPool = new Pool({
      user: process.env.PG_ROOT_USER || 'postgres',
      password: process.env.PG_ROOT_PASSWORD || 'postgres',
      host: process.env.PG_HOST || 'localhost',
      port: Number(process.env.PG_PORT || 5432),
      database: db_name,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    this.tenantPools.set(tenantId, tenantPool);
    this.logger.info('Created tenant pool', { tenantId, dbName: db_name });
    
    return tenantPool;
  }

  /**
   * Execute query on tenant database
   */
  async queryTenant(tenantId: string, text: string, params?: any[]) {
    const pool = await this.getTenantPool(tenantId);
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      this.logger.debug('Tenant query executed', { tenantId, text, duration, rows: res.rowCount });
      return res;
    } catch (err) {
      this.logger.error('Tenant query failed', { tenantId, text, error: (err as any).message });
      throw err;
    }
  }

  /**
   * Get client from tenant pool
   */
  async getTenantClient(tenantId: string): Promise<PoolClient> {
    const pool = await this.getTenantPool(tenantId);
    return pool.connect();
  }

  async onModuleDestroy() {
    await this.pool.end();
    for (const [tenantId, pool] of this.tenantPools.entries()) {
      await pool.end();
      this.logger.info('Tenant pool closed', { tenantId });
    }
    this.logger.info('Database pool closed');
  }

  async onModuleInit() {
    // Ensure legacy check constraints that restrict scenario values are removed for existing tenants
    try {
      const res = await this.query('SELECT id FROM tenants');
      for (const row of res.rows) {
        const tenantId = row.id;
        try {
          const pool = await this.getTenantPool(tenantId);
          const client = await pool.connect();
          try {
            await client.query(`ALTER TABLE financial_statements DROP CONSTRAINT IF EXISTS financial_statements_scenario_check`);
            this.logger.info('Dropped legacy scenario check constraint for tenant', { tenantId });
          } finally {
            client.release();
          }
        } catch (err) {
          this.logger.warn('Could not drop scenario constraint for tenant', { tenantId, error: (err as any)?.message });
        }
      }
    } catch (err) {
      // Ignore if tenants table doesn't exist yet
      this.logger.debug('Skipping tenant migration; tenants table may not exist yet');
    }
  }
}
