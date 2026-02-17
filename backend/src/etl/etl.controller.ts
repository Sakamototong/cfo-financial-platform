import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  Headers,
  HttpException,
  HttpStatus,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { EtlService } from './etl.service';
import { JwksService } from '../auth/jwks.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('etl')
@UseGuards(JwtAuthGuard)
export class EtlController {
  constructor(
    private readonly etlService: EtlService,
    private readonly jwksService: JwksService,
  ) {}

  private async getTenantFromToken(authHeader: string, tenantHeader: string | undefined): Promise<string> {
    if (tenantHeader) return tenantHeader as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Missing or invalid authorization header', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    const payload = await this.jwksService.verify(token);

    const tenantId = payload.preferred_username || payload.sub;
    if (!tenantId) {
      throw new HttpException('Tenant ID not found in token', HttpStatus.UNAUTHORIZED);
    }

    return String(tenantId);
  }

  @Get('templates')
  async getTemplates() {
    return this.etlService.getTemplates();
  }

  @Post('import')
  async importJson(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: { template_id: string; file_data: any[]; auto_approve?: boolean },
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const userId = tenantId;
    return this.etlService.importJson(
      tenantId,
      body.template_id,
      body.file_data,
      body.auto_approve || false,
      userId,
    );
  }

  @Get('imports')
  async getImportLogs(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.etlService.getImportLogs(tenantId);
  }

  @Get('transactions')
  async getTransactions(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('log_id') logId?: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.etlService.getTransactions(tenantId, logId);
  }

  @Post('transactions/approve')
  async approveTransactions(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: { transaction_ids: string[] },
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.etlService.approveTransactions(tenantId, body.transaction_ids);
  }

  @Delete('transactions/:id')
  async deleteTransaction(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') transactionId: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    await this.etlService.deleteTransaction(tenantId, transactionId);
    return { success: true };
  }

  @Post('import/excel')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Headers('content-type') contentType?: string,
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const userId = tenantId; // For now, use tenantId as userId

    // multer stores other fields on req.body, but FileInterceptor doesn't expose @Body here.
    // We'll read mapping from headers if provided as JSON in 'x-mapping' for simplicity.
    // This keeps the endpoint backward-compatible for clients that don't send mapping.
    let mapping: any = undefined;
    try {
      const raw = (contentType && contentType.includes('multipart/form-data')) ? undefined : undefined
      // mapping can be sent in header 'x-mapping' as JSON string
    } catch (e) {
      mapping = undefined
    }

    return this.etlService.importExcel(
      tenantId,
      file.buffer,
      file.originalname,
      userId,
      mapping,
    );
  }

  @Post('import/csv')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Headers('content-type') contentType?: string,
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const userId = tenantId;
    let mapping: any = undefined;
    try {
      // mapping may be provided via header 'x-mapping' as JSON
    } catch (e) {
      mapping = undefined
    }

    return this.etlService.importCsv(
      tenantId,
      file.buffer,
      file.originalname,
      userId,
      mapping,
    );
  }

  @Post('preview/excel')
  @UseInterceptors(FileInterceptor('file'))
  async previewExcel(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-mapping') mappingHeader?: string,
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    let mapping = undefined
    if (mappingHeader) {
      try { mapping = JSON.parse(mappingHeader) } catch (e) { mapping = undefined }
    }
    return this.etlService.previewExcel(tenantId, file.buffer, file.originalname, mapping);
  }

  @Post('preview/csv')
  @UseInterceptors(FileInterceptor('file'))
  async previewCsv(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-mapping') mappingHeader?: string,
  ) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    let mapping = undefined
    if (mappingHeader) {
      try { mapping = JSON.parse(mappingHeader) } catch (e) { mapping = undefined }
    }
    return this.etlService.previewCsv(tenantId, file.buffer, file.originalname, mapping);
  }

  @Get('import/:id/log')
  async downloadImportLog(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') importId: string,
    @Res() res: Response,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const log = await this.etlService.getImportLog(tenantId, importId);
    if (!log) {
      throw new HttpException('Log not found', HttpStatus.NOT_FOUND);
    }

    const fileName = `import_${importId}_error.log`;
    const buf = Buffer.from(String(log), 'utf8');
    const total = buf.length;

    // support Range header for partial content
    const rangeHeader = (res.req && (res.req.headers['range'] as string)) || undefined;
    if (rangeHeader) {
      const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
        if (start >= total || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${total}`);
          return res.end();
        }
        const chunk = buf.slice(start, end + 1);
        res.status(206);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(chunk.length));
        return res.send(chunk);
      }
    }

    // full content
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', String(total));
    res.setHeader('Accept-Ranges', 'bytes');
    return res.send(buf);
  }

  @Get('import/history')
  async getImportHistory(@Headers('authorization') authHeader: string, @Headers('x-tenant-id') tenantHeader: string | undefined) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.etlService.getImportHistory(tenantId);
  }
}
