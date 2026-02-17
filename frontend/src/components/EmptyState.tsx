import React from 'react'
import { Link } from 'react-router-dom'

type EmptyStateProps = {
  icon?: string
  title: string
  description: string
  action?: {
    label: string
    to?: string
    onClick?: () => void
  }
  secondaryAction?: {
    label: string
    to?: string
    onClick?: () => void
  }
}

export default function EmptyState({ icon, title, description, action, secondaryAction }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      textAlign: 'center',
      background: '#f9fafb',
      border: '2px dashed #e5e7eb',
      borderRadius: '12px',
      minHeight: '300px'
    }}>
      {icon && (
        <div style={{
          fontSize: '48px',
          marginBottom: '16px',
          opacity: 0.6
        }}>
          {icon}
        </div>
      )}
      <h3 style={{
        fontSize: '20px',
        fontWeight: 600,
        marginBottom: '8px',
        color: '#111827'
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: '14px',
        color: '#6b7280',
        marginBottom: '24px',
        maxWidth: '400px'
      }}>
        {description}
      </p>
      {action && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {action.to ? (
            <Link to={action.to} className="btn primary" style={{ textDecoration: 'none' }}>
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className="btn primary">
              {action.label}
            </button>
          )}
          {secondaryAction && (
            secondaryAction.to ? (
              <Link to={secondaryAction.to} className="btn" style={{ textDecoration: 'none' }}>
                {secondaryAction.label}
              </Link>
            ) : (
              <button onClick={secondaryAction.onClick} className="btn">
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
