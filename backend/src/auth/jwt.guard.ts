import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwksService } from './jwks.service';
import { Role } from './roles.constants';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SystemUsersService } from '../system-users/system-users.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwks: JwksService,
    private readonly reflector: Reflector,
    private readonly systemUsersService: SystemUsersService,
    private readonly db: DatabaseService,
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
      // Extract role from token name (e.g., demo-token-super-admin-1234567890 -> super_admin)
      // Remove 'demo-token-' prefix and timestamp suffix
      const tokenPart = token.replace('demo-token-', '');
      // If token ends with timestamp (digits), remove it
      const rolePart = tokenPart.replace(/-\d+$/, '');
      const role = rolePart.replace(/-/g, '_'); // Convert hyphens to underscores
      
      // Default demo user is 'admin', but allow overriding via X-Tenant-Id header for local dev
      const tenantHeader = req.headers?.['x-tenant-id'] || req.headers?.['X-Tenant-Id']
      const tenantId = typeof tenantHeader === 'string' ? tenantHeader : undefined
      
      req.user = { 
        sub: 'admin', 
        preferred_username: tenantId || 'admin',
        roles: [role, Role.FINANCE_USER], // Demo admin gets super_admin + finance_user
      };
      
      return true;
    }
    
    try {
      const payload = await this.jwks.verify(token);
      
      // Extract Keycloak roles from token
      let roles = this.extractRoles(payload);
      
      // Enrich roles with system_users table data
      // This allows super_admin users to bypass all tenant role checks
      const email = payload.email || payload.preferred_username;
      if (email && typeof email === 'string') {
        try {
          const systemUser = await this.systemUsersService.getSystemUserByEmail(email);
          if (systemUser && systemUser.role === 'super_admin' && systemUser.is_active) {
            // Add super_admin role if not already present
            if (!roles.includes(Role.SUPER_ADMIN)) {
              roles = [Role.SUPER_ADMIN, ...roles];
            }
          }
        } catch (err: any) {
          // If system user check fails, continue with JWT roles only
          console.log('[JwtAuthGuard] Could not check system user role:', err?.message || 'Unknown error');
        }

        // If Keycloak provided no meaningful CFO roles (fell back to viewer),
        // look up the user's role in the tenant users table so DB-managed
        // roles (e.g. 'admin', 'analyst') are always honoured.
        const onlyViewer = roles.length === 1 && roles[0] === Role.VIEWER;
        if (onlyViewer) {
          try {
            const tenantHeader = req.headers?.['x-tenant-id'] || req.headers?.['X-Tenant-Id'];
            const tenantId = typeof tenantHeader === 'string' && tenantHeader ? tenantHeader : 'admin';
            const result = await this.db.queryTenant(
              tenantId,
              'SELECT role FROM users WHERE email = $1 LIMIT 1',
              [email],
            );
            if (result.rows.length > 0) {
              const dbRoleRaw: string = result.rows[0].role;
              const dbRole = JwtAuthGuard.ROLE_ALIASES[dbRoleRaw] ?? dbRoleRaw;
              const validRoles = Object.values(Role);
              if (validRoles.includes(dbRole as Role)) {
                roles = [dbRole];
              }
            }
          } catch (err: any) {
            console.log('[JwtAuthGuard] Could not look up tenant user role:', err?.message || 'Unknown error');
          }
        }
      }
      
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
   * Role aliases: map external/legacy role names to internal Role enum values.
   * This handles Keycloak realms that use 'admin' instead of 'tenant_admin', etc.
   */
  private static readonly ROLE_ALIASES: Record<string, string> = {
    'admin': Role.TENANT_ADMIN,
    'tenant-admin': Role.TENANT_ADMIN,
    'finance-manager': Role.FINANCE_MANAGER,
    'finance-user': Role.FINANCE_USER,
    'super-admin': Role.SUPER_ADMIN,
  };

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

    // Apply role aliases (e.g. Keycloak 'admin' → 'tenant_admin')
    const aliasedRoles = roles.map(r => JwtAuthGuard.ROLE_ALIASES[r] ?? r);
    
    // Filter to only CFO Platform roles
    const validRoles = Object.values(Role);
    const filteredRoles = aliasedRoles.filter(role => validRoles.includes(role as Role));
    
    // Default to viewer if no valid roles found
    if (filteredRoles.length === 0) {
      return [Role.VIEWER];
    }
    
    return filteredRoles;
  }
}
