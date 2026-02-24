import axios, { AxiosError, AxiosRequestConfig } from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

// Timeout configuration based on request type
const TIMEOUTS = {
  default: 15000,      // 15 seconds for standard requests
  upload: 60000,       // 60 seconds for file uploads
  longRunning: 90000,  // 90 seconds for ETL, reports, projections
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 0, // Don't set instance-level timeout — it causes Axios 1.6 to call
              // AbortSignal.any([userSignal, timeoutSignal]) which is unavailable
              // in older Safari/Chrome, triggering "signal.addEventListener is not a function".
              // Per-request timeout is set below only when no signal is present.
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
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = []

function processQueue(error: any, token: string | null = null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else if (token) resolve(token)
    else reject(new Error('No token available'))
  })
  refreshQueue = []
}

// Helper function to sleep (for retry delay)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Retry config for transient errors
const MAX_RETRY_ATTEMPTS = 3
const BASE_RETRY_DELAY = 1000 // 1 second base delay

/**
 * Axios 1.x stores an internal signal/cancelToken on the request config after processing.
 * Re-using that config for a retry causes "signal.addEventListener is not a function"
 * because the stale internal signal is not a proper AbortSignal.
 * Strip both properties so Axios starts clean for each retry.
 */
function prepareRetryConfig(config: AxiosRequestConfig): AxiosRequestConfig {
  const { signal: _s, cancelToken: _c, ...rest } = config as any
  return rest
}

// Determine if endpoint needs longer timeout
function getTimeoutForUrl(url?: string): number {
  if (!url) return TIMEOUTS.default
  
  const longRunningPatterns = [
    '/etl',
    '/projection',
    '/reports/generate',
    '/import',
    '/export',
  ]
  
  if (longRunningPatterns.some(pattern => url.includes(pattern))) {
    return TIMEOUTS.longRunning
  }
  
  if (url.includes('/upload')) {
    return TIMEOUTS.upload
  }
  
  return TIMEOUTS.default
}

api.interceptors.request.use((config: AxiosRequestConfig) => {
  const token = localStorage.getItem('access_token')
  const tenant = localStorage.getItem('tenant_id')
  if (!config.headers) config.headers = {}
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  if (tenant) config.headers['X-Tenant-Id'] = tenant
  
  // Set timeout per request, BUT only when no AbortSignal is present.
  // Axios 1.6 merges timeout + signal into one via AbortSignal.any() — which
  // crashes on browsers that don't support AbortSignal.any (Safari < 17.4, Chrome < 116).
  // When a signal IS present, the component controls cancellation; the instance
  // timeout (set to 0 above) won't interfere.
  if (config.url && !(config as any).signal) {
    config.timeout = getTimeoutForUrl(config.url)
  }
  
  return config
})

api.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    // error.config can be undefined for programmatic/canceled errors
    if (!error.config) return Promise.reject(error)

    const originalRequest = error.config as AxiosRequestConfig & { 
      _retry?: boolean
      _retryCount?: number 
    }
    
    // Handle network errors and timeouts with retry
    if (!error.response && error.code !== 'ERR_CANCELED') {
      const retryCount = originalRequest._retryCount || 0
      
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        originalRequest._retryCount = retryCount + 1
        const delayMs = BASE_RETRY_DELAY * Math.pow(2, retryCount)
        
        console.log(`Network error. Retrying after ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`, {
          error: error.message,
          code: error.code
        })
        
        await sleep(delayMs)
        return api(prepareRetryConfig(originalRequest))
      } else {
        console.error('Max retry attempts reached for network error')
        return Promise.reject(new Error('Network error. Please check your connection and try again.'))
      }
    }
    
    // Handle 429 Rate Limit errors with retry
    if (error.response?.status === 429) {
      const retryCount = originalRequest._retryCount || 0
      
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        originalRequest._retryCount = retryCount + 1
        
        // Get Retry-After header if available, otherwise use exponential backoff
        const retryAfter = error.response.headers['retry-after']
        const delayMs = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : BASE_RETRY_DELAY * Math.pow(2, retryCount) // Exponential backoff: 1s, 2s, 4s
        
        console.log(`Rate limited. Retrying after ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`)
        
        await sleep(delayMs)
        return api(prepareRetryConfig(originalRequest))
      } else {
        console.error('Max retry attempts reached for rate limit')
        return Promise.reject(new Error('Too many requests. Please try again later.'))
      }
    }
    
    // Handle 503 Service Unavailable with retry (backend not ready)
    if (error.response?.status === 503) {
      const retryCount = originalRequest._retryCount || 0
      
      if (retryCount < 2) { // Only retry twice for 503
        originalRequest._retryCount = retryCount + 1
        const delayMs = BASE_RETRY_DELAY * Math.pow(2, retryCount)
        
        console.log(`Service unavailable. Retrying after ${delayMs}ms (attempt ${retryCount + 1}/2)`)
        
        await sleep(delayMs)
        return api(prepareRetryConfig(originalRequest))
      }
    }
    
    // Handle 408 Request Timeout with retry
    if (error.response?.status === 408 || error.code === 'ECONNABORTED') {
      const retryCount = originalRequest._retryCount || 0
      
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        originalRequest._retryCount = retryCount + 1
        const delayMs = BASE_RETRY_DELAY * Math.pow(2, retryCount)
        
        console.log(`Request timeout. Retrying after ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`)
        
        await sleep(delayMs)
        return api(prepareRetryConfig(originalRequest))
      }
    }
    
    // Handle 401 Unauthorized errors (existing logic)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) return Promise.reject(error)

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) originalRequest.headers['Authorization'] = `Bearer ${token}`
              resolve(api(originalRequest))
            },
            reject,
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
        processQueue(null, newToken ?? null)
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
