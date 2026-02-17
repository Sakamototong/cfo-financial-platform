# CFO Platform - Frontend (POC)

This is a minimal React + Vite frontend scaffold for the CFO Platform POC.

Quick start:

```bash
cd frontend
npm install
npm run dev
```

Defaults:
- API base: http://localhost:3000 (can set VITE_API_BASE)
- Login: use admin/admin (Keycloak-backed auth via backend)
- Tenant ID: demo/testco is set by Login page for convenience (you can change)

Pages included:
- /login
- / (Dashboard)
- /scenarios
- /financials

This scaffold provides API client `src/api/client.ts` with token and tenant headers.
