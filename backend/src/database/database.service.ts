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
      max: 30,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Query timeout: 30 seconds (prevent long-running queries)
      query_timeout: 30000,
      // Statement timeout for PostgreSQL
      statement_timeout: 30000
    });

    // Pool error handler - prevent unhandled pool errors from crashing app
    this.pool.on('error', (err, client) => {
      this.logger.error('Unexpected pool error', { error: err.message });
    });

    // Pool connect event - log new connections
    this.pool.on('connect', (client) => {
      this.logger.debug('New client connected to main pool');
      // Set statement timeout for this connection
      client.query('SET statement_timeout = 30000').catch((err) => {
        this.logger.warn('Failed to set statement timeout', { error: err.message });
      });
    });

    this.logger.info('Database connection pool initialized', {
      host: this.pool.options.host,
      port: this.pool.options.port,
      max: this.pool.options.max,
      queryTimeout: 30000
    });
  }

  async query(text: string, params?: any[]) {
    const start = Date.now();
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.pool.query(text, params);
        const duration = Date.now() - start;
        
        // Log slow queries (> 1 second)
        if (duration > 1000) {
          this.logger.warn('Slow query detected', { 
            text: text.substring(0, 100), 
            duration, 
            rows: res.rowCount,
            attempt: attempt > 0 ? attempt : undefined
          });
        } else {
          this.logger.debug('Query executed', { text: text.substring(0, 100), duration, rows: res.rowCount });
        }
        
        return res;
      } catch (err: any) {
        lastError = err;
        const duration = Date.now() - start;
        
        // Check if this is a transient error that we should retry
        const isTransientError = err.code === 'ECONNRESET' || 
                                 err.code === 'ECONNREFUSED' || 
                                 err.code === '57P03' || // cannot_connect_now
                                 err.code === '53300'; // too_many_connections
        
        if (isTransientError && attempt < maxRetries) {
          this.logger.warn('Transient query error, retrying', { 
            text: text.substring(0, 100), 
            error: err.message, 
            code: err.code,
            attempt: attempt + 1,
            duration 
          });
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }
        
        this.logger.error('Query failed', { 
          text: text.substring(0, 100), 
          error: err.message, 
          code: err.code,
          duration,
          attempts: attempt + 1
        });
        throw err;
      }
    }
    
    throw lastError;
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
      max: 15,
      min: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // Query timeout: 30 seconds
      query_timeout: 30000,
      // Statement timeout for PostgreSQL
      statement_timeout: 30000
    });

    // Tenant pool error handler
    tenantPool.on('error', (err, client) => {
      this.logger.error('Unexpected tenant pool error', { tenantId, error: err.message });
    });

    // Tenant pool connect event
    tenantPool.on('connect', (client) => {
      this.logger.debug('New client connected to tenant pool', { tenantId });
      // Set statement timeout for this connection
      client.query('SET statement_timeout = 30000').catch((err) => {
        this.logger.warn('Failed to set statement timeout for tenant', { tenantId, error: err.message });
      });
    });

    this.tenantPools.set(tenantId, tenantPool);
    this.logger.info('Created tenant pool', { tenantId, dbName: db_name, max: 15, queryTimeout: 30000 });
    
    return tenantPool;
  }

  /**
   * Execute query on tenant database
   */
  async queryTenant(tenantId: string, text: string, params?: any[]) {
    const pool = await this.getTenantPool(tenantId);
    const start = Date.now();
    const maxRetries = 2;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        
        // Log slow queries (> 1 second)
        if (duration > 1000) {
          this.logger.warn('Slow tenant query detected', { 
            tenantId, 
            text: text.substring(0, 100), 
            duration, 
            rows: res.rowCount,
            attempt: attempt > 0 ? attempt : undefined
          });
        } else {
          this.logger.debug('Tenant query executed', { tenantId, text: text.substring(0, 100), duration, rows: res.rowCount });
        }
        
        return res;
      } catch (err: any) {
        lastError = err;
        const duration = Date.now() - start;
        
        // Check if this is a transient error that we should retry
        const isTransientError = err.code === 'ECONNRESET' || 
                                 err.code === 'ECONNREFUSED' || 
                                 err.code === '57P03' || // cannot_connect_now
                                 err.code === '53300'; // too_many_connections
        
        if (isTransientError && attempt < maxRetries) {
          this.logger.warn('Transient tenant query error, retrying', { 
            tenantId,
            text: text.substring(0, 100), 
            error: err.message, 
            code: err.code,
            attempt: attempt + 1,
            duration 
          });
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }
        
        this.logger.error('Tenant query failed', { 
          tenantId, 
          text: text.substring(0, 100), 
          error: err.message, 
          code: err.code,
          duration,
          attempts: attempt + 1
        });
        throw err;
      }
    }
    
    throw lastError;
  }

  /**
   * Get client from tenant pool
   */
  async getTenantClient(tenantId: string): Promise<PoolClient> {
    const pool = await this.getTenantPool(tenantId);
    return pool.connect();
  }

  /**
   * Health check - verify database connectivity
   */
  async healthCheck(): Promise<{ healthy: boolean; mainPool: any; tenantPools: any }> {
    try {
      // Check main pool
      const mainResult = await this.pool.query('SELECT 1 as health_check');
      const mainHealthy = mainResult.rows[0]?.health_check === 1;

      // Check tenant pools
      const tenantPoolHealth: any = {};
      for (const [tenantId, pool] of this.tenantPools.entries()) {
        try {
          await pool.query('SELECT 1 as health_check');
          tenantPoolHealth[tenantId] = { healthy: true, size: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount };
        } catch (err) {
          tenantPoolHealth[tenantId] = { healthy: false, error: (err as any).message };
        }
      }

      return {
        healthy: mainHealthy,
        mainPool: {
          totalCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        },
        tenantPools: tenantPoolHealth
      };
    } catch (err) {
      this.logger.error('Health check failed', { error: (err as any).message });
      return {
        healthy: false,
        mainPool: { error: (err as any).message },
        tenantPools: {}
      };
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getPoolStats() {
    const stats = {
      mainPool: {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount
      },
      tenantPools: {} as any
    };

    for (const [tenantId, pool] of this.tenantPools.entries()) {
      stats.tenantPools[tenantId] = {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      };
    }

    return stats;
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
