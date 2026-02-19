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

    try {
      // Super admins and demo admin can see all tenants
      if (isSuperAdmin || username === 'admin') {
        return this.tenantService.listTenants();
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
