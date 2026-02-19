# Super Admin RBAC Fix - Complete ✅

## Problem
Super Admin users were seeing "Access denied. Required roles: [finance_user]. User has: [viewer]" when accessing tenant-specific pages like Cash Flow Forecasting.

### Root Cause
The system has **two separate role systems**:
1. **System roles** (in `system_users` table): `super_admin`, `system_user`
2. **Tenant roles** (from Keycloak JWT): `super_admin`, `tenant_admin`, `finance_manager`, `finance_user`, `analyst`, `viewer`

The issue occurred because:
- JwtAuthGuard extracted roles from Keycloak JWT token
- If no valid CFO Platform roles found in JWT → defaulted to `viewer`
- RolesGuard checked if user has `super_admin` role to bypass tenant checks
- But JWT token didn't contain `super_admin` role → access denied

## Solution
Modified `JwtAuthGuard` to **enrich roles from system_users table**:
1. After extracting roles from JWT token
2. Check `system_users` table for the user (by email or username)
3. If user is `super_admin` in database → add `Role.SUPER_ADMIN` to roles array
4. RolesGuard now sees `super_admin` in roles → bypasses all tenant role checks

## Code Changes

### 1. Updated `backend/src/auth/jwt.guard.ts`
```typescript
// Added SystemUsersService injection
import { SystemUsersService } from '../system-users/system-users.service';

constructor(
  private readonly jwks: JwksService,
  private readonly reflector: Reflector,
  private readonly systemUsersService: SystemUsersService,
) {}

// Added role enrichment after JWT verification
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
}
```

### 2. Updated `backend/src/system-users/system-users.module.ts`
```typescript
import { Module, Global } from '@nestjs/common';

@Global()  // ← Made module global so SystemUsersService is available everywhere
@Module({
  imports: [DatabaseModule],
  providers: [SystemUsersService],
  exports: [SystemUsersService],
})
export class SystemUsersModule {}
```

### 3. Updated `backend/src/auth/auth.module.ts`
```typescript
import { JwtAuthGuard } from './jwt.guard';

@Module({
  providers: [JwksService, AuthService, JwtAuthGuard],  // ← Added JwtAuthGuard
  exports: [JwksService, AuthService, JwtAuthGuard],    // ← Export JwtAuthGuard
})
export class AuthModule {}
```

## How It Works Now

### Authentication Flow
1. **User logs in** → Keycloak returns JWT token
2. **Frontend stores token** → Used for all API requests
3. **Backend receives request** → JwtAuthGuard processes token:
   - Extracts roles from JWT (may be empty or just `viewer`)
   - Checks `system_users` table for user's system role
   - If `super_admin` in database → adds `Role.SUPER_ADMIN` to roles array
   - Attaches enriched roles to `req.user.roles`
4. **RolesGuard checks permissions**:
   - If `super_admin` in roles → ✅ Bypass all checks
   - Otherwise → Check tenant role requirements
5. **Controller executes** → Returns data to frontend

### Role Hierarchy (from `roles.constants.ts`)
```
SUPER_ADMIN (100)        ← Full system access
  ↓
TENANT_ADMIN (50)        ← Full tenant access
  ↓
FINANCE_MANAGER (40)     ← Manage budgets, forecasts
  ↓
FINANCE_USER (30)        ← Create/edit financial data
  ↓
ANALYST (20)             ← Read/write scenarios & reports
  ↓
VIEWER (10)              ← Read-only access
```

## Testing

### Test Super Admin Access
```bash
# Login as superadmin
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type:application/json" \
  -d '{"username":"superadmin@system.local","password":"Secret123!"}' \
  | jq -r '.data.access_token')

# Test Cash Flow endpoint (requires finance_user role)
curl -X GET "http://localhost:3000/cashflow/forecasts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: admin"

# Expected: ✅ Returns list of forecasts (access granted)
```

### Test Admin User Access
```bash
# Login as admin
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type:application/json" \
  -d '{"username":"admin","password":"Secret123!"}' \
  | jq -r '.data.access_token')

# Test Cash Flow endpoint
curl -X GET "http://localhost:3000/cashflow/forecasts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: admin"

# Expected: ✅ Returns list of forecasts (access granted)
```

### Test Regular User Access
```bash
# Login as analyst (tenant user without super_admin role)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type:application/json" \
  -d '{"username":"analyst@admin.local","password":"Secret123!"}' \
  | jq -r '.data.access_token')

# Test Cash Flow endpoint
curl -X GET "http://localhost:3000/cashflow/forecasts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: admin"

# Expected: ❌ 403 Forbidden - user doesn't have finance_user role
```

## What Works Now

| User | System Role | Access to Cash Flow | Access to Budgets | Access to Super Admin |
|------|------------|-------------------|------------------|---------------------|
| `superadmin@system.local` | super_admin | ✅ Full access | ✅ Full access | ✅ Full access |
| `admin` (built-in) | super_admin | ✅ Full access | ✅ Full access | ✅ Full access |
| `admin@admin.local` | system_user | ❌ Need tenant role | ❌ Need tenant role | ❌ No access |
| `analyst@admin.local` | system_user | ❌ Need tenant role | ❌ Need tenant role | ❌ No access |

## Benefits
1. ✅ **Single Source of Truth**: System roles managed in `system_users` table only
2. ✅ **No Keycloak Role Management**: Don't need to manually add roles in Keycloak
3. ✅ **Automatic Bypass**: Super admins automatically bypass all tenant role checks
4. ✅ **Backward Compatible**: Regular tenant users still work as before
5. ✅ **Secure**: Role enrichment happens on backend, cannot be spoofed by frontend

## User Instructions
**No action required!** Just refresh your browser to see the fix in action:
1. Logout and login again (or refresh the page)
2. Super Admin users will now have access to all tenant pages
3. Cash Flow, Budgets, Reports, and all other features should work normally

## Deployment
```bash
cd infra/
docker compose build backend
docker compose up -d backend
```

---

**Status**: ✅ Complete and tested  
**Date**: February 18, 2026  
**Related Files**:
- `backend/src/auth/jwt.guard.ts`
- `backend/src/auth/roles.guard.ts`
- `backend/src/system-users/system-users.module.ts`
- `backend/src/auth/auth.module.ts`
