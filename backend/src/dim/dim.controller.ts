import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DimService, Dimension, DimensionHierarchy, StatementTemplate } from './dim.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('dim')
@UseGuards(JwtAuthGuard)
export class DimController {
  constructor(private readonly dimService: DimService) {}

  /**
   * Initialize DIM schema
   */
  @Post('init')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async initSchema(@Req() req: any) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.dimService.createDimSchema(tenantId);
    return { message: 'DIM schema initialized successfully' };
  }

  // ============ Dimensions ============

  /**
   * Create or update dimension
   */
  @Post('dimensions')
  async upsertDimension(@Req() req: any, @Body() body: Dimension) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    body.tenant_id = tenantId;
    return this.dimService.upsertDimension(tenantId, body);
  }

  /**
   * List dimensions
   */
  @Get('dimensions')
  async listDimensions(
    @Req() req: any,
    @Query('active_only') activeOnly?: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.listDimensions(
      tenantId,
      activeOnly !== 'false',
    );
  }

  /**
   * Get dimension by code
   */
  @Get('dimensions/:code')
  async getDimension(@Req() req: any, @Param('code') code: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.getDimension(tenantId, code);
  }

  // ============ Hierarchies ============

  /**
   * Add hierarchy node
   */
  @Post('dimensions/:code/hierarchy')
  async addHierarchyNode(
    @Req() req: any,
    @Param('code') code: string,
    @Body() body: DimensionHierarchy,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.addHierarchyNode(tenantId, code, body);
  }

  /**
   * Get hierarchy tree
   */
  @Get('dimensions/:code/hierarchy')
  async getHierarchy(@Req() req: any, @Param('code') code: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.getHierarchy(tenantId, code);
  }

  /**
   * Get child nodes
   */
  @Get('dimensions/:code/hierarchy/:parent')
  async getChildNodes(
    @Req() req: any,
    @Param('code') code: string,
    @Param('parent') parent: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.getChildNodes(tenantId, code, parent);
  }

  /**
   * Delete hierarchy node
   */
  @Delete('dimensions/:code/hierarchy/:node')
  async deleteHierarchyNode(
    @Req() req: any,
    @Param('code') code: string,
    @Param('node') node: string,
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.dimService.deleteHierarchyNode(tenantId, code, node);
    return { message: 'Hierarchy node deleted successfully' };
  }

  // ============ Templates ============

  /**
   * Create template
   */
  @Post('templates')
  async createTemplate(@Req() req: any, @Body() body: StatementTemplate) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    body.tenant_id = tenantId;
    return this.dimService.upsertTemplate(tenantId, body);
  }

  /**
   * List templates
   */
  @Get('templates')
  async listTemplates(
    @Req() req: any,
    @Query('statement_type') statementType?: 'PL' | 'BS' | 'CF',
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.listTemplates(tenantId, statementType);
  }

  /**
   * Get default template (must be before :id to avoid route conflict)
   */
  @Get('templates/default/:type')
  async getDefaultTemplate(
    @Req() req: any,
    @Param('type') type: 'PL' | 'BS' | 'CF',
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.getDefaultTemplate(tenantId, type);
  }

  /**
   * Get template by ID
   */
  @Get('templates/:id')
  async getTemplate(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.getTemplate(tenantId, id);
  }

  /**
   * Validate statement against template
   */
  @Post('templates/:id/validate')
  async validateStatement(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { line_items: any[] },
  ) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    return this.dimService.validateStatement(tenantId, id, body.line_items);
  }

  /**
   * Delete template
   */
  @Delete('templates/:id')
  async deleteTemplate(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user?.preferred_username || req.user?.sub;
    await this.dimService.deleteTemplate(tenantId, id);
    return { message: 'Template deleted successfully' };
  }
}
