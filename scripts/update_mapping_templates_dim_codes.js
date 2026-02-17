#!/usr/bin/env node
(async ()=>{
  const base = process.env.API_BASE || 'http://localhost:3000'
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
  const headers = { 'Authorization': 'Bearer demo-token-1', 'X-Tenant-Id': tenant, 'Content-Type': 'application/json' }

  // compute final prefix
  let computedPrefix = prefix || ''
  if (withTenant) {
    if (computedPrefix) computedPrefix = `${tenant}_${computedPrefix}`
    else computedPrefix = tenant
  }

  console.log('Update mapping templates for tenant:', tenant, 'prefix:', computedPrefix || '(none)', 'uppercase:', !!uppercaseFlag, 'dryRun:', !!dryRun)

  try {
    const cfgRes = await fetch(`${base}/admin/config`, { headers: { 'Authorization': headers.Authorization, 'X-Tenant-Id': headers['X-Tenant-Id'] } })
    if (!cfgRes.ok) throw new Error('Failed to fetch admin config: ' + cfgRes.status)
    const configs = await cfgRes.json()
    const mappingItems = (Array.isArray(configs) ? configs : []).filter(c => typeof c.config_key === 'string' && c.config_key.startsWith('etl.mapping.'))
    console.log('Found mapping templates:', mappingItems.length)

    let updatedCount = 0
    for (const m of mappingItems) {
      const v = m.config_value || m.config_value === 0 ? m.config_value : null
      const cfg = (typeof v === 'string') ? (()=>{ try { return JSON.parse(v) } catch(e){return null} })() : v
      if (!cfg) continue
      const dimMap = cfg.dimension_map || cfg.dimensions || null
      if (!dimMap || typeof dimMap !== 'object') continue

      const newDimMap = {}
      let changed = false
      for (const [k, val] of Object.entries(dimMap)) {
        const original = String(k).trim()
        if (!original) continue
        let code = original
        if (uppercaseFlag) code = code.toUpperCase()
        if (computedPrefix) code = `${computedPrefix}_${code}`
        if (code !== original) changed = true
        // store both the original name and the original mapping value
        newDimMap[code] = { original, value: val }
      }

      if (!changed) continue

      // keep original dimension_map under a backup key to preserve previous format
      const newCfg = { ...cfg, dimension_map: newDimMap, dimension_map_original: dimMap }

      if (dryRun) {
        console.log('[dry-run] Would update', m.config_key, '->', JSON.stringify(newCfg))
        updatedCount++
        continue
      }

      const body = {
        tenant_id: tenant,
        config_key: m.config_key,
        config_value: newCfg,
        description: m.description || `Updated to use prefixed dimension codes`
      }

      const up = await fetch(`${base}/admin/config`, { method: 'POST', headers, body: JSON.stringify(body) })
      const upBody = await up.json().catch(()=>null)
      if (!up.ok) console.error('Failed to update', m.config_key, up.status, upBody)
      else {
        console.log('Updated', m.config_key, 'status', up.status)
        updatedCount++
      }
    }

    console.log('Done. Templates updated:', updatedCount)
  } catch (e) {
    console.error('ERROR', e)
    process.exitCode = 1
  }
})()
