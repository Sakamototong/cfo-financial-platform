import { Body, Controller, Get, Param, Post, Put, Delete, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('tenant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  async create(@Body() body: { name: string; id?: string }) {
    return this.tenantService.createTenant(body.name, body.id);
  }

  @Get()
  async list() {
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

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string }) {
    return this.tenantService.updateTenant(id, body);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.tenantService.deleteTenant(id);
  }
}
