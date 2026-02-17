# 📂 การจัดระเบียบเอกสาร (Documentation Restructure)

## ปัญหาปัจจุบัน

Root directory มีไฟล์ markdown มากเกินไป (15+ files) ทำให้:
- ❌ หาเอกสารที่ต้องการยาก
- ❌ ไม่รู้ว่าควรอ่านอะไรก่อน
- ❌ ข้อมูลบางส่วนซ้ำซ้อน

## การจัดระเบียบใหม่

### โครงสร้างใหม่ที่แนะนำ

```
project-cfo-poc-4/
├── README.md                          # ⭐ Entry point (ใหม่ - ง่าย ชัดเจน)
├── start.sh                           # 🚀 Quick start script
├── stop.sh                            # 🛑 Stop script
├── health-check.sh                    # 🏥 Health check
│
├── docs/                              # 📚 เอกสารทั้งหมด
│   ├── 00-QUICK-START.md             # เริ่มต้นใช้งาน 5 นาที
│   ├── 01-INSTALLATION.md            # การติดตั้งแบบละเอียด
│   ├── 02-USER-GUIDE.md              # คู่มือผู้ใช้
│   ├── 03-API-REFERENCE.md           # API Documentation
│   ├── 04-ARCHITECTURE.md            # System Architecture
│   ├── 05-DEVELOPMENT.md             # Developer Guide
│   ├── 06-TROUBLESHOOTING.md         # แก้ปัญหา
│   │
│   ├── features/                      # Feature-specific docs
│   │   ├── financial-module.md
│   │   ├── transfer-ownership.md
│   │   ├── super-admin.md
│   │   ├── etl-guide.md
│   │   └── projection-engine.md
│   │
│   └── status/                        # Status reports
│       ├── implementation-summary.md
│       ├── phase1-status.md
│       ├── api-status.md
│       └── improvements.md
│
├── backend/
├── frontend/
├── infra/
└── scripts/
```

### แผนการย้ายไฟล์

#### ย้ายไปยัง `docs/` (เอกสารหลัก)

```bash
# Quick Start & Installation
mv USER_JOURNEY_QUICK_REF.md      docs/00-QUICK-START.md
mv USER_JOURNEY.md                 docs/02-USER-GUIDE.md
mv API-STATUS-REPORT.md            docs/03-API-REFERENCE.md
mv IMPLEMENTATION-SUMMARY.md       docs/status/implementation-summary.md
mv PHASE1-STATUS.md                docs/status/phase1-status.md

# Feature Guides
mv FINANCIAL-MODULE-GUIDE.md       docs/features/financial-module.md
mv TRANSFER-OWNERSHIP-COMPLETE.md  docs/features/transfer-ownership.md
mv TRANSFER-OWNERSHIP-UI-GUIDE.md  docs/features/transfer-ownership-ui.md
mv SUPER_ADMIN_IMPLEMENTATION.md   docs/features/super-admin.md
mv ETL-TEST-SUMMARY.md             docs/features/etl-guide.md

# Improvements & Status
mv UX-UI-IMPROVEMENTS.md           docs/status/ux-improvements.md
mv USABILITY-IMPROVEMENTS.md       docs/status/usability-improvements.md

# User Data (for reference)
mv TEST_USERS.md                   docs/reference/test-users.md
mv TENANT_USERS.md                 docs/reference/tenant-users.md
```

#### เก็บไว้ที่ Root (สำคัญมาก)

```
✅ README.md              # Entry point ใหม่
✅ README_POC.md          # Original POC readme (backup)
✅ start.sh               # Quick start script
✅ stop.sh                # Stop script  
✅ health-check.sh        # Health check
✅ package.json           # NPM scripts
✅ .env.example           # Environment example
```

#### ย้ายไปยัง `scripts/tests/` (Test Scripts)

```bash
mkdir -p scripts/tests

mv test-*.sh              scripts/tests/
mv test-*.ps1             scripts/tests/
mv init-admin-tenant.ps1  scripts/tests/
```

### README.md ใหม่ (Simplified)

```markdown
# CFO Platform

**Quick Start:** เริ่มใช้งานภายใน 5 นาที

\`\`\`bash
./start.sh
\`\`\`

**Login:** http://localhost:5173  
**Username:** admin | **Password:** admin

---

## 📚 Documentation

- 🚀 [Quick Start Guide](docs/00-QUICK-START.md) - เริ่มต้นใช้งาน
- 👤 [User Guide](docs/02-USER-GUIDE.md) - คู่มือผู้ใช้
- 🔧 [API Reference](docs/03-API-REFERENCE.md) - API Documentation
- 💻 [Developer Guide](docs/05-DEVELOPMENT.md) - สำหรับ Developer
- 🐛 [Troubleshooting](docs/06-TROUBLESHOOTING.md) - แก้ปัญหา

## 🛠️ Common Commands

\`\`\`bash
npm start         # Start all services
npm stop          # Stop all services
npm run health    # Health check
npm test          # Run tests
npm run logs      # View logs
\`\`\`

## 🏗️ Architecture

- **Backend:** NestJS + PostgreSQL
- **Frontend:** React + TypeScript
- **Auth:** Keycloak + JWT
- **Deploy:** Docker Compose

**77 API Endpoints** across 11 modules

[Full Documentation →](docs/04-ARCHITECTURE.md)
```

## สร้างเอกสารใหม่

### docs/00-QUICK-START.md

```markdown
# 🚀 Quick Start - เริ่มใช้งานภายใน 5 นาที

## Prerequisites

- Docker Desktop
- Node.js 18+

## Installation

\`\`\`bash
# Clone และ start
git clone [repo]
cd project-cfo-poc-4
./start.sh
\`\`\`

## Login

- URL: http://localhost:5173
- Username: `admin`
- Password: `admin`

## What's Next?

1. [Create your first scenario](02-USER-GUIDE.md#scenarios)
2. [Import financial data](02-USER-GUIDE.md#etl)
3. [Generate projections](02-USER-GUIDE.md#projections)

[Full User Guide →](02-USER-GUIDE.md)
```

### docs/06-TROUBLESHOOTING.md

```markdown
# 🐛 Troubleshooting Guide

## Common Issues

### Backend ตอบ 500 Error

**Symptom:** API errors

**Solution:**
\`\`\`bash
npm run logs:backend
npm run restart
\`\`\`

### Docker ไม่สามารถ start

**Symptom:** Containers won't start

**Solution:**
\`\`\`bash
cd infra
docker compose down
docker compose up -d
\`\`\`

### Port already in use

**Symptom:** Cannot start service

**Solution:**
\`\`\`bash
# Find process
lsof -i :3000

# Kill process
kill -9 <PID>
\`\`\`

[More solutions →](#advanced-troubleshooting)
```

## ขั้นตอนการทำ

### 1. สร้างโครงสร้าง docs/

```bash
mkdir -p docs/features
mkdir -p docs/status
mkdir -p docs/reference
```

### 2. สร้างเอกสารใหม่

```bash
# Create main docs
touch docs/00-QUICK-START.md
touch docs/01-INSTALLATION.md
touch docs/04-ARCHITECTURE.md
touch docs/05-DEVELOPMENT.md
touch docs/06-TROUBLESHOOTING.md
```

### 3. ย้ายเอกสารเก่า

```bash
# User guides
mv USER_JOURNEY_QUICK_REF.md docs/00-QUICK-START.md
mv USER_JOURNEY.md docs/02-USER-GUIDE.md
mv API-STATUS-REPORT.md docs/03-API-REFERENCE.md

# Features
mv FINANCIAL-MODULE-GUIDE.md docs/features/financial-module.md
mv TRANSFER-OWNERSHIP-COMPLETE.md docs/features/transfer-ownership.md
mv SUPER_ADMIN_IMPLEMENTATION.md docs/features/super-admin.md

# Status
mv IMPLEMENTATION-SUMMARY.md docs/status/implementation-summary.md
mv PHASE1-STATUS.md docs/status/phase1-status.md
mv UX-UI-IMPROVEMENTS.md docs/status/ux-improvements.md
```

### 4. อัพเดท README.md

Replace `README.md` with new simplified version (see above)

### 5. ย้าย test scripts

```bash
mkdir -p scripts/tests
mv test-*.sh scripts/tests/
mv test-*.ps1 scripts/tests/
```

### 6. อัพเดทลิงก์ในเอกสารทั้งหมด

Search & replace ใน docs:
- `USER_JOURNEY.md` → `02-USER-GUIDE.md`
- `API-STATUS-REPORT.md` → `03-API-REFERENCE.md`
- etc.

## ผลลัพธ์ที่คาดหวัง

### ก่อน (Root มี 20+ files)

```
README.md
USER_JOURNEY.md
USER_JOURNEY_QUICK_REF.md
API-STATUS-REPORT.md
IMPLEMENTATION-SUMMARY.md
... (15+ more)
```

### หลัง (Root มีแค่ essentials)

```
README.md              # ✅ Simplified entry point
start.sh               # ✅ Quick start
docs/                  # ✅ All documentation
  ├── 00-QUICK-START.md
  ├── 02-USER-GUIDE.md
  └── ...
```

## Timeline

- **สร้างโครงสร้าง:** 10 minutes
- **ย้ายไฟล์:** 15 minutes
- **เขียนเอกสารใหม่:** 30 minutes
- **อัพเดทลิงก์:** 20 minutes

**Total:** ~75 minutes

## Priority

🟡 **Medium Priority** - ไม่ block การใช้งาน แต่ช่วยปรับปรุงประสบการณ์มาก

ควรทำหลังจาก:
- ✅ สร้าง start.sh, stop.sh
- ✅ อัพเดท package.json scripts
- ✅ สร้าง health-check.sh

## Notes

- เก็บ `README_POC.md` ไว้เป็น backup
- สร้าง symlinks ถ้าต้องการ backward compatibility
- อัพเดท CI/CD scripts ถ้ามี
