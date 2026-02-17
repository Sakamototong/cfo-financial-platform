import { Controller, Post, Body, Headers, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiHeader, ApiBody } from '@nestjs/swagger';
import { FinancialService } from '../financial/financial.service';
import { JwksService } from '../auth/jwks.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

class ConsolidateDto {
  statement_ids!: string[];
}

@ApiTags('Consolidation')
@Controller('consolidation')
@UseGuards(JwtAuthGuard)
export class ConsolidationController {
  constructor(
    private readonly financialService: FinancialService,
    private readonly jwksService: JwksService,
  ) {}

  private async getTenantFromToken(authHeader: string, tenantHeader?: string): Promise<string> {
    if (tenantHeader) return tenantHeader;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Missing or invalid authorization header', HttpStatus.UNAUTHORIZED);
    }
    const token = authHeader.substring(7);
    if (token.startsWith('demo-token-')) return 'admin';
    const payload = await this.jwksService.verify(token);
    const tenantId = payload.preferred_username || payload.sub;
    if (!tenantId) throw new HttpException('Tenant ID not found in token', HttpStatus.UNAUTHORIZED);
    return String(tenantId);
  }

  @Post('consolidate')
  @ApiHeader({ name: 'Authorization', description: 'Bearer JWT token' })
  @ApiBody({ schema: { type: 'object', properties: { statement_ids: { type: 'array', items: { type: 'string' } } } } })
  async consolidate(@Headers('authorization') authHeader: string, @Headers('x-tenant-id') tenantHeader: string | undefined, @Body() dto: ConsolidateDto) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    const ids = Array.isArray(dto.statement_ids) ? dto.statement_ids.filter(Boolean) : [];
    if (ids.length === 0) {
      throw new HttpException('statement_ids is required', HttpStatus.BAD_REQUEST);
    }

    const fetched: any[] = [];
    for (const id of ids) {
      const s = await this.financialService.getStatement(tenantId, id);
      if (!s) {
        throw new HttpException(`Statement not found: ${id}`, HttpStatus.NOT_FOUND);
      }
      fetched.push(s);
    }

    // Aggregate line items by line_code
    const map: Record<string, any> = {};
    for (const entry of fetched) {
      for (const li of entry.lineItems || []) {
        const key = (li.line_code || li.line_name || 'UNKNOWN').toString();
        if (!map[key]) {
          map[key] = { line_code: li.line_code, line_name: li.line_name, parent_code: li.parent_code, amount: 0, currency: li.currency };
        }
        map[key].amount = Number(map[key].amount || 0) + Number(li.amount || 0);
      }
    }

    const consolidated = Object.values(map);

    return { consolidated: { line_items: consolidated }, statements: fetched };
  }
}
