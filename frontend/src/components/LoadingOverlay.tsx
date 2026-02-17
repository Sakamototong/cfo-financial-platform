import React from 'react'
import { useTenant } from './TenantContext'

export default function LoadingOverlay() {
  const { tenantId } = useTenant()
  const [loading, setLoading] = React.useState(false)
  const [companyName, setCompanyName] = React.useState<string>('')
  const prevTenantRef = React.useRef<string>()

  React.useEffect(() => {
    if (prevTenantRef.current && prevTenantRef.current !== tenantId) {
      // Tenant changed
      setLoading(true)
      setCompanyName(tenantId || '')
      
      // Show overlay for at least 300ms for smooth UX
      const timer = setTimeout(() => {
        setLoading(false)
      }, 300)
      
      return () => clearTimeout(timer)
    }
    prevTenantRef.current = tenantId
  }, [tenantId])

  if (!loading) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.2s ease-in'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '32px',
        background: 'white',
        borderRadius: '12px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #2563eb',
          borderRadius: '50%',
          margin: '0 auto 16px',
          animation: 'spin 0.8s linear infinite'
        }} />
        <div style={{ fontSize: '16px', fontWeight: 500, color: '#111827' }}>
          Loading {companyName}...
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
          Switching company context
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
