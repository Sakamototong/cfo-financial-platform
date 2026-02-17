#!/usr/bin/env node
(async ()=>{
  const base = 'http://localhost:3000'
  const headers = { 'Authorization': 'Bearer demo-token-1', 'X-Tenant-Id': 'demo' }
  try {
    console.log('-> GET /dim/dimensions')
    const gRes = await fetch(`${base}/dim/dimensions`, { headers })
    console.log('status', gRes.status)
    const dims = await gRes.json()
    console.log('dimensions:', Array.isArray(dims) ? dims.length : JSON.stringify(dims).slice(0,200))

    console.log('-> POST /dim/dimensions (create test dimension)')
    const payload = {
      dimension_code: 'TEST01',
      dimension_name: 'Test Dimension 01',
      dimension_type: 'custom',
      description: 'Created by smoke test'
    }
    const pRes = await fetch(`${base}/dim/dimensions`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    console.log('status', pRes.status)
    const created = await pRes.json()
    console.log('created:', JSON.stringify(created).slice(0,200))

    console.log('-> Verify GET contains TEST01')
    const g2 = await fetch(`${base}/dim/dimensions`, { headers })
    const dims2 = await g2.json()
    const found = Array.isArray(dims2) && dims2.find(d=>d.dimension_code==='TEST01')
    console.log('found TEST01?', !!found)

    console.log('-> Cleanup: mark TEST01 inactive')
    await fetch(`${base}/dim/dimensions`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ dimension_code: 'TEST01', dimension_name: 'Test Dimension 01', dimension_type: 'custom', is_active: false }) })

    console.log('DIM SMOKE TESTS COMPLETE')
  } catch (e) {
    console.error('ERROR', e)
    process.exitCode = 1
  }
})()
