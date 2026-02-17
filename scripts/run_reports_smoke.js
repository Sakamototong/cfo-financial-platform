#!/usr/bin/env node
(async ()=>{
  const base = 'http://localhost:3000'
  const headers = { 'Authorization': 'Bearer demo-token-1' }
  try {
    const sRes = await fetch(`${base}/financial/statements`, { headers })
    const statements = await sRes.json()
    console.log('STATEMENTS:', Array.isArray(statements) ? statements.length : JSON.stringify(statements).slice(0,200))

    const pRes = await fetch(`${base}/projections/list`, { headers })
    const projections = await pRes.json()
    console.log('PROJECTIONS:', Array.isArray(projections) ? projections.length : JSON.stringify(projections).slice(0,200))

    const actual = (Array.isArray(statements) && statements[0] && statements[0].id) ? statements[0].id : (statements?.id || '')
    const proj = (Array.isArray(projections) && projections[0] && projections[0].id) ? projections[0].id : ''

    if (actual && proj) {
      console.log('-> Running variance for', actual, proj)
      const vRes = await fetch(`${base}/reports/variance?actual_statement_id=${encodeURIComponent(actual)}&projection_id=${encodeURIComponent(proj)}&period_number=1`, { headers })
      console.log('variance status', vRes.status)
      const v = await vRes.json()
      console.log('variance.summary:', v.summary ? JSON.stringify(v.summary) : 'no summary', 'line_items:', v.line_items ? v.line_items.length : 0)
    } else {
      console.log('-> Skipping variance: missing actual or projection id')
    }

    console.log('-> Running summary')
    const sumRes = await fetch(`${base}/reports/summary?type=PL&start_date=2026-01-01&end_date=2026-12-31`, { headers })
    const sum = await sumRes.json()
    console.log('summary rows:', Array.isArray(sum) ? sum.length : JSON.stringify(sum).slice(0,200))

    console.log('-> Running trend for REV001')
    const trendRes = await fetch(`${base}/reports/trend?line_code=${encodeURIComponent('REV001')}&start_date=2026-01-01&end_date=2026-12-31`, { headers })
    const trend = await trendRes.json()
    console.log('trend:', Object.keys(trend), 'periods:', trend.periods ? trend.periods.length : 0)

    if (actual && proj) {
      console.log('-> Exporting variance CSV')
      const expRes = await fetch(`${base}/reports/export/variance?actual_statement_id=${encodeURIComponent(actual)}&projection_id=${encodeURIComponent(proj)}&period_number=1&format=csv`, { headers })
      const exp = await expRes.json()
      console.log('export format:', exp.format, 'data length:', (exp.data||'').length)
    }

    console.log('SMOKE TESTS COMPLETE')
  } catch (e) {
    console.error('ERROR', e)
    process.exitCode = 1
  }
})()
