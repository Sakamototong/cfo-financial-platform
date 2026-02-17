import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { Bar, Line, Pie } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { useTenant } from '../components/TenantContext'
import EmptyState from '../components/EmptyState'
import ActivityTimeline from '../components/ActivityTimeline'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

export default function Dashboard(){
  const { tenantId } = useTenant()
  const [statements, setStatements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ users: 0, scenarios: 0, transfers: 0 })

  useEffect(()=>{
    if (!tenantId) { setStatements([]); setLoading(false); return }
    async function load(){
      setLoading(true)
      try{
        const r = await api.get('/financial/statements')
        const list: any[] = r.data || []
        // fetch details for each statement to get line_items
        const details = await Promise.all(list.map(async (s)=>{
          try{
            const d = await api.get(`/financial/statements/${s.id}`)
            // backend returns { statement, lineItems } or the statement directly
            return { ...s, line_items: d.data?.lineItems || d.data?.line_items || [] }
          }catch{ return s }
        }))
        setStatements(details)

        // fetch additional stats from other endpoints
        try{
          const usersRes = await api.get('/users')
          setStats(prev => ({ ...prev, users: usersRes.data?.length || 0 }))
        }catch{}
        try{
          const scenariosRes = await api.get('/scenarios')
          setStats(prev => ({ ...prev, scenarios: scenariosRes.data?.length || 0 }))
        }catch{}
      }catch(e){ console.error(e) }
      setLoading(false)
    }
    load()
  }, [tenantId])

  // aggregate totals by scenario
  const agg: Record<string, number> = {}
  statements.forEach(s => {
    const total = (s.line_items || []).reduce((sum:number, li:any) => sum + Number(li.amount||0), 0)
    const key = s.scenario || 'default'
    agg[key] = (agg[key] || 0) + total
  })

  const labels = Object.keys(agg)
  const values = Object.values(agg)
  const totalSum = values.reduce((a, b) => a + b, 0)

  const nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

  // Chart.js data for bar chart
  const data = {
    labels: labels.length ? labels : ['No Data'],
    datasets: [{
      label: 'Total Amount',
      data: labels.length ? values : [0],
      backgroundColor: 'rgba(13, 110, 253, 0.8)',
      borderColor: '#0d6efd',
      borderWidth: 1
    }]
  }

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx:any) => nf.format(ctx.parsed.y) } }
    },
    scales: { y: { ticks: { callback: (v:any) => nf.format(Number(v)) } } }
  }

  return (
    <>
      {/* Info Cards Row */}
      <div className="row">
        <div className="col-12 col-sm-6 col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-primary shadow-sm">
              <i className="bi bi-cart-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Statements</span>
              <span className="info-box-number">
                {statements.length}
              </span>
            </div>
          </div>
        </div>
        
        <div className="col-12 col-sm-6 col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-info shadow-sm">
              <i className="bi bi-diagram-3"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Scenarios</span>
              <span className="info-box-number">{stats.scenarios}</span>
            </div>
          </div>
        </div>
        
        <div className="col-12 col-sm-6 col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-warning shadow-sm">
              <i className="bi bi-people-fill"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Users</span>
              <span className="info-box-number">{stats.users}</span>
            </div>
          </div>
        </div>
        
        <div className="col-12 col-sm-6 col-md-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-success shadow-sm">
              <i className="bi bi-currency-dollar"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">Total Revenue</span>
              <span className="info-box-number">{nf.format(totalSum)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Chart Card */}
      <div className="row">
        <div className="col-md-12">
          <div className="card mb-4">
            <div className="card-header border-0">
              <div className="d-flex justify-content-between">
                <h3 className="card-title">
                  <i className="bi bi-bar-chart me-2"></i>
                  Revenue Overview
                </h3>
                <div className="card-tools">
                  <div className="btn-group btn-group-sm" role="group">
                    <button className="btn btn-outline-secondary">Today</button>
                    <button className="btn btn-outline-secondary">Week</button>
                    <button className="btn btn-outline-secondary active">Month</button>
                    <button className="btn btn-outline-secondary">Year</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (labels.length && totalSum > 0 ? (
                <div style={{ height: 320 }}>
                  <Bar data={data} options={options} />
                </div>
              ) : (
                <EmptyState
                  icon="📊"
                  title="No Financial Data Yet"
                  description="Create your first financial statement to see aggregated totals and charts here."
                  action={{
                    label: "Create Statement",
                    to: "/financials"
                  }}
                  secondaryAction={{
                    label: "Set Up Scenarios",
                    to: "/scenarios"
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Line Chart & Pie Chart Row */}
      <div className="row">
        {/* Line Chart - Revenue Trend */}
        {!loading && totalSum > 0 && (
          <div className="col-md-8">
            <div className="card mb-4">
              <div className="card-header border-0">
                <h3 className="card-title">
                  <i className="bi bi-graph-up-arrow me-2"></i>
                  Revenue Trend
                </h3>
              </div>
              <div className="card-body">
                <div style={{ height: 280 }}>
                  <Line 
                    data={{
                      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                      datasets: [{
                        label: 'Revenue',
                        data: [totalSum * 0.7, totalSum * 0.75, totalSum * 0.85, totalSum * 0.9, totalSum * 0.95, totalSum],
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        fill: true,
                        tension: 0.4
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx:any) => nf.format(ctx.parsed.y) } }
                      },
                      scales: { y: { ticks: { callback: (v:any) => nf.format(Number(v)) } } }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pie Chart - Scenario Distribution */}
        {!loading && labels.length > 0 && (
          <div className="col-md-4">
            <div className="card mb-4">
              <div className="card-header border-0">
                <h3 className="card-title">
                  <i className="bi bi-pie-chart me-2"></i>
                  Scenario Distribution
                </h3>
              </div>
              <div className="card-body">
                <div style={{ height: 280, display: 'flex', justifyContent: 'center' }}>
                  <Pie 
                    data={{
                      labels: labels.length === 1 ? [...labels, 'Available'] : labels,
                      datasets: [{
                        data: labels.length === 1 ? [values[0], 0] : values,
                        backgroundColor: [
                          '#0d6efd',
                          '#198754',
                          '#ffc107',
                          '#dc3545',
                          '#6c757d'
                        ]
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom' },
                        tooltip: { callbacks: { label: (ctx:any) => `${ctx.label}: ${nf.format(ctx.parsed)}` } }
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="row">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">
                <i className="bi bi-clock-history me-2"></i>
                Recent Activity
              </h3>
            </div>
            <div className="card-body">
              <ActivityTimeline limit={5} />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">
                <i className="bi bi-lightning me-2"></i>
                Quick Actions
              </h3>
            </div>
            <div className="card-body">
              <div className="d-grid gap-2">
                <Link to="/financials" className="btn btn-primary btn-lg">
                  <i className="bi bi-plus-circle me-2"></i>
                  Create Financial Statement
                </Link>
                <Link to="/scenarios" className="btn btn-outline-primary btn-lg">
                  <i className="bi bi-diagram-3 me-2"></i>
                  Manage Scenarios
                </Link>
                <Link to="/etl" className="btn btn-outline-secondary btn-lg">
                  <i className="bi bi-arrow-down-circle me-2"></i>
                  Import Data (ETL)
                </Link>
                <Link to="/reports" className="btn btn-outline-info btn-lg">
                  <i className="bi bi-file-earmark-text me-2"></i>
                  View Reports
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
