import React, { useState, useEffect } from 'react'
import { useTenant } from './TenantContext'
import { useUser } from './UserContext'

type OnboardingStep = {
  id: string
  title: string
  description: string
  completed: boolean
  link?: string
  action?: () => void
}

export default function OnboardingWizard() {
  const { tenantId } = useTenant()
  const { role } = useUser()
  const [visible, setVisible] = useState(false)
  const [steps, setSteps] = useState<OnboardingStep[]>([])

  useEffect(() => {
    // Check if user has dismissed onboarding
    const dismissed = localStorage.getItem(`onboarding_dismissed_${tenantId}`)
    if (dismissed) return

    // Check if this is first visit
    const visited = localStorage.getItem(`visited_${tenantId}`)
    if (!visited && tenantId) {
      setVisible(true)
      localStorage.setItem(`visited_${tenantId}`, 'true')
      loadSteps()
    }
  }, [tenantId])

  const loadSteps = () => {
    if (role === 'admin') {
      setSteps([
        {
          id: 'dim',
          title: '1. Set Up Statement Templates',
          description: 'Define your P&L and Balance Sheet structure',
          completed: false,
          link: '/dim'
        },
        {
          id: 'scenarios',
          title: '2. Create Scenarios',
          description: 'Set up Actual, Budget, and Forecast scenarios',
          completed: false,
          link: '/scenarios'
        },
        {
          id: 'financial',
          title: '3. Create First Statement',
          description: 'Enter your first month of financial data',
          completed: false,
          link: '/financials'
        },
        {
          id: 'users',
          title: '4. Invite Your Team',
          description: 'Add analysts and viewers to collaborate',
          completed: false,
          link: '/users'
        }
      ])
    } else if (role === 'analyst') {
      setSteps([
        {
          id: 'dashboard',
          title: '1. View Dashboard',
          description: 'See financial overview and key metrics',
          completed: false,
          link: '/'
        },
        {
          id: 'financial',
          title: '2. Create Statement',
          description: 'Enter monthly financial data',
          completed: false,
          link: '/financials'
        },
        {
          id: 'projections',
          title: '3. Run Projections',
          description: 'Generate forward-looking forecasts',
          completed: false,
          link: '/projections'
        }
      ])
    } else {
      setSteps([
        {
          id: 'dashboard',
          title: '1. View Dashboard',
          description: 'See financial overview and charts',
          completed: false,
          link: '/'
        },
        {
          id: 'reports',
          title: '2. Explore Reports',
          description: 'Access variance and trend analysis',
          completed: false,
          link: '/reports'
        }
      ])
    }
  }

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(`onboarding_dismissed_${tenantId}`, 'true')
  }

  if (!visible || steps.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '360px',
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>🚀 Quick Start Guide</h3>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0 0' }}>
            {role === 'admin' ? 'Set up your company' : 'Get started with CFO Platform'}
          </p>
        </div>
        <button 
          onClick={dismiss}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            color: '#9ca3af'
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {steps.map((step, idx) => (
          <a
            key={step.id}
            href={step.link}
            style={{
              display: 'block',
              padding: '12px',
              background: '#f9fafb',
              borderRadius: '8px',
              textDecoration: 'none',
              color: 'inherit',
              border: '1px solid #e5e7eb',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#f3f4f6'
              e.currentTarget.style.borderColor = '#d1d5db'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#f9fafb'
              e.currentTarget.style.borderColor = '#e5e7eb'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>
              {step.title}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>
              {step.description}
            </div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
        <button
          onClick={dismiss}
          className="btn ghost"
          style={{ width: '100%', fontSize: '13px' }}
        >
          Dismiss Guide
        </button>
      </div>
    </div>
  )
}
