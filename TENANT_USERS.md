# Tenant-Specific User Accounts

## Overview
แต่ละ tenant มี users แยกกันเอง ไม่สามารถ login เข้า tenant อื่นได้

## Admin Tenant (`admin`)
**URL:** เลือก "admin" ใน Company Selector

| Email | Password | Role | Access |
|-------|----------|------|--------|
| admin@admin.local | Secret123! | admin | Full access to admin tenant |
| analyst@admin.local | Secret123! | analyst | Create/edit in admin tenant |
| viewer@admin.local | Secret123! | viewer | Read-only in admin tenant |

**หมายเหตุ:** ยังมี `admin/admin` (demo mode) ที่สามารถเข้าถึงทุก tenant ได้

---

## TestCo Tenant (`testco`)
**URL:** เลือก "testco" ใน Company Selector

| Email | Password | Role | Access |
|-------|----------|------|--------|
| demo-admin@testco.local | Secret123! | admin | Full access to testco tenant |
| analyst@testco.local | Secret123! | analyst | Create/edit in testco tenant |
| viewer@testco.local | Secret123! | viewer | Read-only in testco tenant |

---

## Acmecorp Tenant (`acmecorp-smoke-demo`)
**URL:** เลือก "acmecorp-smoke-demo" ใน Company Selector

| Email | Password | Role | Access |
|-------|----------|------|--------|
| admin@acmecorp.local | Secret123! | admin | Full access to acmecorp tenant |
| analyst@acmecorp.local | Secret123! | analyst | Create/edit in acmecorp tenant |
| viewer@acmecorp.local | Secret123! | viewer | Read-only in acmecorp tenant |

---

## Role Permissions

### Admin Role
- เห็นเมนูทั้งหมด: Dashboard, Tenants, Users, Scenarios, Financials, Projections, Consolidation, Reports, ETL/Import, Dimensions, Company, Billing, Workflow, Admin, Profile
- สามารถ CRUD ทุกอย่างใน tenant ของตัวเอง

### Analyst Role
- เห็นเมนู: Dashboard, Users, Scenarios, Financials, Projections, Consolidation, Reports, ETL/Import, Dimensions, Company, Workflow, Profile
- ไม่เห็น: Tenants, Billing, Admin
- สามารถสร้างและแก้ไขข้อมูล

### Viewer Role
- เห็นเมนู: Dashboard, Financials, Reports, Company, Profile
- ไม่เห็น: Tenants, Users, Scenarios, Projections, Consolidation, ETL/Import, Dimensions, Billing, Workflow, Admin
- Read-only access เท่านั้น

---

## การทดสอบ Tenant Isolation

### ทดสอบ Admin Tenant:
1. Login: `admin@admin.local` / `Secret123!`
2. เลือก tenant: `admin`
3. ตรวจสอบว่าเห็นข้อมูลของ admin tenant เท่านั้น

### ทดสอบ TestCo Tenant:
1. Login: `demo-admin@testco.local` / `Secret123!`
2. เลือก tenant: `testco`
3. ตรวจสอบว่าเห็นข้อมูลของ testco tenant เท่านั้น

### ทดสอบ Acmecorp Tenant:
1. Login: `admin@acmecorp.local` / `Secret123!`
2. เลือก tenant: `acmecorp-smoke-demo`
3. ตรวจสอบว่าเห็นข้อมูลของ acmecorp tenant เท่านั้น

---

## Demo Mode (ไม่แนะนำสำหรับ Production)

**Username:** `admin`  
**Password:** `admin`

- สามารถเข้าถึงทุก tenant ได้
- ใช้สำหรับ development/testing เท่านั้น
- ควร disable ใน production environment
