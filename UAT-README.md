# 🚀 UAT Deployment Quick Reference

สำหรับการ deploy CFO Platform ไปยังเครื่อง UAT

---

## 📋 ไฟล์สำคัญสำหรับ UAT

| ไฟล์ | คำอธิบาย |
|------|----------|
| **UAT-DEPLOYMENT-GUIDE.md** | คู่มือ deployment ฉบับเต็ม (ภาษาอังกฤษ) |
| **uat-quick-deploy.sh** | Script สำหรับติดตั้งอัตโนมัติ (แนะนำ) |
| **health-check-uat.sh** | ตรวจสอบสถานะระบบ |
| **backup-uat.sh** | สำรองข้อมูล (database + config) |
| **UAT-READINESS-REPORT.md** | รายงานผลการทดสอบ E2E (100%) |

---

## ⚡ Quick Start (3 ขั้นตอน)

### 1️⃣ เตรียมเครื่อง UAT Server

**ความต้องการขั้นต่ำ:**
- Ubuntu 22.04 LTS หรือ CentOS 8+
- RAM: 8 GB (แนะนำ 16 GB)
- CPU: 4 cores
- Disk: 50 GB+ SSD
- Port เปิด: 3000, 8080, 8081, 5432
- (ถ้า 8080 ถูกใช้อยู่ ดูวิธีเปลี่ยน port ด้านล่าง)

### 2️⃣ รัน Quick Deploy Script

> **⚠️ เช็ค port ก่อน deploy:** ถ้า port 8080 ถูกใช้อยู่ ให้ตั้ง `FRONTEND_PORT` ก่อน
> ```bash
> # ตรวจสอบว่า 8080 ว่างไหม
> ss -tlnp | grep 8080
> # ถ้าถูกใช้อยู่ ให้เลือก port อื่น เช่น 9080
> export FRONTEND_PORT=9080
> ```

```bash
# SSH เข้าเครื่อง UAT
ssh user@uat-server

# Download script
curl -O https://raw.githubusercontent.com/Sakamototong/cfo-financial-platform/main/uat-quick-deploy.sh

# Run script (ติดตั้งทุกอย่างอัตโนมัติ)
chmod +x uat-quick-deploy.sh
./uat-quick-deploy.sh
```

**Script จะทำอะไร:**
- ✅ ติดตั้ง Docker + Docker Compose
- ✅ Clone code จาก GitHub
- ✅ Generate environment configuration
- ✅ สร้าง strong passwords อัตโนมัติ
- ✅ Build Docker images
- ✅ Start services
- ✅ Run health checks
- ✅ แสดง credentials ให้ save

**ใช้เวลา:** ~10-15 นาที (ขึ้นอยู่กับความเร็วอินเทอร์เน็ต)

### 3️⃣ เข้าใช้งาน

```
Frontend:  http://<UAT_SERVER_IP>:8080
Backend:   http://<UAT_SERVER_IP>:3000
API Docs:  http://<UAT_SERVER_IP>:3000/api
Keycloak:  http://<UAT_SERVER_IP>:8081
```

---

## 🔧 การใช้งาน Scripts

### ตรวจสอบสุขภาพระบบ

```bash
cd /opt/cfo-platform
./health-check-uat.sh
```

**ผลลัพธ์:**
- ✅ แสดงสถานะทุก services
- ⚠️ แจ้งเตือนถ้ามีปัญหา
- ❌ แจ้งเตือนถ้ามี errors

### สำรองข้อมูล

```bash
cd /opt/cfo-platform
./backup-uat.sh
```

**สิ่งที่จะ backup:**
- ✅ ฐานข้อมูลทั้งหมด (PostgreSQL dump)
- ✅ ไฟล์ configuration (.env, docker-compose.yml)
- ✅ Logs files
- ✅ สร้างไฟล์ manifest

**ตำแหน่ง backup:** `./backups/cfo-backup-YYYYMMDD-HHMMSS.tar.gz`

### Restore จาก backup

```bash
cd /opt/cfo-platform

# แสดง backups ที่มี
ls -lh backups/

# Restore
# 1. Stop services
cd infra && docker-compose down

# 2. Extract backup
cd /opt/cfo-platform
tar -xzf backups/cfo-backup-20260217-143000.tar.gz

# 3. Restore database
docker-compose -f infra/docker-compose.yml up -d db
sleep 10
docker-compose -f infra/docker-compose.yml exec -T db psql -U postgres < cfo-backup-20260217-143000-all-databases.sql

# 4. Start all services
docker-compose -f infra/docker-compose.yml up -d
```

---

## 📚 คู่มือฉบับเต็ม

อ่านรายละเอียดใน **[UAT-DEPLOYMENT-GUIDE.md](UAT-DEPLOYMENT-GUIDE.md):**

- ✅ Pre-deployment checklist ครบถ้วน
- ✅ Security hardening
- ✅ SSL/HTTPS setup
- ✅ Firewall configuration
- ✅ Monitoring & logging
- ✅ Backup & recovery procedures
- ✅ Troubleshooting guide
- ✅ Update & rollback procedures

---

## 🔐 Security Checklist

**ก่อนเปิดใช้งาน UAT:**

- [ ] เปลี่ยน default passwords ทั้งหมด
- [ ] ตั้งค่า firewall (ufw/firewalld)
- [ ] ปิด Swagger ใน production (`ENABLE_SWAGGER=false`)
- [ ] ตั้งค่า rate limiting
- [ ] Enable SSL/HTTPS (ถ้าเป็น production)
- [ ] ทดสอบ backup & restore
- [ ] Review audit logs
- [ ] Setup monitoring alerts

---

## 🧪 การทดสอบ

### รัน E2E Tests

```bash
cd /opt/cfo-platform
./run-e2e-test.sh
```

**ผลลัพธ์ที่คาดหวัง:**
```
✅ Passed: 16/16 phases (100.0%)
⏱️  Duration: ~24 seconds
📊 API Calls: 26 requests
```

### ทดสอบด้วยมือ

ตาม checklist ใน [UAT-READINESS-REPORT.md](UAT-READINESS-REPORT.md):
- ✅ Login (Super Admin, Admin, Analyst, Viewer)
- ✅ Create tenant & manage users
- ✅ Financial statements CRUD
- ✅ Scenario management
- ✅ Projections (12-month forecast)
- ✅ Budget management + approval workflow
- ✅ Reports & charts (variance, drill-down)
- ✅ ETL import (CSV / QuickBooks)
- ✅ RBAC permissions (menu-level + API-level)
- ✅ Company profile + fiscal year settings
- ✅ Billing & subscription management
- ✅ Version history + diff compare
- ✅ DSR / DSAR privacy workflow
- ✅ Profile (5 tabs incl. CFO alert thresholds)
- ✅ Workflow approval chains

---

## 📞 การติดต่อ Support

**GitHub Repository:**  
https://github.com/Sakamototong/cfo-financial-platform

**Issues & Bugs:**  
https://github.com/Sakamototong/cfo-financial-platform/issues

**Documentation:**
- [README.md](README.md) - Overview
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guide
- [SECURITY.md](SECURITY.md) - Security policy

---

## 🎯 Troubleshooting เบื้องต้น

### Services ไม่ start

```bash
# ดู logs
cd /opt/cfo-platform/infra
docker-compose logs -f

# Restart services
docker-compose restart

# Rebuild ถ้าจำเป็น
docker-compose down
docker-compose build
docker-compose up -d
```

### Backend ติดต่อ Database ไม่ได้

```bash
# ตรวจสอบ database
docker-compose exec db psql -U postgres -c "SELECT version();"

# ตรวจสอบ environment
docker-compose exec backend env | grep PG_

# Restart backend
docker-compose restart backend
```

### Memory หรือ Disk เต็ม

```bash
# เช็ค disk
df -h
docker system df

# Clean up
docker system prune -a
docker volume prune

# เช็ค memory
free -m
docker stats
```

---

## ✅ Post-Deployment Checklist

หลัง deploy เสร็จ:

- [ ] Run `./health-check-uat.sh` - ทุกอย่าง green
- [ ] Run `./run-e2e-test.sh` - 100% pass
- [ ] ทดสอบ login ทุก roles
- [ ] Import sample data สำเร็จ
- [ ] ตรวจสอบ logs ไม่มี errors
- [ ] Backup แรกสำเร็จ
- [ ] Firewall configured
- [ ] Monitoring setup
- [ ] Team members ได้รับ credentials
- [ ] Documentation อัพเดท

---

**เวอร์ชัน:** v0.3.0  
**อัพเดทล่าสุด:** February 22, 2026  
**ทดสอบบน:** Ubuntu 22.04 LTS, Docker 24.0.5
