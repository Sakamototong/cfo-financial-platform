# CFO Platform POC

**Multi-tenant CFO Platform** รองรับ PDPA/GDPR, per-database isolation, และ mock KMS

## Tech Stack
- **Backend**: Nest.js (TypeScript)
- **Frontend**: Angular (placeholder)
- **Database**: PostgreSQL (per-database tenant isolation)
- **KMS**: Mock AES-256-GCM (ใช้ AWS KMS ในอนาคต)
- **Auth**: Keycloak + JWT (coming soon)
- **Deploy**: Docker Compose

## Quick Start

### 1. สร้าง KMS Master Key
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

คัดลอกผลลัพธ์และตั้งเป็น environment variable:
```powershell
$env:KMS_MASTER_KEY="<your-base64-key>"
```

### 2. รัน Docker Compose
```powershell
cd infra
docker compose up --build
```

Services:
- Backend API: http://localhost:3000
- Frontend: http://localhost:8080
- PostgreSQL: localhost:5432

### 3. ทดสอบ API

สร้าง tenant:
```powershell
curl -X POST http://localhost:3000/tenant -H "Content-Type: application/json" -d '{\"name\":\"acme\"}'
```

ดึงข้อมูล tenant (แทน `{id}` ด้วย id ที่ได้):
```powershell
curl http://localhost:3000/tenant/{id}
```

## Local Development (ไม่ใช้ Docker)

### Backend
```powershell
cd backend
npm install
cp .env.example .env
# แก้ไข .env และตั้ง KMS_MASTER_KEY
npm run start:dev
```

### ต้องการ PostgreSQL
รัน Postgres ด้วย Docker:
```powershell
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15
```

## Project Structure
```
backend/
  src/
    main.ts              # Entry point
    app.module.ts        # Root module
    tenant/              # Tenant provisioning (per-database)
    kms/                 # Mock KMS service
    auth/                # Auth module (placeholder)
frontend/
  index.html             # Frontend placeholder
infra/
  docker-compose.yml     # Docker orchestration
  init/                  # DB init scripts
detailproject/
  CFO Platform.txt       # Project spec
  DPA_draft.md           # Data Processing Agreement
  PrivacyPolicy_draft.md # Privacy Policy
```

## PDPA/GDPR Compliance Features

✅ **Implemented**:
- Per-database tenant isolation
- Mock KMS (AES-256-GCM encryption)
- Encrypted password storage
- Audit logs (console, ต้องเพิ่ม structured logging)

⏳ **Coming Soon**:
- Keycloak + JWT integration
- RBAC + MFA
- Per-tenant encryption keys (AWS KMS)
- DSR endpoints (access/delete/export)
- Immutable audit logs
- DPA/Privacy Policy integration

## Next Steps
1. เพิ่ม Keycloak service ใน docker-compose
2. ติดตั้ง JWT validation middleware
3. เพิ่ม structured logging (Winston/Pino)
4. สร้าง DSR endpoints
5. เพิ่ม test suite (Jest)
6. ติดตั้ง AWS KMS integration

## Documentation
- [DPA Draft](detailproject/DPA_draft.md)
- [Privacy Policy Draft](detailproject/PrivacyPolicy_draft.md)
- [Project Specification](detailproject/CFO%20Platform.txt)

## Notes
- KMS ตอนนี้เป็น mock (local symmetric) — ไม่เหมาะสำหรับ production
- ต้องเพิ่ม connection pooling สำหรับ multi-tenant
- ต้องเพิ่ม resource limits และ rate limiting
