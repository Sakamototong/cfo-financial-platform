#!/usr/bin/env node
(async ()=>{
  const base = process.env.API_BASE || 'http://localhost:3000'

  // Simple arg parsing
  const argv = process.argv.slice(2)
  function getArg(name) {
    const idx = argv.findIndex(a => a === `--${name}`)
    if (idx >= 0 && argv.length > idx+1) return argv[idx+1]
    const kv = argv.find(a => a.startsWith(`--${name}=`))
    if (kv) return kv.split('=')[1]
    return undefined
  }
  const tenant = getArg('tenant') || process.env.TENANT_ID || 'admin'
  const prefix = getArg('prefix') || process.env.DIM_PREFIX || ''
  const uppercaseFlag = argv.includes('--uppercase') || process.env.DIM_UPPERCASE === '1' || process.env.DIM_UPPERCASE === 'true'
  const withTenant = argv.includes('--with-tenant') || process.env.DIM_WITH_TENANT === '1' || process.env.DIM_WITH_TENANT === 'true'
  const dryRun = argv.includes('--dry-run')

  const headers = { 'Authorization': 'Bearer demo-token-1', 'X-Tenant-Id': tenant }


  // compute final prefix: optionally include tenant id
  let computedPrefix = prefix || ''
  if (withTenant) {
    if (computedPrefix) computedPrefix = `${tenant}_${computedPrefix}`
    else computedPrefix = tenant
  }

  console.log('Using tenant:', tenant, 'prefix:', computedPrefix || '(none)', 'rawPrefix:', prefix || '(none)', 'withTenant:', !!withTenant, 'uppercase:', !!uppercaseFlag, 'dryRun:', !!dryRun)

  try {
    console.log('-> Fetch /admin/config (mapping templates)')
    const cfgRes = await fetch(`${base}/admin/config`, { headers })
    if (!cfgRes.ok) throw new Error('Failed to fetch admin config: ' + cfgRes.status)
    const configs = await cfgRes.json()

    const mappingItems = (Array.isArray(configs) ? configs : []).filter(c => typeof c.config_key === 'string' && c.config_key.startsWith('etl.mapping.'))
    console.log('Found mapping templates:', mappingItems.length)

    console.log('-> Fetch existing dimensions')
    const dimRes = await fetch(`${base}/dim/dimensions`, { headers })
    if (!dimRes.ok) throw new Error('Failed to fetch dimensions: ' + dimRes.status)
    const existing = await dimRes.json()

    const existingCodes = new Set((Array.isArray(existing) ? existing : []).map(d => d.dimension_code))
    const existingNames = new Set((Array.isArray(existing) ? existing : []).map(d => d.dimension_name))

    const toCreate = []

    for (const m of mappingItems) {
      const v = m.config_value || m.config_value === 0 ? m.config_value : null
      const cfg = (typeof v === 'string') ? (()=>{ try { return JSON.parse(v) } catch(e){return null} })() : v
      if (!cfg) continue
      const dimMap = cfg.dimension_map || cfg.dimensions || null
      if (!dimMap || typeof dimMap !== 'object') continue
      const keys = Object.keys(dimMap)
      for (const k of keys) {
        const original = String(k).trim()
        if (!original) continue
        let code = original
        if (uppercaseFlag) code = code.toUpperCase()
        if (computedPrefix) code = `${computedPrefix}_${code}`
        const name = original
        if (existingCodes.has(code) || existingNames.has(name)) continue
        toCreate.push({ dimension_code: code, dimension_name: name, dimension_type: 'custom', description: `Auto-created for mapping ${m.config_key}` })
      }
    }

    if (toCreate.length === 0) {
      console.log('No new dimensions to create.')
      process.exit(0)
    }

    console.log('Will create dimensions:', toCreate.map(d=>d.dimension_code))
    for (const d of toCreate) {
      try {
        if (dryRun) {
          console.log('[dry-run] Would create', d)
          continue
        }
        const r = await fetch(`${base}/dim/dimensions`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
        const body = await r.json().catch(()=>null)
        console.log('Created', d.dimension_code, 'status', r.status, body ? JSON.stringify(body).slice(0,200) : '')
      } catch (e) {
        console.error('Failed to create', d.dimension_code, e)
      }
    }

    console.log('Done linking dimensions for mappings')
  } catch (e) {
    console.error('ERROR', e)
    process.exitCode = 1
  }
})()
