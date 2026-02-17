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
import { AdminService, SystemConfig, EtlParameter, TenantApproval, AuditLog } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Initialize admin schema (central DB)
   */
  @Post('init')
  async initAdminSchema() {
    await this.adminService.createAdminSchema();
    return { message: 'Admin schema initialized successfully' };
  }

  /**
   * Initialize tenant admin schema
   */
  @Post('init/tenant')
  async initTenantAdminSchema(@Req() req: any) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.adminService.createTenantAdminSchema(tenantId);
    return { message: 'Tenant admin schema initialized successfully' };
  }

  // ============ System Config ============

  /**
   * Set system config
   */
  @Post('config')
  async setConfig(@Req() req: any, @Body() body: SystemConfig) {
    const adminUser = req.user?.email || req.user?.preferred_username;
    return this.adminService.setConfig(body, adminUser);
  }

  /**
   * Get config by key
   */
  @Get('config/:key')
  async getConfig(@Req() req: any, @Param('key') key: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.adminService.getConfig(key, tenantId);
  }

  /**
   * List configs
   */
  @Get('config')
  async listConfigs(
    @Req() req: any,
    @Query('system_only') systemOnly?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.adminService.listConfigs(tenantId, systemOnly === 'true');
  }

  /**
   * Delete config
   */
  @Delete('config/:key')
  async deleteConfig(@Param('key') key: string) {
    await this.adminService.deleteConfig(key);
    return { message: 'Config deleted successfully' };
  }

  // ============ ETL Parameters ============

  /**
   * Set ETL parameter
   */
  @Post('etl-params')
  async setEtlParameter(@Req() req: any, @Body() body: EtlParameter) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    body.created_by = req.user?.email || req.user?.preferred_username;
    return this.adminService.setEtlParameter(tenantId, body);
  }

  /**
   * Get ETL parameter
   */
  @Get('etl-params/:name')
  async getEtlParameter(
    @Req() req: any,
    @Param('name') name: string,
    @Query('effective_date') effectiveDate?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    const date = effectiveDate ? new Date(effectiveDate) : undefined;
    return this.adminService.getEtlParameter(tenantId, name, date);
  }

  /**
   * List ETL parameters
   */
  @Get('etl-params')
  async listEtlParameters(
    @Req() req: any,
    @Query('parameter_type') parameterType?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.adminService.listEtlParameters(tenantId, parameterType);
  }

  /**
   * Delete ETL parameter
   */
  @Delete('etl-params/:id')
  async deleteEtlParameter(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.adminService.deleteEtlParameter(tenantId, id);
    return { message: 'ETL parameter deleted successfully' };
  }

  // ============ Tenant Approvals ============

  /**
   * Create approval request
   */
  @Post('approvals')
  async createApprovalRequest(@Req() req: any, @Body() body: any) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    const requestedBy = req.user?.email || req.user?.preferred_username;
    return this.adminService.createApprovalRequest(
      tenantId,
      body.tenant_name,
      requestedBy,
      body.metadata,
    );
  }

  /**
   * List approval requests
   */
  @Get('approvals')
  async listApprovalRequests(@Query('status') status?: string) {
    return this.adminService.listApprovalRequests(status);
  }

  /**
   * Approve tenant
   */
  @Put('approvals/:tenantId/approve')
  async approveTenant(@Req() req: any, @Param('tenantId') tenantId: string) {
    const approvedBy = req.user?.email || req.user?.preferred_username;
    return this.adminService.approveTenant(tenantId, approvedBy);
  }

  /**
   * Reject tenant
   */
  @Put('approvals/:tenantId/reject')
  async rejectTenant(
    @Req() req: any,
    @Param('tenantId') tenantId: string,
    @Body() body: { reason: string },
  ) {
    const approvedBy = req.user?.email || req.user?.preferred_username;
    return this.adminService.rejectTenant(tenantId, approvedBy, body.reason);
  }

  // ============ Audit Logs ============

  /**
   * Write audit log
   */
  @Post('audit')
  async writeAuditLog(@Req() req: any, @Body() body: AuditLog) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    body.tenant_id = tenantId;
    body.user_email = req.user?.email || req.user?.preferred_username;
    body.ip_address = req.ip;
    body.user_agent = req.headers['user-agent'];
    await this.adminService.writeAuditLog(tenantId, body);
    return { message: 'Audit log written successfully' };
  }

  /**
   * Query audit logs
   */
  @Get('audit')
  async queryAuditLogs(
    @Req() req: any,
    @Query('user_email') userEmail?: string,
    @Query('action') action?: string,
    @Query('resource_type') resourceType?: string,
    @Query('resource_id') resourceId?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.adminService.queryAuditLogs(tenantId, {
      userEmail,
      action,
      resourceType,
      resourceId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
