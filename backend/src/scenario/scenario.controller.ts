import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ScenarioService, Scenario, Assumption } from './scenario.service';
import { JwksService } from '../auth/jwks.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

interface CreateScenarioDto {
  scenario: Omit<Scenario, 'id' | 'tenant_id'>;
  assumptions: Omit<Assumption, 'id' | 'scenario_id'>[];
}

interface UpdateScenarioDto {
  description?: string;
  is_active?: boolean;
}

@Controller('scenarios')
@UseGuards(JwtAuthGuard)
export class ScenarioController {
  constructor(
    private readonly scenarioService: ScenarioService,
    private readonly jwksService: JwksService,
  ) {}

  private async getTenantFromToken(authHeader: string, tenantHeader: string | undefined): Promise<string> {
    if (tenantHeader) return tenantHeader as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Missing or invalid authorization header', HttpStatus.UNAUTHORIZED);
    }

    const token = authHeader.substring(7);
    // Accept demo tokens during local development
    if (token.startsWith('demo-token-')) {
      return 'admin';
    }

    const payload = await this.jwksService.verify(token);

    const tenantId = payload.preferred_username || payload.sub;
    if (!tenantId) {
      throw new HttpException('Tenant ID not found in token', HttpStatus.UNAUTHORIZED);
    }

    return String(tenantId);
  }

  @Post()
  async createScenario(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() dto: any,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    // Support two payload shapes:
    // 1) { scenario: {...}, assumptions: [...] }
    // 2) flat payload from frontend: { name, description, baseline_period, projection_months, assumptions: [...] }
    let scenarioPayload = dto?.scenario;
    let assumptions = dto?.assumptions || [];

    if (!scenarioPayload) {
      scenarioPayload = {
        scenario_name: dto.name || dto.scenario_name || 'Unnamed Scenario',
        scenario_type: dto.scenario_type || 'custom',
        description: dto.description || null,
        is_active: dto.is_active !== undefined ? dto.is_active : true,
        created_by: tenantId,
      };

      if (Array.isArray(dto.assumptions)) {
        assumptions = dto.assumptions.map((a: any) => ({
          assumption_category: (a.category || a.assumption_category || 'revenue').toLowerCase(),
          assumption_key: a.key || a.assumption_key || '',
          assumption_value: a.growth_rate ?? a.assumption_value ?? 0,
          assumption_unit: a.unit || a.assumption_unit || '',
          notes: a.notes || null,
        }));
      } else {
        assumptions = [];
      }
    }

    const scenario: Scenario = {
      ...scenarioPayload,
      tenant_id: tenantId,
    };

    return this.scenarioService.createScenario(
      tenantId,
      scenario,
      assumptions as Assumption[],
    );
  }

  @Get(':id')
  async getScenario(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const result = await this.scenarioService.getScenario(tenantId, id);
    if (!result) {
      throw new HttpException('Scenario not found', HttpStatus.NOT_FOUND);
    }

    return result;
  }

  @Get()
  async listScenarios(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Query('type') type?: string,
    @Query('is_active') isActive?: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    const filters: any = {};
    if (type) filters.scenario_type = type;
    if (isActive !== undefined) filters.is_active = isActive === 'true';

    return this.scenarioService.listScenarios(tenantId, filters);
  }

  @Put(':id')
  async updateScenario(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateScenarioDto,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    return this.scenarioService.updateScenario(tenantId, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteScenario(
    @Headers('authorization') authHeader: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Param('id') id: string,
  ) {
    const tenantId = await this.getTenantFromToken(authHeader, tenantHeader);

    await this.scenarioService.deleteScenario(tenantId, id);
    return { message: 'Scenario deleted successfully' };
  }

  @Post('defaults')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async createDefaultScenarios(@Headers('authorization') authHeader: string) {
    const tenantId = await this.getTenantFromToken(authHeader, undefined);

    await this.scenarioService.createDefaultScenarios(tenantId, tenantId);
    return { message: 'Default scenarios created successfully' };
  }
}
