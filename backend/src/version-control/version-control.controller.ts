import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.constants';
import { VersionControlService } from './version-control.service';
import {
  CreateVersionDto,
  RestoreVersionDto,
  CompareVersionsDto,
  UpdatePolicyDto,
} from './dto/version.dto';

@ApiTags('Version Control')
@ApiBearerAuth('JWT-auth')
@Controller('version-control')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VersionControlController {
  constructor(private readonly versionService: VersionControlService) {}

  private getTenantFromToken(headers: any): string {
    const tenantId = headers['x-tenant-id'] || headers.authorization?.tenant_id || 'admin';
    return tenantId;
  }

  /**
   * Get version history for all objects (optionally filtered by type)
   * GET /version-control/versions?object_type=coa_entry&limit=50
   */
  @Get('versions')
  @Roles(Role.ANALYST) // Analyst or higher can view version history
  @ApiOperation({ summary: 'Get all version history' })
  async getAllVersions(
    @Headers() headers: any,
    @Query('object_type') objectType?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = this.getTenantFromToken(headers);
    const limitNum = limit ? parseInt(limit, 10) : 100;

    return this.versionService.getAllVersions(tenantId, objectType, limitNum);
  }

  /**
   * Get version history for a specific object
   * GET /version-control/versions/:objectType/:objectId
   */
  @Get('versions/:objectType/:objectId')
  async getVersionHistory(
    @Headers() headers: any,
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = this.getTenantFromToken(headers);
    const limitNum = limit ? parseInt(limit, 10) : 50;

    return this.versionService.getVersionHistory(
      tenantId,
      objectType,
      objectId,
      limitNum,
    );
  }

  /**
   * Get a specific version
   * GET /version-control/versions/:objectType/:objectId/:versionNumber
   */
  @Get('versions/:objectType/:objectId/:versionNumber')
  async getVersion(
    @Headers() headers: any,
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    const tenantId = this.getTenantFromToken(headers);
    const versionNum = parseInt(versionNumber, 10);

    if (isNaN(versionNum)) {
      throw new BadRequestException('Invalid version number');
    }

    return this.versionService.getVersion(
      tenantId,
      objectType,
      objectId,
      versionNum,
    );
  }

  /**
   * Manually create a version snapshot
   * POST /version-control/versions
   */
  @Post('versions')
  async createVersion(
    @Headers() headers: any,
    @Body() dto: CreateVersionDto,
  ) {
    const tenantId = this.getTenantFromToken(headers);
    const createdBy = headers.authorization?.sub || 'system';

    return this.versionService.createVersion(tenantId, dto, createdBy);
  }

  /**
   * Compare two versions
   * POST /version-control/versions/:objectType/:objectId/compare
   */
  @Post('versions/:objectType/:objectId/compare')
  async compareVersions(
    @Headers() headers: any,
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Body() dto: CompareVersionsDto,
  ) {
    const tenantId = this.getTenantFromToken(headers);
    const createdBy = headers.authorization?.sub;

    return this.versionService.compareVersions(
      tenantId,
      objectType,
      objectId,
      dto,
      createdBy,
    );
  }

  /**
   * Restore to a specific version
   * POST /version-control/versions/:objectType/:objectId/restore
   * Returns the snapshot data that should be applied
   */
  @Post('versions/:objectType/:objectId/restore')
  async restoreVersion(
    @Headers() headers: any,
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Body() dto: RestoreVersionDto,
  ) {
    const tenantId = this.getTenantFromToken(headers);

    return this.versionService.restoreVersion(
      tenantId,
      objectType,
      objectId,
      dto,
    );
  }

  /**
   * Get version policy for an object type
   * GET /version-control/policies/:objectType
   */
  @Get('policies/:objectType')
  async getPolicy(
    @Headers() headers: any,
    @Param('objectType') objectType: string,
  ) {
    const tenantId = this.getTenantFromToken(headers);

    return this.versionService.getPolicy(tenantId, objectType);
  }

  /**
   * Update version policy
   * PUT /version-control/policies/:objectType
   */
  @Put('policies/:objectType')
  async updatePolicy(
    @Headers() headers: any,
    @Param('objectType') objectType: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const tenantId = this.getTenantFromToken(headers);

    return this.versionService.updatePolicy(tenantId, objectType, dto);
  }

  /**
   * Clean up old versions based on retention policy
   * POST /version-control/cleanup/:objectType
   */
  @Post('cleanup/:objectType')
  async cleanupOldVersions(
    @Headers() headers: any,
    @Param('objectType') objectType: string,
  ) {
    const tenantId = this.getTenantFromToken(headers);

    return this.versionService.cleanupOldVersions(tenantId, objectType);
  }

  /**
   * Get version statistics
   * GET /version-control/stats
   */
  @Get('stats')
  async getStats(@Headers() headers: any) {
    const tenantId = this.getTenantFromToken(headers);

    return this.versionService.getVersionStats(tenantId);
  }
}
