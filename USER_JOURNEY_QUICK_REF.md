# User Journey - Quick Reference Card

## 🎯 Role-Based Quick Start

### Super Admin (System Administrator)
**Your Mission**: Set up the multi-tenant system

```
1. Login → http://localhost:8080
   Username: kc-superadmin | Password: Secret123!

2. Create New Company/Tenant
   → Navigate to "Tenants" 
   → Click "+ New Tenant"
   → Enter company name: "ACME Corp"
   → System auto-creates isolated database

3. Invite Company Admin
   → Select tenant in dropdown
   → Navigate to "Users"
   → Invite user with 'admin' role

4. Monitor System
   → Admin page: system configs
   → Audit logs and approvals
```

---

### Company Admin (CFO)
**Your Mission**: Set up your company's financial structure

```
1. Login → http://localhost:8080
   Username: demo-admin@testco.local | Password: Secret123!

2. First-Time Setup (Guided by Onboarding Wizard 🚀)
   
   Step 1: Set Up DIM Templates
   → Navigate to "DIM"
   → Create P&L template
   → Define dimensions (Dept, Product, Region)
   
   Step 2: Create Scenarios
   → Navigate to "Scenarios"
   → Create "Actual", "Budget", "Forecast"
   
   Step 3: Create First Statement
   → Navigate to "Financials"
   → Fill form: Type=PL, Period, Scenario
   → Add line items (Revenue, COGS, OpEx)
   → Click "Create Statement"
   
   Step 4: Invite Team
   → Navigate to "Users"
   → Invite analysts (role: analyst)
   → Invite viewers (role: viewer)

3. Monthly Operations
   → Review Dashboard
   → Approve workflows
   → Run consolidation reports
```

---

### Financial Analyst
**Your Mission**: Build financial models and projections

```
1. Login → Use credentials from invitation email

2. Monthly Cycle (Follow Onboarding Guide)
   
   Create Monthly Actuals:
   → Financials → Create Statement
   → Type: P&L, Period: Current Month
   → Scenario: "Actual"
   → Enter/Import line items
   → Save
   
   Run Projections:
   → Projections page
   → Select base statement (current actual)
   → Select scenario (budget assumptions)
   → Periods: 12 months
   → Click "Generate Projection"
   
   Scenario Analysis:
   → Scenarios → Create "Optimistic"
   → Adjust assumptions (+15% growth)
   → Re-run projections
   → Compare on Dashboard
   
   Generate Reports:
   → Reports → Variance Analysis
   → Select Actual vs Budget
   → Export/Share

3. Data Import (ETL)
   → ETL page
   → Upload Excel/CSV
   → Map columns
   → Review import log
```

---

### Viewer (Executive)
**Your Mission**: Monitor financial performance

```
1. Login → Use read-only credentials

2. Quick Review
   → Dashboard: See aggregated charts
   → Financials: Browse statements
   → Reports: View pre-generated analyses

3. Drill Down
   → Click any statement for details
   → Filter by period, scenario, type
   → View trend reports
```

---

## 📊 New UX Features

### ✅ Onboarding Wizard
- **Where**: Bottom-right corner on first login
- **What**: Step-by-step guide based on your role
- **How to Dismiss**: Click "×" or "Dismiss Guide"
- **Reopen**: Clear localStorage key `onboarding_dismissed_{tenant}`

### ✅ Empty States
- **Where**: Pages with no data (Dashboard, Financials, Scenarios)
- **What**: Clear guidance on what to do next
- **Features**: 
  - Descriptive icons and text
  - Primary action button
  - Secondary action (optional)

### ✅ Loading Overlay
- **When**: Switching companies in dropdown
- **What**: Shows "Loading {company}..." overlay
- **Duration**: ~300ms minimum for smooth UX
- **Prevents**: Stale data from previous tenant

### ✅ Company Context
- **Where**: Top header (Company dropdown + name)
- **What**: Always shows selected company
- **Behavior**: All pages auto-reload when changed

---

## 🔄 Common Workflows

### Workflow A: Monthly Close
```
Financials → Create → Enter Data → Save Draft
  ↓
Review & Validate
  ↓
Change Status: "Submitted"
  ↓  
Admin Approves (Workflow page)
  ↓
Status: "Final"
  ↓
Use as base for next projections
```

### Workflow B: Variance Analysis
```
Create Actual Statement (current month)
  ↓
Create Budget Statement (same period)
  ↓
Reports → Variance Analysis
  ↓
Select both statements
  ↓
View line-by-line differences
  ↓
Export report
```

### Workflow C: Scenario Planning
```
Scenarios → Create "Conservative"
  ↓
Set assumptions (e.g., +5% revenue)
  ↓
Projections → Select scenario
  ↓
Generate 12-month projection
  ↓
Dashboard → Compare with other scenarios
  ↓
Adjust assumptions → Re-run
```

---

## 🎨 UI Navigation Tips

### Keyboard Shortcuts (Planned)
- `Ctrl+N`: Create new (context-aware)
- `Ctrl+S`: Save current form
- `Ctrl+K`: Quick search
- `Esc`: Close modal/wizard

### Page States
- **Loading**: Spinner + "Loading..." text
- **Empty**: Icon + description + CTA button
- **Error**: Red banner with message
- **Success**: Green toast notification (4s)

### Visual Indicators
- 🔵 Blue: Primary actions (Create, Submit)
- ⚪ Gray: Secondary actions (Cancel, Back)
- 🔴 Red: Destructive (Delete, Reject)
- 🟢 Green: Success state
- 🟡 Yellow: Warning/Draft state

---

## 🚨 Troubleshooting

### "No data loading"
→ Check if correct company selected in dropdown
→ Verify you have data for that tenant

### "401 Unauthorized"
→ Token expired; refresh page to re-login
→ Check localStorage has `access_token`

### "Empty states not showing"
→ Clear cache and hard refresh (Cmd+Shift+R)
→ Check browser console for errors

### "Onboarding wizard disappeared"
→ It auto-dismisses after first visit
→ Clear localStorage key to see again

---

## 📈 Success Metrics

### Time to Value
- **Super Admin**: Tenant created in < 5 min
- **Company Admin**: Full setup in < 30 min
- **Analyst**: First statement in < 15 min
- **Viewer**: Find desired report in < 2 min

### User Satisfaction
- Clear next steps at every stage ✓
- No dead ends or confusion ✓
- Role-appropriate guidance ✓
- Smooth tenant switching ✓

---

## 🔗 Quick Links

- **Main App**: http://localhost:8080
- **API Docs**: http://localhost:3000/api
- **User Journey Doc**: [USER_JOURNEY.md](./USER_JOURNEY.md)
- **GitHub Issues**: Report UX feedback

---

## 🎯 Next UX Improvements

### Priority 1 (This Sprint)
- [x] Onboarding wizard
- [x] Empty states
- [x] Loading overlay
- [ ] Breadcrumbs navigation
- [ ] Recent items sidebar

### Priority 2 (Next Sprint)
- [ ] Bulk operations for line items
- [ ] Copy from previous statement
- [ ] Keyboard shortcuts
- [ ] Inline editing tables

### Priority 3 (Future)
- [ ] Collaborative comments
- [ ] Activity notifications
- [ ] Mobile responsive
- [ ] Offline support

---

**Last Updated**: Jan 31, 2026  
**Version**: 1.0 (Journey MVP)
