import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/auth'
import api from '../api/client'

export default function Login(){
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin')
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent){
    e.preventDefault()
    setError(null)
    try{
      console.log('Attempting login with:', username)
      const json = await login(username, password)
      console.log('Login response:', json)
      const token = json.data?.access_token || json.access_token
      const refresh = json.data?.refresh_token || json.refresh_token
      if (!token) {
        throw new Error('No access token received from server')
      }
      localStorage.setItem('access_token', token)
      localStorage.setItem('refresh_token', refresh)

      // Temporarily set tenant to 'admin' so the api interceptor has a valid header
      localStorage.setItem('tenant_id', 'admin')

      // Fetch user profile to get role
      try {
        const userRes = await api.get('/auth/me')
        const userData = userRes.data?.data || userRes.data
        if (userData.role) {
          localStorage.setItem('user_role', userData.role)
          localStorage.setItem('user_email', userData.email || username)
        }
      } catch (err) {
        console.error('[Login] Could not fetch user profile:', err)
        if (username === 'admin') {
          localStorage.setItem('user_role', 'admin')
          localStorage.setItem('user_email', 'admin')
        }
      }

      // Auto-detect the user's primary tenant
      try {
        const tenantsRes = await api.get('/my-tenants')
        const tenantList: { id: string; name: string }[] = tenantsRes.data || []
        if (tenantList.length > 0) {
          // For super_admin keep 'admin' as default; for everyone else pick first result
          const role = localStorage.getItem('user_role')
          const isSuperAdmin = role === 'super_admin' || role === 'admin'
          if (!isSuperAdmin) {
            localStorage.setItem('tenant_id', tenantList[0].id)
          }
        }
      } catch (err) {
        console.error('[Login] Could not fetch tenant list:', err)
      }
      
      console.log('Login successful, redirecting to dashboard...')
      // Small delay to ensure localStorage is updated before navigation
      setTimeout(() => {
        window.location.href = '/'
      }, 100)
    }catch(err:any){
      console.error('Login error:', err)
      setError(err.message || 'Network error. Please check if backend is running.')
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1 className="login-title">CFO Platform Login</h1>
          <p className="login-subtitle">Enter your credentials to continue</p>
        </div>
        
        <form onSubmit={submit} className="login-form">
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              {error}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="username" className="form-label">Username</label>
            <input 
              id="username"
              type="text"
              className="form-input"
              value={username} 
              onChange={e=>setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password" className="form-label">Password</label>
            <input 
              id="password"
              type="password"
              className="form-input"
              value={password} 
              onChange={e=>setPassword(e.target.value)}
              placeholder="•••••"
              autoComplete="current-password"
            />
          </div>
          
          <button type="submit" className="btn btn-login">
            Login
          </button>
          
          <div className="demo-credentials">
            <strong>Demo Credentials:</strong><br/>
            <div style={{ marginTop: 8 }}>
              Admin: <code>admin</code> / <code>admin</code><br/>
              Or: <code>demo-admin@testco.local</code> / <code>Secret123!</code>
            </div>
          </div>
          
          <div className="login-footer">
            By logging in, you agree to our{' '}
            <a href="/privacy-policy" target="_blank" className="privacy-link">
              Privacy Policy
            </a>
          </div>
        </form>
      </div>
    </div>
  )
}
