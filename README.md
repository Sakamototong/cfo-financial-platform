# 🚀 CFO Platform

**Financial Planning & Analysis Platform** — ระบบวิเคราะห์และวางแผนทางการเงินแบบ Multi-Tenant

![Docker](https://img.shields.io/badge/Docker-Compose-blue) ![NestJS](https://img.shields.io/badge/Backend-NestJS-red) ![React](https://img.shields.io/badge/Frontend-React%2BVite-cyan) ![PostgreSQL](https://img.shields.io/badge/DB-PostgreSQL%2015-blue) ![Keycloak](https://img.shields.io/badge/Auth-Keycloak%2021-green)

---

## 📋 Overview

Platform สำหรับ CFO ครอบคลุม:

- 🏢 **Multi-Tenant** — แต่ละบริษัทมี PostgreSQL database แยกกัน
- 📊 **Financial Statements** — งบการเงิน, line items, scenarios
- 🔐 **RBAC** — SuperAdmin / Admin / Analyst / Viewer
- 📈 **Projections** — Projection engine พร้อม templates
- 📦 **ETL** — นำเข้าข้อมูลจาก CSV / QuickBooks
- 🔑 **Keycloak 21** — JWT authentication ครบวงจร
- 📋 **Audit Logging** — บันทึกทุก action สำหรับ compliance

---

## ⚡ Quick Start (Local / UAT)

### Prerequisites

- Docker Desktop (with Docker Compose v2)
- Bash shell (macOS / Linux)

### 1. Clone and Setup

```bash
git clone <repo>
cd project-cfo-poc-4
```

### 2. Start Everything (One Command)

```bash
./uat-setup.sh
```

Script จะทำโดยอัตโนมัติ:
1. ตรวจสอบ Docker daemon
2. Start containers (`docker compose up -d --build`)
3. สร้าง schema บน database กลาง
4. สร้าง tenants ผ่าน API
5. Apply schema migrations บน tenant databases
6. Seed ข้อมูลเริ่มต้น (users, COA, superadmin)
7. สร้าง Keycloak users
8. Verify ผลลัพธ์

**Flags:**
```bash
./uat-setup.sh --skip-build     # ข้าม docker build (เร็วขึ้น หากไม่มีการเปลี่ยน code)
./uat-setup.sh --skip-keycloak  # ข้าม Keycloak user creation
./uat-setup.sh --reset          # ลบ volumes แล้ว setup ใหม่ทั้งหมด
```

### 3. Alternative: Start/Stop Only

```bash
./start.sh     # Start containers
./stop.sh      # Stop containers
```

---

## 🌐 Service URLs

| Service       | URL                           |
|---------------|-------------------------------|
| Frontend      | http://localhost:8080         |
| Backend API   | http://localhost:3000         |
| Swagger Docs  | http://localhost:3000/api     |
| Keycloak      | http://localhost:8081         |
| Keycloak Admin| http://localhost:8081/admin   |
| PostgreSQL    | localhost:5432                |
| Redis         | localhost:6379                |

---

## 🔑 Default Accounts

### Login Credentials

| Username          | Password        | Role             | Tenant      |
|-------------------|-----------------|------------------|-------------|
| `superadmin`      | `SuperAdmin123!`| Super Admin      | (ทุก tenant)|
| `admin-user`      | `Secret123!`    | Admin            | admin       |
| `analyst-user`    | `Secret123!`    | Analyst          | admin       |
| `viewer-user`     | `Secret123!`    | Viewer           | admin       |
| `acme-admin`      | `Secret123!`    | Admin            | Acme Corp   |
| `acme-analyst`    | `Secret123!`    | Analyst          | Acme Corp   |
| `acme-viewer`     | `Secret123!`    | Viewer           | Acme Corp   |

> **Quick demo (local only):** `admin` / `admin` → ได้รับ Super Admin demo token โดยไม่ต้องผ่าน Keycloak

### Keycloak Admin Console

| URL | Username | Password |
|-----|----------|----------|
| http://localhost:8081/admin | `admin`  | `admin`  |

### Demo Tokens (Local Dev)

สำหรับ development สามารถใช้ demo tokens โดยตรงโดยไม่ต้อง login:

| Token                        | Role          |
|------------------------------|---------------|
| `demo-token-super-admin`     | SuperAdmin    |
| `demo-token-admin`           | Admin         |
| `demo-token-analyst`         | Analyst       |
| `demo-token-viewer`          | Viewer        |

```bash
curl -H "Authorization: Bearer demo-token-super-admin" http://localhost:3000/tenant
```

---

## 🏢 Default Tenants

| Tenant ID              | Name       | Database                          |
|------------------------|------------|-----------------------------------|
| `admin`                | Admin Org  | `tenant_admin_tenant_admin`       |
| `155cf73a2fe388f0`     | Acme Corp  | `tenant_acme_corp_155cf73a2fe388f0` |

---

## 📁 Project Structure

```
project-cfo-poc-4/
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── auth/            # JWT + Keycloak
│   │   ├── tenant/          # Multi-tenant management
│   │   ├── financial/       # Statements & line items
│   │   ├── scenarios/       # Scenario management
│   │   ├── dim/             # Dimension configuration
│   │   ├── admin/           # System admin & ETL
│   │   ├── workflow/        # Approval workflows
│   │   ├── projections/     # Projection engine
│   │   ├── consolidation/   # Consolidation module
│   │   ├── reports/         # Reports & variance
│   │   ├── audit/           # Audit logging
│   │   └── database/        # DB pool management
│   ├── Dockerfile
│   └── package.json
├── frontend/                 # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/             # Axios client + token refresh
│   │   ├── pages/           # Login, Dashboard, etc.
│   │   └── components/      # UI components
│   └── Dockerfile
├── infra/                    # Infrastructure
│   ├── docker-compose.yml   # All services
│   ├── init/                # DB init SQL scripts
│   └── *.sql                # Migration scripts
├── uat-setup.sh             # UAT/local setup script
├── start.sh                 # Start containers
├── stop.sh                  # Stop containers
└── README.md
```

---

## 📡 API Modules

| Module          | Prefix                  | Description                        |
|-----------------|-------------------------|------------------------------------|
| Auth            | `/auth`                 | Login, refresh, Keycloak callback  |
| Tenant          | `/tenant`               | Tenant CRUD                        |
| Financial       | `/financial`            | Statements, line items             |
| Scenarios       | `/scenarios`            | Scenario management                |
| DIM             | `/dim`                  | Dimension config                   |
| Admin           | `/admin`                | ETL, system admin                  |
| Workflow        | `/workflow`             | Approval workflows                 |
| Projections     | `/projections`          | Projection engine                  |
| Consolidation   | `/consolidation`        | Cross-tenant consolidation         |
| Reports         | `/reports`              | Variance & drill-down reports      |
| Audit           | `/audit`                | Audit trail                        |
| Super Admin     | `/super-admin`          | System-level management            |

**Full OpenAPI spec:** http://localhost:3000/api

---

## 🛠️ npm Commands

```bash
npm start           # Start all containers
npm stop            # Stop all containers
npm run health      # Run health checks
npm run status      # Show container status
npm run logs        # Tail all container logs
npm run logs:backend   # Backend logs only
npm run logs:frontend  # Frontend logs only
npm run logs:db        # Database logs only
npm run restart     # Restart all containers
npm run clean       # Stop + remove volumes (WIPE DATA)
```

---

## 📚 Documentation

| Document                    | Description                          |
|-----------------------------|--------------------------------------|
| [docs/USER_GUIDE_ONE_COMPANY.md](docs/USER_GUIDE_ONE_COMPANY.md) | **คู่มือการใช้งานสำหรับผู้ใช้ในบริษัท** (Admin / Analyst / Viewer) |
| [USER_JOURNEY.md](USER_JOURNEY.md)                  | User journey แต่ละ role             |
| [USER_JOURNEY_QUICK_REF.md](USER_JOURNEY_QUICK_REF.md)  | Quick reference card                 |
| [MENU-PERMISSIONS.md](MENU-PERMISSIONS.md)         | RBAC menu permissions matrix         |
| [TEST_USERS.md](TEST_USERS.md)               | Test user credentials                |
| [TENANT_USERS.md](TENANT_USERS.md)             | Tenant user details                  |
| [TEST-E2E-GUIDE.md](TEST-E2E-GUIDE.md)           | End-to-end test guide                |
| [TEST-E2E-README.md](TEST-E2E-README.md)          | E2E test setup readme                |
| [UAT-DEPLOYMENT-GUIDE.md](UAT-DEPLOYMENT-GUIDE.md)     | UAT deployment instructions          |
| [UAT-READINESS-REPORT.md](UAT-READINESS-REPORT.md)     | UAT readiness checklist              |
| [UAT-README.md](UAT-README.md)               | UAT overview                         |
| [TRANSFER-OWNERSHIP-UI-GUIDE.md](TRANSFER-OWNERSHIP-UI-GUIDE.md) | Transfer ownership guide    |
| [SECURITY.md](SECURITY.md)                 | Security policy                      |
| [CHANGELOG.md](CHANGELOG.md)                | Version history                      |
| [CONTRIBUTING.md](CONTRIBUTING.md)             | Contribution guidelines              |

---

## 🏗️ Tech Stack

| Layer          | Technology                      |
|----------------|---------------------------------|
| Backend        | NestJS 10, TypeScript           |
| Frontend       | React 18, TypeScript, Vite      |
| Database       | PostgreSQL 15 (per-tenant DB)   |
| Cache          | Redis 7                         |
| Auth           | Keycloak 21, JWT                |
| Containerization | Docker Compose v2             |
| Encryption     | AES-256-GCM (envelope KMS)     |
| Logging        | Winston (structured JSON)       |

---

## 🔐 Security

- **Per-Tenant Isolation** — แต่ละ tenant มี PostgreSQL database แยก
- **Envelope Encryption** — Tenant DB passwords เข้ารหัสด้วย KMS master key (AES-256-GCM)
- **JWT Verification** — Keycloak JWKS endpoint validation
- **RBAC** — SuperAdmin / Admin / Analyst / Viewer roles
- **Audit Trail** — บันทึกทุก action ใน `audit_log` table
- **Rate Limiting** — ป้องกัน brute force

### KMS Configuration

```bash
# Production: set before starting
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# Local dev: ถ้าไม่ set จะใช้ ephemeral key (ข้อมูลหาย ถ้า restart)
```

See [SECURITY.md](SECURITY.md) for full details.

---

## 🔧 Troubleshooting

### Containers ไม่ start

```bash
# ดู logs
docker compose -f infra/docker-compose.yml logs --tail=50

# Restart
npm run restart
```

### Reset ทั้งหมด (ลบข้อมูล)

```bash
./uat-setup.sh --reset
```

### Port conflicts

| Port | Service  | Fix                              |
|------|----------|----------------------------------|
| 8080 | Frontend | `lsof -ti:8080 | xargs kill`    |
| 3000 | Backend  | `lsof -ti:3000 | xargs kill`    |
| 5432 | Postgres | Stop local PostgreSQL            |
| 8081 | Keycloak | `lsof -ti:8081 | xargs kill`    |

### KMS Warning บน startup

```
⚠️  KMS_MASTER_KEY not set — using ephemeral key
```

ไม่ใช่ error — ใช้งานได้ปกติ แต่ถ้า restart container ข้อมูล tenant passwords จะ decrypt ไม่ได้  
**Solution:** Set `KMS_MASTER_KEY` ก่อน start หรือใช้ `./uat-setup.sh --reset` เพื่อ setup ใหม่

---

## 📝 License

Proprietary — Internal Use Only

---

*Last Updated: February 21, 2026*
