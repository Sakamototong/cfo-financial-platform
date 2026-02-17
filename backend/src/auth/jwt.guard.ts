import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwksService } from './jwks.service';
import { Role } from './roles.constants';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwks: JwksService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      return true; // Skip authentication for public endpoints
    }

    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization as string | undefined;
    if (!auth || !auth.startsWith('Bearer ')) throw new UnauthorizedException('Missing Bearer token');
    const token = auth.split(' ')[1];
    
    // Allow demo tokens for testing
    if (token.startsWith('demo-token-')) {
      // Extract role from token name (e.g., demo-token-super-admin -> super_admin)
      const rolePart = token.replace('demo-token-', '');
      const role = rolePart.replace(/-/g, '_'); // Convert hyphens to underscores
      
      // Default demo user is 'admin', but allow overriding via X-Tenant-Id header for local dev
      const tenantHeader = req.headers?.['x-tenant-id'] || req.headers?.['X-Tenant-Id']
      const tenantId = typeof tenantHeader === 'string' ? tenantHeader : undefined
      
      req.user = { 
        sub: 'admin', 
        preferred_username: tenantId || 'admin',
        roles: [role], // Role extracted from token name
      };
      
      return true;
    }
    
    try {
      const payload = await this.jwks.verify(token);
      
      // Extract Keycloak roles from token
      const roles = this.extractRoles(payload);
      
      // Attach roles to user object
      req.user = {
        ...payload,
        roles,
      };
      
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Extract roles from Keycloak JWT token
   * Keycloak stores roles in realm_access.roles and resource_access.<client>.roles
   */
  private extractRoles(payload: any): string[] {
    const roles: string[] = [];
    
    // Extract realm roles (realm_access.roles)
    if (payload.realm_access && Array.isArray(payload.realm_access.roles)) {
      roles.push(...payload.realm_access.roles);
    }
    
    // Extract client-specific roles (resource_access.cfo-client.roles)
    const clientId = process.env.KEYCLOAK_CLIENT_ID || 'cfo-client';
    if (payload.resource_access && payload.resource_access[clientId]) {
      const clientRoles = payload.resource_access[clientId].roles;
      if (Array.isArray(clientRoles)) {
        roles.push(...clientRoles);
      }
    }
    
    // Filter to only CFO Platform roles
    const validRoles = Object.values(Role);
    const filteredRoles = roles.filter(role => validRoles.includes(role as Role));
    
    // Default to viewer if no valid roles found
    if (filteredRoles.length === 0) {
      return [Role.VIEWER];
    }
    
    return filteredRoles;
  }
}
