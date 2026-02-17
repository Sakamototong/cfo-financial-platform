import React from 'react'

interface Activity {
  id: string
  type: 'create' | 'update' | 'delete' | 'transfer' | 'login'
  title: string
  description: string
  user: string
  time: string
  icon: string
}

interface ActivityTimelineProps {
  activities?: Activity[]
  limit?: number
}

export default function ActivityTimeline({ activities, limit = 10 }: ActivityTimelineProps) {
  const defaultActivities: Activity[] = [
    {
      id: '1',
      type: 'create',
      title: 'Financial Statement Created',
      description: 'Q1 2026 Income Statement created',
      user: 'John Doe',
      time: '10 minutes ago',
      icon: '📄'
    },
    {
      id: '2',
      type: 'update',
      title: 'Scenario Updated',
      description: 'Best Case scenario projections updated',
      user: 'Jane Smith',
      time: '1 hour ago',
      icon: '✏️'
    },
    {
      id: '3',
      type: 'transfer',
      title: 'Ownership Transfer',
      description: 'Company ownership transferred to new admin',
      user: 'Admin User',
      time: '2 hours ago',
      icon: '🔄'
    },
    {
      id: '4',
      type: 'create',
      title: 'New User Added',
      description: 'Analyst user added to tenant',
      user: 'System',
      time: '3 hours ago',
      icon: '👤'
    },
    {
      id: '5',
      type: 'login',
      title: 'User Login',
      description: 'User logged in from new location',
      user: 'John Doe',
      time: '5 hours ago',
      icon: '🔐'
    }
  ]

  const items = (activities || defaultActivities).slice(0, limit)

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'create': return '#00d25b'
      case 'update': return '#ffab00'
      case 'delete': return '#ff3366'
      case 'transfer': return '#727cf5'
      case 'login': return '#6b7280'
      default: return '#727cf5'
    }
  }

  return (
    <div className="activity-timeline">
      {items.map((activity, index) => (
        <div key={activity.id} className="activity-item">
          <div 
            className="activity-icon" 
            style={{ background: getTypeColor(activity.type) }}
          >
            {activity.icon}
          </div>
          <div className="activity-content">
            <div className="activity-header">
              <h4>{activity.title}</h4>
              <span className="activity-time">{activity.time}</span>
            </div>
            <p className="activity-description">{activity.description}</p>
            <span className="activity-user">by {activity.user}</span>
          </div>
          {index < items.length - 1 && <div className="activity-line" />}
        </div>
      ))}
    </div>
  )
}
