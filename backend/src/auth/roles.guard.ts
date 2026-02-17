import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { Role, ROLE_HIERARCHY, hasRole } from './roles.constants';

/**
 * RBAC Guard - Enforces role-based access control
 * 
 * Uses Keycloak roles extracted from JWT token.
 * Supports role hierarchy (higher roles inherit lower permissions).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required = public endpoint
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Get user roles from JWT token (extracted by JwtAuthGuard)
    const userRoles: string[] = user.roles || [];
    
    if (userRoles.length === 0) {
      throw new ForbiddenException('No roles assigned to user');
    }

    // Super admin always has access
    if (userRoles.includes(Role.SUPER_ADMIN)) {
      return true;
    }

    // Check if user has any of the required roles (using role hierarchy)
    const hasAccess = requiredRoles.some(requiredRole => {
      return hasRole(userRoles, requiredRole);
    });

    if (!hasAccess) {
      const userRolesList = userRoles.join(', ');
      const requiredRolesList = requiredRoles.join(', ');
      
      throw new ForbiddenException(
        `Access denied. Required roles: [${requiredRolesList}]. User has: [${userRolesList}]`
      );
    }

    return true;
  }
}
