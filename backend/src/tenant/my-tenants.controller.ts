import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { UserService } from '../user/user.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('my-tenants')
@UseGuards(JwtAuthGuard)
export class MyTenantsController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly userService: UserService,
  ) {}

  @Get()
  async getMyTenants(@Request() req: any) {
    const username = req.user?.preferred_username || req.user?.email || req.user?.sub;
    
    try {
      // Demo mode - return all tenants
      if (username === 'admin') {
        return this.tenantService.listTenants();
      }
      
      // Get all tenants
      const allTenants = await this.tenantService.listTenants();
      
      // If no tenants found, return default
      if (!allTenants || allTenants.length === 0) {
        return [{ id: 'admin', name: 'Default Company' }];
      }
      
      const myTenants = [];
      
      // Check which tenants this user belongs to
      for (const tenant of allTenants) {
        try {
          const users = await this.userService.listUsers(tenant.id);
          const userExists = users.some((u: any) => u.email === username || u.username === username);
          if (userExists) {
            myTenants.push(tenant);
          }
        } catch (err: any) {
          // Skip tenants where query fails
          console.warn(`Failed to check user in tenant ${tenant.id}:`, err?.message || 'Unknown error');
        }
      }
      
      // If user doesn't belong to any tenant, return first tenant or default
      if (myTenants.length === 0) {
        return allTenants.length > 0 ? [allTenants[0]] : [{ id: 'admin', name: 'Default Company' }];
      }
      
      return myTenants;
    } catch (error) {
      console.error('Error in getMyTenants:', error);
      // Return a default tenant on error
      return [{ id: 'admin', name: 'Default Company' }];
    }
  }
}
