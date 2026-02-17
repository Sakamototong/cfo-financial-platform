#!/usr/bin/env node
(async ()=>{
  const base = 'http://localhost:3000'
  const headers = { 'Authorization': 'Bearer demo-token-1' }
  try {
    console.log('Fetching import history...')
    const hRes = await fetch(`${base}/etl/import/history`, { headers })
    const history = await hRes.json()
    const item = Array.isArray(history) ? history.find(h=>h.error_log) : null
    if (!item) { console.error('No import with error_log found'); process.exitCode=1; return }
    const id = item.id
    console.log('Using import id', id)

    console.log('Requesting byte range 0-49')
    const rangeRes = await fetch(`${base}/etl/import/${id}/log`, { headers: { ...headers, Range: 'bytes=0-49' } })
    console.log('Status', rangeRes.status)
    const buf = await rangeRes.arrayBuffer()
    const fs = require('fs')
    const out = Buffer.from(buf)
    fs.writeFileSync(`scripts/import_${id}_range0-49.log`, out)
    console.log('Saved scripts/import_' + id + '_range0-49.log')

    console.log('Requesting full file')
    const fullRes = await fetch(`${base}/etl/import/${id}/log`, { headers })
    const fullBuf = await fullRes.arrayBuffer()
    fs.writeFileSync(`scripts/import_${id}_full.log`, Buffer.from(fullBuf))
    console.log('Saved scripts/import_' + id + '_full.log')

  } catch (e) {
    console.error('ERROR', e)
    process.exitCode=1
  }
})()
