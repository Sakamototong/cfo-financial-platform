import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiBody, ApiQuery } from '@nestjs/swagger';
import { FinancialService, FinancialStatement, LineItem } from './financial.service';
import { JwksService } from '../auth/jwks.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

class CreateStatementDto {
  statement_type!: 'PL' | 'BS' | 'CF';
  period_type!: 'monthly' | 'quarterly' | 'yearly';
  period_start!: string;
  period_end!: string;
  scenario!: 'actual' | 'best' | 'base' | 'worst' | 'custom';
  status?: 'draft' | 'approved' | 'locked';
  line_items!: {
    line_code: string;
    line_name: string;
    parent_code?: string;
    line_order: number;
    amount: number;
    currency?: string;
    notes?: string;
  }[];
}

class UpdateStatusDto {
  status!: 'draft' | 'approved' | 'locked';
}

@ApiTags('Financial')
@Controller('financial')
@UseGuards(JwtAuthGuard)
export class FinancialController {
  constructor(
    private readonly financialService: FinancialService,
    private readonly jwksService: JwksService,
  ) {}

  /**
   * Extract tenant ID from JWT token
   */
  private async getTenantFromToken(authHeader: string, tenantHeader: string | undefined): Promise<string> {
    // If caller provided an explicit tenant header, prefer it (useful for demo tokens / scripts)
    if (tenantHeader) return tenantHeader as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Missing or invalid authorization header', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);

    // Accept demo tokens in local development
    if (token.startsWith('demo-token-')) {
      return 'admin';
    }

    const payload = await this.jwksService.verify(token);

    // Assume tenant ID is in preferred_username or sub claim
    const tenantId = payload.preferred_username || payload.sub;
    if (!tenantId) {
      throw new HttpException('Tenant ID not found in token', HttpStatus.UNAUTHORIZED);
    }

    return String(tenantId);
  }

  @Post('statements')
  @ApiOperation({ summary: 'Create financial statement with line items' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['statement_type', 'period_type', 'period_start', 'period_end', 'scenario', 'line_items'],
      properties: {
        statement_type: { type: 'string', enum: ['PL', 'BS', 'CF'], example: 'PL' },
        period_type: { type: 'string', enum: ['monthly', 'quarterly', 'yearly'], example: 'monthly' },
        period_start: { type: 'string', format: 'date', example: '2026-01-01' },
        period_end: { type: 'string', format: 'date', example: '2026-01-31' },
        scenario: { type: 'string', enum: ['actual', 'best', 'base', 'worst', 'custom'], example: 'actual' },
        status: { type: 'string', enum: ['draft', 'approved', 'locked'], example: 'draft' },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line_code: { type: 'string', example: 'REV001' },
              line_name: { type: 'string', example: 'Product Revenue' },
              parent_code: { type: 'string', example: 'REV' },
              line_order: { type: 'number', example: 1 },
              amount: { type: 'number', example: 100000 },
              currency: { type: 'string', example: 'THB' },
              notes: { type: 'string', example: 'Q1 revenue' }
            }
          }
        }
      }
    }
  })
  async createStatement(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() dto: CreateStatementDto,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const statement: FinancialStatement = {
      tenant_id: tenantId,
      statement_type: dto.statement_type,
      period_type: dto.period_type,
      period_start: dto.period_start,
      period_end: dto.period_end,
      scenario: dto.scenario,
      status: dto.status || 'draft',
    };

    const lineItems: LineItem[] = dto.line_items.map(item => ({
      statement_id: '', // Will be set by service
      line_code: item.line_code,
      line_name: item.line_name,
      parent_code: item.parent_code,
      line_order: item.line_order,
      amount: item.amount,
      currency: item.currency || 'THB',
      notes: item.notes,
    }));

    return this.financialService.createStatement(tenantId, statement, lineItems);
  }

  @Get('statements/:id')
  @ApiOperation({ summary: 'Get financial statement by ID with line items' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  async getStatement(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const result = await this.financialService.getStatement(tenantId, id);
    if (!result) {
      throw new HttpException('Statement not found', HttpStatus.NOT_FOUND);
    }

    return result;
  }

  @Get('statements')
  @ApiOperation({ summary: 'List all financial statements with optional filters' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  @ApiQuery({ name: 'type', required: false, enum: ['PL', 'BS', 'CF'] })
  @ApiQuery({ name: 'scenario', required: false })
  @ApiQuery({ name: 'period_start', required: false })
  @ApiQuery({ name: 'period_end', required: false })
  async listStatements(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('type') type?: 'PL' | 'BS' | 'CF',
    @Query('scenario') scenario?: string,
    @Query('period_start') periodStart?: string,
    @Query('period_end') periodEnd?: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const filters: any = {};
    if (type) filters.statement_type = type;
    if (scenario) filters.scenario = scenario;
    if (periodStart) filters.period_start = periodStart;
    if (periodEnd) filters.period_end = periodEnd;

    return this.financialService.listStatements(tenantId, filters);
  }

  @Put('statements/:id/status')
  @ApiOperation({ summary: 'Update statement status (draft -> approved -> locked)' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['draft', 'approved', 'locked'], example: 'approved' }
      }
    }
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateStatementStatus(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    return this.financialService.updateStatementStatus(
      tenantId,
      id,
      dto.status,
      tenantId,
    );
  }

  @Put('statements/:id')
  @ApiOperation({ summary: 'Update financial statement with line items' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  async updateStatement(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: Partial<CreateStatementDto>,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const statement: Partial<FinancialStatement> = {};
    if (dto.statement_type !== undefined) statement.statement_type = dto.statement_type;
    if (dto.period_type !== undefined) statement.period_type = dto.period_type;
    if (dto.period_start !== undefined) statement.period_start = dto.period_start;
    if (dto.period_end !== undefined) statement.period_end = dto.period_end;
    if (dto.scenario !== undefined) statement.scenario = dto.scenario as any;
    if (dto.status !== undefined) statement.status = dto.status;

    let lineItems: LineItem[] | undefined = undefined;
    if (dto.line_items && Array.isArray(dto.line_items)) {
      lineItems = dto.line_items.map(item => ({
        statement_id: id,
        line_code: item.line_code,
        line_name: item.line_name,
        parent_code: item.parent_code,
        line_order: item.line_order,
        amount: item.amount,
        currency: item.currency || 'THB',
        notes: item.notes,
      }));
    }

    return this.financialService.updateStatement(tenantId, id, statement, lineItems);
  }

  @Delete('statements/:id')
  @ApiOperation({ summary: 'Delete financial statement (cascade deletes line items)' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteStatement(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    await this.financialService.deleteStatement(tenantId, id);
    return { message: 'Statement deleted successfully' };
  }

  @Get('line-items/:lineCode/transactions')
  @ApiOperation({ summary: 'Get imported transactions for a specific line item (drill-down)' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  async getLineItemTransactions(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('lineCode') lineCode: string,
    @Query('statement_id') statementId: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.financialService.getLineItemTransactions(tenantId, statementId, lineCode);
  }

  @Get('statements/:id/transactions')
  @ApiOperation({ summary: 'Get all imported transactions for a financial statement' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  async getStatementTransactions(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') statementId: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.financialService.getStatementTransactions(tenantId, statementId);
  }
}
