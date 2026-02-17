import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import Navigation from '../components/Navigation'

export default function StatementEdit(){
  const { id } = useParams<{id:string}>()
  const [loading, setLoading] = useState(true)
  const [statement, setStatement] = useState<any | null>(null)
  const [original, setOriginal] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<Record<string,string>>({})
  const [showConfirm, setShowConfirm] = useState(false)
  const navigate = useNavigate()

  useEffect(()=>{
    if(!id) return
    setLoading(true)
    api.get(`/financial/statements/${id}`).then(r=>{
      const d = r.data
      let s = d?.statement ?? d
      // if API returned separate lineItems, attach them as line_items
      if(d && d.lineItems && s){
        s = { ...s, line_items: d.lineItems }
      }
      // ensure line_items is at least an empty array
      if(s && !s.line_items) s.line_items = []
      function toDateInput(v:any){
        if(!v) return ''
        const d = new Date(v)
        if(isNaN(d.getTime())) return String(v)
        return d.toISOString().slice(0,10)
      }
      if(s){
        s.period_start = toDateInput(s.period_start)
        s.period_end = toDateInput(s.period_end)
      }
      setStatement(s)
      // deep clone for undo
      setOriginal(JSON.parse(JSON.stringify(s)))
    }).catch(err=> setError(err?.message || 'Failed')).finally(()=>setLoading(false))
  },[id])

  function updateField(field: string, value: any){
    setStatement((s:any)=> ({ ...s, [field]: value }))
  }

  function updateLine(i:number, field:string, value:any){
    setStatement((s:any)=> ({ ...s, line_items: s.line_items.map((li:any, idx:number)=> idx===i ? ({ ...li, [field]: value }) : li) }))
  }

  function addLine(){
    setStatement((s:any)=> ({ ...s, line_items: [ ...s.line_items, { line_code: 'NEW', line_name: 'New', line_order: s.line_items.length+1, amount: 0, currency: 'THB' } ] }))
  }

  function undoChanges(){
    if(original) setStatement(JSON.parse(JSON.stringify(original)))
    setFormErrors({})
    setError(null)
  }

  function validate(): boolean{
    const errors: Record<string,string> = {}
    if(!statement) { setFormErrors({}); return false }
    if(!statement.period_start) errors['period'] = 'Period start is required'
    if(!statement.period_end) errors['period'] = (errors['period'] ? errors['period'] + '; ' : '') + 'Period end is required'
    if(statement.period_start && statement.period_end){
      const a = new Date(statement.period_start)
      const b = new Date(statement.period_end)
      if(a > b) errors['period'] = 'Period start must be before or equal period end'
    }
    if(!statement.line_items || statement.line_items.length === 0) errors['lines'] = 'At least one line item is required'
    (statement.line_items || []).forEach((li:any, i:number)=>{
      if(!li.line_code) errors[`line-${i}`] = 'Code required'
      if(!li.line_name) errors[`line-${i}`] = (errors[`line-${i}`] ? errors[`line-${i}`] + '; ' : '') + 'Name required'
      if(!Number.isFinite(li.amount)) errors[`line-${i}`] = (errors[`line-${i}`] ? errors[`line-${i}`] + '; ' : '') + 'Amount must be a number'
      if(Number(li.amount) < 0) errors[`line-${i}`] = (errors[`line-${i}`] ? errors[`line-${i}`] + '; ' : '') + 'Amount cannot be negative'
    })
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function saveAsNew(){
    if(!statement) return
    setError(null)
    if(!validate()) return
    setSaving(true)
    try{
      const payload = {
        statement_type: statement.statement_type,
        period_type: statement.period_type,
        period_start: statement.period_start,
        period_end: statement.period_end,
        scenario: statement.scenario,
        status: 'draft',
        line_items: statement.line_items.map((li:any)=> ({ line_code: li.line_code, line_name: li.line_name, line_order: li.line_order, amount: li.amount, currency: li.currency }))
      }
      const r = await api.post('/financial/statements', payload)
      const created = r.data?.statement ?? r.data
      navigate(`/financials/${created.id}`)
    }catch(err:any){ setError(err?.response?.data?.message ?? err.message ?? 'Save failed') }
    finally{ setSaving(false) }
  }

  async function saveExisting(){
    if(!statement || !id) return
    setError(null)
    if(!validate()) return
    setSaving(true)
    try{
      const payload = {
        statement_type: statement.statement_type,
        period_type: statement.period_type,
        period_start: statement.period_start,
        period_end: statement.period_end,
        scenario: statement.scenario,
        status: statement.status || 'draft',
        line_items: statement.line_items.map((li:any)=> ({ line_code: li.line_code, line_name: li.line_name, line_order: li.line_order, amount: li.amount, currency: li.currency, notes: li.notes }))
      }
      const r = await api.put(`/financial/statements/${id}`, payload)
      const updated = r.data?.statement ?? r.data
      navigate(`/financials/${updated.id}`)
    }catch(err:any){ setError(err?.response?.data?.message ?? err.message ?? 'Save failed') }
    finally{ setSaving(false) }
  }

  async function replaceOriginal(){
    if(!statement || !id) return
    setError(null)
    if(!validate()) return
    // show confirm modal
    setShowConfirm(true)
  }

  async function replaceOriginalConfirmed(){
    if(!statement || !id) return
    setSaving(true)
    setShowConfirm(false)
    try{
      const payload = {
        statement_type: statement.statement_type,
        period_type: statement.period_type,
        period_start: statement.period_start,
        period_end: statement.period_end,
        scenario: statement.scenario,
        status: statement.status || 'draft',
        line_items: statement.line_items.map((li:any)=> ({ line_code: li.line_code, line_name: li.line_name, line_order: li.line_order, amount: li.amount, currency: li.currency }))
      }
      const r = await api.post('/financial/statements', payload)
      const created = r.data?.statement ?? r.data
      // delete original
      await api.delete(`/financial/statements/${id}`)
      navigate(`/financials/${created.id}`)
    }catch(err:any){ setError(err?.response?.data?.message ?? err.message ?? 'Replace failed') }
    finally{ setSaving(false) }
  }

  if(loading) return <div className="page"><p>Loading...</p></div>
  if(!statement) return <div className="page"><div className="form-error">Not found</div></div>

  return (
    <div className="page">
      <h2>Edit Statement (Save as new / Replace)</h2>
      {error && <div className="form-error">{error}</div>}
      <div className="form-row">
        <label>Type
          <select value={statement.statement_type} onChange={e=>updateField('statement_type', e.target.value)}>
            <option value="PL">P&L</option>
            <option value="BS">Balance Sheet</option>
          </select>
        </label>
        <label>Scenario
          <input value={statement.scenario} onChange={e=>updateField('scenario', e.target.value)} />
        </label>
      </div>

      <div className="form-row">
        <label>Period start
          <input className={formErrors['period'] ? 'input-error' : ''} type="date" value={statement.period_start} onChange={e=>updateField('period_start', e.target.value)} />
        </label>
        <label>Period end
          <input className={formErrors['period'] ? 'input-error' : ''} type="date" value={statement.period_end} onChange={e=>updateField('period_end', e.target.value)} />
        </label>
      </div>
      {formErrors['period'] && <div className="form-error">{formErrors['period']}</div>}

      <div>
        <h4>Line items</h4>
        {formErrors['lines'] && <div className="form-error">{formErrors['lines']}</div>}
        {statement.line_items.map((li:any, i:number)=> (
          <div key={i} className="line-item">
            <div className="line-grid">
              <input className={formErrors[`line-${i}`] ? 'input-error' : ''} value={li.line_code} onChange={e=>updateLine(i, 'line_code', e.target.value)} />
              <input className={formErrors[`line-${i}`] ? 'input-error' : ''} value={li.line_name} onChange={e=>updateLine(i, 'line_name', e.target.value)} />
              <input className={formErrors[`line-${i}`] ? 'input-error' : ''} type="number" value={li.amount} onChange={e=>updateLine(i, 'amount', Number(e.target.value))} />
              <input className={formErrors[`line-${i}`] ? 'input-error' : ''} value={li.currency} onChange={e=>updateLine(i, 'currency', e.target.value)} />
              <div />
            </div>
            {formErrors[`line-${i}`] && <div className="form-error">{formErrors[`line-${i}`]}</div>}
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={addLine}>Add line</button>
        </div>
      </div>

      <div style={{ marginTop: 12 }} className="form-row">
        <button className="btn" onClick={undoChanges}>Undo</button>
        <button className="btn" onClick={saveExisting} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        <button className="btn" onClick={saveAsNew} disabled={saving}>{saving ? 'Saving...' : 'Save as New'}</button>
        <button className="btn primary" onClick={replaceOriginal} disabled={saving}>{saving ? 'Saving...' : 'Replace Original'}</button>
      </div>
      <ConfirmModal open={showConfirm} title="Confirm Replace" message="This will create a new statement and delete the original. Continue?" onCancel={()=>setShowConfirm(false)} onConfirm={replaceOriginalConfirmed} />
    </div>
  )
}
