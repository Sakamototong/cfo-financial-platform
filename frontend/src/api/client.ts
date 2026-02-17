import axios, { AxiosError, AxiosRequestConfig } from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
})

// A lightweight fetcher used only for refresh to avoid interceptor loops
async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error('Refresh failed')
  return res.json()
}

let isRefreshing = false
let refreshQueue: Array<(token?: string) => void> = []

function processQueue(error: any, token: string | null = null) {
  refreshQueue.forEach(cb => cb(token || undefined))
  refreshQueue = []
}

api.interceptors.request.use((config: AxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  const tenant = localStorage.getItem('tenant_id')
  if (!config.headers) config.headers = {}
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  if (tenant) config.headers['X-Tenant-Id'] = tenant
  return config
})

api.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) return Promise.reject(error)

      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((token?: string) => {
            if (token && originalRequest.headers) originalRequest.headers['Authorization'] = `Bearer ${token}`
            resolve(api(originalRequest))
          })
        })
      }

      isRefreshing = true
      try {
        const data = await refreshAccessToken(refreshToken)
        const newToken = data.data?.access_token || data.access_token
        if (newToken) {
          localStorage.setItem('access_token', newToken)
          if (originalRequest.headers) originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        }
        processQueue(null, newToken)
        return api(originalRequest)
      } catch (e) {
        processQueue(e as any, null)
        // clear tokens and redirect to login
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_role')
        localStorage.removeItem('user_email')
        localStorage.removeItem('user_data')
        
        // Redirect to login if not already there
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(e)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

export default api
