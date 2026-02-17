import { Controller, Get, Param, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsCompatController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async list() {
    // Available to all authenticated users
    return this.tenantService.listTenants();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const tenant = await this.tenantService.getTenant(id);
    if (!tenant) {
      throw new HttpException('Tenant not found', HttpStatus.NOT_FOUND);
    }
    return tenant;
  }
}
