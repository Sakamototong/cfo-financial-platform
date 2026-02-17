import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DsrService } from './dsr.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.constants';
import { Public } from '../auth/public.decorator';
import {
  CreateDsrRequestDto,
  ApproveDsrRequestDto,
  ProcessDsrRequestDto,
  DsrRequestStatus,
  DsrRequestType,
} from './dto/dsr-request.dto';

@ApiTags('DSR - Data Subject Requests')
@ApiBearerAuth('JWT-auth')
@Controller('dsr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DsrController {
  constructor(private readonly dsrService: DsrService) {}

  private getTenantId(headers: any): string {
    return headers['x-tenant-id'] || 'admin';
  }

  private getUserEmail(req: any): string {
    return req.user?.email || req.user?.preferred_username || 'unknown';
  }

  /**
   * Create a new DSR request
   * Any authenticated user can submit a request for their own data
   */
  @Post('requests')
  @Roles(Role.VIEWER) // Any authenticated user
  @ApiOperation({
    summary: 'Submit a Data Subject Request',
    description: 'Submit a request to access, delete, or export your personal data (GDPR/PDPA compliance)',
  })
  async createRequest(
    @Headers() headers: any,
    @Request() req: any,
    @Body() dto: CreateDsrRequestDto,
  ) {
    const tenantId = this.getTenantId(headers);
    const userId = req.user?.sub;

    return this.dsrService.createRequest(tenantId, dto, userId);
  }

  /**
   * Get all DSR requests (admin only)
   */
  @Get('requests')
  @Roles(Role.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Get all DSR requests',
    description: 'View all data subject requests for the tenant (admin only)',
  })
  @ApiQuery({ name: 'status', enum: DsrRequestStatus, required: false })
  @ApiQuery({ name: 'type', enum: DsrRequestType, required: false })
  @ApiQuery({ name: 'email', type: String, required: false })
  async getRequests(
    @Headers() headers: any,
    @Query('status') status?: DsrRequestStatus,
    @Query('type') type?: DsrRequestType,
    @Query('email') email?: string,
  ) {
    const tenantId = this.getTenantId(headers);
    return this.dsrService.getRequests(tenantId, { status, type, email });
  }

  /**
   * Get a specific DSR request
   */
  @Get('requests/:id')
  @Roles(Role.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Get DSR request details',
    description: 'View details of a specific data subject request',
  })
  async getRequest(@Headers() headers: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(headers);
    return this.dsrService.getRequest(tenantId, id);
  }

  /**
   * Approve or reject a DSR request
   */
  @Put('requests/:id/approve')
  @Roles(Role.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Approve or reject DSR request',
    description: 'Admin decision on whether to approve or reject a data subject request',
  })
  async approveRequest(
    @Headers() headers: any,
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ApproveDsrRequestDto,
  ) {
    const tenantId = this.getTenantId(headers);
    const actorEmail = this.getUserEmail(req);

    return this.dsrService.approveRequest(tenantId, id, dto, actorEmail);
  }

  /**
   * Process an approved DSR request
   */
  @Post('requests/:id/process')
  @Roles(Role.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Process DSR request',
    description: 'Execute the data subject request (export data, anonymize, etc.)',
  })
  async processRequest(
    @Headers() headers: any,
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ProcessDsrRequestDto,
  ) {
    const tenantId = this.getTenantId(headers);
    const processorEmail = this.getUserEmail(req);

    return this.dsrService.processRequest(tenantId, id, dto, processorEmail);
  }

  /**
   * Get audit log for a DSR request
   */
  @Get('requests/:id/audit-log')
  @Roles(Role.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Get DSR audit log',
    description: 'View complete audit trail for a data subject request',
  })
  async getAuditLog(@Param('id') id: string) {
    return this.dsrService.getAuditLog(id);
  }

  /**
   * Get DSR statistics
   */
  @Get('statistics')
  @Roles(Role.TENANT_ADMIN)
  @ApiOperation({
    summary: 'Get DSR statistics',
    description: 'Dashboard statistics for data subject requests',
  })
  async getStatistics(@Headers() headers: any) {
    const tenantId = this.getTenantId(headers);
    return this.dsrService.getStatistics(tenantId);
  }

  /**
   * Public endpoint: Submit DSR request without authentication
   * For users who don't have an account but have data in the system
   * This endpoint bypasses JWT authentication
   */
  @Public() // Skip JWT authentication for this endpoint
  @Post('public/request')
  @ApiOperation({
    summary: 'Submit DSR request (public)',
    description: 'Submit a data subject request without authentication (email verification required)',
    tags: ['Public DSR'],
  })
  async createPublicRequest(@Body() dto: CreateDsrRequestDto) {
    // Note: In production, this should:
    // 1. Send verification email to requester_email
    // 2. Only create request after email is verified
    // 3. Rate limit this endpoint heavily
    
    // For now, use default tenant
    const tenantId = 'admin';
    return this.dsrService.createRequest(tenantId, dto);
  }
}
