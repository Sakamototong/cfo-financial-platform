import React, { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import TransactionDrillDown from '../components/TransactionDrillDown'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function StatementDetail(){
  const { id } = useParams<{id:string}>()
  const [loading, setLoading] = useState(true)
  const [statement, setStatement] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [drillDownLine, setDrillDownLine] = useState<{ code: string; name: string } | null>(null)

  useEffect(()=>{
    if(!id) return
    setLoading(true)
    api.get(`/financial/statements/${id}`).then(r=>{
      const d = r.data
      if(d?.statement && (d.lineItems || d.line_items)){
        const lines = d.lineItems ?? d.line_items ?? []
        setStatement({ ...d.statement, line_items: lines })
      } else if(d?.statement && d.statement.line_items){
        setStatement(d.statement)
      } else {
        // fallback: maybe API returned a flat statement with line_items embedded
        setStatement(d)
      }
    }).catch(err=>{
      setError(err?.response?.data?.message ?? err.message ?? 'Failed to load')
    }).finally(()=>setLoading(false))
  },[id])

  function parseAmount(v:any){
    if(v === null || v === undefined) return 0
    const s = String(v).replace(/,/g, '')
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
  }

  function totalAmount(){
    if(!statement?.line_items || statement.line_items.length === 0) return 0
    return statement.line_items.reduce((s:any, li:any)=> s + parseAmount(li.amount), 0)
  }

  function formatDateDisplay(v:any){
    if(!v) return '—'
    const d = new Date(v)
    if(isNaN(d.getTime())) return String(v)
    return d.toLocaleDateString()
  }

  async function updateStatus(newStatus: string){
    if(!id) return
    try{
      await api.put(`/financial/statements/${id}/status`, { status: newStatus })
      // reload
      const r = await api.get(`/financial/statements/${id}`)
      const d = r.data
      if(d?.statement && (d.lineItems || d.line_items)){
        const lines = d.lineItems ?? d.line_items ?? []
        setStatement({ ...d.statement, line_items: lines })
      } else if(d?.statement && d.statement.line_items){
        setStatement(d.statement)
      } else {
        setStatement(d)
      }
    }catch(err:any){ setError(err?.message ?? 'Failed to update') }
  }

  async function deleteStatementConfirmed(){
    if(!id) return
    setDeleting(true)
    try{
      await api.delete(`/financial/statements/${id}`)
      navigate('/financials')
    }catch(err:any){
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to delete')
    }finally{ setDeleting(false); setShowDeleteConfirm(false) }
  }

  if(loading) return <div className="page"><p>Loading...</p></div>
  if(error) return <div className="page"><div className="form-error">{error}</div><Link to="/financials" className="btn">Back</Link></div>

  return (
    <>
      <div>
      <div className="page">
        <h2>Statement Detail</h2>
      <div style={{ marginBottom: 12 }}>
        <strong>Type:</strong> {statement.statement_type} &nbsp; 
        <strong>Scenario:</strong> {statement.scenario} &nbsp; 
        <strong>Status:</strong> {statement.status}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div><strong>Period:</strong> {formatDateDisplay(statement.period_start)} - {formatDateDisplay(statement.period_end)}</div>
        <div><strong>Total:</strong> {totalAmount().toLocaleString()}</div>
      </div>

      <h4>Line Items</h4>
      <div>
        {(!statement.line_items || statement.line_items.length === 0) ? (
          <div>No line items.</div>
        ) : (()=>{
          const labels = statement.line_items.map((li:any)=> li.line_name + ' (' + li.line_code + ')')
          const values = statement.line_items.map((li:any)=> parseAmount(li.amount))
          const data = {
            labels,
            datasets: [
              {
                label: 'Amount',
                data: values,
                backgroundColor: 'rgba(37,99,235,0.8)'
              }
            ]
          }
          const nf = new Intl.NumberFormat(undefined, { style: 'decimal', maximumFractionDigits: 0 })
          const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              title: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx: any) => nf.format(ctx.parsed.y)
                }
              }
            },
            scales: {
              y: {
                ticks: {
                  callback: (v: any) => nf.format(Number(v))
                }
              }
            }
          }
          return (
            <div>
              <div style={{ height: 260, maxHeight: '60vh' }}>
                <Bar data={data} options={options} />
              </div>
              <div style={{ marginTop: 12 }}>
                {statement.line_items.map((li:any)=> (
                  <div 
                    key={li.id || li.line_code} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '6px 8px',
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => setDrillDownLine({ code: li.line_code, name: li.line_name })}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    title="Click to view transaction details"
                  >
                    <div>{li.line_name} ({li.line_code}) 🔍</div>
                    <div>{parseAmount(li.amount).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" onClick={()=>navigate('/financials')}>Back</button>
        <button className="btn" onClick={()=>navigate(`/financials/${statement?.id ?? id}/edit`)}>Edit</button>
        {statement?.status !== 'approved' && <button className="btn primary" onClick={()=>updateStatus('approved')}>Approve</button>}
        <button className="btn ghost" onClick={()=>setShowDeleteConfirm(true)} disabled={deleting}>Delete</button>
      </div>
      </div>
      </div>

      <ConfirmModal open={showDeleteConfirm} title="Confirm Delete" message="Delete this statement? This cannot be undone." onCancel={()=>setShowDeleteConfirm(false)} onConfirm={deleteStatementConfirmed} />
      
      {drillDownLine && id && (
        <TransactionDrillDown
          statementId={id}
          lineCode={drillDownLine.code}
          lineName={drillDownLine.name}
          onClose={() => setDrillDownLine(null)}
        />
      )}
    </>
  )
}
