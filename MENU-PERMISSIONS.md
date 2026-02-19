# ผังเมนูตามสิทธิ์ (CFO Platform)

## ลำดับชั้น Role (Role Hierarchy)

```
super_admin (100) > tenant_admin / admin (50) > finance_manager (40) > finance_user (30) > analyst (20) > viewer (10)
```

| Role ใน DB / Frontend | ระดับ | หมายเหตุ |
|------------------------|:-----:|----------|
| `super_admin`          | 100   | Full system access ทุก tenant |
| `admin` / `tenant_admin` | 50  | Full access ภายใน tenant |
| `finance_manager`      | 40   | จัดการ budget, forecast, approval |
| `finance_user`         | 30   | สร้าง/แก้ไขข้อมูลการเงิน |
| `analyst`              | 20   | สร้าง scenario, รัน report |
| `viewer`               | 10   | อ่านอย่างเดียว |

---

## ผังเมนูตามสิทธิ์

### 🟢 ทุก Role เข้าได้ (viewer ขึ้นไป)

| เมนู | URL | หมายเหตุ |
|------|-----|----------|
| 🏠 Dashboard | `/` | หน้าหลัก |
| 📊 Financial Statements | `/financials` | ดูงบการเงิน |
| 📈 Reports | `/reports` | ดูรายงาน |
| 💰 Cash Flow Forecasting | `/cashflow` | ⚠️ Backend ต้องการ `finance_user`+ |
| 🕐 Version History | `/version-history` | ⚠️ Backend ต้องการ `analyst`+ |
| 🏢 Company Profile | `/company` | ข้อมูลบริษัท |
| 🔒 Data Requests | `/data-requests` | คำขอข้อมูลส่วนบุคคล (PDPA) |
| 👤 My Profile | `/profile` | โปรไฟล์ผู้ใช้ |

> ⚠️ **Cash Flow** และ **Version History** แสดงในเมนูสำหรับทุก role แต่ backend จะ block ถ้า role ไม่ถึง

---

### 🔵 Analyst ขึ้นไป (analyst, finance_user, finance_manager, admin, super_admin)

| เมนู | URL | หมายเหตุ |
|------|-----|----------|
| 🔮 Scenarios | `/scenarios` | สร้าง/จัดการ scenario |
| 📉 Projections | `/projections` | การทำ projection |
| 🔗 Consolidation | `/consolidation` | รวมงบการเงิน |
| 📥 ETL | `/etl` | นำเข้าข้อมูล |
| 📥 ETL Import | `/etl-import` | นำเข้าข้อมูล (Advanced) |
| 🗂️ Dimensions | `/dim` | จัดการ dimension |
| 📋 Chart of Accounts | `/coa` | ผังบัญชี |
| 💼 Budgets | `/budgets` | งบประมาณ |
| 👥 Users | `/users` | จัดการผู้ใช้ใน tenant |
| ⚙️ Workflow | `/workflow` | จัดการ workflow |

---

### 🟠 Admin ขึ้นไป (admin, tenant_admin, finance_manager, super_admin)

| เมนู | URL | หมายเหตุ |
|------|-----|----------|
| 🏛️ Tenants | `/tenants` | จัดการ tenant |
| ⚙️ Admin Settings | `/admin` | ตั้งค่าระบบ |
| 💳 Billing | `/billing` | การเรียกเก็บเงิน |
| ✏️ Edit Financial Statement | `/financials/:id/edit` | แก้ไขงบการเงิน |

---

### 🟣 Super Admin เท่านั้น

| เมนู | URL | หมายเหตุ |
|------|-----|----------|
| 🚀 Super Admin Dashboard | `/super-admin` | ภาพรวมระบบทั้งหมด |
| 🏢 Tenant Management | `/super-admin/tenants/:id` | จัดการ tenant แต่ละราย |
| 👑 System Users | `/super-admin/system-users` | จัดการ super admin users |

---

## ตารางสรุป Role vs เมนู

| เมนู | viewer | analyst | admin | super_admin |
|------|:------:|:-------:|:-----:|:-----------:|
| 🏠 Dashboard | ✅ | ✅ | ✅ | ✅ |
| 📊 Financial Statements | ✅ | ✅ | ✅ | ✅ |
| 📈 Reports | ✅ | ✅ | ✅ | ✅ |
| 💰 Cash Flow Forecasting | ❌¹ | ❌¹ | ✅ | ✅ |
| 🕐 Version History | ❌¹ | ✅ | ✅ | ✅ |
| 🏢 Company Profile | ✅ | ✅ | ✅ | ✅ |
| 🔒 Data Requests | ✅ | ✅ | ✅ | ✅ |
| 👤 My Profile | ✅ | ✅ | ✅ | ✅ |
| 🔮 Scenarios | ❌ | ✅ | ✅ | ✅ |
| 📉 Projections | ❌ | ✅ | ✅ | ✅ |
| 🔗 Consolidation | ❌ | ✅ | ✅ | ✅ |
| 📥 ETL / ETL Import | ❌ | ✅ | ✅ | ✅ |
| 🗂️ Dimensions | ❌ | ✅ | ✅ | ✅ |
| 📋 Chart of Accounts | ❌ | ✅ | ✅ | ✅ |
| 💼 Budgets | ❌ | ✅ | ✅ | ✅ |
| 👥 Users | ❌ | ✅ | ✅ | ✅ |
| ⚙️ Workflow | ❌ | ✅ | ✅ | ✅ |
| 🏛️ Tenants | ❌ | ❌ | ✅ | ✅ |
| ⚙️ Admin Settings | ❌ | ❌ | ✅ | ✅ |
| 💳 Billing | ❌ | ❌ | ✅ | ✅ |
| ✏️ Edit Financial Statement | ❌ | ❌ | ✅ | ✅ |
| 🚀 Super Admin Dashboard | ❌ | ❌ | ❌ | ✅ |
| 🏢 Tenant Management | ❌ | ❌ | ❌ | ✅ |
| 👑 System Users | ❌ | ❌ | ❌ | ✅ |

> ¹ เมนูแสดงใน sidebar แต่ backend จะ block (403 Forbidden) เพราะ role ต่ำกว่าที่กำหนด

---

## ข้อมูลทางเทคนิค

### Backend Role Guards

| Controller | Minimum Role | Level |
|------------|:------------:|:-----:|
| `cashflow.controller.ts` | `finance_user` | 30 |
| `version-control.controller.ts` `.getAllVersions()` | `analyst` | 20 |

### Frontend Role Mapping

```
DB role       → Frontend role  → สิทธิ์
-----------     --------------   --------
admin         → admin            Admin level (50)
tenant_admin  → admin / tenant_admin  Admin level (50)
analyst       → analyst          Analyst level (20)
viewer        → viewer           Viewer level (10)
super_admin   → super_admin      Super Admin (100)
```

### Role ใน `RequireRole` Component (Frontend)

```
ROLE_ORDER: viewer(1) < analyst(2) < finance_user(3) < finance_manager(4) < admin(5) < tenant_admin(5) < super_admin(6)
```
