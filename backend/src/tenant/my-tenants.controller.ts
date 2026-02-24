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
    const username = req.user?.preferred_username || req.user?.sub;
    const email = req.user?.email || username;
    const roles: string[] = req.user?.roles || [];
    const isSuperAdmin = roles.includes('super_admin');
    // demo_username is the actual login name (e.g. 'admin-user'), not the tenant ID
    const demoUsername = req.user?.demo_username;

    try {
      // Only true super_admin users (admin/superadmin) can see all tenants
      // Regular 'admin' role users should only see their own tenant
      if (isSuperAdmin) {
        return this.tenantService.listTenants();
      }

      // For demo users, return only the tenant mapped to their username
      if (demoUsername) {
        const { AuthService } = require('../auth/auth.service');
        // Build a fake token to use parseDemoToken logic for tenant lookup
        const parsed = AuthService.parseDemoToken(`demo-token-x.${demoUsername}-0`);
        const userTenant = parsed?.tenant || 'admin';
        const allTenants = await this.tenantService.listTenants();
        const matched = allTenants.filter((t: any) => t.id === userTenant);
        return matched.length > 0 ? matched : [allTenants[0] || { id: userTenant, name: userTenant }];
      }

      // Get all tenants
      const allTenants = await this.tenantService.listTenants();

      if (!allTenants || allTenants.length === 0) {
        return [{ id: 'admin', name: 'Default Company' }];
      }

      const myTenants = [];

      // Check which tenants this user belongs to — match on email OR username
      for (const tenant of allTenants) {
        try {
          const users = await this.userService.listUsers(tenant.id);
          const userExists = users.some(
            (u: any) =>
              u.email === email ||
              u.email === username ||
              u.username === username ||
              u.username === email,
          );
          if (userExists) {
            myTenants.push(tenant);
          }
        } catch (err: any) {
          console.warn(`Failed to check user in tenant ${tenant.id}:`, err?.message || 'Unknown error');
        }
      }

      if (myTenants.length === 0) {
        return allTenants.length > 0 ? [allTenants[0]] : [{ id: 'admin', name: 'Default Company' }];
      }

      return myTenants;
    } catch (error) {
      console.error('Error in getMyTenants:', error);
      return [{ id: 'admin', name: 'Default Company' }];
    }
  }
}
