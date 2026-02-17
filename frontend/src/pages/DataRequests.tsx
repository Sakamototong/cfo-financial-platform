import React, { useEffect, useState } from 'react'
import api from '../api/client'
import DataTable from '../components/DataTable'

interface DSARRequest {
  id: string
  requestType: 'access' | 'export' | 'delete' | 'rectify'
  description: string
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'deleted'
  requestedAt: string
  processedAt?: string
  adminNotes?: string
}

const EmptyState = ({ onCreateClick }: { onCreateClick: () => void }) => (
  <div className="card-body text-center py-5">
    <i className="bi bi-clipboard-data fs-1 text-secondary mb-3 d-block"></i>
    <h3>ยังไม่มีคำขอข้อมูล</h3>
    <p className="text-secondary">คุณยังไม่มีคำขอเข้าถึงหรือจัดการข้อมูลส่วนบุคคล</p>
    <button onClick={onCreateClick} className="btn btn-primary">
      <i className="bi bi-plus-circle me-1"></i> สร้างคำขอใหม่
    </button>
  </div>
)

export default function DataRequests() {
  const [requests, setRequests] = useState<DSARRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    requestType: 'access' as const,
    description: '',
  })

  useEffect(() => {
    loadRequests()
  }, [])

  const loadRequests = async () => {
    setLoading(true)
    try {
      const res = await api.get('/privacy/dsar/my-requests')
      setRequests(res.data)
    } catch (err: any) {
      // Privacy module may not be active - load from localStorage as fallback
      if (err.response?.status === 404) {
        const saved = localStorage.getItem('dsar_requests')
        if (saved) {
          try { setRequests(JSON.parse(saved)) } catch { /* ignore */ }
        }
      }
      console.error('Failed to load DSAR requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/privacy/dsar/request', formData)
      alert('คำขอของคุณถูกส่งเรียบร้อยแล้ว เราจะดำเนินการภายใน 30 วัน')
      setShowForm(false)
      setFormData({ requestType: 'access', description: '' })
      loadRequests()
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + (err.response?.data?.message || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (requestId: string) => {
    try {
      const res = await api.get(`/privacy/dsar/export/${requestId}`)
      const blob = new Blob([JSON.stringify(res.data, null, 2)], {
        type: 'application/json',
      })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `my-data-${requestId}.json`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + (err.response?.data?.message || err.message))
    }
  }

  const requestTypeLabels: Record<string, string> = {
    access: 'ขอเข้าถึงข้อมูล',
    export: 'ขอส่งออกข้อมูล',
    delete: 'ขอลบข้อมูล',
    rectify: 'ขอแก้ไขข้อมูล',
  }

  const statusLabels: Record<string, string> = {
    pending: 'รอดำเนินการ',
    processing: 'กำลังดำเนินการ',
    completed: 'เสร็จสิ้น',
    rejected: 'ถูกปฏิเสธ',
    deleted: 'ลบข้อมูลแล้ว',
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const processingCount = requests.filter(r => r.status === 'processing').length
  const completedCount = requests.filter(r => r.status === 'completed').length

  const columns = [
    {
      key: 'requestType',
      label: 'ประเภท',
      sortable: true,
      render: (req: DSARRequest) => (
        <div>
          <div className="fw-semibold">
            {requestTypeLabels[req.requestType] || req.requestType}
          </div>
          {req.description && (
            <div className="text-secondary small mt-1">
              {req.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      sortable: true,
      render: (req: DSARRequest) => {
        const badgeClass =
          req.status === 'completed' ? 'text-bg-success' :
          req.status === 'rejected' ? 'text-bg-danger' :
          req.status === 'processing' ? 'text-bg-info' :
          req.status === 'deleted' ? 'text-bg-secondary' :
          'text-bg-warning'
        return <span className={`badge ${badgeClass}`}>{statusLabels[req.status]}</span>
      },
    },
    {
      key: 'requestedAt',
      label: 'วันที่ขอ',
      sortable: true,
      render: (req: DSARRequest) => new Date(req.requestedAt).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    },
    {
      key: 'processedAt',
      label: 'วันที่ดำเนินการ',
      sortable: true,
      render: (req: DSARRequest) =>
        req.processedAt
          ? new Date(req.processedAt).toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : '-',
    },
    {
      key: 'actions',
      label: 'การดำเนินการ',
      render: (req: DSARRequest) => (
        <div className="d-flex gap-2 align-items-center">
          {req.status === 'completed' && req.requestType === 'export' && (
            <button onClick={() => handleExport(req.id)} className="btn btn-sm btn-primary">
              <i className="bi bi-download me-1"></i> ดาวน์โหลด
            </button>
          )}
          {req.adminNotes && (
            <span className="text-secondary" title={req.adminNotes}>
              <i className="bi bi-chat-dots"></i>
            </span>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      {/* Page Header Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h3 className="card-title">คำขอข้อมูลส่วนบุคคล</h3>
          <div className="card-tools">
            <button onClick={loadRequests} className="btn btn-outline-secondary btn-sm me-2">
              <i className="bi bi-arrow-clockwise me-1"></i> รีเฟรช
            </button>
            <button onClick={() => setShowForm(!showForm)} className="btn btn-primary btn-sm">
              {showForm ? (
                <><i className="bi bi-x-circle me-1"></i> ยกเลิก</>
              ) : (
                <><i className="bi bi-plus-circle me-1"></i> สร้างคำขอใหม่</>
              )}
            </button>
          </div>
        </div>
        <div className="card-body">
          <p className="text-secondary mb-0">
            จัดการคำขอเข้าถึง แก้ไข หรือลบข้อมูลส่วนบุคคลตาม GDPR/PDPA
          </p>
        </div>
      </div>

      {/* GDPR/PDPA Info Callout */}
      <div className="callout callout-info mb-4">
        <h5>สิทธิของคุณตาม GDPR/PDPA</h5>
        <p className="mb-2">คุณมีสิทธิ์ในการ:</p>
        <ul className="mb-2">
          <li><strong>เข้าถึงข้อมูล:</strong> ดูข้อมูลส่วนบุคคลที่เราเก็บไว้</li>
          <li><strong>ส่งออกข้อมูล:</strong> ขอข้อมูลในรูปแบบ JSON เพื่อนำไปใช้ที่อื่น (Data Portability)</li>
          <li><strong>แก้ไขข้อมูล:</strong> แก้ไขข้อมูลที่ไม่ถูกต้อง</li>
          <li><strong>ลบข้อมูล:</strong> ขอลบข้อมูลของคุณ (Right to be Forgotten)</li>
        </ul>
        <p className="mb-0 small text-secondary">
          <i className="bi bi-clock me-1"></i> เราจะตอบสนองคำขอภายใน <strong>30 วัน</strong> ตามกฎหมาย
        </p>
      </div>

      {/* Metric Info Boxes */}
      <div className="row mb-4">
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-primary">
              <i className="bi bi-clipboard-data"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">คำขอทั้งหมด</span>
              <span className="info-box-number">{requests.length}</span>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-warning">
              <i className="bi bi-hourglass-split"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">รอดำเนินการ</span>
              <span className="info-box-number">{pendingCount}</span>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-info">
              <i className="bi bi-gear"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">กำลังดำเนินการ</span>
              <span className="info-box-number">{processingCount}</span>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="info-box">
            <span className="info-box-icon text-bg-success">
              <i className="bi bi-check-circle"></i>
            </span>
            <div className="info-box-content">
              <span className="info-box-text">เสร็จสิ้น</span>
              <span className="info-box-number">{completedCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">สร้างคำขอใหม่</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setShowForm(false)
                    setFormData({ requestType: 'access', description: '' })
                  }}
                ></button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">
                      ประเภทคำขอ <span className="text-danger">*</span>
                    </label>
                    <select
                      value={formData.requestType}
                      onChange={(e) =>
                        setFormData({ ...formData, requestType: e.target.value as any })
                      }
                      className="form-select"
                      required
                    >
                      <option value="access">ขอเข้าถึงข้อมูล</option>
                      <option value="export">ขอส่งออกข้อมูล (Data Portability)</option>
                      <option value="rectify">ขอแก้ไขข้อมูล</option>
                      <option value="delete">ขอลบข้อมูล (Right to be Forgotten)</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">รายละเอียดเพิ่มเติม</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      className="form-control"
                      placeholder="กรุณาระบุรายละเอียดเพิ่มเติมเกี่ยวกับคำขอของคุณ..."
                      rows={4}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowForm(false)
                      setFormData({ requestType: 'access', description: '' })
                    }}
                  >
                    ยกเลิก
                  </button>
                  <button type="submit" disabled={loading} className="btn btn-primary">
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-1"></span> กำลังส่ง...</>
                    ) : (
                      <><i className="bi bi-send me-1"></i> ส่งคำขอ</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Requests Table Card */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">คำขอของฉัน</h3>
        </div>
        <div className="card-body">
          {loading && requests.length === 0 ? (
            <div className="text-center py-5 text-secondary">
              <span className="spinner-border spinner-border-sm me-2"></span>
              กำลังโหลด...
            </div>
          ) : requests.length === 0 ? (
            <EmptyState onCreateClick={() => setShowForm(true)} />
          ) : (
            <DataTable columns={columns} data={requests} searchable paginated />
          )}
        </div>
      </div>
    </>
  )
}
