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
  const dryRun = argv.includes('--dry-run')
  const headers = { 'Authorization': 'Bearer demo-token-1', 'X-Tenant-Id': tenant, 'Content-Type': 'application/json' }

  console.log('Normalize mapping templates for tenant:', tenant, 'dryRun:', !!dryRun)

  try {
    const cfgRes = await fetch(`${base}/admin/config`, { headers: { 'Authorization': headers.Authorization, 'X-Tenant-Id': headers['X-Tenant-Id'] } })
    if (!cfgRes.ok) throw new Error('Failed to fetch admin config: ' + cfgRes.status)
    const configs = await cfgRes.json()
    const mappingItems = (Array.isArray(configs) ? configs : []).filter(c => typeof c.config_key === 'string' && c.config_key.startsWith('etl.mapping.'))
    console.log('Found mapping templates:', mappingItems.length)

    let updated = 0
    for (const m of mappingItems) {
      const v = m.config_value || m.config_value === 0 ? m.config_value : null
      const cfg = (typeof v === 'string') ? (()=>{ try { return JSON.parse(v) } catch(e){return null} })() : v
      if (!cfg) continue
      const dimMap = cfg.dimension_map || null
      if (!dimMap || typeof dimMap !== 'object') continue

      // Detect already-normalized form: values are objects that contain 'column' (new schema)
      const sampleVal = Object.values(dimMap)[0]
      const alreadyNormalized = sampleVal && typeof sampleVal === 'object' && ('column' in sampleVal || ('value' in sampleVal && typeof sampleVal.value === 'string'))
      if (alreadyNormalized) {
        console.log('Skipping (already normalized):', m.config_key)
        continue
      }

      // Build normalized map: newKey -> { column, original, source }
      const normalized = {}
      const originalBackup = {}

      for (const [newKey, val] of Object.entries(dimMap)) {
        // various legacy shapes
        let column = null
        let originalName = null
        let sourceKey = null

        if (typeof val === 'string') {
          column = val
        } else if (val && typeof val === 'object') {
          // cases:
          // 1) val = { value: 'G', original: 'admin_product' }
          // 2) val = { value: { value: 'G', original: 'admin_product' }, original: 'demo_admin_product' }
          // 3) val = { original: 'demo_admin_product', value: 'G' }
          if ('value' in val && typeof val.value === 'string') {
            column = val.value
            originalName = val.original || null
          } else if ('value' in val && typeof val.value === 'object') {
            column = val.value.value
            originalName = val.value.original || null
            sourceKey = val.original || null
          } else if ('original' in val && typeof val.original === 'string') {
            sourceKey = val.original
          }
        }

        // fallback: try to look into dimension_map_original if present
        if ((column === null || column === undefined) && cfg.dimension_map_original && typeof cfg.dimension_map_original === 'object') {
          const maybe = cfg.dimension_map_original[newKey] || cfg.dimension_map_original[sourceKey]
          if (typeof maybe === 'string') column = maybe
          else if (maybe && typeof maybe === 'object') column = maybe.value || column
        }

        // final fallbacks
        if (!originalName && sourceKey && typeof sourceKey === 'string') {
          // if sourceKey contains last segment after '_' consider it original
          const parts = sourceKey.split('_')
          originalName = parts.slice(-2).join('_') || sourceKey
        }

        // store simplified original backup mapping if possible
        if (originalName && column) originalBackup[originalName] = column

        normalized[newKey] = { column: column, original: originalName, source: sourceKey }
      }

      // Prepare new config value
      const newCfg = { ...cfg, dimension_map: normalized }
      if (Object.keys(originalBackup).length > 0) newCfg.dimension_map_original = originalBackup

      if (dryRun) {
        console.log('[dry-run] Would update', m.config_key, '->', JSON.stringify(newCfg))
        updated++
        continue
      }

      const body = { tenant_id: tenant, config_key: m.config_key, config_value: newCfg, description: m.description || 'Normalized dimension_map format' }
      const up = await fetch(`${base}/admin/config`, { method: 'POST', headers, body: JSON.stringify(body) })
      const upBody = await up.json().catch(()=>null)
      if (!up.ok) console.error('Failed to update', m.config_key, up.status, upBody)
      else {
        console.log('Updated', m.config_key, 'status', up.status)
        updated++
      }
    }

    console.log('Normalization complete. Updated templates:', updated)
  } catch (e) {
    console.error('ERROR', e)
    process.exitCode = 1
  }
})()
