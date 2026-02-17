import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards
} from '@nestjs/common';
import { CoaService } from './coa.service';
import { CreateCoaDto } from './dto/create-coa.dto';
import { UpdateCoaDto } from './dto/update-coa.dto';

@Controller('coa')
export class CoaController {
  constructor(private readonly coaService: CoaService) {}

  /**
   * GET /coa - Get all accounts
   */
  @Get()
  async findAll(@Headers('x-tenant-id') tenantId: string) {
    return this.coaService.findAll(tenantId);
  }

  /**
   * GET /coa/hierarchy - Get accounts as tree structure
   */
  @Get('hierarchy')
  async getHierarchy(@Headers('x-tenant-id') tenantId: string) {
    return this.coaService.getHierarchy(tenantId);
  }

  /**
   * GET /coa/search?q=revenue - Search accounts
   */
  @Get('search')
  async search(
    @Headers('x-tenant-id') tenantId: string,
    @Query('q') query: string
  ) {
    return this.coaService.search(tenantId, query);
  }

  /**
   * GET /coa/templates - Get all available templates
   */
  @Get('templates')
  async getTemplates() {
    return this.coaService.getTemplates();
  }

  /**
   * GET /coa/templates/:id/accounts - Get accounts from template
   */
  @Get('templates/:id/accounts')
  async getTemplateAccounts(@Param('id') templateId: string) {
    return this.coaService.getTemplateAccounts(templateId);
  }

  /**
   * POST /coa/templates/:id/apply - Apply template to tenant
   */
  @Post('templates/:id/apply')
  async applyTemplate(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') templateId: string
  ) {
    return this.coaService.applyTemplate(tenantId, templateId);
  }

  /**
   * GET /coa/:code - Get single account
   */
  @Get(':code')
  async findOne(
    @Headers('x-tenant-id') tenantId: string,
    @Param('code') accountCode: string
  ) {
    return this.coaService.findOne(tenantId, accountCode);
  }

  /**
   * POST /coa - Create new account
   */
  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() createCoaDto: CreateCoaDto
  ) {
    return this.coaService.create(tenantId, createCoaDto);
  }

  /**
   * PUT /coa/:code - Update account
   */
  @Put(':code')
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('code') accountCode: string,
    @Body() updateCoaDto: UpdateCoaDto
  ) {
    return this.coaService.update(tenantId, accountCode, updateCoaDto);
  }

  /**
   * DELETE /coa/:code - Deactivate account
   */
  @Delete(':code')
  async remove(
    @Headers('x-tenant-id') tenantId: string,
    @Param('code') accountCode: string
  ) {
    return this.coaService.remove(tenantId, accountCode);
  }
}
