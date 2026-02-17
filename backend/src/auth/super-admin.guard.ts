import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { SystemUsersService } from '../system-users/system-users.service';

/**
 * Guard to ensure user has super_admin role
 * Should be used after JwtAuthGuard
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly systemUsersService: SystemUsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // Get email from JWT payload
    const email = user.email || user.preferred_username;
    
    if (!email) {
      return false;
    }

    // Check if user is super admin in system_users table
    const systemUser = await this.systemUsersService.getSystemUserByEmail(email);
    
    if (!systemUser) {
      return false;
    }

    // Check if user is super admin and active
    if (systemUser.role === 'super_admin' && systemUser.is_active) {
      // Attach system user info to request for later use
      request.systemUser = systemUser;
      return true;
    }

    return false;
  }
}
