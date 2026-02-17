import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ProjectionService, ProjectionRequest } from './projection.service';
import { JwksService } from '../auth/jwks.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('projections')
@UseGuards(JwtAuthGuard)
export class ProjectionController {
  constructor(
    private readonly projectionService: ProjectionService,
    private readonly jwksService: JwksService,
  ) {}

  private async getTenantFromToken(authHeader: string, tenantHeader: string | undefined): Promise<string> {
    if (tenantHeader) return tenantHeader;

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

  @Post('generate')
  async generateProjections(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() request: ProjectionRequest,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    // Basic validation
    if (!request?.base_statement_id) {
      throw new HttpException('base_statement_id is required', HttpStatus.BAD_REQUEST);
    }
    if (!request?.scenario_id) {
      throw new HttpException('scenario_id is required', HttpStatus.BAD_REQUEST);
    }
    if (!request?.projection_periods || request.projection_periods <= 0) {
      throw new HttpException('projection_periods must be a positive integer', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.projectionService.generateProjections(tenantId, request);
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate projections';
      if (msg.includes('Base statement not found')) {
        throw new HttpException(msg, HttpStatus.NOT_FOUND);
      }
      if (msg.includes('Scenario not found')) {
        throw new HttpException(msg, HttpStatus.NOT_FOUND);
      }
      // For other known validation errors from service, return 400
      if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('required')) {
        throw new HttpException(msg, HttpStatus.BAD_REQUEST);
      }
      // default to internal server error with message
      throw new HttpException(msg, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('list')
  async listProjections(@Headers('authorization') authHeader: string, @Headers('x-tenant-id') tenantHeader: string | undefined) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);
    return this.projectionService.listProjections(tenantId);
  }

  @Get(':id')
  async getProjection(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const projection = await this.projectionService.getProjection(tenantId, id);
    if (!projection) {
      throw new HttpException('Projection not found', HttpStatus.NOT_FOUND);
    }

    return projection;
  }
}
