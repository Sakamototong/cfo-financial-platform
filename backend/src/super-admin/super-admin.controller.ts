import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/roles.constants';
import { SystemUsersService } from '../system-users/system-users.service';
import { TenantService } from '../tenant/tenant.service';
import { UserService } from '../user/user.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Super Admin')
@ApiBearerAuth('JWT-auth')
@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN) // All endpoints require super admin role
export class SuperAdminController {
  constructor(
    private readonly systemUsersService: SystemUsersService,
    private readonly tenantService: TenantService,
    private readonly userService: UserService,
  ) {}

  // ==================== System Users Management ====================

  @Get('system-users')
  @ApiOperation({ summary: 'List all system users with tenant memberships' })
  async listSystemUsers(@Query('role') role?: string, @Query('search') search?: string) {
    if (search) {
      const users = await this.systemUsersService.searchUsers(search);
      const memberships: Record<string, any[]> = {};
      
      // Get memberships for each user
      for (const user of users) {
        const userMemberships = await this.systemUsersService.getUserTenants(user.id);
        const allTenants = await this.tenantService.listTenants();
        
        memberships[user.id] = userMemberships.map(m => {
          const tenant = allTenants.find(t => t.id === m.tenant_id);
          return {
            ...m,
            tenant_name: tenant?.name || m.tenant_id,
          };
        });
      }
      
      return { users, memberships };
    }
    
    const filters: any = {};
    if (role && (role === 'super_admin' || role === 'system_user')) {
      filters.role = role;
    }
    
    const users = await this.systemUsersService.listSystemUsers(filters);
    const memberships: Record<string, any[]> = {};
    const allTenants = await this.tenantService.listTenants();
    
    // Get memberships for each user
    for (const user of users) {
      const userMemberships = await this.systemUsersService.getUserTenants(user.id);
      memberships[user.id] = userMemberships.map(m => {
        const tenant = allTenants.find(t => t.id === m.tenant_id);
        return {
          ...m,
          tenant_name: tenant?.name || m.tenant_id,
        };
      });
    }
    
    return { users, memberships };
  }

  @Post('system-users')
  @ApiOperation({ summary: 'Create a new system user' })
  async createSystemUser(@Body() data: {
    email: string;
    full_name: string;
    role: 'super_admin' | 'system_user';
    password: string;
  }) {
    // Create user in system_users table
    const user = await this.systemUsersService.createSystemUser({
      email: data.email,
      full_name: data.full_name,
      role: data.role,
    });

    // TODO: Create user in Keycloak with password
    // For now, return the user
    return user;
  }

  @Put('system-users/:id/role')
  @ApiOperation({ summary: 'Update system user role' })
  async updateSystemUserRole(
    @Param('id') id: string,
    @Body() data: { role: 'super_admin' | 'system_user' }
  ) {
    return this.systemUsersService.updateSystemUser(id, { role: data.role });
  }

  @Put('system-users/:id/status')
  @ApiOperation({ summary: 'Update system user active status' })
  async updateSystemUserStatus(
    @Param('id') id: string,
    @Body() data: { is_active: boolean }
  ) {
    return this.systemUsersService.updateSystemUser(id, { is_active: data.is_active });
  }

  @Delete('system-users/:id')
  @ApiOperation({ summary: 'Delete system user' })
  async deleteSystemUser(@Param('id') id: string) {
    // Remove from all tenant memberships first
    const memberships = await this.systemUsersService.getUserTenants(id);
    for (const membership of memberships) {
      await this.systemUsersService.removeUserFromTenant(id, membership.tenant_id);
    }
    
    // Delete from system_users table
    await this.systemUsersService.deleteSystemUser(id);
    
    // TODO: Delete from Keycloak
    
    return { success: true };
  }

  @Get('users')
  async listAllUsers(@Query('role') role?: string, @Query('search') search?: string) {
    if (search) {
      return this.systemUsersService.searchUsers(search);
    }
    
    const filters: any = {};
    if (role && (role === 'super_admin' || role === 'system_user')) {
      filters.role = role;
    }
    
    return this.systemUsersService.listSystemUsers(filters);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.systemUsersService.getSystemUserById(id);
  }

  @Post('users')
  async createUser(@Body() data: {
    email: string;
    full_name: string;
    role: 'super_admin' | 'system_user';
  }) {
    return this.systemUsersService.createSystemUser(data);
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() data: {
      full_name?: string;
      role?: 'super_admin' | 'system_user';
      is_active?: boolean;
    }
  ) {
    return this.systemUsersService.updateSystemUser(id, data);
  }

  @Get('users/:id/tenants')
  async getUserTenants(@Param('id') id: string) {
    const memberships = await this.systemUsersService.getUserTenants(id);
    const allTenants = await this.tenantService.listTenants();
    
    // Enrich with tenant details
    return memberships.map(m => {
      const tenant = allTenants.find(t => t.id === m.tenant_id);
      return {
        ...m,
        tenant_name: tenant?.name || m.tenant_id,
      };
    });
  }

  @Post('users/:userId/tenants/:tenantId')
  async assignUserToTenant(
    @Param('userId') userId: string,
    @Param('tenantId') tenantId: string,
    @Body() data: { role: 'admin' | 'analyst' | 'viewer' }
  ) {
    // Create membership in central table
    const membership = await this.systemUsersService.assignUserToTenant(
      userId,
      tenantId,
      data.role
    );

    // Also create user record in tenant's database
    const systemUser = await this.systemUsersService.getSystemUserById(userId);
    if (systemUser) {
      try {
        // Check if user already exists in tenant
        const tenantUsers = await this.userService.listUsers(tenantId);
        const existingUser = tenantUsers.find((u: any) => u.email === systemUser.email);
        
        if (!existingUser) {
          // Use upsertUser method from UserService
          await this.userService.upsertUser(tenantId, {
            tenant_id: tenantId,
            email: systemUser.email,
            full_name: systemUser.full_name,
            role: data.role,
            is_active: systemUser.is_active,
          });
        }
      } catch (err) {
        console.error('Failed to create user in tenant database:', err);
      }
    }

    return membership;
  }

  @Delete('users/:userId/tenants/:tenantId')
  async removeUserFromTenant(
    @Param('userId') userId: string,
    @Param('tenantId') tenantId: string
  ) {
    await this.systemUsersService.removeUserFromTenant(userId, tenantId);
    return { success: true };
  }

  // ==================== Tenant Management ====================

  @Get('tenants')
  async listAllTenants() {
    const tenants = await this.tenantService.listTenants();
    
    // Enrich with user counts and subscription info
    const enriched = await Promise.all(
      tenants.map(async (tenant) => {
        try {
          const users = await this.systemUsersService.getTenantUsers(tenant.id);
          return {
            ...tenant,
            user_count: users.length,
            active_user_count: users.filter(u => u.is_active).length,
          };
        } catch (err) {
          return {
            ...tenant,
            user_count: 0,
            active_user_count: 0,
          };
        }
      })
    );
    
    return enriched;
  }

  @Get('tenants/:id')
  async getTenantById(@Param('id') id: string) {
    const tenant = await this.tenantService.getTenant(id);
    const users = await this.systemUsersService.getTenantUsers(id);
    
    return {
      ...tenant,
      users,
    };
  }

  @Get('tenants/:id/users')
  async getTenantUsers(@Param('id') id: string) {
    return this.systemUsersService.getTenantUsers(id);
  }

  @Post('tenants')
  async createTenant(@Body() data: { name: string }) {
    return this.tenantService.createTenant(data.name);
  }

  @Delete('tenants/:id')
  async deleteTenant(@Param('id') id: string) {
    await this.tenantService.deleteTenant(id);
    return { success: true };
  }

  // ==================== Analytics ====================

  @Get('analytics/overview')
  async getSystemOverview() {
    const [allTenants, allUsers, superAdmins] = await Promise.all([
      this.tenantService.listTenants(),
      this.systemUsersService.listSystemUsers(),
      this.systemUsersService.getSuperAdmins(),
    ]);

    const activeTenants = allTenants.filter(t => t.id); // All created tenants are active by default
    const activeUsers = allUsers.filter(u => u.is_active);

    return {
      total_tenants: allTenants.length,
      active_tenants: activeTenants.length,
      total_users: allUsers.length,
      active_users: activeUsers.length,
      super_admins: superAdmins.length,
      timestamp: new Date(),
    };
  }

  @Get('analytics/tenants/:id/stats')
  async getTenantStats(@Param('id') id: string) {
    const [users, company] = await Promise.all([
      this.systemUsersService.getTenantUsers(id),
      this.userService.getCompanyProfile(id).catch(() => null),
    ]);

    return {
      tenant_id: id,
      total_users: users.length,
      active_users: users.filter(u => u.is_active).length,
      admin_count: users.filter(u => u.tenant_role === 'admin').length,
      analyst_count: users.filter(u => u.tenant_role === 'analyst').length,
      viewer_count: users.filter(u => u.tenant_role === 'viewer').length,
      company_profile: company,
    };
  }

  // ==================== Current Super Admin Info ====================

  @Get('me')
  async getCurrentSuperAdmin(@Request() req: any) {
    return req.systemUser; // Attached by SuperAdminGuard
  }
}
