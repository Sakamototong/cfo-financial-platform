#!/usr/bin/env node
(async ()=>{
  const base = 'http://localhost:3000'
  const headers = { 'Authorization': 'Bearer demo-token-1', 'X-Tenant-Id': 'admin', 'Content-Type': 'application/json' }

  const templates = [
    {
      key: 'etl.mapping.basic_pl_csv',
      desc: 'Basic CSV mapping for P&L import',
      value: {
        format: 'csv',
        columns: {
          line_code: 'A',
          line_name: 'B',
          amount: 'C',
          currency: 'D',
          notes: 'E'
        },
        options: { header:true, skip_empty:true }
      }
    },
    {
      key: 'etl.mapping.excel_sales_sheet',
      desc: 'Excel mapping: Sales sheet with month columns',
      value: {
        format: 'excel',
        sheet: 'SalesData',
        start_row: 2,
        columns: {
          product_code: 'A',
          product_name: 'B',
          jan_amount: 'C',
          feb_amount: 'D'
        },
        options: { currency_column: 'E' }
      }
    },
    {
      key: 'etl.mapping.fx_currency_map',
      desc: 'FX mapping table for currency conversion during import',
      value: {
        type: 'fx_map',
        mappings: {
          USD: 'THB',
          EUR: 'THB'
        },
        default_rate: 1.0
      }
    },
    {
      key: 'etl.mapping.advanced_pl',
      desc: 'Advanced P&L with dimension mapping',
      value: {
        format: 'csv',
        columns: {
          account_code: 'A',
          account_name: 'B',
          scenario: 'C',
          period: 'D',
          amount: 'E'
        },
        dimension_map: {
          department: 'F',
          product: 'G'
        },
        options: { header:true }
      }
    }
  ]

  for (const t of templates) {
    try {
      const res = await fetch(`${base}/admin/config`, { method: 'POST', headers, body: JSON.stringify({ tenant_id: 'admin', config_key: t.key, config_value: t.value, description: t.desc, is_system: false }) })
      const data = await res.json().catch(()=>null)
      console.log(t.key, '=>', res.status, data ? JSON.stringify(data).slice(0,200) : '')
    } catch (e) {
      console.error('Failed', t.key, e)
    }
  }

  console.log('Done creating example mappings')
})()
