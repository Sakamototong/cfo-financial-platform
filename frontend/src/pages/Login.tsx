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
      
      // Set default tenant (admin for demo mode, testco for real users)
      const defaultTenant = username === 'admin' ? 'admin' : 'testco'
      localStorage.setItem('tenant_id', defaultTenant)
      
      // Fetch user profile to get role
      try {
        const userRes = await api.get('/auth/me')
        console.log('[Login] Full /auth/me response:', userRes)
        console.log('[Login] userRes.data:', userRes.data)
        console.log('[Login] userRes.data.data:', userRes.data?.data)
        const userData = userRes.data?.data || userRes.data
        console.log('[Login] Parsed userData:', userData)
        console.log('[Login] Role:', userData.role)
        if (userData.role) {
          localStorage.setItem('user_role', userData.role)
          localStorage.setItem('user_email', userData.email || username)
          console.log('[Login] User role set to localStorage:', userData.role)
        }
      } catch (err) {
        console.error('[Login] Could not fetch user profile:', err)
        // Default role for admin
        if (username === 'admin') {
          localStorage.setItem('user_role', 'admin')
          localStorage.setItem('user_email', 'admin')
        }
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
