import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CashflowService } from './cashflow.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.constants';
import { JwksService } from '../auth/jwks.service';
import { CreateCashFlowForecastDto, UpdateCashFlowForecastDto } from './dto/create-forecast.dto';
import { UpdateCashFlowLineItemDto, BulkUpdateLineItemsDto } from './dto/line-item.dto';

@ApiTags('Cash Flow')
@ApiBearerAuth('JWT-auth')
@Controller('cashflow')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FINANCE_USER) // Cash flow forecasting requires Finance User or higher
export class CashflowController {
  constructor(
    private readonly cashflowService: CashflowService,
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

  // ===== FORECASTS =====

  @Get('forecasts')
  async getAllForecasts(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.findAll(tenantId);
  }

  @Get('forecasts/:id')
  async getForecast(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.findOne(tenantId, id);
  }

  @Post('forecasts')
  async createForecast(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() dto: CreateCashFlowForecastDto,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.create(tenantId, dto);
  }

  @Put('forecasts/:id')
  async updateForecast(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateCashFlowForecastDto,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.update(tenantId, id, dto);
  }

  @Delete('forecasts/:id')
  async deleteForecast(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.remove(tenantId, id);
  }

  // ===== LINE ITEMS =====

  @Get('forecasts/:id/line-items')
  async getLineItems(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.getLineItems(tenantId, id);
  }

  @Put('forecasts/:id/line-items/:week')
  async updateLineItem(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Param('week') week: string,
    @Body() dto: UpdateCashFlowLineItemDto,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.updateLineItem(tenantId, id, parseInt(week), dto);
  }

  @Put('forecasts/:id/line-items')
  async bulkUpdateLineItems(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: BulkUpdateLineItemsDto,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.bulkUpdateLineItems(tenantId, id, dto);
  }

  // ===== SUMMARY & ANALYTICS =====

  @Get('forecasts/:id/summary')
  async getForecastSummary(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.getForecastSummary(tenantId, id);
  }

  // ===== CATEGORIES =====

  @Get('categories')
  async getCategories(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.cashflowService.getCategories(tenantId);
  }
}
