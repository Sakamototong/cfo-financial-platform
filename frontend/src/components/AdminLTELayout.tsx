import React, { useState, useEffect, ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useUser } from './UserContext'
import { useTenant } from './TenantContext'
import { useTheme } from './ThemeContext'
import CompanySelector from './CompanySelector'

interface AdminLTELayoutProps {
  children: ReactNode
}

export default function AdminLTELayout({ children }: AdminLTELayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { role, email } = useUser()
  const { company } = useTenant()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Role-based visibility
  const isSuperAdmin = role === 'super_admin'
  const isAdmin = role === 'admin' || isSuperAdmin
  const isAnalyst = role === 'analyst'
  const canViewTenants = isAdmin
  const canViewUsers = isAdmin || isAnalyst
  const canEdit = isAdmin || isAnalyst
  const canViewFinancials = true // all roles
  const canViewReports = true // all roles
  const canManageETL = isAdmin || isAnalyst
  const canManageDimensions = isAdmin || isAnalyst
  const canManageWorkflow = isAdmin || isAnalyst

  // Logout function
  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_data')
    localStorage.removeItem('tenant_id')
    window.location.href = '/login'
  }

  // Initialize AdminLTE after mount
  useEffect(() => {
    // AdminLTE initialization will happen via the included scripts
    const body = document.body
    body.classList.add('layout-fixed', 'sidebar-expand-lg')
    if (sidebarOpen) {
      body.classList.add('sidebar-open')
    } else {
      body.classList.remove('sidebar-open')
    }
  }, [sidebarOpen])

  return (
    <div className="app-wrapper">
      {/* Header */}
      <nav className="app-header navbar navbar-expand bg-body">
        <div className="container-fluid">
          {/* Start Navbar Links */}
          <ul className="navbar-nav">
            <li className="nav-item">
              <a 
                className="nav-link" 
                data-lte-toggle="sidebar" 
                href="#" 
                role="button"
                onClick={(e) => {
                  e.preventDefault()
                  setSidebarOpen(!sidebarOpen)
                }}
              >
                <i className="bi bi-list"></i>
              </a>
            </li>
            <li className="nav-item d-none d-md-block">
              <Link to="/" className="nav-link">Home</Link>
            </li>
          </ul>
          
          {/* End Navbar Links */}
          <ul className="navbar-nav ms-auto">
            {/* Theme Toggle */}
            <li className="nav-item">
              <a className="nav-link" href="#" role="button" onClick={(e) => { e.preventDefault(); toggleTheme(); }}>
                <i className={theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill'}></i>
              </a>
            </li>
            
            {/* User Dropdown */}
            <li className="nav-item dropdown user-menu">
              <a 
                className="nav-link dropdown-toggle" 
                href="#" 
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <i className="bi bi-person-circle"></i>
                <span className="d-none d-md-inline">{email || 'User'}</span>
              </a>
              <ul className="dropdown-menu dropdown-menu-lg dropdown-menu-end">
                <li className="user-header bg-primary text-white">
                  <i className="bi bi-person-circle" style={{fontSize: '64px'}}></i>
                  <p>
                    {email}
                    <small>Role: {role}</small>
                  </p>
                </li>
                <li className="user-footer">
                  <Link to="/profile" className="btn btn-default btn-flat">Profile</Link>
                  <button onClick={handleLogout} className="btn btn-default btn-flat float-end">Sign out</button>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme={theme}>
        {/* Brand Logo */}
        <div className="sidebar-brand">
          <Link to="/" className="brand-link">
            <i className="bi bi-currency-dollar brand-image"></i>
            <span className="brand-text fw-light">CFO Platform</span>
          </Link>
        </div>

        {/* Sidebar */}
        <div className="sidebar-wrapper">
          <nav className="mt-2">
            <ul className="nav sidebar-menu flex-column" data-lte-toggle="treeview" role="menu">
              {/* Company Selector */}
              <li className="nav-item px-3 mb-2">
                <CompanySelector />
              </li>

              {/* Super Admin Section */}
              {isSuperAdmin && (
                <>
                  <li className="nav-header">SUPER ADMIN</li>
                  <li className={`nav-item ${isActive('/super-admin') ? 'menu-open' : ''}`}>
                    <Link to="/super-admin" className={`nav-link ${isActive('/super-admin') ? 'active' : ''}`}>
                      <i className="nav-icon bi bi-shield-lock"></i>
                      <p>Super Admin Dashboard</p>
                    </Link>
                  </li>
                </>
              )}

              {/* Core Section */}
              <li className="nav-header">CORE</li>
              <li className={`nav-item ${isActive('/') && location.pathname === '/' ? 'menu-open' : ''}`}>
                <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-speedometer2"></i>
                  <p>Dashboard</p>
                </Link>
              </li>

              {/* Financial Section */}
              <li className="nav-header">FINANCIAL</li>
              {canEdit && (
              <li className={`nav-item ${isActive('/scenarios') ? 'menu-open' : ''}`}>
                <Link to="/scenarios" className={`nav-link ${isActive('/scenarios') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-diagram-3"></i>
                  <p>Scenarios</p>
                </Link>
              </li>
              )}
              {canViewFinancials && (
              <li className={`nav-item ${isActive('/financials') ? 'menu-open' : ''}`}>
                <Link to="/financials" className={`nav-link ${isActive('/financials') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-bar-chart"></i>
                  <p>Financials</p>
                </Link>
              </li>
              )}
              {canEdit && (
              <li className={`nav-item ${isActive('/projections') ? 'menu-open' : ''}`}>
                <Link to="/projections" className={`nav-link ${isActive('/projections') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-graph-up-arrow"></i>
                  <p>Projections</p>
                </Link>
              </li>
              )}
              {canEdit && (
              <li className={`nav-item ${isActive('/consolidation') ? 'menu-open' : ''}`}>
                <Link to="/consolidation" className={`nav-link ${isActive('/consolidation') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-collection"></i>
                  <p>Consolidation</p>
                </Link>
              </li>
              )}
              {canViewReports && (
              <li className={`nav-item ${isActive('/reports') ? 'menu-open' : ''}`}>
                <Link to="/reports" className={`nav-link ${isActive('/reports') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-file-earmark-text"></i>
                  <p>Reports</p>
                </Link>
              </li>
              )}
              <li className={`nav-item ${isActive('/cashflow') ? 'menu-open' : ''}`}>
                <Link to="/cashflow" className={`nav-link ${isActive('/cashflow') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-cash-coin"></i>
                  <p>Cash Flow Forecast</p>
                </Link>
              </li>

              {/* Data Management Section */}
              <li className="nav-header">DATA MANAGEMENT</li>
              {canManageETL && (
              <li className={`nav-item ${isActive('/etl') && location.pathname === '/etl' ? 'menu-open' : ''}`}>
                <Link to="/etl" className={`nav-link ${location.pathname === '/etl' ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-arrow-down-circle"></i>
                  <p>ETL</p>
                </Link>
              </li>
              )}
              {canManageETL && (
              <li className={`nav-item ${isActive('/etl-import') ? 'menu-open' : ''}`}>
                <Link to="/etl-import" className={`nav-link ${isActive('/etl-import') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-upload"></i>
                  <p>ETL Import</p>
                </Link>
              </li>
              )}
              {canManageDimensions && (
              <li className={`nav-item ${isActive('/dim') ? 'menu-open' : ''}`}>
                <Link to="/dim" className={`nav-link ${isActive('/dim') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-grid-3x3"></i>
                  <p>Dimensions</p>
                </Link>
              </li>
              )}
              {canManageDimensions && (
              <li className={`nav-item ${isActive('/coa') ? 'menu-open' : ''}`}>
                <Link to="/coa" className={`nav-link ${isActive('/coa') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-list-nested"></i>
                  <p>Chart of Accounts</p>
                </Link>
              </li>
              )}
              {canManageDimensions && (
              <li className={`nav-item ${isActive('/budgets') ? 'menu-open' : ''}`}>
                <Link to="/budgets" className={`nav-link ${isActive('/budgets') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-wallet2"></i>
                  <p>Budgets</p>
                </Link>
              </li>
              )}
              <li className={`nav-item ${isActive('/version-history') ? 'menu-open' : ''}`}>
                <Link to="/version-history" className={`nav-link ${isActive('/version-history') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-clock-history"></i>
                  <p>Version History</p>
                </Link>
              </li>

              {/* Organization Section */}
              <li className="nav-header">ORGANIZATION</li>
              {canViewTenants && (
              <li className={`nav-item ${isActive('/tenants') ? 'menu-open' : ''}`}>
                <Link to="/tenants" className={`nav-link ${isActive('/tenants') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-building"></i>
                  <p>Tenants</p>
                </Link>
              </li>
              )}
              {canViewUsers && (
              <li className={`nav-item ${isActive('/users') ? 'menu-open' : ''}`}>
                <Link to="/users" className={`nav-link ${isActive('/users') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-people"></i>
                  <p>Users</p>
                </Link>
              </li>
              )}
              <li className={`nav-item ${isActive('/company') ? 'menu-open' : ''}`}>
                <Link to="/company" className={`nav-link ${isActive('/company') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-building-gear"></i>
                  <p>Company</p>
                </Link>
              </li>

              {/* System Section */}
              <li className="nav-header">SYSTEM</li>
              {canManageWorkflow && (
              <li className={`nav-item ${isActive('/workflow') ? 'menu-open' : ''}`}>
                <Link to="/workflow" className={`nav-link ${isActive('/workflow') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-arrow-repeat"></i>
                  <p>Workflow</p>
                </Link>
              </li>
              )}
              {isAdmin && (
              <li className={`nav-item ${isActive('/admin') ? 'menu-open' : ''}`}>
                <Link to="/admin" className={`nav-link ${isActive('/admin') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-gear"></i>
                  <p>Admin</p>
                </Link>
              </li>
              )}
              {isAdmin && (
              <li className={`nav-item ${isActive('/billing') ? 'menu-open' : ''}`}>
                <Link to="/billing" className={`nav-link ${isActive('/billing') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-credit-card"></i>
                  <p>Billing</p>
                </Link>
              </li>
              )}

              {/* Personal Section */}
              <li className="nav-header">PERSONAL</li>
              <li className={`nav-item ${isActive('/data-requests') ? 'menu-open' : ''}`}>
                <Link to="/data-requests" className={`nav-link ${isActive('/data-requests') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-shield-check"></i>
                  <p>Privacy</p>
                </Link>
              </li>
              <li className={`nav-item ${isActive('/profile') ? 'menu-open' : ''}`}>
                <Link to="/profile" className={`nav-link ${isActive('/profile') ? 'active' : ''}`}>
                  <i className="nav-icon bi bi-person"></i>
                  <p>Profile</p>
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </aside>

      {/* Content Wrapper */}
      <main className="app-main">
        <div className="app-content-header">
          <div className="container-fluid">
            <div className="row">
              <div className="col-sm-6">
                <h3 className="mb-0">{document.title || 'CFO Platform'}</h3>
              </div>
              <div className="col-sm-6">
                <ol className="breadcrumb float-sm-end">
                  <li className="breadcrumb-item"><Link to="/">Home</Link></li>
                  {location.pathname !== '/' && (
                    <li className="breadcrumb-item active">{location.pathname.split('/')[1]}</li>
                  )}
                </ol>
              </div>
            </div>
          </div>
        </div>
        
        <div className="app-content">
          <div className="container-fluid">
            {children}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="float-end d-none d-sm-inline">
          Version 1.0.0
        </div>
        <strong>
          Copyright &copy; 2025-2026 <a href="#">CFO Platform</a>.
        </strong>
        All rights reserved.
      </footer>
    </div>
  )
}
