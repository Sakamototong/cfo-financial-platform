import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';

export interface ApprovalChain {
  id?: string;
  tenant_id: string;
  chain_name: string;
  document_type: 'statement' | 'scenario' | 'projection' | 'custom';
  steps: ApprovalStep[];
  is_active: boolean;
  created_by: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface ApprovalStep {
  step_order: number;
  approver_role?: string; // 'admin', 'manager', etc.
  approver_email?: string; // Specific user
  approval_type: 'any' | 'all'; // 'any' = any one approver, 'all' = all approvers must approve
  required: boolean;
}

export interface ApprovalRequest {
  id?: string;
  tenant_id: string;
  chain_id: string;
  document_type: string;
  document_id: string;
  document_name: string;
  requested_by: string;
  request_date: Date;
  current_step: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  completed_date?: Date;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export interface ApprovalAction {
  id?: string;
  request_id: string;
  step_order: number;
  approver_email: string;
  action: 'approve' | 'reject' | 'delegate';
  action_date: Date;
  comments?: string;
  delegated_to?: string;
}

export interface ApprovalNotification {
  id?: string;
  tenant_id: string;
  request_id: string;
  recipient_email: string;
  notification_type: 'approval_requested' | 'approved' | 'rejected' | 'completed' | 'delegated';
  sent_date: Date;
  is_read: boolean;
  created_at?: Date;
}

@Injectable()
export class WorkflowService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create workflow schema in tenant database
   */
  async createWorkflowSchema(tenantId: string): Promise<void> {
    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Approval chains table
      await client.query(`
        CREATE TABLE IF NOT EXISTS approval_chains (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          chain_name VARCHAR(255) NOT NULL,
          document_type VARCHAR(50) NOT NULL,
          steps JSONB NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_by VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chains_tenant ON approval_chains(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_chains_type ON approval_chains(document_type);
      `);

      // Approval requests table
      await client.query(`
        CREATE TABLE IF NOT EXISTS approval_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          chain_id UUID NOT NULL REFERENCES approval_chains(id) ON DELETE RESTRICT,
          document_type VARCHAR(50) NOT NULL,
          document_id VARCHAR(255) NOT NULL,
          document_name VARCHAR(255) NOT NULL,
          requested_by VARCHAR(255) NOT NULL,
          request_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          current_step INTEGER DEFAULT 1,
          status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
          completed_date TIMESTAMPTZ,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_requests_status ON approval_requests(status);
        CREATE INDEX IF NOT EXISTS idx_requests_document ON approval_requests(document_type, document_id);
        CREATE INDEX IF NOT EXISTS idx_requests_chain ON approval_requests(chain_id);
      `);

      // Approval actions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS approval_actions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
          step_order INTEGER NOT NULL,
          approver_email VARCHAR(255) NOT NULL,
          action VARCHAR(50) NOT NULL CHECK (action IN ('approve', 'reject', 'delegate')),
          action_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          comments TEXT,
          delegated_to VARCHAR(255)
        );

        CREATE INDEX IF NOT EXISTS idx_actions_request ON approval_actions(request_id);
        CREATE INDEX IF NOT EXISTS idx_actions_approver ON approval_actions(approver_email);
      `);

      // Approval notifications table
      await client.query(`
        CREATE TABLE IF NOT EXISTS approval_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id VARCHAR(255) NOT NULL,
          request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
          recipient_email VARCHAR(255) NOT NULL,
          notification_type VARCHAR(50) NOT NULL,
          sent_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          is_read BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON approval_notifications(recipient_email, is_read);
        CREATE INDEX IF NOT EXISTS idx_notifications_request ON approval_notifications(request_id);
      `);

      await client.query('COMMIT');

      this.logger.info('Workflow schema created successfully', { tenantId });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create workflow schema', {
        error: (error as any).message,
        tenantId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ============ Approval Chains ============

  /**
   * Create or update approval chain
   */
  async upsertApprovalChain(tenantId: string, chain: ApprovalChain): Promise<ApprovalChain> {
    this.logger.info('Upserting approval chain', {
      tenantId,
      chainName: chain.chain_name,
    });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO approval_chains 
       (tenant_id, chain_name, document_type, steps, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        tenantId,
        chain.chain_name,
        chain.document_type,
        JSON.stringify(chain.steps),
        chain.is_active !== false,
        chain.created_by,
      ],
    );

    return result.rows[0];
  }

  /**
   * Get approval chain
   */
  async getApprovalChain(tenantId: string, chainId: string): Promise<ApprovalChain | null> {
    const result = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM approval_chains WHERE id = $1',
      [chainId],
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * List approval chains
   */
  async listApprovalChains(
    tenantId: string,
    documentType?: string,
    activeOnly: boolean = true,
  ): Promise<ApprovalChain[]> {
    let query = 'SELECT * FROM approval_chains WHERE tenant_id = $1';
    const params: any[] = [tenantId];

    if (documentType) {
      query += ' AND document_type = $2';
      params.push(documentType);
    }

    if (activeOnly) {
      query += ' AND is_active = true';
    }

    query += ' ORDER BY chain_name';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Delete approval chain
   */
  async deleteApprovalChain(tenantId: string, chainId: string): Promise<void> {
    await this.db.queryTenant(
      tenantId,
      'DELETE FROM approval_chains WHERE id = $1',
      [chainId],
    );

    this.logger.info('Approval chain deleted', { tenantId, chainId });
  }

  // ============ Approval Requests ============

  /**
   * Create approval request
   */
  async createApprovalRequest(
    tenantId: string,
    request: ApprovalRequest,
  ): Promise<ApprovalRequest> {
    this.logger.info('Creating approval request', {
      tenantId,
      documentType: request.document_type,
      documentId: request.document_id,
    });

    const result = await this.db.queryTenant(
      tenantId,
      `INSERT INTO approval_requests 
       (tenant_id, chain_id, document_type, document_id, document_name, requested_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        tenantId,
        request.chain_id,
        request.document_type,
        request.document_id,
        request.document_name,
        request.requested_by,
        request.metadata ? JSON.stringify(request.metadata) : null,
      ],
    );

    const createdRequest = result.rows[0];

    // Send notification to approvers of step 1
    await this.sendNotifications(tenantId, createdRequest.id, 1, 'approval_requested');

    return createdRequest;
  }

  /**
   * Get approval request
   */
  async getApprovalRequest(tenantId: string, requestId: string): Promise<any> {
    // Get request
    const requestResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM approval_requests WHERE id = $1',
      [requestId],
    );

    if (requestResult.rows.length === 0) {
      return null;
    }

    const request = requestResult.rows[0];

    // Get chain
    const chain = await this.getApprovalChain(tenantId, request.chain_id);

    // Get actions
    const actionsResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM approval_actions WHERE request_id = $1 ORDER BY action_date',
      [requestId],
    );

    return {
      ...request,
      chain,
      actions: actionsResult.rows,
    };
  }

  /**
   * List approval requests
   */
  async listApprovalRequests(
    tenantId: string,
    filters: {
      status?: string;
      documentType?: string;
      requestedBy?: string;
      approverEmail?: string;
    },
  ): Promise<ApprovalRequest[]> {
    let query = 'SELECT ar.* FROM approval_requests ar WHERE ar.tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.status) {
      query += ` AND ar.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.documentType) {
      query += ` AND ar.document_type = $${paramIndex++}`;
      params.push(filters.documentType);
    }

    if (filters.requestedBy) {
      query += ` AND ar.requested_by = $${paramIndex++}`;
      params.push(filters.requestedBy);
    }

    if (filters.approverEmail) {
      // Find requests where this user is a pending approver
      query += ` AND ar.id IN (
        SELECT DISTINCT ar2.id
        FROM approval_requests ar2
        JOIN approval_chains ac ON ar2.chain_id = ac.id
        WHERE ar2.status = 'pending'
        AND jsonb_array_elements(ac.steps)->>'approver_email' = $${paramIndex++}
      )`;
      params.push(filters.approverEmail);
    }

    query += ' ORDER BY ar.request_date DESC';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Take approval action
   */
  async takeAction(
    tenantId: string,
    requestId: string,
    action: ApprovalAction,
  ): Promise<ApprovalRequest> {
    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Get request and chain
      const requestData = await this.getApprovalRequest(tenantId, requestId);
      if (!requestData) {
        throw new Error('Approval request not found');
      }

      if (requestData.status !== 'pending') {
        throw new Error('Request is not pending');
      }

      const chain: ApprovalChain = requestData.chain;
      const currentStep = chain.steps.find(
        (s: ApprovalStep) => s.step_order === requestData.current_step,
      );

      if (!currentStep) {
        throw new Error('Invalid step');
      }

      // Verify approver is authorized
      const isAuthorized =
        currentStep.approver_email === action.approver_email ||
        (currentStep.approver_role && action.approver_email); // TODO: check user role

      if (!isAuthorized) {
        throw new Error('Not authorized to approve this step');
      }

      // Record action
      await client.query(
        `INSERT INTO approval_actions 
         (request_id, step_order, approver_email, action, comments, delegated_to)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          requestId,
          requestData.current_step,
          action.approver_email,
          action.action,
          action.comments || null,
          action.delegated_to || null,
        ],
      );

      let newStatus = requestData.status;
      let newStep = requestData.current_step;

      if (action.action === 'reject') {
        // Rejected - stop workflow
        newStatus = 'rejected';
        await client.query(
          `UPDATE approval_requests 
           SET status = $1, completed_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStatus, requestId],
        );

        await this.sendNotifications(tenantId, requestId, newStep, 'rejected');
      } else if (action.action === 'approve') {
        // Check if this step is complete
        const stepApprovals = await client.query(
          `SELECT COUNT(*) FROM approval_actions 
           WHERE request_id = $1 AND step_order = $2 AND action = 'approve'`,
          [requestId, requestData.current_step],
        );

        const approvalCount = parseInt(stepApprovals.rows[0].count, 10);

        // Move to next step or complete
        if (
          currentStep.approval_type === 'any' ||
          (currentStep.approval_type === 'all' && approvalCount >= 1)
        ) {
          // Step complete, move to next
          const nextStep = chain.steps.find(
            (s: ApprovalStep) => s.step_order === requestData.current_step + 1,
          );

          if (nextStep) {
            newStep = nextStep.step_order;
            await client.query(
              `UPDATE approval_requests 
               SET current_step = $1, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [newStep, requestId],
            );

            await this.sendNotifications(tenantId, requestId, newStep, 'approval_requested');
          } else {
            // No more steps - approved
            newStatus = 'approved';
            await client.query(
              `UPDATE approval_requests 
               SET status = $1, completed_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [newStatus, requestId],
            );

            await this.sendNotifications(tenantId, requestId, newStep, 'approved');
          }
        }
      } else if (action.action === 'delegate') {
        // Delegation - notify delegated user
        await this.sendNotifications(tenantId, requestId, newStep, 'delegated');
      }

      await client.query('COMMIT');

      // Return updated request
      return await this.getApprovalRequest(tenantId, requestId);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to take approval action', {
        error: (error as any).message,
        tenantId,
        requestId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel approval request
   */
  async cancelRequest(
    tenantId: string,
    requestId: string,
    cancelledBy: string,
  ): Promise<ApprovalRequest> {
    await this.db.queryTenant(
      tenantId,
      `UPDATE approval_requests 
       SET status = 'cancelled', completed_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId],
    );

    this.logger.info('Approval request cancelled', { tenantId, requestId, cancelledBy });

    return await this.getApprovalRequest(tenantId, requestId);
  }

  // ============ Notifications ============

  /**
   * Send notifications for approval step
   */
  private async sendNotifications(
    tenantId: string,
    requestId: string,
    stepOrder: number,
    notificationType: string,
  ): Promise<void> {
    // Get request and chain
    const request = await this.getApprovalRequest(tenantId, requestId);
    if (!request || !request.chain) {
      return;
    }

    const step = request.chain.steps.find((s: ApprovalStep) => s.step_order === stepOrder);
    if (!step) {
      return;
    }

    // Determine recipients
    const recipients: string[] = [];
    if (step.approver_email) {
      recipients.push(step.approver_email);
    }
    // TODO: If approver_role, query users with that role

    // Also notify requester for final outcomes
    if (['approved', 'rejected'].includes(notificationType)) {
      recipients.push(request.requested_by);
    }

    // Insert notifications
    for (const recipient of recipients) {
      await this.db.queryTenant(
        tenantId,
        `INSERT INTO approval_notifications 
         (tenant_id, request_id, recipient_email, notification_type)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, requestId, recipient, notificationType],
      );
    }

    this.logger.info('Notifications sent', {
      tenantId,
      requestId,
      recipients: recipients.length,
      notificationType,
    });
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    tenantId: string,
    userEmail: string,
    unreadOnly: boolean = false,
  ): Promise<ApprovalNotification[]> {
    let query = 'SELECT * FROM approval_notifications WHERE recipient_email = $1';
    const params: any[] = [userEmail];

    if (unreadOnly) {
      query += ' AND is_read = false';
    }

    query += ' ORDER BY sent_date DESC';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(
    tenantId: string,
    notificationId: string,
  ): Promise<void> {
    await this.db.queryTenant(
      tenantId,
      'UPDATE approval_notifications SET is_read = true WHERE id = $1',
      [notificationId],
    );
  }
}
