import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { randomBytes } from 'crypto';

export interface User {
  id?: string;
  tenant_id: string;
  email: string;
  full_name: string;
  phone?: string;
  bio?: string;
  role: 'admin' | 'analyst' | 'viewer';
  is_active: boolean;
  last_login?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export interface CompanyProfile {
  id?: string;
  tenant_id: string;
  company_name: string;
  tax_id?: string;
  industry?: string;
  fiscal_year_end?: string; // MM-DD format
  default_currency: string;
  address?: string;
  phone?: string;
  website?: string;
  logo_url?: string;
  settings?: any; // JSON for custom settings
  created_at?: Date;
  updated_at?: Date;
}

export interface UserInvitation {
  id?: string;
  tenant_id: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  invited_by: string;
  invitation_token: string;
  expires_at: Date;
  accepted_at?: Date;
  status: 'pending' | 'accepted' | 'expired';
  created_at?: Date;
}

export interface OwnershipTransferRequest {
  id?: string;
  tenant_id: string;
  current_owner_email: string;
  new_owner_email: string;
  reason?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  requested_at: Date;
  responded_at?: Date;
  response_message?: string;
  created_at?: Date;
  updated_at?: Date;
}

@Injectable()
export class UserService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create user table in tenant database
   */
  async createUserSchema(tenantId: string): Promise<void> {
    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          bio TEXT,
          role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
          is_active BOOLEAN DEFAULT true,
          last_login TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      `);

      // Company profile table
      await client.query(`
        CREATE TABLE IF NOT EXISTS company_profile (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          company_name VARCHAR(255) NOT NULL,
          tax_id VARCHAR(100),
          industry VARCHAR(100),
          fiscal_year_end VARCHAR(5),
          default_currency VARCHAR(3) DEFAULT 'THB',
          address TEXT,
          phone VARCHAR(50),
          website VARCHAR(255),
          logo_url VARCHAR(500),
          settings JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_company_profile_tenant ON company_profile(tenant_id);
      `);

      // User invitations table
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_invitations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL,
          invited_by VARCHAR(255) NOT NULL,
          invitation_token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          accepted_at TIMESTAMPTZ,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON user_invitations(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(invitation_token);
      `);

      // Ownership transfer requests table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ownership_transfer_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          current_owner_email VARCHAR(255) NOT NULL,
          new_owner_email VARCHAR(255) NOT NULL,
          reason TEXT,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
          requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          responded_at TIMESTAMPTZ,
          response_message TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_transfer_requests_tenant ON ownership_transfer_requests(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON ownership_transfer_requests(status);
      `);

      await client.query('COMMIT');

      this.logger.info('User schema created successfully', { tenantId });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create user schema', {
        error: (error as any).message,
        tenantId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create or update user
   */
  async upsertUser(tenantId: string, user: User): Promise<User> {
    this.logger.info('Upserting user', { tenantId, email: user.email });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO users (tenant_id, email, full_name, phone, bio, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) 
       DO UPDATE SET 
         full_name = EXCLUDED.full_name,
         phone = EXCLUDED.phone,
         bio = EXCLUDED.bio,
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [tenantId, user.email, user.full_name, user.phone || null, user.bio || null, user.role, user.is_active !== false],
    );

    return result.rows[0];
  }

  /**
   * Get user by email
   */
  async getUserByEmail(tenantId: string, email: string): Promise<User | null> {
    const result = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM users WHERE email = $1',
      [email],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List all users in tenant
   */
  async listUsers(
    tenantId: string,
    filters?: { role?: string; is_active?: boolean },
  ): Promise<User[]> {
    let query = 'SELECT * FROM users WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.role) {
      query += ` AND role = $${paramIndex}`;
      params.push(filters.role);
      paramIndex++;
    }

    if (filters?.is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(filters.is_active);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Update user role
   */
  async updateUserRole(
    tenantId: string,
    userId: string,
    role: 'admin' | 'analyst' | 'viewer',
  ): Promise<User> {
    const result = await this.db.queryTenant(
      tenantId,
      `UPDATE users 
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [role, userId],
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    this.logger.info('User role updated', { tenantId, userId, role });
    return result.rows[0];
  }

  /**
   * Deactivate user
   */
  async deactivateUser(tenantId: string, userId: string): Promise<void> {
    await this.db.queryTenant(
      tenantId,
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId],
    );

    this.logger.info('User deactivated', { tenantId, userId });
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(tenantId: string, email: string): Promise<void> {
    await this.db.queryTenant(
      tenantId,
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE email = $1',
      [email],
    );
  }

  /**
   * Create or update company profile
   */
  async upsertCompanyProfile(
    tenantId: string,
    profile: CompanyProfile,
  ): Promise<CompanyProfile> {
    this.logger.info('Upserting company profile', { tenantId });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO company_profile 
       (tenant_id, company_name, tax_id, industry, fiscal_year_end, default_currency, 
        address, phone, website, logo_url, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (tenant_id) 
       DO UPDATE SET 
         company_name = EXCLUDED.company_name,
         tax_id = EXCLUDED.tax_id,
         industry = EXCLUDED.industry,
         fiscal_year_end = EXCLUDED.fiscal_year_end,
         default_currency = EXCLUDED.default_currency,
         address = EXCLUDED.address,
         phone = EXCLUDED.phone,
         website = EXCLUDED.website,
         logo_url = EXCLUDED.logo_url,
         settings = EXCLUDED.settings,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        tenantId,
        profile.company_name,
        profile.tax_id || null,
        profile.industry || null,
        profile.fiscal_year_end || null,
        profile.default_currency || 'THB',
        profile.address || null,
        profile.phone || null,
        profile.website || null,
        profile.logo_url || null,
        profile.settings ? JSON.stringify(profile.settings) : null,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get company profile
   */
  async getCompanyProfile(tenantId: string): Promise<CompanyProfile | null> {
    const result = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM company_profile WHERE tenant_id = $1',
      [tenantId],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Create user invitation
   */
  async createInvitation(
    tenantId: string,
    email: string,
    role: 'admin' | 'analyst' | 'viewer',
    invitedBy: string,
  ): Promise<UserInvitation> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO user_invitations 
       (tenant_id, email, role, invited_by, invitation_token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, email, role, invitedBy, token, expiresAt],
    );

    this.logger.info('User invitation created', { tenantId, email, role });
    return result.rows[0];
  }

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string): Promise<UserInvitation | null> {
    // Need to query central database since we don't know tenant yet
    const result = await this.db.query(
      `SELECT i.*, t.name as tenant_name
       FROM user_invitations i
       JOIN tenants t ON t.id = i.tenant_id
       WHERE i.invitation_token = $1 AND i.status = 'pending'`,
      [token],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(
    tenantId: string,
    token: string,
    user: Partial<User>,
  ): Promise<User> {
    // Update invitation status
    await this.db.queryTenant(
      tenantId,
      `UPDATE user_invitations 
       SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP
       WHERE invitation_token = $1`,
      [token],
    );

    // Create user
    return this.upsertUser(tenantId, user as User);
  }

  /**
   * Initiate ownership transfer
   */
  async initiateOwnershipTransfer(
    tenantId: string,
    currentOwnerEmail: string,
    newOwnerEmail: string,
    reason?: string,
  ): Promise<OwnershipTransferRequest> {
    this.logger.info('Initiating ownership transfer', {
      tenantId,
      currentOwner: currentOwnerEmail,
      newOwner: newOwnerEmail,
    });

    // Check if new owner exists and is active
    const newOwner = await this.getUserByEmail(tenantId, newOwnerEmail);
    if (!newOwner) {
      throw new Error('New owner not found in tenant');
    }

    if (!newOwner.is_active) {
      throw new Error('New owner is not active');
    }

    // Check if there's already a pending transfer
    const existingPending = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM ownership_transfer_requests 
       WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId],
    );

    if (existingPending.rows.length > 0) {
      throw new Error('There is already a pending ownership transfer');
    }

    // Create transfer request
    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO ownership_transfer_requests 
       (tenant_id, current_owner_email, new_owner_email, reason, status, requested_at)
       VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP)
       RETURNING *`,
      [tenantId, currentOwnerEmail, newOwnerEmail, reason || null],
    );

    // TODO: Send notification to new owner

    this.logger.info('Ownership transfer request created', {
      requestId: result.rows[0].id,
    });

    return result.rows[0];
  }

  /**
   * Accept ownership transfer
   */
  async acceptOwnershipTransfer(
    tenantId: string,
    transferRequestId: string,
    newOwnerEmail: string,
    message?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.info('Accepting ownership transfer', {
      tenantId,
      transferRequestId,
      newOwner: newOwnerEmail,
    });

    // Get transfer request
    const requestResult = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM ownership_transfer_requests WHERE id = $1 AND tenant_id = $2`,
      [transferRequestId, tenantId],
    );

    if (requestResult.rows.length === 0) {
      throw new Error('Transfer request not found');
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      throw new Error(`Transfer request is ${request.status}, cannot accept`);
    }

    if (request.new_owner_email !== newOwnerEmail) {
      throw new Error('You are not the designated new owner');
    }

    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Update transfer request
      await client.query(
        `UPDATE ownership_transfer_requests 
         SET status = 'accepted', responded_at = CURRENT_TIMESTAMP, response_message = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [message || 'Ownership accepted', transferRequestId],
      );

      // Demote current owner to analyst
      await client.query(
        `UPDATE users SET role = 'analyst', updated_at = CURRENT_TIMESTAMP WHERE email = $1 AND tenant_id = $2`,
        [request.current_owner_email, tenantId],
      );

      // Promote new owner to admin
      await client.query(
        `UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE email = $1 AND tenant_id = $2`,
        [newOwnerEmail, tenantId],
      );

      await client.query('COMMIT');

      this.logger.info('Ownership transferred successfully', {
        transferRequestId,
        previousOwner: request.current_owner_email,
        newOwner: newOwnerEmail,
      });

      return {
        success: true,
        message: 'Ownership transferred successfully',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to accept ownership transfer', {
        error: (error as any).message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject ownership transfer
   */
  async rejectOwnershipTransfer(
    tenantId: string,
    transferRequestId: string,
    newOwnerEmail: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.info('Rejecting ownership transfer', {
      tenantId,
      transferRequestId,
      newOwner: newOwnerEmail,
    });

    // Get transfer request
    const requestResult = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM ownership_transfer_requests WHERE id = $1 AND tenant_id = $2`,
      [transferRequestId, tenantId],
    );

    if (requestResult.rows.length === 0) {
      throw new Error('Transfer request not found');
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      throw new Error(`Transfer request is ${request.status}, cannot reject`);
    }

    if (request.new_owner_email !== newOwnerEmail) {
      throw new Error('You are not the designated new owner');
    }

    // Update transfer request
    await this.db.queryTenant(
      tenantId,
      `UPDATE ownership_transfer_requests 
       SET status = 'rejected', responded_at = CURRENT_TIMESTAMP, response_message = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [reason || 'Ownership rejected', transferRequestId],
    );

    this.logger.info('Ownership transfer rejected', { transferRequestId });

    return {
      success: true,
      message: 'Ownership transfer rejected',
    };
  }

  /**
   * Cancel ownership transfer (by current owner)
   */
  async cancelOwnershipTransfer(
    tenantId: string,
    transferRequestId: string,
    currentOwnerEmail: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.info('Cancelling ownership transfer', {
      tenantId,
      transferRequestId,
      currentOwner: currentOwnerEmail,
    });

    // Get transfer request
    const requestResult = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM ownership_transfer_requests WHERE id = $1 AND tenant_id = $2`,
      [transferRequestId, tenantId],
    );

    if (requestResult.rows.length === 0) {
      throw new Error('Transfer request not found');
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      throw new Error(`Transfer request is ${request.status}, cannot cancel`);
    }

    if (request.current_owner_email !== currentOwnerEmail) {
      throw new Error('You are not the current owner');
    }

    // Update transfer request
    await this.db.queryTenant(
      tenantId,
      `UPDATE ownership_transfer_requests 
       SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [transferRequestId],
    );

    this.logger.info('Ownership transfer cancelled', { transferRequestId });

    return {
      success: true,
      message: 'Ownership transfer cancelled',
    };
  }

  /**
   * Get pending ownership transfer requests
   */
  async getPendingTransferRequests(tenantId: string): Promise<OwnershipTransferRequest[]> {
    const result = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM ownership_transfer_requests 
       WHERE tenant_id = $1 AND status = 'pending'
       ORDER BY requested_at DESC`,
      [tenantId],
    );

    return result.rows;
  }

  /**
   * Get all transfer requests (for admin/audit)
   */
  async getAllTransferRequests(tenantId: string): Promise<OwnershipTransferRequest[]> {
    const result = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM ownership_transfer_requests 
       WHERE tenant_id = $1
       ORDER BY requested_at DESC`,
      [tenantId],
    );

    return result.rows;
  }

  /**
   * List pending invitations
   */
  async listInvitations(tenantId: string): Promise<UserInvitation[]> {
    const result = await this.db.queryTenant(
      tenantId,
      `SELECT * FROM user_invitations 
       WHERE tenant_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [tenantId],
    );

    return result.rows;
  }
}
