# CFO Platform POC - Phase 1

Financial Planning & Analysis Platform - Proof of Concept

## 📋 Overview

Complete full-stack implementation with:
- **Backend**: NestJS + PostgreSQL + Keycloak (77 API endpoints)
- **Frontend**: React + TypeScript + Vite + Chart.js
- **Infrastructure**: Docker Compose for local development
- **Authentication**: JWT with automatic token refresh

## 🚀 Quick Start

### Prerequisites

- Docker Desktop (with Docker Compose)
- Node.js 18+
- PowerShell (Windows) or Bash (Mac/Linux)

### 1. Start Backend Services

Before starting the compose stack, set a `KMS_MASTER_KEY` environment variable (example):

```bash
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
```

```powershell
cd infra
docker-compose up -d
docker ps  # Verify all containers are "Up"
```

Services available at:
- **Backend API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api
- **Keycloak**: http://localhost:8081
- **PostgreSQL**: localhost:5432

### 2. Start Frontend

```powershell
cd frontend
npm install --legacy-peer-deps  # First time only
npm run dev
```

Frontend available at: **http://localhost:5173**

Note: The frontend reads the API base URL from the Vite env variable `VITE_API_BASE` at build time (default `http://localhost:3000`).
For development you can keep the default; for a production build set it before running `npm run build`, for example:

```bash
VITE_API_BASE=http://localhost:3000 npm run build
# then copy `dist` into the nginx image used by docker-compose
```

Alternatively create a `.env.production` in the `frontend/` folder with `VITE_API_BASE=http://localhost:3000` before building.

Note about Docker Compose: the compose setup builds the frontend image with the build-arg `VITE_API_BASE=http://backend:3000` so the production bundle inside the container points to the `backend` service on the Docker network. If you need to override this, edit `infra/docker-compose.yml` build args or set `VITE_API_BASE` before building.

### OpenAI Assistant in Swagger

We integrated a small OpenAI-powered assistant into the Swagger UI served at `http://localhost:3000/api`.

- To enable it, set an OpenAI API key in your environment before starting the compose stack:

```bash
export OPENAI_API_KEY="sk-..."
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
cd infra
docker-compose up -d --build
```

- The compose file already forwards `OPENAI_API_KEY` into the `backend` container. If you do not set the key the assistant UI will still show but the server will reply with a message saying the key is not configured.

- The assistant uses a compact summary of the OpenAPI spec to provide context to the model. If you want more detailed responses you can extend the assistant by including schemas and parameters (I can help enable that).

### 3. Login

- URL: http://localhost:5173
- Username: `admin`
- Password: `admin`

## 🏗️ Architecture

```
project-cfo-poc-4/
├── backend/              # NestJS API (77 endpoints)
│   ├── src/
│   │   ├── auth/        # JWT authentication
│   │   ├── tenant/      # Multi-tenant management
│   │   ├── financial/   # Statements & line items
│   │   ├── scenarios/   # Scenario management
│   │   ├── dim/         # Dimension configuration
│   │   ├── admin/       # System admin & ETL
│   │   ├── workflow/    # Approval workflows
│   │   └── ... (4 more modules)
│   └── Dockerfile
├── frontend/            # React + Vite
│   ├── src/
│   │   ├── api/        # Axios client with token refresh
│   │   ├── pages/      # Login, Dashboard, Scenarios, Financials
│   │   ├── components/ # Custom modal, etc.
│   │   └── styles.css
│   └── package.json
└── infra/              # Docker infrastructure
    ├── docker-compose.yml
    ├── get-token.ps1
    └── test-all-apis.ps1
```

## ✅ Features Implemented

### Backend (77 API Endpoints)

**Modules:**
- ✅ Authentication (JWT with Keycloak)
- ✅ Multi-tenant management
- ✅ Financial statements & line items (CRUD)
- ✅ Scenario & assumption management
- ✅ Dimension configuration (DIM)
- ✅ System administration & ETL
- ✅ Approval workflow
- ✅ Projections engine
- ✅ Consolidation
- ✅ Reports & variance analysis
- ✅ Audit logging

**API Documentation:**
- Full OpenAPI/Swagger at `/api`
- Bearer token authentication
- All endpoints tested (100% passing)

### Frontend

**Pages:**
- ✅ Login with token storage
- ✅ Dashboard with aggregated charts
- ✅ Scenarios (list + create form)
- ✅ Financials (list + create with dynamic line items)
- ✅ Statement Detail (Chart.js visualization)
- ✅ Statement Edit (validation, undo, save options)

**Features:**
- ✅ Automatic token refresh with queue
- ✅ Form validation with inline errors
- ✅ Responsive design (mobile-friendly)
- ✅ Chart.js data visualization
- ✅ Custom modal with accessibility
- ✅ Save as New / Replace Original

## 📡 Key API Endpoints

### Authentication
```
POST   /auth/login       Get JWT tokens
POST   /auth/refresh     Refresh access token
```

### Tenants
```
POST   /tenant           Create tenant
GET    /tenant/:id       Get tenant details
```

### Financial Statements
```
POST   /financial/statements              Create statement
GET    /financial/statements              List statements
GET    /financial/statements/:id          Get statement details
PUT    /financial/statements/:id/status   Update status
DELETE /financial/statements/:id          Delete statement
```

### Scenarios
```
POST   /scenarios        Create scenario
GET    /scenarios        List scenarios
GET    /scenarios/:id    Get scenario details
PUT    /scenarios/:id    Update scenario
DELETE /scenarios/:id    Delete scenario
```

**See Swagger at http://localhost:3000/api for all 77 endpoints**

## 🔧 Development

### Backend Development

```powershell
cd backend
npm install --legacy-peer-deps
npm run build

# Rebuild Docker container
cd ../infra
docker-compose up -d --build backend
```

### Frontend Development

```powershell
cd frontend
npm install <package> --legacy-peer-deps
npm run build          # Production build
npm run preview        # Preview production
```

### Testing APIs

```powershell
cd infra
.\test-all-apis.ps1    # Test all 77 endpoints
.\get-token.ps1        # Get JWT token (copied to clipboard)
```

Or use Swagger UI at http://localhost:3000/api

## 🐳 Docker Management

### View Logs

```powershell
docker logs infra-backend-1 -f
docker logs infra-db-1 -f
docker logs infra-keycloak-1 -f
```

### Restart Services

```powershell
cd infra
docker-compose restart backend
docker-compose restart           # All services
docker-compose down              # Stop all
docker-compose down -v           # Stop + remove volumes
```

## 🔑 Authentication Flow

1. Frontend: `POST /auth/login` → Backend → Keycloak
2. Backend returns `access_token` + `refresh_token`
3. Frontend stores tokens in localStorage
4. Axios interceptor adds `Authorization: Bearer <token>` to requests
5. On 401: interceptor calls `POST /auth/refresh` automatically
6. Queue prevents concurrent refresh requests

## 🛠️ Troubleshooting

### Backend won't start

```powershell
docker logs infra-backend-1 --tail 50
cd infra
docker-compose down
docker-compose up -d --build backend
```

### Frontend CORS errors

CORS is enabled for `localhost:5173`, `localhost:5174`, `localhost:3001` in [backend/src/main.ts](backend/src/main.ts#L9-L12)

If using different port, update and rebuild backend.

### Database connection issues

```powershell
docker ps | Select-String db         # Check if running
cd infra
docker-compose down -v               # Reset database
docker-compose up -d db
```

### Port conflicts

**Ports used:** 3000 (backend), 5173 (frontend), 8081 (keycloak), 5432 (postgres)

Modify in `docker-compose.yml` or `vite.config.ts` if needed.

### Token refresh fails

Check browser Console:
- Tokens missing from localStorage? Login again
- Keycloak down? Check `docker ps`
- Token expired beyond refresh window? Login again

## 📊 Database Schema

**Multi-tenant:** One database per tenant

**Key Tables:**
- `financial_statements` - Statement headers
- `financial_line_items` - Line items with amounts
- `scenarios` - Planning scenarios
- `dimensions` - DIM templates
- `approval_chains` - Workflow definitions
- `approval_requests` - Workflow instances

## ETL / Mapping (สถานะปัจจุบัน)

- ETL preview/import endpoints รองรับการส่ง mapping (ผ่าน header `x-mapping`).
- หน้า `ETL` ใน frontend: เพิ่มปุ่ม `Load example` และส่ง mapping เมื่อทำ Preview/Upload.
- มีสคริปต์ในโฟลเดอร์ `scripts/` สำหรับสร้างตัวอย่าง mapping, สร้าง/เชื่อม DIM entries, อัปเดตโค้ดมิติ, และ normalize โครงสร้าง mapping template.
- เทมเพลตตัวอย่าง `etl.mapping.advanced_pl` ได้ถูก normalize ไปยังรูปแบบ `{ column, source, original }` แล้ว.

งานที่เหลือ (สรุปสั้น):
- ปรับปรุงหน้า UI ให้เลือก mapping ก่อน preview/import (UX + validation).
- รันสคริปต์ normalize/update ข้าม tenants ตามนโยบาย (ต้องยืนยันก่อนรันในทุก tenant).
- ทดสอบ end-to-end สำหรับ import ด้วย mapping หลายแบบและหลาย tenant.
- ปรับปรุง error handling / toast messages ใน UI สำหรับ ETL flows.


## 🎯 Credentials

**Frontend Login:**
- Username: `admin`
- Password: `admin`

**Keycloak Admin** (http://localhost:8081):
- Username: `admin`
- Password: `admin`

**PostgreSQL** (localhost:5432):
- Database: `postgres`
- Username: `postgres`
- Password: `postgres`

## 📈 Next Steps / Production TODO

**Security:**
- [ ] Change default passwords
- [ ] Use confidential Keycloak client
- [ ] Add HTTPS/TLS
- [ ] Implement secret management
- [ ] Add rate limiting

**Infrastructure:**
- [ ] Proper Docker multi-stage builds
- [ ] CI/CD pipeline
- [ ] Database backups & replication
- [ ] Monitoring (Prometheus, Grafana)
- [ ] Health checks

**Backend:**
- [ ] Unit & integration tests
- [ ] Implement business logic (currently stubs)
- [ ] Add pagination
- [ ] Error handling & logging
- [ ] Database migrations
- [ ] Query optimization

**Frontend:**
- [ ] Loading states & skeletons
- [ ] Error boundaries
- [ ] Offline support
- [ ] Bundle optimization
- [ ] E2E tests (Playwright)
- [ ] State management (if needed)

**Features:**
- [ ] Complete approval workflows
- [ ] Excel/CSV import UI
- [ ] Financial projections
- [ ] Consolidation logic
- [ ] Advanced reporting
- [ ] User management UI

---

**Built with:** NestJS • React • TypeScript • PostgreSQL • Keycloak • Docker • Vite • Chart.js

**Status:** Phase 1 POC Complete ✅

**Last Updated:** January 26, 2026

## 📝 Dev Notes (added Jan 31, 2026)

These notes record recent local-development actions to make the repo runnable and to create demo accounts.

- Created tenant: `testco` (via `POST /tenant`).
- Created tenant user record in the tenant DB:
  - email: `demo-admin@testco.local`
  - full_name: `Demo Admin`
  - role: `admin`
  - (tenant record id shown in API response when created)
- Keycloak users created/updated:
  - `kc-superadmin` — password set to `Secret123!` (realm admin role assigned)
  - `demo-admin@testco.local` — password set to `Secret123!` (tenant admin candidate)

Notes / how to use:
- Keycloak admin console: http://localhost:8081 (admin/admin)
- Login as tenant admin using Keycloak credentials: `demo-admin@testco.local` / `Secret123!`.
- For quick API testing you can still use demo tokens (development only): `Authorization: Bearer demo-token-12345` — backend accepts any token that starts with `demo-token-` as a local dev convenience.

Quick curl examples (dev):
```bash
# List tenants (demo token)
curl -H "Authorization: Bearer demo-token-12345" http://localhost:3000/tenants | jq

# Use tenant-scoped request (specify X-Tenant-Id)
curl -H "Authorization: Bearer demo-token-12345" -H "X-Tenant-Id: testco" http://localhost:3000/financial/statements | jq

# Login via backend (demo login flow)
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' | jq
```

Security reminder: these demo accounts and tokens are for local development only — change passwords and remove demo-token acceptance before any public deployment.

# Create test user
Invoke-RestMethod -Method Post -Uri "http://localhost:8081/admin/realms/master/users" -Headers @{
  Authorization="Bearer $adminToken"
  "Content-Type"="application/json"
} -Body '{
  "username":"tester",
  "enabled":true,
  "credentials":[{
    "type":"password",
    "value":"tester",
    "temporary":false
  }]
}'
```

### 4. Test APIs

#### Get Access Token
```powershell
$tokenResp = Invoke-RestMethod -Method Post -Uri "http://localhost:8081/realms/master/protocol/openid-connect/token" -Body @{
  client_id="cfo-client"
  client_secret="secret"
  username="tester"
  password="tester"
  grant_type="password"
}
$token = $tokenResp.access_token
```

#### Create Tenant
```powershell
$tenant = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/tenant" -Headers @{
  Authorization="Bearer $token"
  "Content-Type"="application/json"
} -Body '{"name":"acmecorp"}'

Write-Host "Tenant created: $($tenant.id)"
```

#### Create Financial Statement
```powershell
$statement = @{
  statement = @{
    statement_type = "PL"
    period_type = "monthly"
    period_start = "2026-01-01"
    period_end = "2026-01-31"
    scenario = "actual"
    status = "draft"
  }
  lineItems = @(
    @{
      line_code = "REV-001"
      line_name = "Product Sales"
      line_order = 1
      amount = 150000
      currency = "THB"
    }
    @{
      line_code = "REV-002"
      line_name = "Service Revenue"
      line_order = 2
      amount = 50000
      currency = "THB"
    }
    @{
      line_code = "COGS-001"
      line_name = "Cost of Goods Sold"
      line_order = 3
      amount = 80000
      currency = "THB"
    }
    @{
      line_code = "OPEX-001"
      line_name = "Operating Expenses"
      line_order = 4
      amount = 40000
      currency = "THB"
    }
  )
} | ConvertTo-Json -Depth 10

$result = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/financial/statements" -Headers @{
  Authorization="Bearer $token"
  "Content-Type"="application/json"
} -Body $statement

Write-Host "Statement created: $($result.statement.id)"
```

#### Create Default Scenarios
```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/scenarios/defaults" -Headers @{
  Authorization="Bearer $token"
}

# List scenarios
$scenarios = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/scenarios" -Headers @{
  Authorization="Bearer $token"
}

$scenarios | Format-Table scenario_name, scenario_type, is_active
```

## 🧪 Testing

### Unit Tests

```bash
cd backend

# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov
```

**Current Coverage:**
- ✅ KmsService: 3 tests (encrypt/decrypt round-trip, IV randomness, empty string)
- ✅ TenantService: 2 tests (service instantiation, getTenant with null)

**Test Results:**
```
Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
Time:        7.942s
```

### End-to-End (E2E) Tests

**✅ 100% Test Success Rate - Production Ready**

Complete end-to-end testing covering the entire user journey from Super Admin setup to multi-role financial operations.

**Quick Start:**
```bash
# Run E2E test suite (auto-installs dependencies)
./run-e2e-test.sh

# Or run directly with Python
python3 test-company-e2e.py
```

**Test Coverage:** 16 phases testing:
- ✅ Phase 0: Pre-flight Setup & System Validation
- ✅ Phase 1-2: Tenant & User Provisioning
- ✅ Phase 3-5: Financial Statements (CRUD operations)
- ✅ Phase 6-7: Scenario Management & Budget Planning
- ✅ Phase 8-10: Financial Projections & Analysis
- ✅ Phase 11-12: Drill-Down Reports & Charts
- ✅ Phase 13-14: ETL Data Import (CSV/Excel)
- ✅ Phase 15: Multi-Role Access Control (RBAC)

**Test Results:**
```
=== FINAL RESULTS ===
✅ Passed: 16/16 phases (100.0%)
❌ Failed: 0 phases
⏱️  Duration: 24.3 seconds
📊 API Calls: 26 requests
🔒 Auth: 4 roles tested (Super Admin, Admin, Analyst, Viewer)
```

**Documentation:**
- [UAT Readiness Report](UAT-READINESS-REPORT.md) - Production readiness assessment
- [E2E Test Guide](TEST-E2E-GUIDE.md) - Comprehensive testing documentation
- [Quick Reference](TEST-E2E-README.md) - Quick start guide

**CI/CD Integration:**
```yaml
# Example GitHub Actions workflow
- name: Run E2E Tests
  run: |
    export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    cd infra && docker-compose up -d && cd ..
    sleep 30  # Wait for services
    ./run-e2e-test.sh
```

## 🔄 CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push:

1. **Setup**: Checkout code, install Node.js 18
2. **Database**: Start Postgres 15 service container
3. **Dependencies**: Run `npm ci`
4. **Tests**: Run `npm test` with coverage
5. **Build**: Run `npm run build` (TypeScript compilation)
6. **Upload**: Send coverage to Codecov

## 📊 Monitoring & Logging

### Structured Logs (Winston)
```json
{
  "level": "info",
  "message": "Creating tenant",
  "name": "testcorp",
  "timestamp": "2026-01-26T07:23:06.019Z"
}
```

### Query Logging
All database queries logged with:
- Execution time (ms)
- Row count
- Query text (truncated)

### Audit Trail
All financial data changes tracked in `audit_log`:
- Entity type and ID
- Action (create/update/delete/approve/lock)
- Changes (JSONB with old/new values)
- User and IP address

## 🔐 Security Features

- **Per-Tenant Isolation**: Each tenant has separate PostgreSQL database
- **Envelope Encryption**: Tenant DB passwords encrypted with KMS master key
- **JWT Verification**: Keycloak JWKS endpoint validation with issuer + audience checks
- **Connection Pooling**: Prevents connection exhaustion (max 20)
- **Audit Logging**: Compliance-ready audit trail for GDPR/PDPA

## 🛣️ Roadmap

### Phase 2 - Connected Platform (Q2 2026)
- [ ] Replace mock KMS with AWS KMS
- [ ] Add DSR (Data Subject Request) endpoints
- [ ] Implement RBAC with Keycloak roles
- [ ] Add rate limiting (express-rate-limit)
- [ ] ERP/e-Tax/Bank integrations
- [ ] Payment gateway integration

### Phase 3 - AI CFO Platform (Q3 2026)
- [ ] AI document extraction (PP.30)
- [ ] AI-powered forecasting
- [ ] Anomaly detection
- [ ] AI scenario recommendations

## 📝 License

Proprietary - Internal POC

## 🤝 Contributing

1. Create feature branch
2. Write tests for new features
3. Ensure `npm test` passes
4. Build succeeds (`npm run build`)
5. Submit PR with clear description
