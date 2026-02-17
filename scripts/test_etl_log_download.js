#!/usr/bin/env node
(async ()=>{
  const base = 'http://localhost:3000'
  const headers = { 'Authorization': 'Bearer demo-token-1' }
  try {
    const form = new FormData()
    form.append('file', new Blob(['']), 'empty.csv')

    console.log('Uploading empty CSV to trigger failed import...')
    const res = await fetch(`${base}/etl/import/csv`, { method: 'POST', headers, body: form })
    const result = await res.json()
    console.log('Import response:', result)

    const importId = result?.import_id
    if (!importId) {
      console.error('No import_id returned; aborting')
      process.exitCode = 1
      return
    }

    // wait a short moment for DB update
    await new Promise(r => setTimeout(r, 500))

    console.log('Fetching error log for import id', importId)
    const logRes = await fetch(`${base}/etl/import/${importId}/log`, { headers })
    if (!logRes.ok) {
      console.error('Failed to fetch log:', logRes.status, await logRes.text())
      process.exitCode = 1
      return
    }
    const logJson = await logRes.json()
    console.log('Log response:', logJson)

    const fs = require('fs')
    const outPath = `scripts/import_${importId}_error.log`
    fs.writeFileSync(outPath, logJson.data || '')
    console.log('Saved log to', outPath)
  } catch (e) {
    console.error('ERROR', e)
    process.exitCode = 1
  }
})()
