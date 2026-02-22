# Test Users - All Roles

## 🔐 User Credentials

### Super Admin
- **Username**: `superadmin`
- **Password**: `SuperAdmin123!`
- **Role**: System Administrator
- **Access**: Full system access, cross-tenant operations

> Quick demo: `admin` / `admin` (bypasses Keycloak — local dev only)

### Company Admin (CFO) — Tenant: admin
- **Username**: `admin-user`
- **Password**: `Secret123!`
- **Role**: admin
- **Access**: Full access within admin tenant

### Company Admin (CFO) — Tenant: Acme Corp
- **Username**: `acme-admin`
- **Password**: `Secret123!`
- **Role**: admin
- **Access**: Full access within Acme Corp tenant

### Financial Analyst — Tenant: admin
- **Username**: `analyst-user`
- **Password**: `Secret123!`
- **Role**: analyst
- **Access**: Create/edit financial data, run scenarios & projections

### Financial Analyst — Tenant: Acme Corp
- **Username**: `acme-analyst`
- **Password**: `Secret123!`
- **Role**: analyst

### Viewer (Executive) — Tenant: admin
- **Username**: `viewer-user`
- **Password**: `Secret123!`
- **Role**: viewer
- **Access**: Read-only access to reports and dashboards

### Viewer (Executive) — Tenant: Acme Corp
- **Username**: `acme-viewer`
- **Password**: `Secret123!`
- **Role**: viewer

---

## 🚀 Quick Login Test

### Test All Roles:

```bash
# 1. Test Super Admin
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"kc-superadmin","password":"Secret123!"}'

# 2. Test Company Admin
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo-admin@testco.local","password":"Secret123!"}'

# 3. Test Analyst
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"analyst@testco.local","password":"Secret123!"}'

# 4. Test Viewer
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"viewer@testco.local","password":"Secret123!"}'
```

---

## 📋 Role Permissions Matrix

| Feature | Super Admin | Company Admin | Analyst | Viewer |
|---------|-------------|---------------|---------|--------|
| Create Tenants | ✅ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ✅ | ❌ | ❌ |
| Create DIM Templates | ✅ | ✅ | ✅ | ❌ |
| Create Scenarios | ✅ | ✅ | ✅ | ❌ |
| Create Statements | ✅ | ✅ | ✅ | ❌ |
| Run Projections | ✅ | ✅ | ✅ | ❌ |
| Upload ETL | ✅ | ✅ | ✅ | ❌ |
| Approve Workflows | ✅ | ✅ | ❌ | ❌ |
| View Dashboard | ✅ | ✅ | ✅ | ✅ |
| View Financials | ✅ | ✅ | ✅ | ✅ |
| View Reports | ✅ | ✅ | ✅ | ✅ |
| System Admin Panel | ✅ | ❌ | ❌ | ❌ |

---

## 🧪 Testing Scenarios

### Scenario 1: Admin Setup Flow
```
1. Login as: demo-admin@testco.local
2. Navigate to DIM → Create template
3. Navigate to Scenarios → Create "Budget"
4. Navigate to Users → Invite analyst
5. Verify onboarding wizard appears
```

### Scenario 2: Analyst Data Entry
```
1. Login as: analyst@testco.local
2. Navigate to Financials → Create statement
3. Enter line items
4. Navigate to Projections → Generate forecast
5. Navigate to Reports → View variance
```

### Scenario 3: Viewer Read-Only
```
1. Login as: viewer@testco.local
2. Navigate to Dashboard → View charts
3. Navigate to Financials → View list (no create button)
4. Navigate to Reports → View only
5. Verify no edit/create actions visible
```

### Scenario 4: Multi-Tenant Access
```
1. Login as: kc-superadmin
2. Navigate to Tenants → Create "ACME Corp"
3. Switch company dropdown → testco
4. Verify data loads for testco
5. Switch to ACME Corp → Verify empty state
```

---

## 🛠️ Create Additional Users

### Via Keycloak UI:
1. Navigate to http://localhost:8081
2. Login with admin/admin
3. Go to Users → Create user
4. Set password in Credentials tab
5. Assign roles as needed

### Via API:
```bash
# Get Keycloak admin token
TOKEN=$(curl -sS -X POST http://localhost:8081/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r .access_token)

# Create new user
curl -X POST http://localhost:8081/admin/realms/master/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser@testco.local",
    "email": "newuser@testco.local",
    "enabled": true,
    "emailVerified": true
  }'

# Set password (use user ID from response)
USER_ID="<user-id>"
curl -X PUT "http://localhost:8081/admin/realms/master/users/${USER_ID}/reset-password" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"password","value":"Secret123!","temporary":false}'
```

---

## 📝 User Role Assignment

### In Backend Database:
```sql
-- Connect to tenant database
\c tenant_testco_testco

-- Create user record with role
INSERT INTO users (id, username, email, role, created_at)
VALUES (
  gen_random_uuid(),
  'analyst@testco.local',
  'analyst@testco.local',
  'analyst',
  NOW()
);
```

### Via Backend API:
```bash
# Create user in tenant DB
curl -X POST http://localhost:3000/users \
  -H "Authorization: Bearer <demo-token or JWT>" \
  -H "X-Tenant-Id: testco" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "analyst@testco.local",
    "email": "analyst@testco.local",
    "role": "analyst"
  }'
```

---

## 🔍 Troubleshooting

### "User not found" error
→ User exists in Keycloak but not in tenant DB
→ Run: POST /users with user details

### "Insufficient permissions"
→ Check role in tenant DB users table
→ Verify role assignment matches: admin > analyst > viewer

### "401 Unauthorized"
→ Token expired; re-login
→ Check X-Tenant-Id header matches user's tenant

### Can't see certain menu items
→ Expected; menus filtered by role
→ Admin menu only visible to admin role

---

## 📊 Current Users Status

| Username | Keycloak | Tenant DB | Role | Status |
|----------|----------|-----------|------|--------|
| kc-superadmin | ✅ | ➖ (not needed) | admin | Active |
| demo-admin@testco.local | ✅ | ✅ | admin | Active |
| analyst@testco.local | ✅ Ready | ✅ Created | analyst | Active |
| viewer@testco.local | ✅ Ready | ✅ Created | viewer | Active |

**Note**: Keycloak users (analyst, viewer) can be created via Keycloak admin UI at http://localhost:8081 with admin/admin credentials. Set password to `Secret123!` for consistency.

---

**Note**: All passwords are set to `Secret123!` for testing purposes. Change in production!

**Last Updated**: February 22, 2026
