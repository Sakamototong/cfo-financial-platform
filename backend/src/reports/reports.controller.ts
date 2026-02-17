import {
  Controller,
  Get,
  Query,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwksService } from '../auth/jwks.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly jwksService: JwksService,
  ) {}

  private async getTenantFromToken(authHeader: string, tenantHeader: string | undefined): Promise<string> {
    if (tenantHeader) return tenantHeader as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException(
        'Missing or invalid authorization header',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = authHeader.substring(7);
    const payload = await this.jwksService.verify(token);

    const tenantId = payload.preferred_username || payload.sub;
    if (!tenantId) {
      throw new HttpException(
        'Tenant ID not found in token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return String(tenantId);
  }

  /**
   * Compare actual vs projected for a specific period
   * GET /reports/variance?actual_statement_id=xxx&projection_id=xxx&period_number=1
   */
  @Get('variance')
  async getVarianceReport(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('actual_statement_id') actualStatementId: string,
    @Query('projection_id') projectionId: string,
    @Query('period_number') periodNumber: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!actualStatementId || !projectionId || !periodNumber) {
      throw new HttpException(
        'Missing required parameters: actual_statement_id, projection_id, period_number',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.reportsService.compareActualVsProjected(
      tenantId,
      actualStatementId,
      projectionId,
      parseInt(periodNumber),
    );
  }

  /**
   * Get trend analysis for a line item
   * GET /reports/trend?line_code=REV-001&start_date=2026-01-01&end_date=2026-12-31
   */
  @Get('trend')
  async getTrendAnalysis(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('line_code') lineCode: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!lineCode || !startDate || !endDate) {
      throw new HttpException(
        'Missing required parameters: line_code, start_date, end_date',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.reportsService.getTrendAnalysis(
      tenantId,
      lineCode,
      startDate,
      endDate,
    );
  }

  /**
   * Get multi-period summary
   * GET /reports/summary?type=PL&start_date=2026-01-01&end_date=2026-12-31
   */
  @Get('summary')
  async getMultiPeriodSummary(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('type') type: string,
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!type || !startDate || !endDate) {
      throw new HttpException(
        'Missing required parameters: type, start_date, end_date',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!['PL', 'BS', 'CF'].includes(type)) {
      throw new HttpException(
        'Invalid type. Must be PL, BS, or CF',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.reportsService.getMultiPeriodSummary(
      tenantId,
      type as 'PL' | 'BS' | 'CF',
      startDate,
      endDate,
    );
  }

  /**
   * Compare budget vs actual for a specific period
   * GET /reports/budget-vs-actual?budget_id=xxx&statement_id=xxx
   */
  @Get('budget-vs-actual')
  async getBudgetVsActualReport(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('budget_id') budgetId: string,
    @Query('statement_id') statementId: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!budgetId || !statementId) {
      throw new HttpException(
        'Missing required parameters: budget_id, statement_id',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.reportsService.compareBudgetVsActual(
      tenantId,
      budgetId,
      statementId,
    );
  }

  /**
   * Export variance report
   * GET /reports/export/variance?actual_statement_id=xxx&projection_id=xxx&period_number=1&format=csv
   */
  @Get('export/variance')
  async exportVarianceReport(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('actual_statement_id') actualStatementId: string,
    @Query('projection_id') projectionId: string,
    @Query('period_number') periodNumber: string,
    @Query('format') format: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    if (!actualStatementId || !projectionId || !periodNumber) {
      throw new HttpException(
        'Missing required parameters',
        HttpStatus.BAD_REQUEST,
      );
    }

    const exportFormat = (format || 'json') as 'json' | 'csv';
    if (!['json', 'csv'].includes(exportFormat)) {
      throw new HttpException(
        'Invalid format. Must be json or csv',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.reportsService.exportVarianceReport(
      tenantId,
      actualStatementId,
      projectionId,
      parseInt(periodNumber),
      exportFormat,
    );
  }
}
