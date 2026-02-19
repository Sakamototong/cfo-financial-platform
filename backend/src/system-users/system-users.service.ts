import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface SystemUser {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'system_user';
  is_active: boolean;
  created_at: Date;
  last_login_at?: Date;
}

export interface UserTenantMembership {
  id: string;
  user_id: string;
  tenant_id: string;
  tenant_role: 'admin' | 'analyst' | 'viewer';
  joined_at: Date;
}

// In-memory cache for super admin lookups (avoids DB hit on every request)
interface CachedUser {
  user: SystemUser | null;
  expiry: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute cache

@Injectable()
export class SystemUsersService {
  private userCache = new Map<string, CachedUser>();

  constructor(private readonly db: DatabaseService) {}

  /**
   * Helper: run a query on the system pool and always release the client.
   * This prevents connection leaks that previously exhausted the pool.
   */
  private async systemQuery(text: string, params: any[] = []): Promise<any> {
    const client = await this.db.getSystemClient();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  /**
   * Create a new system user in the central registry
   */
  async createSystemUser(data: {
    email: string;
    full_name: string;
    role: 'super_admin' | 'system_user';
  }): Promise<SystemUser> {
    const result = await this.systemQuery(
      `INSERT INTO system_users (email, full_name, role, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [data.email, data.full_name, data.role]
    );
    this.invalidateCache(data.email);
    return result.rows[0];
  }

  /**
   * Get system user by email (with in-memory cache for hot-path lookups)
   */
  async getSystemUserByEmail(email: string): Promise<SystemUser | null> {
    // Check cache first
    const cached = this.userCache.get(email);
    if (cached && cached.expiry > Date.now()) {
      return cached.user;
    }

    const result = await this.systemQuery(
      `SELECT * FROM system_users WHERE email = $1`,
      [email]
    );
    const user = result.rows[0] || null;

    // Cache the result
    this.userCache.set(email, { user, expiry: Date.now() + CACHE_TTL_MS });

    return user;
  }

  /**
   * Get system user by ID
   */
  async getSystemUserById(id: string): Promise<SystemUser | null> {
    const result = await this.systemQuery(
      `SELECT * FROM system_users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * List all system users (with optional filtering)
   */
  async listSystemUsers(filters?: {
    role?: 'super_admin' | 'system_user';
    is_active?: boolean;
  }): Promise<SystemUser[]> {
    let query = `SELECT * FROM system_users WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.role) {
      query += ` AND role = $${paramIndex++}`;
      params.push(filters.role);
    }

    if (filters?.is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(filters.is_active);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.systemQuery(query, params);
    return result.rows;
  }

  /**
   * Update system user
   */
  async updateSystemUser(
    id: string,
    data: Partial<Pick<SystemUser, 'full_name' | 'role' | 'is_active'>>
  ): Promise<SystemUser> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      params.push(data.full_name);
    }

    if (data.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      params.push(data.role);
    }

    if (data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(data.is_active);
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    const result = await this.systemQuery(
      `UPDATE system_users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    this.clearCache();
    return result.rows[0];
  }

  /**
   * Assign user to tenant with a specific role
   */
  async assignUserToTenant(
    userId: string,
    tenantId: string,
    role: 'admin' | 'analyst' | 'viewer'
  ): Promise<UserTenantMembership> {
    const result = await this.systemQuery(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, tenant_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET tenant_role = $3, joined_at = now()
       RETURNING *`,
      [userId, tenantId, role]
    );
    return result.rows[0];
  }

  /**
   * Remove user from tenant
   */
  async removeUserFromTenant(userId: string, tenantId: string): Promise<void> {
    await this.systemQuery(
      `DELETE FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }

  /**
   * Get all tenants for a user
   */
  async getUserTenants(userId: string): Promise<Array<{
    tenant_id: string;
    tenant_role: string;
    joined_at: Date;
  }>> {
    const result = await this.systemQuery(
      `SELECT tenant_id, tenant_role, joined_at
       FROM user_tenant_memberships
       WHERE user_id = $1
       ORDER BY joined_at DESC`,
      [userId]
    );
    return result.rows;
  }

  /**
   * Get all users for a tenant
   */
  async getTenantUsers(tenantId: string): Promise<Array<{
    user_id: string;
    email: string;
    full_name: string;
    tenant_role: string;
    is_active: boolean;
    joined_at: Date;
  }>> {
    const result = await this.systemQuery(
      `SELECT
        su.id as user_id,
        su.email,
        su.full_name,
        utm.tenant_role,
        su.is_active,
        utm.joined_at
       FROM user_tenant_memberships utm
       JOIN system_users su ON su.id = utm.user_id
       WHERE utm.tenant_id = $1
       ORDER BY utm.joined_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  /**
   * Check if user has access to tenant
   */
  async hasAccessToTenant(userId: string, tenantId: string): Promise<boolean> {
    const result = await this.systemQuery(
      `SELECT 1 FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get user's role in a specific tenant
   */
  async getUserRoleInTenant(
    userId: string,
    tenantId: string
  ): Promise<'admin' | 'analyst' | 'viewer' | null> {
    const result = await this.systemQuery(
      `SELECT tenant_role FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    return result.rows[0]?.tenant_role || null;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    await this.systemQuery(
      `UPDATE system_users SET last_login_at = now() WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Search users across the system
   */
  async searchUsers(query: string, limit = 50): Promise<SystemUser[]> {
    const result = await this.systemQuery(
      `SELECT * FROM system_users
       WHERE email ILIKE $1 OR full_name ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [`%${query}%`, limit]
    );
    return result.rows;
  }

  /**
   * Get super admins
   */
  async getSuperAdmins(): Promise<SystemUser[]> {
    return this.listSystemUsers({ role: 'super_admin', is_active: true });
  }

  /**
   * Delete system user
   */
  async deleteSystemUser(userId: string): Promise<void> {
    await this.systemQuery(
      `DELETE FROM system_users WHERE id = $1`,
      [userId]
    );
    this.clearCache();
  }

  /** Invalidate cache for a specific email */
  private invalidateCache(email: string): void {
    this.userCache.delete(email);
  }

  /** Clear entire cache */
  private clearCache(): void {
    this.userCache.clear();
  }
}
