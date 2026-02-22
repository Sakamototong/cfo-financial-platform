import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Scenarios from './pages/Scenarios'
import Financials from './pages/Financials'
import StatementDetail from './pages/StatementDetail'
import StatementEdit from './pages/StatementEdit'
import Tenants from './pages/Tenants'
import ETL from './pages/ETL'
import Projections from './pages/Projections'
import Consolidation from './pages/Consolidation'
import Reports from './pages/Reports'
import DIM from './pages/DIM'
import Admin from './pages/Admin'
import Workflow from './pages/Workflow'
import Users from './pages/Users'
import Profile from './pages/Profile'
import Tables from './pages/Tables'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import TenantDetail from './pages/TenantDetail'
import SystemUsers from './pages/SystemUsers'
import PrivacyPolicy from './pages/PrivacyPolicy'
import DataRequests from './pages/DataRequests'
import Billing from './pages/Billing'
import CompanyProfile from './pages/CompanyProfile'
import ChartOfAccounts from './pages/ChartOfAccounts'
import Budget from './pages/Budget'
import BudgetVsActualReport from './pages/BudgetVsActualReport'
import CashFlowForecast from './pages/CashFlowForecast'
import VersionHistory from './pages/VersionHistory'
import ProtectedRoute from './components/ProtectedRoute'
import RequireRole from './components/RequireRole'
import AdminLTELayout from './components/AdminLTELayout'
import './styles.css'
import { TenantProvider, useTenant } from './components/TenantContext'
import { ThemeProvider } from './components/ThemeContext'
import CookieConsent from './components/CookieConsent'
import { UserProvider } from './components/UserContext'
import OnboardingWizard from './components/OnboardingWizard'
import LoadingOverlay from './components/LoadingOverlay'
import CommandPalette from './components/CommandPalette'
import KeyboardShortcuts from './components/KeyboardShortcuts'

function App() {
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false)
  
  // Add keyboard navigation support
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ThemeProvider>
      <TenantProvider>
        <UserProvider>
        <BrowserRouter>
          <TenantReloader />
          <LoadingOverlay />
          <ConditionalLayout />
          <CookieConsent />
          <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
          <KeyboardShortcuts />
          <OnboardingWizard />
        </BrowserRouter>
        </UserProvider>
      </TenantProvider>
    </ThemeProvider>
  )
}

function TenantReloader() {
  const { tenantId, refreshCompanyProfile } = useTenant()
  const [key, setKey] = React.useState<string | undefined>(tenantId)

  React.useEffect(() => {
    const run = async () => {
      await refreshCompanyProfile(tenantId)
      setKey(tenantId ? `${tenantId}-${Date.now()}` : `${Date.now()}`)
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  return null
}

function ConditionalLayout() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  
  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login/>} />
      </Routes>
    )
  }
  
  return (
    <AdminLTELayout>
      <Routes>
        {/* Public routes (all authenticated users) */}
        <Route path="/" element={<ProtectedRoute><Dashboard/></ProtectedRoute>} />
        <Route path="/financials" element={<ProtectedRoute><Financials/></ProtectedRoute>} />
        <Route path="/financials/:id" element={<ProtectedRoute><StatementDetail/></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports/></ProtectedRoute>} />
        <Route path="/reports/budget-vs-actual" element={<ProtectedRoute><BudgetVsActualReport/></ProtectedRoute>} />
        <Route path="/cashflow" element={<ProtectedRoute><CashFlowForecast/></ProtectedRoute>} />
        <Route path="/version-history" element={<ProtectedRoute><VersionHistory/></ProtectedRoute>} />
        <Route path="/company" element={<ProtectedRoute><CompanyProfile/></ProtectedRoute>} />
        <Route path="/privacy-policy" element={<ProtectedRoute><PrivacyPolicy/></ProtectedRoute>} />
        <Route path="/data-requests" element={<ProtectedRoute><DataRequests/></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile/></ProtectedRoute>} />
        <Route path="/profile/:id" element={<ProtectedRoute><Profile/></ProtectedRoute>} />

        {/* Analyst+ routes */}
        <Route path="/scenarios" element={<ProtectedRoute><RequireRole role="analyst"><Scenarios/></RequireRole></ProtectedRoute>} />
        <Route path="/projections" element={<ProtectedRoute><RequireRole role="analyst"><Projections/></RequireRole></ProtectedRoute>} />
        <Route path="/consolidation" element={<ProtectedRoute><RequireRole role="analyst"><Consolidation/></RequireRole></ProtectedRoute>} />
        <Route path="/etl" element={<ProtectedRoute><RequireRole role="analyst"><ETL/></RequireRole></ProtectedRoute>} />
        <Route path="/etl-import" element={<Navigate to="/etl" replace />} />
        <Route path="/dim" element={<ProtectedRoute><RequireRole role="analyst"><DIM/></RequireRole></ProtectedRoute>} />
        <Route path="/coa" element={<ProtectedRoute><RequireRole role="analyst"><ChartOfAccounts/></RequireRole></ProtectedRoute>} />
        <Route path="/budgets" element={<ProtectedRoute><RequireRole role="analyst"><Budget/></RequireRole></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute><RequireRole role="analyst"><Users/></RequireRole></ProtectedRoute>} />
        <Route path="/workflow" element={<ProtectedRoute><RequireRole role="analyst"><Workflow/></RequireRole></ProtectedRoute>} />

        {/* Admin+ routes */}
        <Route path="/tenants" element={<ProtectedRoute><RequireRole role="super_admin"><Tenants/></RequireRole></ProtectedRoute>} />
        <Route path="/financials/:id/edit" element={<ProtectedRoute><RequireRole role="admin"><StatementEdit/></RequireRole></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><RequireRole role="admin"><Admin/></RequireRole></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><RequireRole role="admin"><Billing/></RequireRole></ProtectedRoute>} />
        <Route path="/tables" element={<ProtectedRoute><RequireRole role="admin"><Tables/></RequireRole></ProtectedRoute>} />

        {/* Super Admin only */}
        <Route path="/super-admin" element={<ProtectedRoute><RequireRole role="super_admin"><SuperAdminDashboard/></RequireRole></ProtectedRoute>} />
        <Route path="/super-admin/tenants/:id" element={<ProtectedRoute><RequireRole role="super_admin"><TenantDetail/></RequireRole></ProtectedRoute>} />
        <Route path="/super-admin/system-users" element={<ProtectedRoute><RequireRole role="super_admin"><SystemUsers/></RequireRole></ProtectedRoute>} />
      </Routes>
    </AdminLTELayout>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<App />)
}
