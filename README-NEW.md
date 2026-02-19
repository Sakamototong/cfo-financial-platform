# 🚀 CFO Platform - Quick Start Guide

**Financial Planning & Analysis Platform** - ระบบวิเคราะห์และวางแผนทางการเงิน

[![Version](https://img.shields.io/badge/version-1.0.0--poc-blue.svg)]()
[![Node](https://img.shields.io/badge/node-18%2B-green.svg)]()
[![Docker](https://img.shields.io/badge/docker-required-blue.svg)]()

---

## ⚡ เริ่มใช้งานภายใน 5 นาที

### วิธีการติดตั้ง

```bash
# 1. Clone repository
git clone [repository-url]
cd project-cfo-poc-4

# 2. เริ่มระบบ (One Command!)
chmod +x start.sh
./start.sh
```

### เข้าสู่ระบบ

เมื่อเห็นข้อความ "✅ CFO Platform is Ready!":

1. เปิดเบราว์เซอร์ไปที่: **http://localhost:8080**
2. Login ด้วย:
   - **Username:** `admin`
   - **Password:** `admin`

### เสร็จแล้ว! 🎉

ระบบพร้อมใช้งาน - ทุกอย่างรันใน Docker containers

---

## 📚 เอกสารประกอบ

| เอกสาร | สำหรับใครบ้าง | ลิงก์ |
|--------|---------------|------|
| **Getting Started** | ผู้เริ่มต้นทุกคน | [คู่มือเริ่มต้น](#คูมอเรมตน) |
| **User Guide** | ผู้ใช้งานทั่วไป (CFO, Analyst) | [USER_JOURNEY_QUICK_REF.md](USER_JOURNEY_QUICK_REF.md) |
| **API Reference** | Developer | [API-STATUS-REPORT.md](API-STATUS-REPORT.md) |
| **User Journey** | ทุกคน - เข้าใจ workflow | [USER_JOURNEY.md](USER_JOURNEY.md) |
| **Architecture** | Developer/Admin | [ดูด้านล่าง](#สถาปตยกรรม) |

---

## 🎯 คู่มือผู้ใช้งานด่วน

### สำหรับ Company Admin (CFO)

**ภารกิจ:** ตั้งค่าระบบการเงินของบริษัท

```
✅ ขั้นตอนที่ 1: สร้าง Financial Statement Template
   → ไปที่ DIM → สร้างโครงสร้างงบการเงิน (P&L, Balance Sheet)

✅ ขั้นตอนที่ 2: สร้าง Scenarios
   → ไปที่ Scenarios → สร้าง "Actual", "Budget", "Forecast"

✅ ขั้นตอนที่ 3: Import ข้อมูล
   → ไปที่ ETL → Upload Excel/CSV

✅ ขั้นตอนที่ 4: เชิญทีมงาน
   → ไปที่ Users → เชิญ Analysts และ Viewers
```

[คู่มือละเอียด →](USER_JOURNEY_QUICK_REF.md#company-admin-cfo)

---

### สำหรับ Financial Analyst

**ภารกิจ:** สร้างโมเดลการเงินและคาดการณ์

```
✅ สร้าง Financial Statement
   → Financials → Create Statement → กรอกข้อมูล

✅ รัน Projection
   → Projections → Generate → เลือก scenario และระยะเวลา

✅ วิเคราะห์ Scenario
   → Scenarios → สร้าง scenario ใหม่ → เปรียบเทียบผล

✅ สร้างรายงาน
   → Reports → Variance Analysis → Export
```

[คู่มือละเอียด →](USER_JOURNEY_QUICK_REF.md#financial-analyst)

---

### สำหรับ Super Admin (System Admin)

**ภารกิจ:** จัดการ multi-tenant system

```
✅ สร้าง Tenant ใหม่
   → Super Admin → Tenants → Create New

✅ สร้าง Company Admin
   → Users → Invite user with 'admin' role

✅ ตรวจสอบระบบ
   → Admin → System Config, Audit Logs
```

[คู่มือละเอียด →](SUPER_ADMIN_IMPLEMENTATION.md)

---

## 🛠️ คำสั่งที่ใช้บ่อย

```bash
# ✅ เริ่มระบบทั้งหมด
npm start

# ✅ หยุดระบบทั้งหมด
npm stop

# ✅ ตรวจสอบสถานะ
npm run health
npm run status

# ✅ ดู logs
npm run logs              # ทุก service
npm run logs:backend      # backend เท่านั้น
npm run logs:frontend     # frontend เท่านั้น

# ✅ รัน tests
npm test                  # Interactive menu
npm run test:api          # API tests
npm run test:financial    # Financial module
npm run test:projection   # Projection engine

# ✅ Restart services
npm run restart

# ✅ Development mode (hot-reload)
npm run dev:backend
npm run dev:frontend

# ✅ ลบทุกอย่างและเริ่มใหม่
npm run clean
npm start
```

---

## 🏗️ สถาปัตยกรรม

### Tech Stack

- **Backend:** NestJS (TypeScript) + PostgreSQL
- **Frontend:** React + TypeScript + Vite + Chart.js
- **Authentication:** Keycloak + JWT (auto-refresh)
- **Infrastructure:** Docker Compose
- **Encryption:** Mock KMS (AES-256-GCM)

### Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| **Frontend** | 8080 | React App (Docker/nginx) |
| **Backend API** | 3000 | NestJS REST API |
| **Swagger UI** | 3000/api | API Documentation |
| **Keycloak** | 8081 | Authentication Server |
| **PostgreSQL** | 5432 | Database |

> **Note:** Frontend runs on port **8080** via nginx in Docker  
> For development with hot-reload: `cd frontend && npm run dev` (port 5173)

### API Modules (77 Endpoints)

```
✅ Auth (2)         - Login, Token refresh
✅ Tenant (2)       - Multi-tenant management
✅ Financial (5)    - Statements, Line items
✅ Scenarios (6)    - Scenario CRUD, Defaults
✅ Projection (2)   - Generate, Retrieve
✅ Reports (4)      - Variance, Trend, Summary
✅ ETL (3)          - Excel/CSV import, History
✅ DIM (14)         - Dimension configuration
✅ Admin (16)       - System config, Audit
✅ Workflow (12)    - Approval chains
✅ Users (11)       - User management, Transfer ownership
```

[API Documentation →](http://localhost:3000/api) (เมื่อระบบทำงาน)

---

## 🔐 Default Users

ใช้ username/password เหล่านี้สำหรับทดสอบ:

| Role | Username | Password | Tenant / Access |
|------|----------|----------|-----------------|
| **Super Admin** | `superadmin` หรือ `superadmin@system.local` | `Secret123!` | System-wide (ทุก Tenant) |
| **Company Admin** | `admin@admin.local` | `Secret123!` | Tenant: admin |
| **Analyst** | `analyst@admin.local` | `Secret123!` | Tenant: admin |
| **Viewer** | `viewer@admin.local` | `Secret123!` | Tenant: admin |
| **ACME Admin** | `admin@acmecorp.local` | `Secret123!` | Tenant: acme-corp |

### Tenants ที่มีในระบบ

| Tenant ID | ชื่อบริษัท |
|-----------|------------|
| `admin` | Admin Tenant |
| `acme-corp` | ACME Corporation |

---

## 🚨 แก้ปัญหา (Troubleshooting)

### ปัญหา: Docker ไม่สามารถ start ได้

```bash
# ตรวจสอบว่า Docker กำลังทำงานอยู่
docker info

# ลองหยุดและเริ่มใหม่
cd infra
docker compose down
docker compose up -d
```

### ปัญหา: Backend ตอบ 500 Error

```bash
# ดู logs ของ backend
npm run logs:backend

# ตรวจสอบ database
npm run logs:db

# Restart backend
cd infra
docker compose restart backend
```

### ปัญหา: Frontend ไม่แสดง

```bash
# ตรวจสอบว่า frontend container ทำงาน
cd infra
docker compose ps frontend

# ดู logs
docker compose logs frontend

# Restart
docker compose restart frontend

# หรือเข้า http://localhost:8080 ใน browser
# Development mode (port 5173): cd frontend && npm run dev
```

### ปัญหา: "KMS_MASTER_KEY not found"

```bash
# ใช้ start.sh มันจะ generate ให้อัตโนมัติ
./start.sh

# หรือ manual:
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# หรือใช้ key จาก .env.local ที่ start.sh สร้างไว้
source .env.local

# แล้วค่อย restart
cd infra
docker compose restart backend
```

### ปัญหา: Port ชนกัน (Port already in use)

```bash
# หา process ที่ใช้ port
lsof -i :3000    # Backend
lsof -i :5173    # Frontend
lsof -i :8081    # Keycloak

# Kill process
kill -9 <PID>

# หรือเปลี่ยน port ใน docker-compose.yml
```

### ปัญหาอื่นๆ

1. ตรวจสอบ prerequisites:
   ```bash
   docker --version   # ควรเป็น 20.10+
   node --version     # ควรเป็น 18+
   npm --version      # ควรเป็น 9+
   ```

2. ลบทุกอย่างและเริ่มใหม่:
   ```bash
   npm run clean
   npm start
   ```

3. ตรวจสอบ logs:
   ```bash
   npm run logs
   ```

---

## 📖 Additional Documentation

### Implementation Guides
- [Transfer Ownership Complete Guide](TRANSFER-OWNERSHIP-COMPLETE.md)
- [Financial Module Guide](FINANCIAL-MODULE-GUIDE.md)
- [Super Admin Implementation](SUPER_ADMIN_IMPLEMENTATION.md)
- [UX/UI Improvements](UX-UI-IMPROVEMENTS.md)

### Status Reports
- [API Status Report](API-STATUS-REPORT.md)
- [Phase 1 Status](PHASE1-STATUS.md)
- [Implementation Summary](IMPLEMENTATION-SUMMARY.md)
- [ETL Test Summary](ETL-TEST-SUMMARY.md)

### Project Details
- [Project Specification](detailproject/CFO%20Platform.txt)
- [Privacy Policy Draft](detailproject/PrivacyPolicy_draft.md)
- [DPA Draft](detailproject/DPA_draft.md)

---

## 🔄 Project Structure

```
project-cfo-poc-4/
├── 📱 frontend/              # React Frontend
│   ├── src/
│   │   ├── components/      # UI Components
│   │   ├── pages/           # Page Components
│   │   ├── api/             # API Calls
│   │   └── styles.css       # Global Styles
│   └── package.json
│
├── 🔧 backend/              # NestJS Backend
│   ├── src/
│   │   ├── auth/           # Authentication
│   │   ├── tenant/         # Multi-tenant
│   │   ├── financial/      # Financial Statements
│   │   ├── projection/     # Projections
│   │   ├── scenario/       # Scenarios
│   │   ├── etl/            # Data Import
│   │   ├── dim/            # Dimensions
│   │   ├── reports/        # Reporting
│   │   ├── workflow/       # Approvals
│   │   ├── admin/          # System Admin
│   │   ├── super-admin/    # Super Admin
│   │   └── user/           # User Management
│   └── package.json
│
├── 🐳 infra/                # Infrastructure
│   ├── docker-compose.yml  # All services
│   ├── init/               # DB init scripts
│   └── *.sh                # Setup scripts
│
├── 🧪 scripts/              # Utility Scripts
│   └── *.js                # Node scripts
│
├── 📝 Test Scripts          # API Testing
│   ├── test-*.sh           # Bash tests
│   └── test-*.ps1          # PowerShell tests
│
└── 📖 Documentation         # Project Docs
    ├── README.md           # This file
    ├── USER_JOURNEY*.md    # User guides
    ├── IMPLEMENTATION-SUMMARY.md
    └── *.md                # Various docs
```

---

## 🎓 Learning Resources

### For Users
1. [Quick Reference Guide](USER_JOURNEY_QUICK_REF.md) - เริ่มใช้งานเร็ว 5 นาที
2. [Full User Journey](USER_JOURNEY.md) - เข้าใจ workflow ทั้งหมด
3. [Video Tutorial](#) - (Coming soon)

### For Developers
1. [API Documentation](http://localhost:3000/api) - Swagger UI
2. [API Status Report](API-STATUS-REPORT.md) - Endpoint status
3. [Architecture Overview](#สถาปตยกรรม) - System design

---

## 🚀 What's Next?

### Planned Features
- [ ] Onboarding Wizard (component exists, needs activation)
- [ ] Better error messages
- [ ] Performance optimization
- [ ] PWA support
- [ ] Mobile responsive design
- [ ] Multi-language support

### Known Issues
- ⚠️ Financial Module: Schema mismatch (approval_requests column names)
- ⚠️ Privacy/Audit modules: Disabled due to TypeORM issues

---

## 🐛 Bug Fixes (Recent)

### v1.0.1 — February 19, 2026

| # | ปัญหา | สาเหตุ | สิ่งที่แก้ไข |
|---|-------|--------|-------------|
| 1 | **Role ไม่เสถียร** — refresh หน้าแล้ว role กลับเป็น viewer | DB connection leak ใน `SystemUsersService` (13/14 methods ไม่ `release()` connection) | เขียน `systemQuery()` helper ที่มี `try/finally { client.release() }` ทุก method |
| 2 | **Connection pool หมด** → timeout ทุก request | Pool max=20 + timeout=2s ทำให้หมดเร็วมาก | เพิ่ม pool: system max 20→30, tenant max 10→15, timeout 2s→10s |
| 3 | **Super Admin เห็นเมนูผิด** | `/auth/me` query DB ซ้ำซ้อน (JwtAuthGuard ก็ query แล้ว) | ใช้ `req.user.roles` จาก JwtAuthGuard แทน (มี in-memory cache 60s) |
| 4 | **เปลี่ยนบริษัทไม่ได้** — CompanySelector ซ่อน dropdown | `/my-tenants` เช็คแค่ `username==='admin'`, super admin ไม่ได้รับทุก tenant | เพิ่มเช็ค `roles.includes('super_admin')` → return ทุก tenant |
| 5 | **Default tenant ผิด** | Login.tsx ตั้ง default tenant เป็น `testco` ซึ่งไม่มีในระบบ | เปลี่ยนเป็น `admin` |
| 6 | **Frontend ยังแสดง role เก่า** | `UserContext` อ่าน role จาก localStorage (stale cache) | ลบ init จาก localStorage + เพิ่ม retry 2 ครั้งถ้า API fail |

[See issues →](USABILITY-IMPROVEMENTS.md)

---

## 📞 Support

### Need Help?
- 📖 Documentation: [USER_JOURNEY_QUICK_REF.md](USER_JOURNEY_QUICK_REF.md)
- 🐛 Issues: Check [USABILITY-IMPROVEMENTS.md](USABILITY-IMPROVEMENTS.md)
- 💬 Contact: [Your contact info]

### Quick Commands
```bash
npm run health      # System health check
npm run status      # Service status
npm run logs        # View all logs
```

---

## 📄 License

[Your License]

---

**Made with ❤️ for CFOs and Financial Analysts**

*Last Updated: February 19, 2026*
