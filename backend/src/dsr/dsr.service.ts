import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KmsService } from '../kms/kms.service';
import {
  CreateDsrRequestDto,
  UpdateDsrRequestDto,
  ApproveDsrRequestDto,
  ProcessDsrRequestDto,
  DsrRequestType,
  DsrRequestStatus,
} from './dto/dsr-request.dto';

@Injectable()
export class DsrService {
  constructor(
    private readonly db: DatabaseService,
    private readonly kms: KmsService,
  ) {}

  /**
   * Create a new DSR request
   * GDPR Art. 12: Must respond within 30 days
   */
  async createRequest(tenantId: string, dto: CreateDsrRequestDto, userId?: string) {
    // Calculate due date (30 days from now per GDPR)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const query = `
      INSERT INTO dsr_requests (
        tenant_id,
        request_type,
        requester_email,
        requester_user_id,
        requester_name,
        request_reason,
        request_scope,
        due_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await this.db.query(query, [
      tenantId,
      dto.request_type,
      dto.requester_email,
      userId,
      dto.requester_name,
      dto.request_reason,
      JSON.stringify(dto.request_scope || {}),
      dueDate,
    ]);

    const request = result.rows[0];

    // Create audit log entry
    await this.createAuditLog(request.id, {
      action: 'created',
      actor_email: dto.requester_email,
      new_status: DsrRequestStatus.PENDING,
      notes: `DSR ${dto.request_type} request created`,
    });

    return request;
  }

  /**
   * Get all DSR requests for a tenant
   */
  async getRequests(
    tenantId: string,
    filters?: {
      status?: DsrRequestStatus;
      type?: DsrRequestType;
      email?: string;
    },
  ) {
    let query = `
      SELECT 
        dr.*,
        CASE 
          WHEN dr.due_date < NOW() AND dr.status NOT IN ('completed', 'rejected') THEN true
          ELSE false
        END as is_overdue
      FROM dsr_requests dr
      WHERE dr.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.status) {
      query += ` AND dr.status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    if (filters?.type) {
      query += ` AND dr.request_type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }

    if (filters?.email) {
      query += ` AND dr.requester_email ILIKE $${paramIndex}`;
      params.push(`%${filters.email}%`);
      paramIndex++;
    }

    query += ` ORDER BY dr.created_at DESC`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Get a specific DSR request
   */
  async getRequest(tenantId: string, requestId: string) {
    const query = `
      SELECT * FROM dsr_requests
      WHERE tenant_id = $1 AND id = $2
    `;

    const result = await this.db.query(query, [tenantId, requestId]);

    if (result.rows.length === 0) {
      throw new NotFoundException('DSR request not found');
    }

    return result.rows[0];
  }

  /**
   * Approve or reject a DSR request
   * Only tenant admins can approve
   */
  async approveRequest(
    tenantId: string,
    requestId: string,
    dto: ApproveDsrRequestDto,
    actorEmail: string,
  ) {
    const request = await this.getRequest(tenantId, requestId);

    if (request.status !== DsrRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved/rejected');
    }

    const newStatus = dto.approved ? DsrRequestStatus.APPROVED : DsrRequestStatus.REJECTED;

    const query = `
      UPDATE dsr_requests
      SET 
        status = $1,
        approved_by = $2,
        approved_at = NOW(),
        rejection_reason = $3,
        updated_at = NOW()
      WHERE tenant_id = $4 AND id = $5
      RETURNING *
    `;

    const result = await this.db.query(query, [
      newStatus,
      actorEmail,
      dto.rejection_reason,
      tenantId,
      requestId,
    ]);

    // Create audit log
    await this.createAuditLog(requestId, {
      action: dto.approved ? 'approved' : 'rejected',
      actor_email: actorEmail,
      old_status: request.status,
      new_status: newStatus,
      notes: dto.notes || dto.rejection_reason,
    });

    return result.rows[0];
  }

  /**
   * Process a DSR request (execute the data export/deletion)
   */
  async processRequest(
    tenantId: string,
    requestId: string,
    dto: ProcessDsrRequestDto,
    processorEmail: string,
  ) {
    const request = await this.getRequest(tenantId, requestId);

    if (request.status !== DsrRequestStatus.APPROVED) {
      throw new BadRequestException('Only approved requests can be processed');
    }

    // Update status to processing
    await this.db.query(
      `UPDATE dsr_requests SET status = $1, processed_by = $2, processed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [DsrRequestStatus.PROCESSING, processorEmail, requestId],
    );

    await this.createAuditLog(requestId, {
      action: 'processing_started',
      actor_email: processorEmail,
      old_status: request.status,
      new_status: DsrRequestStatus.PROCESSING,
      notes: dto.notes,
    });

    // Execute the actual DSR operation based on type
    let responseData: any = null;

    try {
      switch (request.request_type) {
        case DsrRequestType.ACCESS:
          responseData = await this.executeAccessRequest(tenantId, request);
          break;
        case DsrRequestType.PORTABILITY:
          responseData = await this.executePortabilityRequest(tenantId, request);
          break;
        case DsrRequestType.DELETE:
          await this.executeDeleteRequest(tenantId, request);
          break;
        default:
          throw new BadRequestException(`Request type ${request.request_type} not yet implemented`);
      }

      // Mark as completed
      const updateQuery = `
        UPDATE dsr_requests
        SET 
          status = $1,
          response_data = $2,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `;

      const result = await this.db.query(updateQuery, [
        DsrRequestStatus.COMPLETED,
        JSON.stringify(responseData || {}),
        requestId,
      ]);

      await this.createAuditLog(requestId, {
        action: 'completed',
        actor_email: processorEmail,
        old_status: DsrRequestStatus.PROCESSING,
        new_status: DsrRequestStatus.COMPLETED,
        notes: 'DSR request successfully processed',
      });

      return result.rows[0];
    } catch (error: any) {
      // Mark as failed and revert to approved
      await this.db.query(
        `UPDATE dsr_requests SET status = 'approved', updated_at = NOW() WHERE id = $1`,
        [requestId],
      );

      await this.createAuditLog(requestId, {
        action: 'processing_failed',
        actor_email: processorEmail,
        old_status: DsrRequestStatus.PROCESSING,
        new_status: DsrRequestStatus.APPROVED,
        notes: `Processing failed: ${error?.message || 'Unknown error'}`,
      });

      throw error;
    }
  }

  /**
   * Execute Access Request (GDPR Art. 15)
   * Export all personal data related to the requester
   */
  private async executeAccessRequest(tenantId: string, request: any) {
    const data: any = {
      request_id: request.id,
      requester_email: request.requester_email,
      export_date: new Date().toISOString(),
      data: {},
    };

    // Export user profile data
    const userQuery = `
      SELECT id, email, full_name, phone, bio, role, is_active, last_login, created_at, updated_at
      FROM users
      WHERE tenant_id = $1 AND email = $2
    `;
    const userResult = await this.db.query(userQuery, [tenantId, request.requester_email]);
    data.data.user_profile = userResult.rows;

    // Export financial statements (if user owns any)
    // Note: Adjust these queries based on your actual table structure
    // For now, we'll skip company data since the table doesn't exist
    
    // Add metadata
    data.metadata = {
      total_records: Object.values(data.data).flat().length,
      data_types: Object.keys(data.data),
      note: 'This is a sample data export. Additional data sources can be added based on tenant schema.',
    };

    return data;
  }

  /**
   * Execute Portability Request (GDPR Art. 20)
   * Export data in machine-readable format (JSON)
   */
  private async executePortabilityRequest(tenantId: string, request: any) {
    const data = await this.executeAccessRequest(tenantId, request);
    data.format = 'JSON';
    data.portability_compliant = true;
    return data;
  }

  /**
   * Execute Delete Request (GDPR Art. 17 - Right to be Forgotten)
   * Anonymize or delete personal data
   */
  private async executeDeleteRequest(tenantId: string, request: any) {
    const email = request.requester_email;

    // Find all records to anonymize
    // Only anonymize users table for now (safest approach)
    const tables = ['users'];
    const anonymizedRecords = [];

    for (const table of tables) {
      const selectQuery = `SELECT * FROM ${table} WHERE tenant_id = $1 AND email = $2`;
      const records = await this.db.query(selectQuery, [tenantId, email]);

      for (const record of records.rows) {
        // Store original data (encrypted) for compliance
        const originalData = await this.kms.encrypt(JSON.stringify(record));

        // Anonymize the record
        const anonymizeQuery = `
          UPDATE ${table}
          SET 
            email = $1,
            full_name = $2,
            phone = NULL,
            bio = NULL,
            updated_at = NOW()
          WHERE id = $3 AND tenant_id = $4
        `;

        await this.db.query(anonymizeQuery, [
          `anonymized_${record.id}@deleted.local`,
          'Anonymized User',
          record.id,
          tenantId,
        ]);

        // Track anonymization
        const trackQuery = `
          INSERT INTO anonymization_records (
            dsr_request_id, tenant_id, table_name, record_id, original_data, anonymized_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await this.db.query(trackQuery, [
          request.id,
          tenantId,
          table,
          record.id,
          originalData,
          request.processed_by,
        ]);

        anonymizedRecords.push({ table, record_id: record.id });
      }
    }

    // Mark request as anonymized
    await this.db.query(
      `UPDATE dsr_requests SET is_anonymized = true, anonymized_at = NOW() WHERE id = $1`,
      [request.id],
    );

    return {
      anonymized_records: anonymizedRecords.length,
      tables_affected: tables,
      anonymization_date: new Date().toISOString(),
      note: 'User data anonymized. Original data encrypted and stored for compliance.',
    };
  }

  /**
   * Get audit log for a DSR request
   */
  async getAuditLog(requestId: string) {
    const query = `
      SELECT * FROM dsr_audit_log
      WHERE dsr_request_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.db.query(query, [requestId]);
    return result.rows;
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    requestId: string,
    data: {
      action: string;
      actor_email?: string;
      actor_role?: string;
      old_status?: DsrRequestStatus;
      new_status?: DsrRequestStatus;
      notes?: string;
      metadata?: any;
    },
  ) {
    const query = `
      INSERT INTO dsr_audit_log (
        dsr_request_id,
        action,
        actor_email,
        actor_role,
        old_status,
        new_status,
        notes,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    await this.db.query(query, [
      requestId,
      data.action,
      data.actor_email,
      data.actor_role,
      data.old_status,
      data.new_status,
      data.notes,
      JSON.stringify(data.metadata || {}),
    ]);
  }

  /**
   * Get DSR statistics for dashboard
   */
  async getStatistics(tenantId: string) {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('completed', 'rejected')) as overdue_count,
        COUNT(*) FILTER (WHERE request_type = 'access') as access_requests,
        COUNT(*) FILTER (WHERE request_type = 'delete') as delete_requests,
        COUNT(*) FILTER (WHERE request_type = 'portability') as portability_requests,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400) FILTER (WHERE completed_at IS NOT NULL) as avg_days_to_complete
      FROM dsr_requests
      WHERE tenant_id = $1
    `;

    const result = await this.db.query(query, [tenantId]);
    return result.rows[0];
  }
}
