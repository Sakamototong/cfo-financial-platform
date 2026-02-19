import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useUser } from './UserContext'
import { useTenant } from './TenantContext'
import { useTheme } from './ThemeContext'
import CompanySelector from './CompanySelector'
import NotificationCenter from './NotificationCenter'

export default function Navigation() {
  const location = useLocation()
  const { role, email, loading } = useUser()
  const { company } = useTenant()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false)
  
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/')

  // Check if user is super admin
  const isSuperAdmin = role === 'super_admin'

  // Logout function
  const handleLogout = () => {
    // Clear all authentication data
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user_role')
    localStorage.removeItem('user_email')
    localStorage.removeItem('user_data')
    localStorage.removeItem('tenant_id')
    
    // Clear any other cached data (optional)
    // localStorage.clear() // Uncomment if you want to clear everything
    
    // Redirect to login page
    window.location.href = '/login'
  }

  // Define menu items based on roles
  const canViewTenants = role === 'admin' || isSuperAdmin
  const canViewUsers = role === 'admin' || role === 'analyst' || isSuperAdmin
  const canEdit = role === 'admin' || role === 'analyst' || isSuperAdmin
  const canViewFinancials = true // all roles
  const canViewReports = true // all roles
  const canManageETL = role === 'admin' || role === 'analyst' || isSuperAdmin
  const canManageDimensions = role === 'admin' || role === 'analyst' || isSuperAdmin
  const canManageWorkflow = role === 'admin' || role === 'analyst' || isSuperAdmin

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => 
      prev.includes(groupName) 
        ? prev.filter(g => g !== groupName)
        : [...prev, groupName]
    )
  }

  const isGroupCollapsed = (groupName: string) => collapsedGroups.includes(groupName)

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
    document.body.classList.toggle('sidebar-collapsed')
  }

  return (
    <>
      {/* Top Navbar - NobleUI Style */}
      <header className="top-navbar">
        <div className="navbar-left">
          <button className="sidebar-toggle" onClick={toggleSidebar}>
            ☰
          </button>
          <div className="navbar-logo">
            <Link to="/">CFO<span className="logo-accent">Platform</span></Link>
          </div>
        </div>

        <div className="navbar-center">
          <div className="navbar-search">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Search here..." 
              className="search-input"
            />
          </div>
        </div>

        <div className="navbar-right">
          <button className="navbar-icon-btn" onClick={toggleTheme} title="Toggle Theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          
          <button className="navbar-icon-btn" title="Language">
            🌐 <span className="navbar-text">English</span>
          </button>
          
          <button className="navbar-icon-btn" title="Apps">
            ⊞
          </button>
          
          <button className="navbar-icon-btn" title="Messages">
            ✉️
          </button>
          
          {/* Notification Dropdown */}
          <div className="navbar-dropdown">
            <button 
              className="navbar-icon-btn" 
              onClick={() => {
                setShowNotificationDropdown(!showNotificationDropdown)
                setShowProfileDropdown(false)
              }}
              title="Notifications"
            >
              🔔
              <span className="notification-badge">6</span>
            </button>
            
            {showNotificationDropdown && (
              <div className="dropdown-menu dropdown-menu-right notification-dropdown">
                <div className="dropdown-header">
                  <span className="dropdown-title">6 New Notifications</span>
                  <button className="clear-all-btn">Clear all</button>
                </div>
                <div className="dropdown-body">
                  <div className="notification-item">
                    <div className="notification-avatar" style={{background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>N</div>
                    <div className="notification-content">
                      <div className="notification-text">New Order Received</div>
                      <div className="notification-time">30 min ago</div>
                    </div>
                  </div>
                  <div className="notification-item">
                    <div className="notification-avatar" style={{background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'}}>S</div>
                    <div className="notification-content">
                      <div className="notification-text">Server Limit Reached!</div>
                      <div className="notification-time">1 hrs ago</div>
                    </div>
                  </div>
                  <div className="notification-item">
                    <div className="notification-avatar" style={{background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'}}>C</div>
                    <div className="notification-content">
                      <div className="notification-text">New customer registered</div>
                      <div className="notification-time">2 sec ago</div>
                    </div>
                  </div>
                  <div className="notification-item">
                    <div className="notification-avatar" style={{background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'}}>A</div>
                    <div className="notification-content">
                      <div className="notification-text">Apps are ready for update</div>
                      <div className="notification-time">5 hrs ago</div>
                    </div>
                  </div>
                  <div className="notification-item">
                    <div className="notification-avatar" style={{background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'}}>D</div>
                    <div className="notification-content">
                      <div className="notification-text">Download completed</div>
                      <div className="notification-time">6 hrs ago</div>
                    </div>
                  </div>
                </div>
                <div className="dropdown-footer">
                  <Link to="/notifications" className="view-all-link">View all</Link>
                </div>
              </div>
            )}
          </div>
          
          {/* Profile Dropdown */}
          <div className="navbar-dropdown">
            <button 
              className="navbar-icon-btn profile-btn"
              onClick={() => {
                setShowProfileDropdown(!showProfileDropdown)
                setShowNotificationDropdown(false)
              }}
            >
              <div className="profile-avatar">
                {email?.[0]?.toUpperCase() || '?'}
              </div>
            </button>
            
            {showProfileDropdown && (
              <div className="dropdown-menu dropdown-menu-right profile-dropdown">
                <div className="dropdown-header profile-header">
                  <div className="profile-avatar profile-avatar-lg">
                    {email?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="profile-info">
                    <div className="profile-name">{email?.split('@')[0] || 'User'}</div>
                    <div className="profile-email">{email}</div>
                  </div>
                </div>
                <div className="dropdown-body">
                  <Link to="/profile" className="dropdown-item" onClick={() => setShowProfileDropdown(false)}>
                    <span className="dropdown-icon">👤</span>
                    <span>Profile</span>
                  </Link>
                  <Link to="/profile" className="dropdown-item" onClick={() => setShowProfileDropdown(false)}>
                    <span className="dropdown-icon">✏️</span>
                    <span>Edit Profile</span>
                  </Link>
                  <button className="dropdown-item">
                    <span className="dropdown-icon">🔄</span>
                    <span>Switch User</span>
                  </button>
                  <div className="dropdown-divider"></div>
                  <button 
                    className="dropdown-item"
                    onClick={handleLogout}
                  >
                    <span className="dropdown-icon">🚪</span>
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <CompanySelector />
        </div>

        <nav className="sidebar-nav">
          {loading && (
            <div style={{ textAlign: 'center', padding: '12px 0', color: '#888', fontSize: '13px' }}>
              <i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }}></i>Loading menu...
            </div>
          )}
          {/* Super Admin */}
          {isSuperAdmin && (
            <div className="nav-group">
              <div className="nav-group-title">🔒 Super Admin</div>
              <div className="nav-group-items">
                <Link to="/super-admin" className={isActive('/super-admin') && location.pathname === '/super-admin' ? 'active' : ''} title="Super Admin Dashboard">
                  <span className="icon">🏢</span> Dashboard
                </Link>
                <Link to="/super-admin/system-users" className={isActive('/super-admin/system-users') ? 'active' : ''} title="System Users">
                  <span className="icon">👥</span> System Users
                </Link>
              </div>
            </div>
          )}

          {/* Core */}
          <div className="nav-group">
            <div className="nav-group-title" onClick={() => toggleGroup('core')}>
              📊 Core {isGroupCollapsed('core') ? '▼' : '▲'}
            </div>
            <div className={`nav-group-items ${isGroupCollapsed('core') ? 'collapsed' : ''}`}>
              <Link to="/" className={isActive('/') && location.pathname === '/' ? 'active' : ''} title="Dashboard">
                <span className="icon">📊</span> Dashboard
              </Link>
            </div>
          </div>

          {/* Financial */}
          <div className="nav-group">
            <div className="nav-group-title" onClick={() => toggleGroup('financial')}>
              💰 Financial {isGroupCollapsed('financial') ? '▼' : '▲'}
            </div>
            <div className={`nav-group-items ${isGroupCollapsed('financial') ? 'collapsed' : ''}`}>
              {canEdit && (
                <Link to="/scenarios" className={isActive('/scenarios') ? 'active' : ''} title="Scenarios">
                  <span className="icon">📋</span> Scenarios
                </Link>
              )}
              {canViewFinancials && (
                <Link to="/financials" className={isActive('/financials') ? 'active' : ''} title="Financials">
                  <span className="icon">💰</span> Financials
                </Link>
              )}
              {canEdit && (
                <Link to="/projections" className={isActive('/projections') ? 'active' : ''} title="Projections">
                  <span className="icon">📈</span> Projections
                </Link>
              )}
              {canEdit && (
                <Link to="/consolidation" className={isActive('/consolidation') ? 'active' : ''} title="Consolidation">
                  <span className="icon">🔗</span> Consolidation
                </Link>
              )}
              {canViewReports && (
                <Link to="/reports" className={isActive('/reports') ? 'active' : ''} title="Reports">
                  <span className="icon">📑</span> Reports
                </Link>
              )}
            </div>
          </div>

          {/* Data Management */}
          <div className="nav-group">
            <div className="nav-group-title" onClick={() => toggleGroup('data')}>
              📥 Data Management {isGroupCollapsed('data') ? '▼' : '▲'}
            </div>
            <div className={`nav-group-items ${isGroupCollapsed('data') ? 'collapsed' : ''}`}>
              {canManageETL && (
                <Link to="/etl" className={isActive('/etl') ? 'active' : ''} title="ETL">
                  <span className="icon">📥</span> ETL
                </Link>
              )}
              {canManageETL && (
                <Link to="/etl-import" className={isActive('/etl-import') ? 'active' : ''} title="ETL Import">
                  <span className="icon">📤</span> ETL Import
                </Link>
              )}
              {canManageDimensions && (
                <Link to="/dim" className={isActive('/dim') ? 'active' : ''} title="Dimensions">
                  <span className="icon">🏷️</span> Dimensions
                </Link>
              )}
              {canManageDimensions && (
                <Link to="/coa" className={isActive('/coa') ? 'active' : ''} title="Chart of Accounts">
                  <span className="icon">📊</span> Chart of Accounts
                </Link>
              )}
              {canManageDimensions && (
                <Link to="/budgets" className={isActive('/budgets') ? 'active' : ''} title="Budgets">
                  <span className="icon">💰</span> Budgets
                </Link>
              )}
              {canManageDimensions && (
                <Link to="/cashflow" className={isActive('/cashflow') ? 'active' : ''} title="Cash Flow Forecast">
                  <span className="icon">💵</span> Cash Flow Forecast
                </Link>
              )}
              {canManageDimensions && (
                <Link to="/version-history" className={isActive('/version-history') ? 'active' : ''} title="Version History">
                  <span className="icon">📜</span> Version History
                </Link>
              )}
            </div>
          </div>

          {/* Organization */}
          <div className="nav-group">
            <div className="nav-group-title" onClick={() => toggleGroup('organization')}>
              🏢 Organization {isGroupCollapsed('organization') ? '▼' : '▲'}
            </div>
            <div className={`nav-group-items ${isGroupCollapsed('organization') ? 'collapsed' : ''}`}>
              {canViewTenants && (
                <Link to="/tenants" className={isActive('/tenants') ? 'active' : ''} title="Tenants">
                  <span className="icon">🏢</span> Tenants
                </Link>
              )}
              {canViewUsers && (
                <Link to="/users" className={isActive('/users') ? 'active' : ''} title="Users">
                  <span className="icon">👥</span> Users
                </Link>
              )}
              <Link to="/company" className={isActive('/company') ? 'active' : ''} title="Company">
                <span className="icon">🏛️</span> Company
              </Link>
            </div>
          </div>

          {/* System */}
          <div className="nav-group">
            <div className="nav-group-title" onClick={() => toggleGroup('system')}>
              ⚙️ System {isGroupCollapsed('system') ? '▼' : '▲'}
            </div>
            <div className={`nav-group-items ${isGroupCollapsed('system') ? 'collapsed' : ''}`}>
              {canManageWorkflow && (
                <Link to="/workflow" className={isActive('/workflow') ? 'active' : ''} title="Workflow">
                  <span className="icon">⚙️</span> Workflow
                </Link>
              )}
              {role === 'admin' && (
                <Link to="/admin" className={isActive('/admin') ? 'active' : ''} title="Admin">
                  <span className="icon">🔧</span> Admin
                </Link>
              )}
              {role === 'admin' && (
                <Link to="/billing" className={isActive('/billing') ? 'active' : ''} title="Billing">
                  <span className="icon">💳</span> Billing
                </Link>
              )}
            </div>
          </div>

          {/* Personal */}
          <div className="nav-group">
            <div className="nav-group-title" onClick={() => toggleGroup('personal')}>
              👤 Personal {isGroupCollapsed('personal') ? '▼' : '▲'}
            </div>
            <div className={`nav-group-items ${isGroupCollapsed('personal') ? 'collapsed' : ''}`}>
              <Link to="/data-requests" className={isActive('/data-requests') ? 'active' : ''} title="Privacy">
                <span className="icon">🔒</span> Privacy
              </Link>
                <Link to="/profile" className={isActive('/profile') ? 'active' : ''} title="Profile">
                <span className="icon">👤</span> Profile
              </Link>
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-actions">
            <NotificationCenter />
            <button 
              onClick={toggleTheme} 
              className="theme-toggle"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </div>
          <button onClick={handleLogout} className="btn ghost">Logout</button>
        </div>
      </aside>
    </>
  )
}
