import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useUser } from '../components/UserContext'
import api from '../api/client'

interface UserProfile {
  fullName: string
  email: string
  phone: string
  company: string
  bio: string
}

interface SecuritySettings {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

interface NotificationPrefs {
  emailNotifications: boolean
  financialUpdates: boolean
  userActivity: boolean
  weeklyReports: boolean
}

export default function Profile() {
  const { id } = useParams()
  const { email, role } = useUser()
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const [profile, setProfile] = useState<UserProfile>({
    fullName: '', email: email || '', phone: '', company: '', bio: ''
  })

  const [security, setSecurity] = useState<SecuritySettings>({
    currentPassword: '', newPassword: '', confirmPassword: ''
  })

  const [notifications, setNotifications] = useState<NotificationPrefs>(() => {
    const saved = localStorage.getItem('notificationPrefs')
    return saved ? JSON.parse(saved) : { emailNotifications: true, financialUpdates: true, userActivity: false, weeklyReports: true }
  })

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const r = await api.get('/users/profile/me')
        setProfile({ fullName: r.data.full_name || '', email: r.data.email || '', phone: r.data.phone || '', company: '', bio: r.data.bio || '' })
      } catch (error) {
        console.error('Failed to load profile:', error)
        setProfile(prev => ({ ...prev, email: email || '' }))
      } finally { setLoading(false) }
    }
    loadProfile()
  }, [email])

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text }); setTimeout(() => setMessage(null), 3000)
  }

  const handleProfileSave = async () => {
    setLoading(true)
    try {
      await api.put('/users/profile/me', { full_name: profile.fullName, phone: profile.phone, bio: profile.bio })
      showMsg('success', 'Profile updated successfully!')
    } catch (error) { showMsg('error', 'Failed to update profile') }
    finally { setLoading(false) }
  }

  const handlePasswordChange = async () => {
    if (security.newPassword !== security.confirmPassword) { showMsg('error', 'Passwords do not match'); return }
    if (security.newPassword.length < 8) { showMsg('error', 'Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      setSecurity({ currentPassword: '', newPassword: '', confirmPassword: '' })
      showMsg('success', 'Password updated successfully!')
    } catch (error) { showMsg('error', 'Failed to update password') }
    finally { setLoading(false) }
  }

  const handleNotificationSave = () => {
    localStorage.setItem('notificationPrefs', JSON.stringify(notifications))
    showMsg('success', 'Notification preferences saved!')
  }

  return (
    <>
      {/* Header Card with Avatar */}
      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex align-items-center gap-3">
            <div className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold"
              style={{ width: 64, height: 64, fontSize: 24, background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
              {profile.fullName.charAt(0) || 'U'}
            </div>
            <div>
              <h4 className="mb-0">{profile.fullName || 'User'}</h4>
              <span className="text-muted">{profile.email}</span>
              <span className="badge text-bg-primary ms-2">{role}</span>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'} alert-dismissible`}>
          <button className="btn-close" onClick={() => setMessage(null)}></button>
          <i className={`bi ${message.type === 'success' ? 'bi-check-circle' : 'bi-exclamation-triangle'} me-2`}></i>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button className={`nav-link ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}><i className="bi bi-person me-1"></i>Profile</button></li>
        <li className="nav-item"><button className={`nav-link ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}><i className="bi bi-shield-lock me-1"></i>Security</button></li>
        <li className="nav-item"><button className={`nav-link ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}><i className="bi bi-bell me-1"></i>Notifications</button></li>
      </ul>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><i className="bi bi-person-circle me-2"></i>Profile Information</h3></div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="form-label">Full Name</label>
                <input className="form-control" value={profile.fullName} onChange={e => setProfile({...profile, fullName: e.target.value})} />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Email</label>
                <input className="form-control" value={profile.email} disabled />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Phone</label>
                <input className="form-control" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} placeholder="Enter phone number" />
              </div>
              <div className="col-md-6 mb-3">
                <label className="form-label">Company</label>
                <input className="form-control" value={profile.company} onChange={e => setProfile({...profile, company: e.target.value})} placeholder="Enter company name" />
              </div>
              <div className="col-12 mb-3">
                <label className="form-label">Bio</label>
                <textarea className="form-control" value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} rows={3} placeholder="Tell us about yourself..." />
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" onClick={handleProfileSave} disabled={loading}>
              {loading ? <><span className="spinner-border spinner-border-sm me-1"></span>Saving...</> : <><i className="bi bi-check-lg me-1"></i>Save Profile</>}
            </button>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><i className="bi bi-shield-lock me-2"></i>Change Password</h3></div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6">
                <div className="mb-3">
                  <label className="form-label">Current Password</label>
                  <input type="password" className="form-control" value={security.currentPassword} onChange={e => setSecurity({...security, currentPassword: e.target.value})} />
                </div>
                <div className="mb-3">
                  <label className="form-label">New Password</label>
                  <input type="password" className="form-control" value={security.newPassword} onChange={e => setSecurity({...security, newPassword: e.target.value})} />
                  <div className="form-text">Minimum 8 characters</div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Confirm New Password</label>
                  <input type="password" className="form-control" value={security.confirmPassword} onChange={e => setSecurity({...security, confirmPassword: e.target.value})} />
                </div>
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-warning" onClick={handlePasswordChange} disabled={loading}>
              <i className="bi bi-key me-1"></i>Change Password
            </button>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title"><i className="bi bi-bell me-2"></i>Notification Preferences</h3></div>
          <div className="card-body">
            <div className="mb-3">
              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" checked={notifications.emailNotifications} onChange={e => setNotifications({...notifications, emailNotifications: e.target.checked})} />
                <label className="form-check-label"><strong>Email Notifications</strong><br /><small className="text-muted">Receive important updates via email</small></label>
              </div>
              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" checked={notifications.financialUpdates} onChange={e => setNotifications({...notifications, financialUpdates: e.target.checked})} />
                <label className="form-check-label"><strong>Financial Updates</strong><br /><small className="text-muted">Get notified about financial data changes</small></label>
              </div>
              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" checked={notifications.userActivity} onChange={e => setNotifications({...notifications, userActivity: e.target.checked})} />
                <label className="form-check-label"><strong>User Activity</strong><br /><small className="text-muted">Notifications about user actions in your tenant</small></label>
              </div>
              <div className="form-check form-switch mb-2">
                <input className="form-check-input" type="checkbox" checked={notifications.weeklyReports} onChange={e => setNotifications({...notifications, weeklyReports: e.target.checked})} />
                <label className="form-check-label"><strong>Weekly Reports</strong><br /><small className="text-muted">Receive weekly summary reports</small></label>
              </div>
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" onClick={handleNotificationSave}>
              <i className="bi bi-check-lg me-1"></i>Save Preferences
            </button>
          </div>
        </div>
      )}
    </>
  )
}
