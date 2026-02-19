import React from 'react'
import { Link } from 'react-router-dom'
import { useUser } from './UserContext'

const ROLE_ORDER: Record<string, number> = {
  viewer: 1,
  analyst: 2,
  finance_user: 3,
  finance_manager: 3,
  admin: 3,
  tenant_admin: 3,
  super_admin: 4,
}

const ROLE_LABELS: Record<string, string> = {
  viewer: 'Viewer',
  analyst: 'Analyst',
  finance_user: 'Finance User',
  finance_manager: 'Finance Manager',
  admin: 'Admin',
  tenant_admin: 'Tenant Admin',
  super_admin: 'Super Admin',
}

export function hasMinRole(userRole: string | undefined, minRole: string): boolean {
  if (!userRole) return false
  return (ROLE_ORDER[userRole] ?? 0) >= (ROLE_ORDER[minRole] ?? 0)
}

interface RequireRoleProps {
  role: 'super_admin' | 'admin' | 'tenant_admin' | 'finance_manager' | 'finance_user' | 'analyst' | 'viewer'
  children: React.ReactNode
  /** If true, render nothing instead of Access Denied (for hiding UI elements) */
  silent?: boolean
}

export default function RequireRole({ role, children, silent }: RequireRoleProps) {
  const { role: userRole } = useUser()
  const allowed = hasMinRole(userRole, role)

  if (!allowed) {
    if (silent) return null
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <div className="card shadow-sm" style={{ maxWidth: 480 }}>
            <div className="card-body py-5 px-4">
              <i className="bi bi-shield-lock text-danger d-block mb-3" style={{ fontSize: '3rem' }}></i>
              <h4 className="mb-2">ไม่มีสิทธิ์เข้าถึง</h4>
              <p className="text-muted mb-3">
                หน้านี้ต้องการสิทธิ์ระดับ <strong>{ROLE_LABELS[role] || role}</strong> ขึ้นไป
                <br />
                สิทธิ์ปัจจุบันของคุณ: <span className="badge text-bg-secondary">{ROLE_LABELS[userRole || ''] || userRole || 'ไม่ทราบ'}</span>
              </p>
              <Link to="/" className="btn btn-primary">
                <i className="bi bi-house-door me-1"></i>กลับหน้าหลัก
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
