import React, { useState, useEffect } from 'react'
import api from '../api/client'

interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  time: string
  read: boolean
}

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      title: 'New Financial Statement',
      message: 'Q1 2026 statement has been created',
      type: 'success',
      time: '5 min ago',
      read: false
    },
    {
      id: '2',
      title: 'Projection Complete',
      message: 'Revenue projection for next quarter is ready',
      type: 'info',
      time: '1 hour ago',
      read: false
    },
    {
      id: '3',
      title: 'User Added',
      message: 'New analyst user has been added to your tenant',
      type: 'info',
      time: '2 hours ago',
      read: true
    }
  ])

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    )
  }

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const getIcon = (type: string) => {
    switch(type) {
      case 'success': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      default: return 'ℹ️'
    }
  }

  return (
    <div className="notification-center">
      <button 
        className="notification-bell" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <>
          <div className="notification-overlay" onClick={() => setIsOpen(false)} />
          <div className="notification-dropdown">
            <div className="notification-header">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="btn-text">
                  Mark all as read
                </button>
              )}
            </div>

            <div className="notification-list">
              {notifications.length === 0 ? (
                <div className="notification-empty">
                  <span style={{ fontSize: 48, opacity: 0.3 }}>🔔</span>
                  <p>No notifications</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div 
                    key={notif.id} 
                    className={`notification-item ${notif.read ? 'read' : 'unread'}`}
                    onClick={() => markAsRead(notif.id)}
                  >
                    <div className="notification-icon">{getIcon(notif.type)}</div>
                    <div className="notification-content">
                      <div className="notification-title">{notif.title}</div>
                      <div className="notification-message">{notif.message}</div>
                      <div className="notification-time">{notif.time}</div>
                    </div>
                    {!notif.read && <div className="notification-dot" />}
                  </div>
                ))
              )}
            </div>

            <div className="notification-footer">
              <a href="/notifications" className="btn-text">View all notifications</a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
