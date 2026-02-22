/**
 * RBAC Role Definitions for CFO Platform
 * 
 * Aligned with Keycloak realm roles
 */

/**
 * Platform Roles (ordered by permission level)
 */
export enum Role {
  // Super Admin - Full system access across all tenants
  SUPER_ADMIN = 'super_admin',
  
  // Tenant Admin - Full access within tenant
  TENANT_ADMIN = 'tenant_admin',
  
  // Finance Manager - Can manage budgets, forecasts, approvals
  FINANCE_MANAGER = 'finance_manager',
  
  // Finance User - Can create/edit financial data
  FINANCE_USER = 'finance_user',
  
  // Analyst - Read-write access to scenarios and reports
  ANALYST = 'analyst',
  
  // Viewer - Read-only access
  VIEWER = 'viewer',
}

/**
 * Role hierarchy levels (higher = more permissions)
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  [Role.VIEWER]: 10,
  [Role.ANALYST]: 20,
  [Role.FINANCE_USER]: 30,
  [Role.FINANCE_MANAGER]: 40,
  'admin': 50, // alias used by demo tokens and frontend
  [Role.TENANT_ADMIN]: 50,
  [Role.SUPER_ADMIN]: 100,
};

/**
 * Role display names (for UI)
 */
export const ROLE_NAMES: Record<string, string> = {
  [Role.SUPER_ADMIN]: 'Super Administrator',
  [Role.TENANT_ADMIN]: 'Tenant Administrator',
  [Role.FINANCE_MANAGER]: 'Finance Manager',
  [Role.FINANCE_USER]: 'Finance User',
  [Role.ANALYST]: 'Analyst',
  [Role.VIEWER]: 'Viewer',
};

/**
 * Role descriptions
 */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  [Role.SUPER_ADMIN]: 'Full system access, can manage all tenants and system configuration',
  [Role.TENANT_ADMIN]: 'Full access within tenant, can manage users and company settings',
  [Role.FINANCE_MANAGER]: 'Can manage budgets, forecasts, cash flow, and approve workflows',
  [Role.FINANCE_USER]: 'Can create and edit financial statements, scenarios, and projections',
  [Role.ANALYST]: 'Can create scenarios, run reports, and perform variance analysis',
  [Role.VIEWER]: 'Read-only access to financial data and reports',
};

/**
 * Check if a user has required role or higher
 */
export function hasRole(userRoles: string[], requiredRole: string): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  
  return userRoles.some(role => {
    const userLevel = ROLE_HIERARCHY[role] || 0;
    return userLevel >= requiredLevel;
  });
}

/**
 * Check if user has ANY of the required roles
 */
export function hasAnyRole(userRoles: string[], requiredRoles: string[]): boolean {
  if (!userRoles || userRoles.length === 0) return false;
  
  return requiredRoles.some(requiredRole => 
    userRoles.includes(requiredRole)
  );
}

/**
 * Get highest role from user's roles
 */
export function getHighestRole(userRoles: string[]): string | null {
  if (!userRoles || userRoles.length === 0) return null;
  
  let highest = userRoles[0];
  let highestLevel = ROLE_HIERARCHY[highest] || 0;
  
  for (const role of userRoles) {
    const level = ROLE_HIERARCHY[role] || 0;
    if (level > highestLevel) {
      highest = role;
      highestLevel = level;
    }
  }
  
  return highest;
}
