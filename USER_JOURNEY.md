# User Journey - CFO Platform

## 👥 User Personas & Roles

### 1. **Super Admin** (System Administrator)
- **Access**: Full system access, cross-tenant operations
- **Goals**: Manage tenants, system configuration, user provisioning
- **Technical skill**: High

### 2. **Company Admin** (CFO/Finance Director)
- **Access**: Full access within their company/tenant
- **Goals**: Oversee financial planning, approve workflows, manage team
- **Technical skill**: Medium-High

### 3. **Financial Analyst** (FP&A Analyst)
- **Access**: Create/edit financial data, run scenarios & projections
- **Goals**: Build financial models, analyze scenarios, generate reports
- **Technical skill**: Medium

### 4. **Viewer** (Executive/Stakeholder)
- **Access**: Read-only access to reports and dashboards
- **Goals**: View financial insights, track performance
- **Technical skill**: Low-Medium

---

## 🗺️ User Journey Maps

### Journey 1: Super Admin - Initial System Setup

**Goal**: Set up multi-tenant system for multiple companies

#### Steps:
1. **Login** → Keycloak admin credentials
2. **Create Tenants** 
   - Navigate to Tenants page
   - Click "+ New Tenant"
   - Enter company name (e.g., "ACME Corp")
   - System creates isolated database
3. **Initialize Tenant Schema**
   - POST /admin/init (tenant tables)
   - POST /users/init (user schema)
   - POST /dim/init (dimension tables)
4. **Create Company Admin**
   - Navigate to Users page
   - Select tenant: "ACME Corp"
   - Invite user with 'admin' role
   - User receives invitation
5. **Configure System Settings**
   - Set up ETL parameters
   - Configure approval chains
   - Audit log review

**Pain Points**:
- ❌ No guided wizard for tenant setup
- ❌ Manual API calls needed for schema init
- ❌ No validation of setup completion

---

### Journey 2: Company Admin - First Time Setup

**Goal**: Set up company financial structure and invite team

#### Steps:
1. **Login & Company Selection**
   - Login with credentials
   - System auto-selects their tenant
   - View Dashboard (empty state)
2. **Set Up DIM Templates**
   - Navigate to DIM page
   - Create statement template (P&L, Balance Sheet)
   - Define dimensions (Department, Product, Region)
   - Link dimensions to statement lines
3. **Create Base Scenarios**
   - Navigate to Scenarios page
   - Create "Actual", "Budget", "Forecast" scenarios
   - Set baseline period and assumptions
4. **Import Historical Data**
   - Navigate to ETL page
   - Upload Excel/CSV with actuals
   - Map columns to DIM structure
   - Review import log
5. **Invite Team Members**
   - Navigate to Users page
   - Invite analysts (role: 'analyst')
   - Invite executives (role: 'viewer')
6. **Set Up Approval Workflows**
   - Navigate to Workflow page
   - Create approval chains
   - Assign approvers for scenarios/projections

**Pain Points**:
- ❌ No onboarding wizard or checklist
- ❌ Empty states don't guide next actions
- ❌ No templates or sample data
- ❌ Complex DIM setup without help

---

### Journey 3: Financial Analyst - Monthly Planning Cycle

**Goal**: Create monthly financial statements and projections

#### Steps:
1. **Login & Context Check**
   - Login
   - Verify correct company selected
   - Navigate to Dashboard
2. **Create Monthly Statement**
   - Navigate to Financials page
   - Click "Create Statement"
   - Select: P&L, Monthly, 2026-01
   - Enter line items (Revenue, COGS, OpEx)
   - Select scenario: "Actual"
   - Save as draft
3. **Review & Submit**
   - Validate totals
   - Change status: "submitted"
   - Trigger approval workflow (if configured)
4. **Run Projections**
   - Navigate to Projections page
   - Select base statement (Jan Actual)
   - Select scenario (Budget assumptions)
   - Set projection periods: 12 months
   - Click "Generate Projection"
   - Review projected line items
5. **Scenario Analysis**
   - Navigate to Scenarios page
   - Create "Optimistic" scenario
   - Adjust assumptions (+15% revenue growth)
   - Re-run projections with new scenario
   - Compare side-by-side
6. **Generate Reports**
   - Navigate to Reports page
   - Select "Variance Analysis"
   - Compare Actual vs Budget
   - Export to Excel/PDF
   - Share with stakeholders

**Pain Points**:
- ❌ No bulk operations for line items
- ❌ No copy/paste from previous statements
- ❌ Limited scenario comparison UI
- ❌ No collaborative commenting
- ❌ Manual report distribution

---

### Journey 4: Viewer - Monthly Review

**Goal**: Review financial performance and dashboards

#### Steps:
1. **Login**
   - Login with read-only credentials
   - Auto-select company
2. **Dashboard Overview**
   - View aggregated totals by scenario
   - See revenue trends (chart)
   - Quick scenario comparison
3. **Drill Down to Details**
   - Click on Financials
   - View list of statements
   - Click statement to see line items
   - Filter by period, scenario, type
4. **View Reports**
   - Navigate to Reports page
   - View pre-generated reports
   - Summary reports (P&L, Balance Sheet)
   - Trend analysis by line code
5. **Logout**

**Pain Points**:
- ❌ Limited interactive dashboards
- ❌ No personalized views
- ❌ No alerts/notifications
- ❌ No mobile optimization

---

## 🎯 Critical User Flows

### Flow A: First Login Experience

```
[Login Page] 
    ↓
[Auth Success]
    ↓
[Company Auto-Selected or Selector shown]
    ↓
[Dashboard]
    ↓ (if empty)
[Onboarding Wizard] ← NEW
    - Welcome message
    - Role-based quick start
    - Link to setup guides
```

### Flow B: Switching Companies (Multi-Tenant Users)

```
[Any Page]
    ↓
[Select Company from Dropdown]
    ↓
[Loading Indicator] ← NEW
    ↓
[Page Reloads with New Tenant Data]
    ↓
[Company Name Displayed in Header] ✓ DONE
```

### Flow C: Monthly Close Process

```
[Financials] 
    ↓
[Create Statement: Month-end Actuals]
    ↓
[Enter/Import Line Items]
    ↓
[Save as Draft]
    ↓
[Review & Validate]
    ↓
[Submit for Approval] ← Uses Workflow
    ↓
[Admin Approves]
    ↓
[Status: Final]
    ↓
[Use as Base for Projections]
```

---

## 🚀 Recommended Improvements

### Priority 1: Onboarding & Empty States

**Problem**: New users see empty pages with no guidance

**Solution**: 
- ✅ Add onboarding wizard for first-time users
- ✅ Add empty state components with clear CTAs
- ✅ Add role-based quick start guides
- ✅ Add sample data generation option

### Priority 2: Workflow Enhancement

**Problem**: Linear flows require too many clicks

**Solution**:
- ✅ Add "Copy from Previous" for statements
- ✅ Add bulk operations for line items
- ✅ Add keyboard shortcuts
- ✅ Add inline editing for tables

### Priority 3: Navigation & Context

**Problem**: Users lose context when switching between pages

**Solution**:
- ✅ Add breadcrumbs
- ✅ Show loading state when switching tenants ← PARTIAL
- ✅ Persist filters and selections
- ✅ Add "Recent items" sidebar

### Priority 4: Collaboration

**Problem**: No way to communicate within the system

**Solution**:
- ✅ Add comments on statements/projections
- ✅ Add @mentions for users
- ✅ Add activity feed
- ✅ Add email notifications

### Priority 5: Mobile & Responsive

**Problem**: Layout breaks on smaller screens

**Solution**:
- ✅ Responsive navigation
- ✅ Touch-friendly controls
- ✅ Mobile-optimized dashboards
- ✅ Offline support for viewing

---

## 📊 Journey Metrics

### Success Metrics by Role

**Super Admin**:
- Time to create first tenant: < 5 min
- Tenant provisioning success rate: > 95%

**Company Admin**:
- Time to first complete setup: < 30 min
- Team invitation success rate: > 90%

**Analyst**:
- Time to create monthly statement: < 15 min
- Projection generation success: > 98%

**Viewer**:
- Time to find desired report: < 2 min
- Dashboard load time: < 3 sec

---

## 🎨 UX Enhancements Implemented

### ✅ Completed:
1. **Tenant Context Management**
   - TenantContext with company profile
   - CompanySelector with auto-select
   - All pages reload on tenant switch

2. **Navigation**
   - Company name in header
   - Role-based menu items

### 🚧 In Progress:
3. **Loading States**
   - Need visual feedback during tenant switch

### 📋 Planned:
4. **Onboarding Wizard**
5. **Empty States**
6. **Breadcrumbs**
7. **Recent Items**
8. **Bulk Operations**

---

## 🔄 Next Steps

1. Implement onboarding wizard for new companies
2. Add empty state components with CTAs
3. Add loading overlay when switching tenants
4. Add breadcrumb navigation
5. Add "Recent Statements" sidebar
6. Add bulk line item operations
7. Add statement copy functionality
8. Add collaborative comments
9. Add activity notifications
10. Mobile responsive optimization
