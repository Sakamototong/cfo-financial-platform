# CFO Platform - End-to-End System Test Guide

## 📋 Overview

สคริปต์ `test-company-e2e.py` เป็น **End-to-End Test Suite** ที่จำลองบริษัทจริงที่เข้ามาใช้บริการ CFO Platform ตั้งแต่เริ่มต้นจนถึงการใช้งานฟีเจอร์หลักทั้งหมด

**บริษัทที่จำลอง:** ACME Corporation (`acme-corp`)  
**จำนวน Test Phases:** 15 phases  
**ระยะเวลาการรัน:** ~2-3 นาที  
**API Endpoints ทดสอบ:** 45+ endpoints

---

## 🎯 เป้าหมาย

สคริปต์นี้ทดสอบ **User Journey** ที่สมบูรณ์แบบ:

1. **Super Admin** - สร้าง tenant และ users
2. **Company Admin** - Setup DIM templates และ scenarios
3. **Financial Analyst** - Import ข้อมูล, สร้าง statements, projections, budgets
4. **Viewer** - ทดสอบ read-only access
5. **Multi-role RBAC** - ทดสอบ permission isolation
6. **Data Privacy (DSAR)** - ทดสอบ GDPR/PDPA compliance
7. **System Health** - ทดสอบ rate limiting และ system health

---

## ✅ Prerequisites

### 1. Docker Services ต้องรันอยู่

```bash
cd /Users/sommanutketpong/Documents/GitHub/project-cfo-poc-4/infra
docker compose up -d
```

**ตรวจสอบ services:**
```bash
docker compose ps
```

ต้องมี services เหล่านี้รัน:
- ✅ `backend` (port 3000)
- ✅ `frontend` (port 8080)
- ✅ `db` (PostgreSQL)
- ✅ `keycloak` (port 8081)

### 2. Backend API ต้อง Respond

```bash
curl -s http://localhost:3000/api | head -5
```

ควรเห็น HTML response จาก Swagger UI

### 3. Python 3.7+

```bash
python3 --version
```

### 4. Python Dependencies

```bash
pip3 install requests
```

---

## 🚀 การติดตั้ง

### 1. Clone Repository (ถ้ายังไม่ได้ clone)

```bash
git clone <repository-url>
cd project-cfo-poc-4
```

### 2. ให้สิทธิ์ Execute

```bash
chmod +x test-company-e2e.py
```

### 3. Install Python Dependencies

**Option 1: ใช้ pip**
```bash
pip3 install requests
```

**Option 2: ใช้ virtual environment (แนะนำ)**
```bash
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# หรือ .venv\Scripts\activate  # Windows
pip install requests
```

---

## 🏃 วิธีการรัน

### การรันแบบพื้นฐาน

```bash
python3 test-company-e2e.py
```

### การรันแบบ Verbose (แนะนำสำหรับ debug)

```bash
python3 test-company-e2e.py --verbose
```

**Verbose mode แสดง:**
- รายละเอียด HTTP requests/responses
- Status codes
- Response data structures
- API call details

### การรันแบบไม่ Cleanup

```bash
python3 test-company-e2e.py --no-cleanup
```

เก็บ test data ไว้ (tenant, users, statements) เพื่อตรวจสอบใน database หรือ UI

### การรันแบบใช้ Real Authentication

```bash
python3 test-company-e2e.py --no-demo-tokens
```

ใช้ Keycloak authentication แทน demo tokens (ต้องมี Keycloak users อยู่แล้ว)

### ตัวอย่างการรันแบบเต็ม

```bash
# รันแบบ verbose + เก็บ test data
python3 test-company-e2e.py --verbose --no-cleanup
```

### แสดง Help

```bash
python3 test-company-e2e.py --help
```

---

## 📊 ผลลัพธ์ที่คาดหวัง

### Output ตัวอย่าง (Success)

```
======================================================================
CFO Platform - End-to-End System Test
Company: ACME Corporation (acme-corp)
======================================================================

[1/16] Super Admin - Tenant Provisioning
======================================================================
[14:23:15] ✓ Running: Phase 1: Super Admin - Tenant Provisioning
[14:23:15] → Creating tenant 'acme-corp'...
[14:23:16] ✓ Tenant acme-corp confirmed
[14:23:16] → Initializing admin schema...
[14:23:17] → Initializing user schema...
[14:23:17] → Initializing DIM schema...
[14:23:17] ✓ All schemas initialized
[14:23:17] ✓ PASSED: Phase 1: Super Admin - Tenant Provisioning (2.1s)

[2/16] Super Admin - User Creation
======================================================================
[14:23:17] → Creating user: admin@acme-corp.com (admin)
[14:23:18] → Assigning admin@acme-corp.com to tenant acme-corp
[14:23:18] → Creating user: analyst@acme-corp.com (analyst)
[14:23:19] → Creating user: viewer@acme-corp.com (viewer)
[14:23:20] ✓ Created/verified 3 users
[14:23:20] ✓ PASSED: Phase 2: Super Admin - User Creation (3.2s)

... (phases 3-14) ...

[15/16] Cleanup
======================================================================
[14:25:30] → Cleaning up test data...
[14:25:30] → Deleting tenant acme-corp...
[14:25:31] ✓ Test tenant deleted
[14:25:31] ✓ PASSED: Phase 15: Cleanup (0.8s)

======================================================================
TEST SUMMARY
======================================================================
Total Tests:    15
Passed:         15 ✓
Failed:         0 ✗
Success Rate:   100.0%
Total Time:     127 seconds
API Calls:      89
======================================================================

All tests completed successfully! 🎉
```

### Output ตัวอย่าง (Partial Success)

```
======================================================================
TEST SUMMARY
======================================================================
Total Tests:    14
Passed:         10 ✓
Failed:         4 ✗
Success Rate:   71.4%
Total Time:     25 seconds
API Calls:      23
======================================================================
Some tests failed. Please review the logs above.
```

**สถานะสี:**
- 🟢 `✓` (สีเขียว) = Success
- 🔴 `✗` (สีแดง) = Failed
- 🟡 `⚠` (สีเหลือง) = Warning
- 🔵 `→` (สีฟ้า) = Step in progress
- 🔵 `ℹ` (สีฟ้า) = Info

---

## 🔍 Test Phases รายละเอียด

### Phase 1: Super Admin - Tenant Provisioning
- สร้าง tenant `acme-corp`
- Initialize admin, user, DIM schemas
- Verify tenant exists

**API Endpoints:**
- `POST /super-admin/tenants`
- `GET /super-admin/tenants`
- `POST /admin/init`
- `POST /users/init`
- `POST /dim/init`

---

### Phase 2: Super Admin - User Creation
- สร้าง Company Admin user
- สร้าง Analyst user
- สร้าง Viewer user
- Assign users ไปที่ tenant `acme-corp`

**API Endpoints:**
- `POST /super-admin/users`
- `POST /super-admin/users/:userId/tenants/:tenantId`

---

### Phase 3: Company Admin - DIM Setup
- List available DIM templates
- สร้าง P&L template
- สร้าง Balance Sheet template
- สร้าง Cash Flow template

**API Endpoints:**
- `GET /dim/templates`
- `POST /dim/templates`

---

### Phase 4: Company Admin - Scenario Creation
- สร้าง default scenarios (Actual, Budget, Forecast)
- สร้าง custom scenario "Optimistic" (+15% growth)
- สร้าง custom scenario "Pessimistic" (-5% decline)
- List และ verify scenarios

**API Endpoints:**
- `POST /scenarios/defaults`
- `POST /scenarios`
- `GET /scenarios`

---

### Phase 5: Financial Analyst - ETL Import
- Generate sample CSV data (50 transactions)
- Upload CSV ผ่าน ETL import
- Check import status
- List imported transactions

**API Endpoints:**
- `POST /etl/import`
- `GET /etl/imports/:id`
- `GET /etl/transactions`

**Sample CSV Format:**
```csv
Date,Account,Description,Debit,Credit,Category
2026-01-05,4000,Product Sales - Week 1,125000,0,Revenue
2026-01-10,5000,Cost of Goods Sold,0,50000,COGS
2026-01-15,6100,Salaries,0,80000,Operating Expenses
...
```

---

### Phase 6: Financial Analyst - Create Statement
- สร้าง P&L statement สำหรับ January 2026
- Add line items:
  - Revenue: 500,000 THB
  - COGS: 200,000 THB
  - Operating Expenses: 150,000 THB
  - Net Income: 150,000 THB
- Update status เป็น "submitted"

**API Endpoints:**
- `POST /financial/statements`
- `POST /financial/line-items`
- `GET /financial/statements/:id`
- `PUT /financial/statements/:id/status`

---

### Phase 7: Company Admin - Approve Statement
- Fetch statements ที่ status = "submitted"
- Approve statement
- Verify approval notification

**API Endpoints:**
- `GET /financial/statements?status=submitted`
- `PUT /financial/statements/:id/status`

---

### Phase 8: Financial Analyst - Generate Projections
- Get scenario list
- Generate 12-month projection จาก base statement
- Verify projected periods
- Verify financial ratios calculated

**API Endpoints:**
- `GET /scenarios`
- `POST /projections/generate`
- `GET /projections/:id`

**Financial Ratios ที่ verify:**
- Current Ratio
- Debt-to-Equity
- Profit Margin
- ROA, ROE
- และอีก 20+ ratios

---

### Phase 9: Financial Analyst - Create Budget
- สร้าง 2026 Annual Budget
- Add budget line items
- Submit budget for approval

**API Endpoints:**
- `POST /budgets`
- `POST /budgets/:id/line-items`
- `POST /budgets/:id/submit`

---

### Phase 10: Company Admin - Reports & Analytics
- Generate variance analysis report (Budget vs Actual)
- Generate trend analysis (Q1 2026)
- Generate budget vs actual comprehensive report
- Export report as CSV

**API Endpoints:**
- `GET /reports/variance`
- `GET /reports/trend`
- `GET /reports/budget-vs-actual`
- `GET /reports/export/variance`

---

### Phase 11: Multi-Role Permission Testing

#### Test Viewer Role (Read-Only)
- ✅ GET `/financial/statements` → 200 (allowed)
- ❌ POST `/financial/statements` → 403 (blocked)
- ❌ DELETE `/financial/statements/:id` → 403 (blocked)

#### Test Analyst Role
- ✅ POST `/financial/statements` → 201 (can create)
- ❌ PUT `/budgets/:id/approve` → 403 (cannot approve)

**Verify RBAC Hierarchy:**
```
Viewer (10) < Analyst (30) < Admin (50) < Super Admin (100)
```

---

### Phase 12: Data Privacy & Compliance (DSAR)
- Submit Data Subject Access Request (DSAR)
- Admin approves request
- Process request and generate data export
- Verify audit trail

**API Endpoints:**
- `POST /dsr/requests`
- `PUT /dsr/requests/:id/approve`
- `POST /dsr/requests/:id/process`
- `GET /dsr/requests/:id/audit-log`

**GDPR/PDPA Compliance:**
- User data export
- Audit logging
- Request approval workflow

---

### Phase 13: System Health & Rate Limiting
- Test rate limiting (5 requests/minute on auth endpoints)
- Verify 429 Too Many Requests returned
- Check system health endpoints

**Rate Limit Configuration:**
- Auth endpoints: **5 requests/minute**
- Default endpoints: **60 requests/minute**

---

### Phase 14: Final Verification
- Get system analytics overview
- Get tenant-specific statistics
- Verify data integrity:
  - ✅ 1 tenant created
  - ✅ 3 users created
  - ✅ Statements, projections, budgets exist

**API Endpoints:**
- `GET /super-admin/analytics/overview`
- `GET /super-admin/analytics/tenants/:id/stats`
- `GET /super-admin/tenants/:id/users`

---

### Phase 15: Cleanup (Optional)
- Delete tenant `acme-corp`
- Cascading delete: users, statements, projections, budgets
- Verify tenant removed

**API Endpoints:**
- `DELETE /super-admin/tenants/:id`

**Skip cleanup:**
```bash
python3 test-company-e2e.py --no-cleanup
```

---

## 🐛 การแก้ไขปัญหา

### ❌ Problem: Connection Refused

**Error:**
```
requests.exceptions.ConnectionError: ('Connection aborted.', ConnectionRefusedError(61, 'Connection refused'))
```

**แก้ไข:**
```bash
# ตรวจสอบ Docker services
cd infra && docker compose ps

# ถ้า services ไม่รัน
docker compose up -d

# รอให้ backend พร้อม
sleep 10
curl http://localhost:3000/api
```

---

### ❌ Problem: 500 Internal Server Error

**Error:**
```
Response: 500 (expected 201)
{"statusCode":500,"message":"Internal server error"}
```

**สาเหตุเป็นไปได้:**
1. **Database schema ไม่ถูก initialize:**
   ```bash
   # Check database tables
   docker compose exec -T db psql -U postgres -d postgres -c "\dt"
   ```

2. **Tenant ยังไม่ถูกสร้าง:**
   ```bash
   # Create admin tenant first
   docker compose exec -T db psql -U postgres -d postgres -c "
   INSERT INTO tenants (tenant_id, company_name, status, created_at)
   VALUES ('admin', 'Admin Tenant', 'active', NOW())
   ON CONFLICT DO NOTHING;
   "
   ```

3. **Backend logs มี error:**
   ```bash
   docker compose logs backend | tail -50
   ```

---

### ❌ Problem: 403 Forbidden

**Error:**
```
Response: 403 (expected 201)
{"statusCode":403,"message":"Forbidden resource"}
```

**สาเหตุ:**
- Demo tokens ไม่มี permission เพียงพอ
- RBAC rules block การเข้าถึง

**แก้ไข:**
```bash
# ลองใช้ real authentication
python3 test-company-e2e.py --no-demo-tokens
```

---

### ❌ Problem: Demo Tokens ไม่ทำงาน

**แก้ไข:**

ตรวจสอบว่า backend support demo tokens:

```bash
# ดูที่ backend source code
grep -r "demo-token" backend/src/
```

ถ้าไม่ support ให้ใช้:
```bash
python3 test-company-e2e.py --no-demo-tokens
```

---

### ❌ Problem: ModuleNotFoundError: No module named 'requests'

**แก้ไข:**
```bash
pip3 install requests
```

หรือ
```bash
python3 -m pip install requests
```

---

### ⚠️ Warning: urllib3 NotOpenSSLWarning

**Message:**
```
NotOpenSSLWarning: urllib3 v2 only supports OpenSSL 1.1.1+
```

**แก้ไข (Optional):**
```bash
pip3 install 'urllib3<2.0'
```

**หมายเหตุ:** Warning นี้ไม่ส่งผลกระทบต่อการทดสอบ

---

### 🔍 Debug Mode

เปิด verbose logging เพื่อดู request/response details:

```bash
python3 test-company-e2e.py --verbose 2>&1 | tee test-output.log
```

จะบันทึก output ลง `test-output.log` เพื่อวิเคราะห์

---

## 📝 การตรวจสอบ Test Data

### ตรวจสอบใน Database

```bash
# Connect to PostgreSQL
docker compose -f infra/docker-compose.yml exec db psql -U postgres -d acme-corp

# List all tenants
SELECT * FROM tenants WHERE tenant_id = 'acme-corp';

# List users
SELECT * FROM users WHERE tenant_id = 'acme-corp';

# List financial statements
SELECT * FROM financial_statements WHERE tenant_id = 'acme-corp';

# List scenarios
SELECT * FROM scenarios WHERE tenant_id = 'acme-corp';
```

### ตรวจสอบใน UI

1. เปิด browser: http://localhost:8080
2. Login ด้วย:
   - **Username:** `admin@acme-corp.com`
   - **Password:** `Admin123!`
3. ตรวจสอบ:
   - Dashboard มี charts และ data
   - Financial Statements แสดงรายการ
   - Scenarios มี Actual, Budget, Forecast, Optimistic, Pessimistic
   - Reports สามารถ generate ได้

### ตรวจสอบใน Swagger

1. เปิด browser: http://localhost:3000/api
2. ทดสอบ endpoints ด้วยตนเอง
3. ใช้ "Try it out" feature

---

## 🎓 การ Customize Script

### เปลี่ยน Tenant Name

แก้ในไฟล์ `test-company-e2e.py`:

```python
TENANT_NAME = "my-company"
COMPANY_NAME = "My Company Inc."
```

### เพิ่ม Test Phase ใหม่

```python
def phase16_custom_test(self) -> bool:
    """Phase 16: Custom Test"""
    self.print_phase(16, 17, "Custom Test")
    
    # Your test logic here
    response = self.api_call(
        "GET",
        "/your-endpoint",
        user_role="analyst",
        tenant_id=TENANT_NAME
    )
    
    return self.verify_response(response, 200)
```

แล้วเพิ่มใน `run_all_tests()`:

```python
phases = [
    # ... existing phases ...
    ("Phase 16: Custom Test", self.phase16_custom_test),
]
```

### เปลี่ยนจำนวน CSV Transactions

แก้ใน `_generate_sample_csv()`:

```python
def _generate_sample_csv(self) -> str:
    # เพิ่มหรือลด transactions ตามต้องการ
    transactions = [
        # ... add more rows ...
    ]
```

---

## 📚 เอกสารเพิ่มเติม

### ที่เกี่ยวข้อง
- [USER_JOURNEY.md](USER_JOURNEY.md) - Complete user journey documentation
- [USER_JOURNEY_QUICK_REF.md](USER_JOURNEY_QUICK_REF.md) - Quick reference guide
- [API-STATUS-REPORT.md](API-STATUS-REPORT.md) - API implementation status
- [PHASE2-RBAC-COMPLETE.md](PHASE2-RBAC-COMPLETE.md) - RBAC documentation

### API Documentation
- **Swagger UI:** http://localhost:3000/api
- **Backend Routes:** `backend/src/*/controllers/*.ts`

---

## 🤝 Contributing

หากต้องการเพิ่ม test scenarios:

1. แก้ไข `test-company-e2e.py`
2. เพิ่ม phase function ใหม่
3. Update `run_all_tests()` method
4. ทดสอบด้วย `--verbose` flag
5. Update documentation นี้

---

## 📞 Support

หากมีปัญหา:

1. เช็ค logs: `docker compose logs backend`
2. รันแบบ verbose: `python3 test-company-e2e.py --verbose`
3. ตรวจสอบ database: `docker compose exec db psql -U postgres`
4. เช็ค network: `curl http://localhost:3000/api`

---

## ✨ หมายเหตุ

- สคริปต์นี้ออกแบบมาสำหรับ **development/testing environment**
- **ห้าม** รันกับ production database
- Test data จะถูกลบทิ้งหลัง test เสร็จ (ถ้าไม่ใช้ `--no-cleanup`)
- ใช้ `--verbose` เพื่อดู detailed logs
- Demo tokens ทำให้ test รันเร็วขึ้น แต่อาจไม่ test authentication flow แบบเต็ม

---

**Last Updated:** February 17, 2026  
**Version:** 1.0.0  
**Script:** `test-company-e2e.py`
