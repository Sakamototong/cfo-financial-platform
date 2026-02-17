# 🐳 CFO Platform - Docker Deployment Guide

**เอกสารนี้อธิบายการ deploy ด้วย Docker (วิธีที่ถูกต้องสำหรับโปรเจกต์นี้)**

---

## ✅ สถาปัตยกรรมจริง (Docker-Based)

โปรเจกต์นี้รัน **ทุกอย่างใน Docker containers** ผ่าน Docker Compose:

```
┌─────────────────────────────────────────┐
│         Docker Compose Stack            │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────┐  ┌──────────┐           │
│  │ Frontend │  │ Backend  │           │
│  │  nginx   │  │  NestJS  │           │
│  │  :8080   │  │  :3000   │           │
│  └──────────┘  └──────────┘           │
│                                         │
│  ┌──────────┐  ┌──────────┐           │
│  │PostgreSQL│  │ Keycloak │           │
│  │  :5432   │  │  :8081   │           │
│  └──────────┘  └──────────┘           │
│                                         │
└─────────────────────────────────────────┘
         ▲
         │
    localhost
```

### Services ทั้งหมด

| Service | Image/Build | Port | Description |
|---------|-------------|------|-------------|
| **frontend** | Build from `frontend/` | **8080** | React app served by nginx |
| **backend** | Build from `backend/` | 3000 | NestJS API |
| **db** | postgres:15 | 5432 | PostgreSQL database |
| **keycloak** | keycloak:21.1.1 | 8081 | Authentication |

---

## 🚀 การใช้งาน (Correct Way)

### เริ่มต้น

```bash
# 1. Set KMS key (หรือให้ start.sh generate ให้)
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# 2. Start ทุกอย่าง
./start.sh

# หรือ manual:
cd infra
docker compose up -d
```

### หยุด

```bash
./stop.sh

# หรือ manual:
cd infra
docker compose down
```

### ตรวจสอบสถานะ

```bash
npm run status
# หรือ
cd infra
docker compose ps
```

### ดู Logs

```bash
# ทั้งหมด
npm run logs

# แยก service
npm run logs:backend
npm run logs:frontend
npm run logs:db

# หรือ manual
cd infra
docker compose logs -f backend
```

---

## 🌐 URLs สำคัญ

เมื่อระบบทำงาน เข้าถึงได้ที่:

```
✅ Frontend (React):      http://localhost:8080
✅ Backend API:           http://localhost:3000
✅ Swagger UI:            http://localhost:3000/api
✅ Keycloak Admin:        http://localhost:8081
✅ Database:              localhost:5432
```

### ⚠️ สำคัญ!

Frontend รันบน **port 8080** (ไม่ใช่ 5173)  
- Port 8080: Production mode in Docker (nginx)
- Port 5173: Development mode เท่านั้น (ถ้ารัน `npm run dev`)

---

## 🛠️ Docker Compose Configuration

### docker-compose.yml

```yaml
version: "3.8"
services:
  db:
    image: postgres:15
    ports: ["5432:5432"]
    
  keycloak:
    image: quay.io/keycloak/keycloak:21.1.1
    ports: ["8081:8080"]
    
  backend:
    build: ../backend
    environment:
      KMS_MASTER_KEY: ${KMS_MASTER_KEY}  # ⚠️ Required!
      PG_HOST: db
      KEYCLOAK_HOST: http://keycloak:8080
    ports: ["3000:3000"]
    depends_on: [db, keycloak]
    
  frontend:
    build: ../frontend
    args:
      VITE_API_BASE: http://localhost:3000  # สำหรับ browser
    ports: ["8080:80"]
```

### Environment Variables

**Required:**
- `KMS_MASTER_KEY` - สำหรับ encryption (auto-generated โดย start.sh)

**Optional:**
- `OPENAI_API_KEY` - สำหรับ Swagger AI assistant

---

## 💻 Development Mode (Hot Reload)

ถ้าต้องการ development mode พร้อม hot-reload:

### Backend Development

```bash
# หยุด backend container
cd infra
docker compose stop backend

# รัน dev mode
cd ../backend
npm install  # ถ้ายังไม่ได้ install
npm run start:dev
```

Backend จะรันที่ http://localhost:3000 พร้อม hot-reload

### Frontend Development

```bash
# Frontend container ยังรันอยู่ได้ (port 8080)
# รัน dev server แยก
cd frontend
npm install --legacy-peer-deps  # ถ้ายังไม่ได้ install
npm run dev
```

Frontend dev จะรันที่ http://localhost:5173 พร้อม hot-reload

> **Note:** เมื่อ develop เสร็จ ต้อง rebuild Docker images:
> ```bash
> cd infra
> docker compose build backend  # หรือ frontend
> docker compose up -d
> ```

---

## 🔧 การ rebuild Images

เมื่อแก้โค้ด backend หรือ frontend:

```bash
cd infra

# Rebuild service เดียว
docker compose build backend
docker compose build frontend

# Rebuild ทั้งหมด
docker compose build

# Start ใหม่
docker compose up -d
```

---

## 📋 Common Tasks

### 1. ตรวจสอบว่าระบบพร้อมใช้งาน

```bash
# Run health check
./health-check.sh

# หรือ manual check
curl http://localhost:8080         # Frontend
curl http://localhost:3000/api     # Backend (Swagger)
curl http://localhost:8081         # Keycloak
```

### 2. ดู logs เมื่อมีปัญหา

```bash
# ดู logs ทั้งหมด
cd infra
docker compose logs

# Service เดียว
docker compose logs backend
docker compose logs frontend

# Follow logs realtime
docker compose logs -f backend
```

### 3. Restart service

```bash
cd infra

# Restart service เดียว
docker compose restart backend
docker compose restart frontend

# Restart ทั้งหมด
docker compose restart
```

### 4. เข้าไปใน container

```bash
cd infra

# เข้า backend container
docker compose exec backend sh

# ดู database
docker compose exec db psql -U postgres
```

### 5. Clean และเริ่มใหม่

```bash
# หยุดและลบ containers + volumes
cd infra
docker compose down -v

# Build และ start ใหม่
docker compose up -d --build
```

---

## 🐛 Troubleshooting

### ปัญหา 1: "KMS_MASTER_KEY not set"

**Symptom:** Warning เมื่อรัน docker compose

**Solution:**
```bash
# ใช้ start.sh จะ generate ให้อัตโนมัติ
./start.sh

# หรือ manual
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
cd infra
docker compose up -d
```

**บันทึกไว้ใช้ต่อ:**
```bash
# start.sh สร้างไฟล์ .env.local
# ครั้งต่อไปใช้:
source .env.local
./start.sh
```

---

### ปัญหา 2: Backend ตอบ 500 Error

**Symptom:** API calls ล้มเหลว

**Check logs:**
```bash
cd infra
docker compose logs backend

# ดูว่ามี error อะไร
```

**Common causes:**
- Database not ready
- KMS_MASTER_KEY ไม่ถูกต้อง
- Migration ไม่สำเร็จ

**Solution:**
```bash
# Restart backend
docker compose restart backend

# หรือ rebuild
docker compose down
docker compose up -d --build
```

---

### ปัญหา 3: Frontend ไม่แสดง

**Symptom:** http://localhost:8080 ไม่เปิด

**Check:**
```bash
cd infra
docker compose ps frontend
docker compose logs frontend
```

**Solution:**
```bash
# Restart
docker compose restart frontend

# หรือ rebuild
docker compose build frontend
docker compose up -d
```

---

### ปัญหา 4: Port already in use

**Symptom:** "Bind for 0.0.0.0:3000 failed: port is already allocated"

**Solution:**
```bash
# หา process ที่ใช้ port
lsof -i :3000
lsof -i :8080

# Kill process
kill -9 <PID>

# หรือหยุด Docker compose แล้วเริ่มใหม่
cd infra
docker compose down
docker compose up -d
```

---

### ปัญหา 5: Database connection failed

**Symptom:** Backend ไม่เชื่อมต่อ database

**Check:**
```bash
cd infra
docker compose logs db

# ตรวจสอบว่า db container รัน
docker compose ps db
```

**Solution:**
```bash
# Restart database
docker compose restart db

# ถ้ายังไม่ได้ ลองลบและสร้างใหม่
docker compose down
docker volume rm infra_postgres_data  # ถ้ามี
docker compose up -d
```

---

## 📊 Monitoring

### ดูสถานะ containers

```bash
cd infra
docker compose ps

# Output:
NAME               STATUS          PORTS
infra-backend-1    Up 2 hours     0.0.0.0:3000->3000/tcp
infra-frontend-1   Up 2 hours     0.0.0.0:8080->80/tcp
infra-db-1         Up 2 hours     0.0.0.0:5432->5432/tcp
infra-keycloak-1   Up 2 hours     0.0.0.0:8081->8080/tcp
```

### Resource Usage

```bash
# ดู CPU/Memory usage
docker stats

# เฉพาะ project นี้
docker stats infra-backend-1 infra-frontend-1
```

### Disk Usage

```bash
# ดูขนาด images
docker images | grep infra

# ดูขนาด volumes
docker volume ls
docker system df
```

---

## 🔐 Security Notes

### Environment Variables

**ห้าม commit:**
- `KMS_MASTER_KEY`
- `OPENAI_API_KEY`
- Database passwords

**ใช้:**
- `.env.local` (git ignored)
- `export` ใน shell
- start.sh จะ generate ให้

### Production Deployment

สำหรับ production:

1. **ใช้ secrets management** (AWS Secrets Manager, Vault)
2. **ตั้ง strong passwords** สำหรับ database, Keycloak
3. **Enable HTTPS** (nginx + Let's Encrypt)
4. **Use real KMS** (AWS KMS แทน mock)
5. **Set proper CORS** ใน backend
6. **Limit container resources**

---

## 📚 Related Documentation

- [README.md](README.md) - Overview
- [USER_JOURNEY_QUICK_REF.md](USER_JOURNEY_QUICK_REF.md) - User guide
- [API-STATUS-REPORT.md](API-STATUS-REPORT.md) - API documentation
- [IMPROVEMENTS-SUMMARY.md](IMPROVEMENTS-SUMMARY.md) - Recent changes

---

## 🎯 Summary

### ✅ ทำ (Correct)

```bash
# เริ่มระบบ
./start.sh

# ดูสถานะ
npm run status

# ดู logs
npm run logs

# หยุด
npm stop
```

### ❌ ไม่ทำ (Incorrect - สำหรับ standalone install เท่านั้น)

```bash
# ❌ ไม่ต้องทำถ้าใช้ Docker
cd backend && npm install && npm run start:dev
cd frontend && npm install && npm run dev

# ใช้ Docker compose แทน!
```

### 🔄 Development (Hot Reload)

```bash
# Backend dev
cd infra && docker compose stop backend
cd ../backend && npm run start:dev

# Frontend dev  
cd frontend && npm run dev  # port 5173

# Production mode: ใช้ Docker (port 8080)
```

---

**Made with ❤️ for Docker deployments**

*Last Updated: February 15, 2026*
