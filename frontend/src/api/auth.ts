export async function login(username: string, password: string, base = (import.meta.env.VITE_API_BASE || 'http://localhost:3000')) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) {
    let errorMsg = 'Login failed'
    try {
      const errorData = await res.json()
      errorMsg = errorData.message || errorData.error || errorMsg
    } catch (e) {
      // ignore json parse error
    }
    throw new Error(errorMsg)
  }
  return res.json()
}

export async function refresh(refreshToken: string, base = (import.meta.env.VITE_API_BASE || 'http://localhost:3000')) {
  const res = await fetch(`${base}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  if (!res.ok) throw new Error('Refresh failed')
  return res.json()
}
