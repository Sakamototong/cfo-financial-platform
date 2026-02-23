import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.constants';
import { EtlEnhancedService } from './etl-enhanced.service';
import { CreateImportTemplateDto, UpdateImportTemplateDto } from './dto/import-template.dto';
import { ProcessImportDto, UpdateTransactionDto } from './dto/import-transaction.dto';

@ApiTags('ETL')
@ApiBearerAuth('JWT-auth')
@Controller('etl')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FINANCE_USER) // ETL operations require Finance User or higher
export class EtlEnhancedController {
  constructor(private readonly etlService: EtlEnhancedService) {}

  // ===== IMPORT TEMPLATES =====

  @Get('templates')
  async getTemplates() {
    return this.etlService.getTemplates();
  }

  @Get('templates/:id/download')
  async downloadTemplate(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    let result: { filename: string; buffer: Buffer; contentType: string };
    try {
      result = await this.etlService.downloadTemplate(id);
    } catch (err: any) {
      res.status(404).json({ message: err.message || 'Template not found' });
      return;
    }
    res.set({
      'Content-Type': result.contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      'Content-Length': String(result.buffer.length),
    });
    return new StreamableFile(result.buffer);
  }

  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    return this.etlService.getTemplate(id);
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateImportTemplateDto) {
    return this.etlService.createTemplate(dto);
  }

  @Put('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() dto: UpdateImportTemplateDto) {
    return this.etlService.updateTemplate(id, dto);
  }

  // ===== IMPORT LOGS =====

  @Get('imports')
  async getImportLogs(
    @Req() req: any,
    @Query('limit') limit?: string
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.getImportLogs(tenantId, limit ? parseInt(limit) : 50);
  }

  @Get('imports/:id')
  async getImportLog(
    @Req() req: any,
    @Param('id') id: string
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.getImportLog(tenantId, id);
  }

  // ===== IMPORT PROCESSING =====

  @Post('import')
  @Throttle({ etl: { limit: 20, ttl: 60000 } }) // Rate limit: 20 ETL imports per minute
  async processImport(
    @Req() req: any,
    @Body() dto: ProcessImportDto
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.processImport(tenantId, dto);
  }

  // ===== IMPORTED TRANSACTIONS =====

  @Get('transactions')
  async getImportedTransactions(
    @Req() req: any,
    @Query('log_id') logId?: string,
    @Query('status') status?: string
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.getImportedTransactions(tenantId, logId, status);
  }

  @Put('transactions/:id')
  async updateTransaction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.updateTransaction(tenantId, id, dto);
  }

  @Delete('transactions/:id')
  async deleteTransaction(
    @Req() req: any,
    @Param('id') id: string
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.deleteTransaction(tenantId, id);
  }

  @Post('transactions/approve')
  async approveTransactions(
    @Req() req: any,
    @Body() body: { transaction_ids: string[] }
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.approveTransactions(tenantId, body.transaction_ids);
  }

  // ===== MAPPING RULES =====

  @Get('mapping-rules')
  async getMappingRules(@Req() req: any) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.getMappingRules(tenantId);
  }

  @Post('transactions/:id/apply-mapping')
  async applyMappingRules(
    @Req() req: any,
    @Param('id') id: string
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.applyMappingRules(tenantId, id);
  }

  // ===== POST TO FINANCIALS =====

  @Post('transactions/post-to-financials')
  async postTransactionsToFinancials(
    @Req() req: any,
    @Body() body: { transaction_ids: string[]; statement_id: string }
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.postTransactionsToFinancials(
      tenantId, 
      body.transaction_ids, 
      body.statement_id
    );
  }

  @Get('financials/:statementId/transactions-summary')
  async getPostedTransactionsSummary(
    @Req() req: any,
    @Param('statementId') statementId: string
  ) {
    const tenantId = req.user?.tenantId || 'admin';
    return this.etlService.getPostedTransactionsSummary(tenantId, statementId);
  }
}
