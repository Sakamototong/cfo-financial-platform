import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WorkflowService, ApprovalChain, ApprovalRequest, ApprovalAction } from './workflow.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  /**
   * Initialize workflow schema
   */
  @Post('init')
  async initSchema(@Req() req: any) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.workflowService.createWorkflowSchema(tenantId);
    return { message: 'Workflow schema initialized successfully' };
  }

  // ============ Approval Chains ============

  /**
   * Create approval chain
   */
  @Post('chains')
  async createApprovalChain(@Req() req: any, @Body() body: ApprovalChain) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    body.tenant_id = tenantId;
    body.created_by = req.user?.email || req.user?.preferred_username;
    return this.workflowService.upsertApprovalChain(tenantId, body);
  }

  /**
   * Get approval chain
   */
  @Get('chains/:id')
  async getApprovalChain(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.workflowService.getApprovalChain(tenantId, id);
  }

  /**
   * List approval chains
   */
  @Get('chains')
  async listApprovalChains(
    @Req() req: any,
    @Query('document_type') documentType?: string,
    @Query('active_only') activeOnly?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.workflowService.listApprovalChains(
      tenantId,
      documentType,
      activeOnly !== 'false',
    );
  }

  /**
   * Delete approval chain
   */
  @Delete('chains/:id')
  async deleteApprovalChain(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.workflowService.deleteApprovalChain(tenantId, id);
    return { message: 'Approval chain deleted successfully' };
  }

  // ============ Approval Requests ============

  /**
   * Create approval request
   */
  @Post('requests')
  async createApprovalRequest(@Req() req: any, @Body() body: ApprovalRequest) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    body.tenant_id = tenantId;
    body.requested_by = req.user?.email || req.user?.preferred_username;
    return this.workflowService.createApprovalRequest(tenantId, body);
  }

  /**
   * Get approval request
   */
  @Get('requests/:id')
  async getApprovalRequest(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.workflowService.getApprovalRequest(tenantId, id);
  }

  /**
   * List approval requests
   */
  @Get('requests')
  async listApprovalRequests(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('document_type') documentType?: string,
    @Query('requested_by') requestedBy?: string,
    @Query('approver_email') approverEmail?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.workflowService.listApprovalRequests(tenantId, {
      status,
      documentType,
      requestedBy,
      approverEmail,
    });
  }

  /**
   * Take approval action
   */
  @Post('requests/:id/actions')
  async takeAction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject' | 'delegate'; comments?: string; delegated_to?: string },
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    const approverEmail = req.user?.email || req.user?.preferred_username;

    const action: ApprovalAction = {
      request_id: id,
      step_order: 0, // Will be determined by service
      approver_email: approverEmail,
      action: body.action,
      action_date: new Date(),
      comments: body.comments,
      delegated_to: body.delegated_to,
    };

    return this.workflowService.takeAction(tenantId, id, action);
  }

  /**
   * Cancel approval request
   */
  @Put('requests/:id/cancel')
  async cancelRequest(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    const cancelledBy = req.user?.email || req.user?.preferred_username;
    return this.workflowService.cancelRequest(tenantId, id, cancelledBy);
  }

  // ============ Notifications ============

  /**
   * Get user notifications
   */
  @Get('notifications')
  async getUserNotifications(
    @Req() req: any,
    @Query('unread_only') unreadOnly?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    const userEmail = req.user?.email || req.user?.preferred_username;
    return this.workflowService.getUserNotifications(
      tenantId,
      userEmail,
      unreadOnly === 'true',
    );
  }

  /**
   * Mark notification as read
   */
  @Put('notifications/:id/read')
  async markNotificationRead(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.workflowService.markNotificationRead(tenantId, id);
    return { message: 'Notification marked as read' };
  }
}
