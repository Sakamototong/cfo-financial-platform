import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactDOM from 'react-dom'
import api from '../api/client'
import { useTenant } from '../components/TenantContext'

// ─── Types ───────────────────────────────────────────────────────────────────
interface Dimension {
  id?: string
  dimension_code: string
  dimension_name: string
  dimension_type: 'account' | 'department' | 'product' | 'location' | 'project' | 'custom'
  description?: string
  is_active: boolean
  created_at?: string
}

interface HierarchyNode {
  id?: string
  dimension_id?: string
  parent_code?: string | null
  node_code: string
  node_name: string
  level: number
  sort_order: number
  is_leaf: boolean
  metadata?: any
}

interface TemplateLineItem {
  line_code: string
  line_name: string
  parent_code?: string
  level: number
  line_order: number
  data_type: 'input' | 'calculated' | 'subtotal' | 'total'
  formula?: string
  required: boolean
  default_value?: number
  validation?: { min?: number; max?: number; allowNegative?: boolean }
}

interface StatementTemplate {
  id?: string
  template_name: string
  statement_type: 'PL' | 'BS' | 'CF'
  description?: string
  line_items: TemplateLineItem[]
  is_default: boolean
  created_at?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────
const DIM_TYPES: { value: Dimension['dimension_type']; label: string; icon: string; color: string }[] = [
  { value: 'account',    label: 'บัญชี (Account)',       icon: 'journal-bookmark', color: 'primary'  },
  { value: 'department', label: 'แผนก (Department)',      icon: 'building',         color: 'success'  },
  { value: 'product',    label: 'สินค้า (Product)',        icon: 'box-seam',         color: 'warning'  },
  { value: 'location',   label: 'สถานที่ (Location)',      icon: 'geo-alt',          color: 'info'     },
  { value: 'project',    label: 'โครงการ (Project)',       icon: 'kanban',           color: 'danger'   },
  { value: 'custom',     label: 'กำหนดเอง (Custom)',       icon: 'sliders',          color: 'secondary'},
]

const STMT_TYPES = ['PL', 'BS', 'CF'] as const
const STMT_LABELS: Record<string, string> = { PL: 'กำไร-ขาดทุน (P&L)', BS: 'งบดุล (Balance Sheet)', CF: 'กระแสเงินสด (Cash Flow)' }
const STMT_ICONS: Record<string, string> = { PL: 'graph-up-arrow', BS: 'pie-chart', CF: 'currency-exchange' }
const DATA_TYPE_COLORS: Record<string, string> = { input: 'primary', calculated: 'success', subtotal: 'warning', total: 'danger' }

// ─── Pre-built Quick-Setup data ───────────────────────────────────────────────
const QUICK_DIMS: Partial<Dimension>[] = [
  { dimension_code: 'DEPT',    dimension_name: 'แผนก',           dimension_type: 'department', description: 'โครงสร้างแผนกภายในองค์กร',          is_active: true },
  { dimension_code: 'COSTCTR', dimension_name: 'ศูนย์ต้นทุน',     dimension_type: 'account',    description: 'Cost Center สำหรับการวิเคราะห์ต้นทุน', is_active: true },
  { dimension_code: 'PRODUCT', dimension_name: 'สินค้า/บริการ',   dimension_type: 'product',    description: 'Product line / Service category',      is_active: true },
  { dimension_code: 'PROJECT', dimension_name: 'โครงการ',          dimension_type: 'project',    description: 'โครงการและงาน',                         is_active: true },
  { dimension_code: 'REGION',  dimension_name: 'ภูมิภาค/สาขา',    dimension_type: 'location',   description: 'สาขา/ภูมิภาค',                          is_active: true },
]

const QUICK_PL_TEMPLATE: Omit<StatementTemplate, 'id' | 'created_at'> = {
  template_name: 'Thai Standard P&L (มาตรฐานไทย)',
  statement_type: 'PL',
  description: 'งบกำไรขาดทุนตามมาตรฐานการบัญชีไทย',
  is_default: true,
  line_items: [
    { line_code: 'REV',       line_name: 'รายได้รวม',                  level: 0, line_order: 1,  data_type: 'total',      required: false, formula: 'REV_SALES+REV_OTHER' },
    { line_code: 'REV_SALES', line_name: 'รายได้จากการขาย',             level: 1, line_order: 2,  data_type: 'input',      required: true  },
    { line_code: 'REV_OTHER', line_name: 'รายได้อื่น',                  level: 1, line_order: 3,  data_type: 'input',      required: false },
    { line_code: 'COGS',      line_name: 'ต้นทุนขาย',                   level: 0, line_order: 4,  data_type: 'input',      required: true,  validation: { allowNegative: false } },
    { line_code: 'GP',        line_name: 'กำไรขั้นต้น',                  level: 0, line_order: 5,  data_type: 'calculated', required: false, formula: 'REV_SALES-COGS' },
    { line_code: 'OPEX',      line_name: 'ค่าใช้จ่ายในการดำเนินงาน',    level: 0, line_order: 6,  data_type: 'subtotal',   required: false },
    { line_code: 'SELL_EXP',  line_name: 'ค่าใช้จ่ายในการขาย',          level: 1, line_order: 7,  data_type: 'input',      required: false },
    { line_code: 'ADMIN_EXP', line_name: 'ค่าใช้จ่ายบริหารทั่วไป',      level: 1, line_order: 8,  data_type: 'input',      required: false },
    { line_code: 'DEPR',      line_name: 'ค่าเสื่อมราคา',               level: 1, line_order: 9,  data_type: 'input',      required: false },
    { line_code: 'EBIT',      line_name: 'กำไรก่อนดอกเบี้ยและภาษี',     level: 0, line_order: 10, data_type: 'calculated', required: false, formula: 'GP-OPEX' },
    { line_code: 'INT_EXP',   line_name: 'ดอกเบี้ยจ่าย',                level: 1, line_order: 11, data_type: 'input',      required: false },
    { line_code: 'EBT',       line_name: 'กำไรก่อนภาษี',                level: 0, line_order: 12, data_type: 'calculated', required: false, formula: 'EBIT-INT_EXP' },
    { line_code: 'TAX',       line_name: 'ภาษีเงินได้นิติบุคคล',         level: 1, line_order: 13, data_type: 'input',      required: false },
    { line_code: 'NET_PROFIT',line_name: 'กำไรสุทธิ',                   level: 0, line_order: 14, data_type: 'total',      required: false, formula: 'EBT-TAX' },
  ],
}

const QUICK_BS_TEMPLATE: Omit<StatementTemplate, 'id' | 'created_at'> = {
  template_name: 'Thai Standard Balance Sheet (มาตรฐานไทย)',
  statement_type: 'BS',
  description: 'งบดุลตามมาตรฐานการบัญชีไทย',
  is_default: true,
  line_items: [
    { line_code: 'ASSETS',   line_name: 'สินทรัพย์รวม',            level: 0, line_order: 1,  data_type: 'total',    required: false, formula: 'CA+NCA' },
    { line_code: 'CA',       line_name: 'สินทรัพย์หมุนเวียน',       level: 0, line_order: 2,  data_type: 'subtotal', required: false },
    { line_code: 'CASH',     line_name: 'เงินสดและรายการเทียบเท่า', level: 1, line_order: 3,  data_type: 'input',    required: true  },
    { line_code: 'AR',       line_name: 'ลูกหนี้การค้า',             level: 1, line_order: 4,  data_type: 'input',    required: false },
    { line_code: 'INV',      line_name: 'สินค้าคงเหลือ',             level: 1, line_order: 5,  data_type: 'input',    required: false },
    { line_code: 'NCA',      line_name: 'สินทรัพย์ไม่หมุนเวียน',    level: 0, line_order: 6,  data_type: 'subtotal', required: false },
    { line_code: 'PPE',      line_name: 'ที่ดินอาคารอุปกรณ์-สุทธิ', level: 1, line_order: 7,  data_type: 'input',    required: false },
    { line_code: 'INTANG',   line_name: 'สินทรัพย์ไม่มีตัวตน',       level: 1, line_order: 8,  data_type: 'input',    required: false },
    { line_code: 'LIAB',     line_name: 'หนี้สินรวม',                level: 0, line_order: 9,  data_type: 'total',    required: false, formula: 'CL+NCL' },
    { line_code: 'CL',       line_name: 'หนี้สินหมุนเวียน',          level: 0, line_order: 10, data_type: 'subtotal', required: false },
    { line_code: 'AP',       line_name: 'เจ้าหนี้การค้า',             level: 1, line_order: 11, data_type: 'input',    required: false },
    { line_code: 'ST_LOAN',  line_name: 'เงินกู้ระยะสั้น',            level: 1, line_order: 12, data_type: 'input',    required: false },
    { line_code: 'NCL',      line_name: 'หนี้สินไม่หมุนเวียน',       level: 0, line_order: 13, data_type: 'subtotal', required: false },
    { line_code: 'LT_LOAN',  line_name: 'เงินกู้ระยะยาว',             level: 1, line_order: 14, data_type: 'input',    required: false },
    { line_code: 'EQUITY',   line_name: 'ส่วนของผู้ถือหุ้น',           level: 0, line_order: 15, data_type: 'subtotal', required: false },
    { line_code: 'PAID_CAP', line_name: 'ทุนเรือนหุ้น',               level: 1, line_order: 16, data_type: 'input',    required: false },
    { line_code: 'RETAINED', line_name: 'กำไรสะสม',                   level: 1, line_order: 17, data_type: 'input',    required: false },
  ],
}

const QUICK_CF_TEMPLATE: Omit<StatementTemplate, 'id' | 'created_at'> = {
  template_name: 'Thai Standard Cash Flow (มาตรฐานไทย)',
  statement_type: 'CF',
  description: 'งบกระแสเงินสดตามมาตรฐานการบัญชีไทย',
  is_default: true,
  line_items: [
    { line_code: 'CFO',       line_name: 'เงินสดจากกิจกรรมดำเนินงาน',  level: 0, line_order: 1,  data_type: 'subtotal', required: false },
    { line_code: 'NET_INC',   line_name: 'กำไรสุทธิ',                   level: 1, line_order: 2,  data_type: 'input',    required: true  },
    { line_code: 'ADJ_DEPR',  line_name: 'บวก: ค่าเสื่อมราคา',           level: 1, line_order: 3,  data_type: 'input',    required: false },
    { line_code: 'CHG_AR',    line_name: 'การเปลี่ยนแปลง: ลูกหนี้',      level: 1, line_order: 4,  data_type: 'input',    required: false },
    { line_code: 'CHG_INV',   line_name: 'การเปลี่ยนแปลง: สินค้า',       level: 1, line_order: 5,  data_type: 'input',    required: false },
    { line_code: 'CHG_AP',    line_name: 'การเปลี่ยนแปลง: เจ้าหนี้',     level: 1, line_order: 6,  data_type: 'input',    required: false },
    { line_code: 'CFI',       line_name: 'เงินสดจากกิจกรรมลงทุน',        level: 0, line_order: 7,  data_type: 'subtotal', required: false },
    { line_code: 'CAPEX',     line_name: 'ซื้อสินทรัพย์ถาวร',             level: 1, line_order: 8,  data_type: 'input',    required: false },
    { line_code: 'INVEST',    line_name: 'เงินลงทุน',                     level: 1, line_order: 9,  data_type: 'input',    required: false },
    { line_code: 'CFF',       line_name: 'เงินสดจากกิจกรรมจัดหาเงิน',    level: 0, line_order: 10, data_type: 'subtotal', required: false },
    { line_code: 'LOAN_PROC', line_name: 'รับเงินกู้',                    level: 1, line_order: 11, data_type: 'input',    required: false },
    { line_code: 'LOAN_REPA', line_name: 'ชำระเงินกู้',                   level: 1, line_order: 12, data_type: 'input',    required: false },
    { line_code: 'DIVIDEND',  line_name: 'จ่ายเงินปันผล',                 level: 1, line_order: 13, data_type: 'input',    required: false },
    { line_code: 'NET_CF',    line_name: 'เงินสดสุทธิ',                   level: 0, line_order: 14, data_type: 'total',    required: false, formula: 'CFO+CFI+CFF' },
    { line_code: 'BEG_CASH',  line_name: 'เงินสดต้นงวด',                  level: 0, line_order: 15, data_type: 'input',    required: false },
    { line_code: 'END_CASH',  line_name: 'เงินสดปลายงวด',                level: 0, line_order: 16, data_type: 'total',    required: false, formula: 'NET_CF+BEG_CASH' },
  ],
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: string }) {
  return ReactDOM.createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, minWidth: 280 }}>
      <div className={`alert alert-${type} shadow-lg d-flex align-items-center gap-2 py-2 px-3 mb-0`}>
        <i className={`bi bi-${type === 'success' ? 'check-circle' : type === 'danger' ? 'x-circle' : 'info-circle'}`}></i>
        <span className="small">{msg}</span>
      </div>
    </div>,
    document.body
  )
}


// ─── Main Component ───────────────────────────────────────────────────────────
export default function DIM() {
  const { tenantId } = useTenant()

  // ── Data ──────────────────────────────────────────────────────────────
  const [dimensions, setDimensions]   = useState<Dimension[]>([])
  const [templates, setTemplates]     = useState<StatementTemplate[]>([])
  const [hierarchy, setHierarchy]     = useState<HierarchyNode[]>([])
  const [selectedDim, setSelectedDim] = useState<Dimension | null>(null)
  const [loading, setLoading]         = useState(false)

  // ── Tab ───────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'dims' | 'hierarchy' | 'templates' | 'setup'>('dims')

  // ── Dimension form ────────────────────────────────────────────────────
  const [dimForm, setDimForm] = useState<Partial<Dimension>>({ dimension_type: 'custom', is_active: true })
  const [dimEditing, setDimEditing] = useState(false)

  // ── Hierarchy form ────────────────────────────────────────────────────
  const [nodeForm, setNodeForm] = useState<Partial<HierarchyNode>>({ level: 0, sort_order: 0, is_leaf: true })
  const [nodeEditing, setNodeEditing] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())

  // ── Template state ────────────────────────────────────────────────────
  const [selectedTemplate, setSelectedTemplate] = useState<StatementTemplate | null>(null)
  const [tmplForm, setTmplForm] = useState<Partial<StatementTemplate>>({ statement_type: 'PL', is_default: false, line_items: [] })
  const [tmplEditing, setTmplEditing] = useState(false)
  const [lineItemForm, setLineItemForm] = useState<Partial<TemplateLineItem>>({ level: 0, line_order: 1, data_type: 'input', required: false })

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const toastTimer = useRef<any>(null)
  function showToast(msg: string, type = 'success') {
    setToast({ msg, type }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  // ── Filters ───────────────────────────────────────────────────────────
  const [dimSearch, setDimSearch]       = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [tmplFilter, setTmplFilter]     = useState<'ALL' | 'PL' | 'BS' | 'CF'>('ALL')

  // ─── Load ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const [dimRes, tmplRes] = await Promise.all([
        api.get('/dim/dimensions?active_only=false').catch(() => ({ data: [] })),
        api.get('/dim/templates').catch(() => ({ data: [] })),
      ])
      setDimensions(Array.isArray(dimRes.data) ? dimRes.data : [])
      setTemplates(Array.isArray(tmplRes.data) ? tmplRes.data : [])
    } catch { showToast('Failed to load data', 'danger') }
    setLoading(false)
  }, [tenantId])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── Load hierarchy when dim selected ─────────────────────────────────
  const loadHierarchy = useCallback(async (dim: Dimension) => {
    if (!dim.dimension_code) return
    try {
      const res = await api.get(`/dim/dimensions/${dim.dimension_code}/hierarchy`)
      setHierarchy(Array.isArray(res.data) ? res.data : [])
    } catch { setHierarchy([]) }
  }, [])

  function selectDimForHierarchy(dim: Dimension) {
    setSelectedDim(dim); loadHierarchy(dim); setTab('hierarchy')
  }

  // ─── Dimension CRUD ───────────────────────────────────────────────────
  async function saveDimension() {
    if (!dimForm.dimension_code || !dimForm.dimension_name) { showToast('Code and Name are required', 'danger'); return }
    try {
      const res = await api.post('/dim/dimensions', { ...dimForm, is_active: dimForm.is_active !== false })
      setDimensions(prev => {
        const idx = prev.findIndex(d => d.dimension_code === res.data.dimension_code)
        if (idx >= 0) { const c = [...prev]; c[idx] = res.data; return c }
        return [...prev, res.data]
      })
      showToast(dimEditing ? 'Dimension updated' : 'Dimension created')
      resetDimForm()
    } catch (e: any) { showToast(e?.response?.data?.message || 'Save failed', 'danger') }
  }

  function resetDimForm() { setDimForm({ dimension_type: 'custom', is_active: true }); setDimEditing(false) }

  function editDim(d: Dimension) {
    setDimForm({ ...d }); setDimEditing(true)
    document.getElementById('dim-form-top')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function toggleDimActive(d: Dimension) {
    try {
      const res = await api.post('/dim/dimensions', { ...d, is_active: !d.is_active })
      setDimensions(prev => prev.map(x => x.dimension_code === d.dimension_code ? res.data : x))
      showToast(`Dimension ${!d.is_active ? 'activated' : 'deactivated'}`)
    } catch (e: any) { showToast(e?.response?.data?.message || 'Update failed', 'danger') }
  }

  // ─── Hierarchy CRUD ───────────────────────────────────────────────────
  async function saveNode() {
    if (!selectedDim || !nodeForm.node_code || !nodeForm.node_name) { showToast('Node code and name are required', 'danger'); return }
    try {
      const res = await api.post(`/dim/dimensions/${selectedDim.dimension_code}/hierarchy`, {
        node_code: nodeForm.node_code,
        node_name: nodeForm.node_name,
        parent_code: nodeForm.parent_code || null,
        level: nodeForm.level || 0,
        sort_order: nodeForm.sort_order || 0,
        is_leaf: nodeForm.is_leaf !== false,
        metadata: nodeForm.metadata || null,
      })
      setHierarchy(prev => {
        const idx = prev.findIndex(n => n.node_code === res.data.node_code)
        if (idx >= 0) { const c = [...prev]; c[idx] = res.data; return c }
        return [...prev, res.data]
      })
      showToast(nodeEditing ? 'Node updated' : 'Node added')
      resetNodeForm()
    } catch (e: any) { showToast(e?.response?.data?.message || 'Save failed', 'danger') }
  }

  function resetNodeForm() { setNodeForm({ level: 0, sort_order: 0, is_leaf: true }); setNodeEditing(null) }

  function editNode(n: HierarchyNode) { setNodeForm({ ...n }); setNodeEditing(n.node_code) }

  async function deleteNode(nodeCode: string) {
    if (!selectedDim || !confirm(`Delete node "${nodeCode}"?`)) return
    try {
      await api.delete(`/dim/dimensions/${selectedDim.dimension_code}/hierarchy/${nodeCode}`)
      setHierarchy(prev => prev.filter(n => n.node_code !== nodeCode))
      showToast('Node deleted', 'warning')
    } catch (e: any) { showToast(e?.response?.data?.message || 'Delete failed', 'danger') }
  }

  // ─── Template CRUD ────────────────────────────────────────────────────
  async function saveTemplate() {
    if (!tmplForm.template_name || !tmplForm.statement_type) { showToast('Name and type are required', 'danger'); return }
    try {
      const body = { ...tmplForm, line_items: tmplForm.line_items || [], tenant_id: tenantId }
      const res = await api.post('/dim/templates', body)
      setTemplates(prev => {
        const idx = prev.findIndex(t => t.id === res.data.id)
        if (idx >= 0) { const c = [...prev]; c[idx] = res.data; return c }
        return [...prev, res.data]
      })
      showToast(tmplEditing ? 'Template updated' : 'Template created')
      resetTmplForm()
    } catch (e: any) { showToast(e?.response?.data?.message || 'Save failed', 'danger') }
  }

  function resetTmplForm() {
    setTmplForm({ statement_type: 'PL', is_default: false, line_items: [] }); setTmplEditing(false); setSelectedTemplate(null)
  }

  function editTemplate(t: StatementTemplate) {
    setTmplForm({ ...t, line_items: Array.isArray(t.line_items) ? [...t.line_items] : [] })
    setSelectedTemplate(t); setTmplEditing(true)
    document.getElementById('tmpl-form-top')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function deleteTemplate(id?: string) {
    if (!id || !confirm('Delete this template?')) return
    try {
      await api.delete(`/dim/templates/${id}`)
      setTemplates(prev => prev.filter(t => t.id !== id))
      if (selectedTemplate?.id === id) resetTmplForm()
      showToast('Template deleted', 'warning')
    } catch (e: any) { showToast(e?.response?.data?.message || 'Delete failed', 'danger') }
  }

  function addLineItem() {
    if (!lineItemForm.line_code || !lineItemForm.line_name) { showToast('Line code and name are required', 'danger'); return }
    const existing = tmplForm.line_items || []
    const newItem: TemplateLineItem = {
      line_code:    lineItemForm.line_code!,
      line_name:    lineItemForm.line_name!,
      parent_code:  lineItemForm.parent_code,
      level:        lineItemForm.level ?? 0,
      line_order:   lineItemForm.line_order ?? existing.length + 1,
      data_type:    lineItemForm.data_type ?? 'input',
      formula:      lineItemForm.formula,
      required:     lineItemForm.required ?? false,
      default_value:lineItemForm.default_value,
    }
    setTmplForm(prev => ({ ...prev, line_items: [...(prev.line_items || []), newItem] }))
    setLineItemForm({ level: 0, line_order: existing.length + 2, data_type: 'input', required: false })
  }

  function removeLineItem(code: string) {
    setTmplForm(prev => ({ ...prev, line_items: (prev.line_items || []).filter(l => l.line_code !== code) }))
  }

  function moveLineItem(code: string, dir: -1 | 1) {
    setTmplForm(prev => {
      const items = [...(prev.line_items || [])]
      const idx = items.findIndex(l => l.line_code === code)
      if (idx < 0) return prev
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= items.length) return prev
      ;[items[idx], items[newIdx]] = [items[newIdx], items[idx]]
      return { ...prev, line_items: items.map((l, i) => ({ ...l, line_order: i + 1 })) }
    })
  }

  // ─── Quick Setup ──────────────────────────────────────────────────────
  const [setupLoading, setSetupLoading] = useState(false)

  async function runQuickSetup() {
    if (!confirm('สร้าง Dimensions มาตรฐานและ Statement Templates ทั้งหมด? (จะไม่ทับข้อมูลที่มีอยู่แล้ว)')) return
    setSetupLoading(true)
    let created = 0; let skipped = 0
    try {
      for (const d of QUICK_DIMS) {
        try { await api.post('/dim/dimensions', d); created++ } catch { skipped++ }
      }
      for (const t of [QUICK_PL_TEMPLATE, QUICK_BS_TEMPLATE, QUICK_CF_TEMPLATE]) {
        try { await api.post('/dim/templates', { ...t, tenant_id: tenantId }); created++ } catch { skipped++ }
      }
      showToast(`Quick Setup done — ${created} created, ${skipped} skipped`)
      await loadAll(); setTab('dims')
    } catch (e: any) { showToast('Setup failed: ' + e.message, 'danger') }
    setSetupLoading(false)
  }

  // ─── Derived data ─────────────────────────────────────────────────────
  const filteredDims = dimensions.filter(d => {
    if (!showInactive && !d.is_active) return false
    if (dimSearch) {
      const q = dimSearch.toLowerCase()
      return d.dimension_code.toLowerCase().includes(q) || d.dimension_name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q)
    }
    return true
  })
  const filteredTemplates = templates.filter(t => tmplFilter === 'ALL' || t.statement_type === tmplFilter)

  // ─── Hierarchy tree renderer ──────────────────────────────────────────
  function buildTree(nodes: HierarchyNode[], parentCode: string | null = null): HierarchyNode[] {
    return nodes.filter(n => (n.parent_code ?? null) === parentCode).sort((a, b) => a.sort_order - b.sort_order)
  }

  function HierarchyTree({ nodes, parentCode = null, depth = 0 }: { nodes: HierarchyNode[]; parentCode?: string | null; depth?: number }) {
    const children = buildTree(nodes, parentCode)
    if (children.length === 0) return null
    return (
      <ul className="list-unstyled mb-0" style={{ paddingLeft: depth === 0 ? 0 : 20 }}>
        {children.map(n => {
          const hasChildren = nodes.some(x => x.parent_code === n.node_code)
          const expanded = expandedNodes.has(n.node_code)
          return (
            <li key={n.node_code} className="py-1">
              <div className="d-flex align-items-center gap-2">
                {hasChildren ? (
                  <button className="btn btn-link btn-sm p-0 text-muted" style={{ width: 16 }}
                    onClick={() => setExpandedNodes(prev => { const s = new Set(prev); s.has(n.node_code) ? s.delete(n.node_code) : s.add(n.node_code); return s })}>
                    <i className={`bi bi-chevron-${expanded ? 'down' : 'right'} small`}></i>
                  </button>
                ) : <span style={{ width: 16, display: 'inline-block' }}></span>}
                <span className={`badge bg-${n.is_leaf ? 'light text-dark border' : 'secondary'} me-1`} style={{ fontSize: '0.65rem' }}>L{n.level}</span>
                <code className="small text-primary">{n.node_code}</code>
                <span className="small">{n.node_name}</span>
                {!n.is_leaf && <span className="badge bg-info" style={{ fontSize: '0.6rem' }}>Group</span>}
                <div className="ms-auto d-flex gap-1">
                  <button className="btn btn-link btn-sm p-0 text-secondary" onClick={() => editNode(n)}><i className="bi bi-pencil small"></i></button>
                  <button className="btn btn-link btn-sm p-0 text-danger" onClick={() => deleteNode(n.node_code)}><i className="bi bi-trash small"></i></button>
                </div>
              </div>
              {hasChildren && expanded && <HierarchyTree nodes={nodes} parentCode={n.node_code} depth={depth + 1} />}
            </li>
          )
        })}
      </ul>
    )
  }

  // ──────────────────────────────────────────────────────────────────────
  return (
    <>
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ─── Page Header ─────────────────────────────────────────────── */}
      <div className="d-flex justify-content-between align-items-start mb-3 px-1">
        <div>
          <h2 className="mb-0 fw-bold" style={{ color: '#1a3c5e' }}>
            <i className="bi bi-diagram-3 me-2 text-primary"></i>Dimension Management (DIM)
          </h2>
          <small className="text-muted">จัดการมิติข้อมูล โครงสร้าง Hierarchy และ Statement Templates สำหรับงาน CFO</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={loadAll} disabled={loading}>
            <i className={`bi bi-arrow-clockwise me-1 ${loading ? 'spin' : ''}`}></i>Refresh
          </button>
          <button className="btn btn-warning btn-sm" onClick={() => setTab('setup')}>
            <i className="bi bi-lightning-fill me-1"></i>Quick Setup
          </button>
        </div>
      </div>

      {/* ─── KPI Strip ───────────────────────────────────────────────── */}
      <div className="row g-3 mb-3">
        {[
          { label: 'Dimensions',          val: dimensions.length,                         icon: 'diagram-3',         color: 'primary' },
          { label: 'Active Dimensions',   val: dimensions.filter(d => d.is_active).length, icon: 'check-circle',      color: 'success' },
          { label: 'Statement Templates', val: templates.length,                           icon: 'file-earmark-ruled', color: 'info'    },
          { label: 'Default Templates',   val: templates.filter(t => t.is_default).length, icon: 'star-fill',         color: 'warning' },
        ].map(k => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className={`card border-${k.color} h-100`}>
              <div className="card-body d-flex align-items-center gap-3 py-3">
                <div className={`text-bg-${k.color} rounded-3 d-flex align-items-center justify-content-center`} style={{ width: 46, height: 46, fontSize: 20 }}>
                  <i className={`bi bi-${k.icon}`}></i>
                </div>
                <div>
                  <div className="fw-bold fs-4 lh-1">{loading ? <span className="spinner-border spinner-border-sm"></span> : k.val}</div>
                  <small className="text-muted">{k.label}</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Main Card ────────────────────────────────────────────────── */}
      <div className="card shadow-sm">
        <div className="card-header" style={{ background: 'linear-gradient(135deg,#1a6fc7,#0d47a1)', color: '#fff', padding: '0 1rem' }}>
          <ul className="nav nav-tabs border-0" style={{ marginBottom: -1 }}>
            {[
              { id: 'dims',      label: 'Dimensions',         icon: 'diagram-3'          },
              { id: 'hierarchy', label: 'Hierarchy',           icon: 'diagram-2'          },
              { id: 'templates', label: 'Statement Templates', icon: 'file-earmark-ruled' },
              { id: 'setup',     label: 'Quick Setup',         icon: 'lightning-fill'     },
            ].map(t => (
              <li className="nav-item" key={t.id}>
                <button
                  className={`nav-link border-0 ${tab === t.id ? 'active text-primary fw-bold' : 'text-white'}`}
                  style={{ background: tab === t.id ? '#fff' : 'transparent', borderRadius: '4px 4px 0 0', marginTop: 4 }}
                  onClick={() => setTab(t.id as any)}>
                  <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-body">

          {/* ══ Tab 1: Dimensions ════════════════════════════════════════ */}
          {tab === 'dims' && (
            <div className="row g-3">
              {/* Left: Form */}
              <div className="col-lg-4">
                <div className="card border-primary bg-primary bg-opacity-5 h-100" id="dim-form-top">
                  <div className="card-header py-2 bg-primary text-white">
                    <strong><i className={`bi bi-${dimEditing ? 'pencil' : 'plus-circle'} me-1`}></i>{dimEditing ? 'Edit Dimension' : 'New Dimension'}</strong>
                  </div>
                  <div className="card-body">
                    <div className="mb-2">
                      <label className="form-label small fw-semibold text-muted mb-1">Dimension Code *</label>
                      <input className="form-control form-control-sm" placeholder="เช่น DEPT, COSTCTR, PROJECT"
                        value={dimForm.dimension_code || ''} disabled={dimEditing}
                        onChange={e => setDimForm(p => ({ ...p, dimension_code: e.target.value.toUpperCase().replace(/\s/g, '_') }))} />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-semibold text-muted mb-1">ชื่อ Dimension *</label>
                      <input className="form-control form-control-sm" placeholder="เช่น แผนก, ศูนย์ต้นทุน"
                        value={dimForm.dimension_name || ''}
                        onChange={e => setDimForm(p => ({ ...p, dimension_name: e.target.value }))} />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-semibold text-muted mb-1">ประเภท</label>
                      <select className="form-select form-select-sm" value={dimForm.dimension_type || 'custom'}
                        onChange={e => setDimForm(p => ({ ...p, dimension_type: e.target.value as any }))}>
                        {DIM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-semibold text-muted mb-1">คำอธิบาย</label>
                      <textarea className="form-control form-control-sm" rows={2} placeholder="รายละเอียดของ dimension นี้"
                        value={dimForm.description || ''}
                        onChange={e => setDimForm(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="form-check mb-3">
                      <input type="checkbox" className="form-check-input" id="dim-active"
                        checked={dimForm.is_active !== false}
                        onChange={e => setDimForm(p => ({ ...p, is_active: e.target.checked }))} />
                      <label className="form-check-label small" htmlFor="dim-active">Active</label>
                    </div>
                    <div className="d-flex gap-2">
                      <button className="btn btn-primary btn-sm flex-grow-1" onClick={saveDimension}>
                        <i className="bi bi-check-lg me-1"></i>{dimEditing ? 'Update' : 'Create Dimension'}
                      </button>
                      {dimEditing && <button className="btn btn-outline-secondary btn-sm" onClick={resetDimForm}>Cancel</button>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Table */}
              <div className="col-lg-8">
                <div className="d-flex flex-wrap gap-2 mb-2 align-items-center">
                  <input type="search" className="form-control form-control-sm" style={{ maxWidth: 220 }}
                    placeholder="🔍 ค้นหา dimension…" value={dimSearch} onChange={e => setDimSearch(e.target.value)} />
                  <div className="form-check form-check-inline ms-2 mb-0">
                    <input type="checkbox" className="form-check-input" id="show-inactive"
                      checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                    <label className="form-check-label small" htmlFor="show-inactive">Show Inactive</label>
                  </div>
                  <span className="ms-auto text-muted small">{filteredDims.length} dimensions</span>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover border mb-0">
                    <thead className="table-dark">
                      <tr><th>Code</th><th>ชื่อ</th><th>ประเภท</th><th className="text-center">Status</th><th className="text-center">Hierarchy</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filteredDims.length === 0 && (
                        <tr><td colSpan={6} className="text-center text-muted py-4">
                          ยังไม่มี Dimension — กรอกฟอร์มด้านซ้ายหรือใช้{' '}
                          <button className="btn btn-link btn-sm p-0" onClick={() => setTab('setup')}>Quick Setup</button>
                        </td></tr>
                      )}
                      {filteredDims.map(d => {
                        const typeInfo = DIM_TYPES.find(t => t.value === d.dimension_type) || DIM_TYPES[5]
                        return (
                          <tr key={d.dimension_code} className={!d.is_active ? 'opacity-50' : ''}>
                            <td><code className="text-primary fw-semibold">{d.dimension_code}</code></td>
                            <td>
                              <div className="fw-semibold small">{d.dimension_name}</div>
                              {d.description && <div className="text-muted" style={{ fontSize: '0.7rem' }}>{d.description}</div>}
                            </td>
                            <td><span className={`badge bg-${typeInfo.color}`} style={{ fontSize: '0.65rem' }}><i className={`bi bi-${typeInfo.icon} me-1`}></i>{d.dimension_type}</span></td>
                            <td className="text-center">
                              <span className={`badge ${d.is_active ? 'bg-success' : 'bg-secondary'}`} style={{ fontSize: '0.65rem' }}>{d.is_active ? 'Active' : 'Inactive'}</span>
                            </td>
                            <td className="text-center">
                              <button className="btn btn-link btn-sm p-0 text-info" onClick={() => selectDimForHierarchy(d)}>
                                <i className="bi bi-diagram-2 me-1"></i>Edit Tree
                              </button>
                            </td>
                            <td>
                              <div className="d-flex gap-1 justify-content-end">
                                <button className="btn btn-outline-primary btn-sm py-0" onClick={() => editDim(d)}><i className="bi bi-pencil"></i></button>
                                <button className={`btn ${d.is_active ? 'btn-outline-warning' : 'btn-outline-success'} btn-sm py-0`} onClick={() => toggleDimActive(d)}>
                                  <i className={`bi bi-${d.is_active ? 'pause' : 'play'}`}></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Type legend */}
                <div className="mt-3 p-2 bg-light rounded-2 d-flex flex-wrap gap-1">
                  {DIM_TYPES.map(t => (
                    <span key={t.value} className={`badge bg-${t.color} bg-opacity-75`} style={{ fontSize: '0.65rem' }}>
                      <i className={`bi bi-${t.icon} me-1`}></i>{t.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ Tab 2: Hierarchy ══════════════════════════════════════════ */}
          {tab === 'hierarchy' && (
            <div className="row g-3">
              {/* Dimension selector */}
              <div className="col-12">
                <div className="d-flex flex-wrap gap-2 align-items-center bg-light rounded-2 p-2 mb-0">
                  <span className="small fw-semibold text-muted">เลือก Dimension:</span>
                  {dimensions.filter(d => d.is_active).map(d => (
                    <button key={d.dimension_code}
                      className={`btn btn-sm ${selectedDim?.dimension_code === d.dimension_code ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => { setSelectedDim(d); loadHierarchy(d) }}>
                      <i className={`bi bi-${DIM_TYPES.find(t => t.value === d.dimension_type)?.icon || 'sliders'} me-1`}></i>
                      {d.dimension_name}
                    </button>
                  ))}
                  {dimensions.filter(d => d.is_active).length === 0 && (
                    <span className="text-muted small">ยังไม่มี Dimension — ไปที่แท็บ Dimensions ก่อน</span>
                  )}
                </div>
              </div>

              {!selectedDim && (
                <div className="col-12">
                  <div className="alert alert-info mb-0"><i className="bi bi-info-circle me-1"></i>กรุณาเลือก Dimension ด้านบนเพื่อดู/จัดการ Hierarchy</div>
                </div>
              )}

              {selectedDim && (
                <>
                  {/* Node form */}
                  <div className="col-lg-4">
                    <div className="card border-0 bg-light">
                      <div className="card-header py-2">
                        <strong className="small"><i className={`bi bi-node-${nodeEditing ? 'minus' : 'plus'} me-1 text-primary`}></i>{nodeEditing ? 'Edit Node' : 'Add Node'} — {selectedDim.dimension_name}</strong>
                      </div>
                      <div className="card-body py-2">
                        <div className="row g-2">
                          <div className="col-6">
                            <label className="form-label small mb-0 text-muted">Node Code *</label>
                            <input className="form-control form-control-sm" placeholder="เช่น FIN, FIN-AP"
                              value={nodeForm.node_code || ''}
                              onChange={e => setNodeForm(p => ({ ...p, node_code: e.target.value.toUpperCase() }))} />
                          </div>
                          <div className="col-6">
                            <label className="form-label small mb-0 text-muted">Node Name *</label>
                            <input className="form-control form-control-sm" placeholder="เช่น การเงิน"
                              value={nodeForm.node_name || ''}
                              onChange={e => setNodeForm(p => ({ ...p, node_name: e.target.value }))} />
                          </div>
                          <div className="col-7">
                            <label className="form-label small mb-0 text-muted">Parent Code</label>
                            <select className="form-select form-select-sm" value={nodeForm.parent_code || ''}
                              onChange={e => setNodeForm(p => ({ ...p, parent_code: e.target.value || null }))}>
                              <option value="">— Root —</option>
                              {hierarchy.filter(n => !n.is_leaf).map(n => (
                                <option key={n.node_code} value={n.node_code}>{n.node_code} — {n.node_name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-2">
                            <label className="form-label small mb-0 text-muted">Level</label>
                            <input type="number" className="form-control form-control-sm" min={0} max={9}
                              value={nodeForm.level ?? 0}
                              onChange={e => setNodeForm(p => ({ ...p, level: parseInt(e.target.value) || 0 }))} />
                          </div>
                          <div className="col-3">
                            <label className="form-label small mb-0 text-muted">Order</label>
                            <input type="number" className="form-control form-control-sm" min={0}
                              value={nodeForm.sort_order ?? 0}
                              onChange={e => setNodeForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))} />
                          </div>
                          <div className="col-12">
                            <div className="form-check">
                              <input type="checkbox" className="form-check-input" id="node-leaf"
                                checked={nodeForm.is_leaf !== false}
                                onChange={e => setNodeForm(p => ({ ...p, is_leaf: e.target.checked }))} />
                              <label className="form-check-label small" htmlFor="node-leaf">Leaf node (ไม่มีลูก)</label>
                            </div>
                          </div>
                          <div className="col-12">
                            <label className="form-label small mb-0 text-muted">Metadata JSON (optional)</label>
                            <textarea className="form-control form-control-sm font-monospace" rows={2}
                              placeholder='{"budget": 500000, "manager": "สมศักดิ์"}'
                              value={typeof nodeForm.metadata === 'string' ? nodeForm.metadata : (nodeForm.metadata ? JSON.stringify(nodeForm.metadata) : '')}
                              onChange={e => setNodeForm(p => ({ ...p, metadata: e.target.value }))} />
                          </div>
                        </div>
                        <div className="d-flex gap-2 mt-2">
                          <button className="btn btn-primary btn-sm flex-grow-1" onClick={saveNode}>
                            <i className="bi bi-check-lg me-1"></i>{nodeEditing ? 'Update Node' : 'Add Node'}
                          </button>
                          {nodeEditing && <button className="btn btn-outline-secondary btn-sm" onClick={resetNodeForm}>Cancel</button>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Hierarchy tree */}
                  <div className="col-lg-8">
                    <div className="card border-0 shadow-sm">
                      <div className="card-header py-2 d-flex justify-content-between align-items-center">
                        <span className="fw-semibold small">
                          <i className="bi bi-diagram-2 me-1 text-primary"></i>Tree — <strong className="text-primary">{selectedDim.dimension_name}</strong>
                          <span className="badge bg-secondary ms-2">{hierarchy.length} nodes</span>
                        </span>
                        <button className="btn btn-outline-secondary btn-sm py-0"
                          onClick={() => setExpandedNodes(expandedNodes.size > 0 ? new Set() : new Set(hierarchy.map(n => n.node_code)))}>
                          <i className={`bi bi-${expandedNodes.size > 0 ? 'arrows-collapse' : 'arrows-expand'} me-1`}></i>
                          {expandedNodes.size > 0 ? 'Collapse' : 'Expand All'}
                        </button>
                      </div>
                      <div className="card-body py-2" style={{ minHeight: 120 }}>
                        {hierarchy.length === 0 ? (
                          <div className="text-center text-muted py-4">
                            <i className="bi bi-diagram-2 display-5 opacity-25 d-block mb-2"></i>
                            ยังไม่มี nodes — เพิ่มจากฟอร์มด้านซ้าย
                          </div>
                        ) : (
                          <HierarchyTree nodes={hierarchy} />
                        )}
                      </div>
                    </div>

                    {/* Flat table */}
                    {hierarchy.length > 0 && (
                      <div className="mt-3 table-responsive">
                        <table className="table table-sm table-bordered mb-0">
                          <thead className="table-dark"><tr><th>Node Code</th><th>Node Name</th><th>Parent</th><th>Level</th><th>Leaf?</th><th>Metadata</th><th></th></tr></thead>
                          <tbody>
                            {[...hierarchy].sort((a, b) => a.level - b.level || a.sort_order - b.sort_order).map(n => (
                              <tr key={n.node_code}>
                                <td><code className="text-primary small">{n.node_code}</code></td>
                                <td className="small">{n.node_name}</td>
                                <td><code className="small text-muted">{n.parent_code || '—'}</code></td>
                                <td className="text-center"><span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>L{n.level}</span></td>
                                <td className="text-center"><i className={`bi bi-${n.is_leaf ? 'circle-fill text-success' : 'circle text-warning'} small`}></i></td>
                                <td className="small text-muted" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {n.metadata ? JSON.stringify(n.metadata) : '—'}
                                </td>
                                <td>
                                  <div className="d-flex gap-1">
                                    <button className="btn btn-outline-primary btn-sm py-0 px-1" onClick={() => editNode(n)}><i className="bi bi-pencil small"></i></button>
                                    <button className="btn btn-outline-danger btn-sm py-0 px-1" onClick={() => deleteNode(n.node_code)}><i className="bi bi-trash small"></i></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ Tab 3: Statement Templates ════════════════════════════════ */}
          {tab === 'templates' && (
            <div className="row g-3">
              {/* Left: Form */}
              <div className="col-lg-5" id="tmpl-form-top">
                <div className="card border-success bg-success bg-opacity-5">
                  <div className="card-header py-2 bg-success text-white">
                    <strong><i className={`bi bi-${tmplEditing ? 'pencil' : 'plus-circle'} me-1`}></i>{tmplEditing ? 'Edit Template' : 'New Template'}</strong>
                  </div>
                  <div className="card-body">
                    <div className="row g-2 mb-2">
                      <div className="col-8">
                        <label className="form-label small fw-semibold text-muted mb-1">Template Name *</label>
                        <input className="form-control form-control-sm" placeholder="เช่น Standard P&L Thai GAAP"
                          value={tmplForm.template_name || ''}
                          onChange={e => setTmplForm(p => ({ ...p, template_name: e.target.value }))} />
                      </div>
                      <div className="col-4">
                        <label className="form-label small fw-semibold text-muted mb-1">Statement Type *</label>
                        <select className="form-select form-select-sm" value={tmplForm.statement_type || 'PL'}
                          onChange={e => setTmplForm(p => ({ ...p, statement_type: e.target.value as any }))}>
                          {STMT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-semibold text-muted mb-1">คำอธิบาย</label>
                      <textarea className="form-control form-control-sm" rows={2}
                        value={tmplForm.description || ''}
                        onChange={e => setTmplForm(p => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="form-check mb-3">
                      <input type="checkbox" className="form-check-input" id="tmpl-default"
                        checked={tmplForm.is_default === true}
                        onChange={e => setTmplForm(p => ({ ...p, is_default: e.target.checked }))} />
                      <label className="form-check-label small" htmlFor="tmpl-default">Set as Default Template for this type</label>
                    </div>

                    {/* Line Items */}
                    <div className="border-top pt-2">
                      <div className="fw-semibold small text-muted mb-2"><i className="bi bi-list-ol me-1 text-success"></i>Line Items ({(tmplForm.line_items || []).length})</div>
                      <div className="bg-light rounded-2 p-2 mb-2">
                        <div className="row g-1 mb-1">
                          <div className="col-4">
                            <input className="form-control form-control-sm" placeholder="Line Code *"
                              value={lineItemForm.line_code || ''}
                              onChange={e => setLineItemForm(p => ({ ...p, line_code: e.target.value.toUpperCase() }))} />
                          </div>
                          <div className="col-8">
                            <input className="form-control form-control-sm" placeholder="Line Name *"
                              value={lineItemForm.line_name || ''}
                              onChange={e => setLineItemForm(p => ({ ...p, line_name: e.target.value }))} />
                          </div>
                        </div>
                        <div className="row g-1 mb-1">
                          <div className="col-4">
                            <select className="form-select form-select-sm" value={lineItemForm.data_type || 'input'}
                              onChange={e => setLineItemForm(p => ({ ...p, data_type: e.target.value as any }))}>
                              <option value="input">Input</option>
                              <option value="calculated">Calculated</option>
                              <option value="subtotal">Subtotal</option>
                              <option value="total">Total</option>
                            </select>
                          </div>
                          <div className="col-2">
                            <input type="number" className="form-control form-control-sm" placeholder="Lv" min={0} max={5}
                              value={lineItemForm.level ?? 0}
                              onChange={e => setLineItemForm(p => ({ ...p, level: parseInt(e.target.value) || 0 }))} />
                          </div>
                          <div className="col-6">
                            <input className="form-control form-control-sm" placeholder="Parent Code (optional)"
                              value={lineItemForm.parent_code || ''}
                              onChange={e => setLineItemForm(p => ({ ...p, parent_code: e.target.value.toUpperCase() || undefined }))} />
                          </div>
                        </div>
                        {(lineItemForm.data_type === 'calculated' || lineItemForm.data_type === 'total') && (
                          <input className="form-control form-control-sm mb-1" placeholder="Formula (เช่น REV_SALES-COGS)"
                            value={lineItemForm.formula || ''}
                            onChange={e => setLineItemForm(p => ({ ...p, formula: e.target.value }))} />
                        )}
                        <div className="d-flex align-items-center gap-2">
                          <div className="form-check mb-0">
                            <input type="checkbox" className="form-check-input" id="li-req"
                              checked={lineItemForm.required === true}
                              onChange={e => setLineItemForm(p => ({ ...p, required: e.target.checked }))} />
                            <label className="form-check-label small" htmlFor="li-req">Required</label>
                          </div>
                          <button className="btn btn-success btn-sm py-0 ms-auto" onClick={addLineItem}>
                            <i className="bi bi-plus-lg me-1"></i>Add Row
                          </button>
                        </div>
                      </div>

                      {(tmplForm.line_items || []).length > 0 && (
                        <div className="table-responsive" style={{ maxHeight: 300, overflowY: 'auto' }}>
                          <table className="table table-sm mb-0" style={{ fontSize: '0.72rem' }}>
                            <thead className="table-dark sticky-top"><tr><th>#</th><th>Code</th><th>Name</th><th>Type</th><th>Lv</th><th></th></tr></thead>
                            <tbody>
                              {(tmplForm.line_items || []).map((li, i) => (
                                <tr key={li.line_code}>
                                  <td className="text-muted">{i + 1}</td>
                                  <td><code style={{ fontSize: '0.68rem', paddingLeft: li.level * 8 }}>{li.line_code}</code></td>
                                  <td style={{ paddingLeft: li.level * 8 }}>{li.line_name}{li.formula && <code className="ms-1 text-muted" style={{ fontSize: '0.6rem' }}>={li.formula}</code>}</td>
                                  <td><span className={`badge bg-${DATA_TYPE_COLORS[li.data_type]}`} style={{ fontSize: '0.6rem' }}>{li.data_type}</span>{li.required && <span className="badge bg-danger ms-1" style={{ fontSize: '0.6rem' }}>req</span>}</td>
                                  <td className="text-center">{li.level}</td>
                                  <td>
                                    <div className="d-flex gap-0">
                                      <button className="btn btn-link btn-sm p-0 text-muted" onClick={() => moveLineItem(li.line_code, -1)}><i className="bi bi-arrow-up small"></i></button>
                                      <button className="btn btn-link btn-sm p-0 text-muted" onClick={() => moveLineItem(li.line_code, 1)}><i className="bi bi-arrow-down small"></i></button>
                                      <button className="btn btn-link btn-sm p-0 text-danger" onClick={() => removeLineItem(li.line_code)}><i className="bi bi-x small"></i></button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="d-flex gap-2 mt-3">
                      <button className="btn btn-success btn-sm flex-grow-1" onClick={saveTemplate}>
                        <i className="bi bi-check-lg me-1"></i>{tmplEditing ? 'Update Template' : 'Create Template'}
                      </button>
                      {tmplEditing && <button className="btn btn-outline-secondary btn-sm" onClick={resetTmplForm}>Cancel</button>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Template list */}
              <div className="col-lg-7">
                <div className="d-flex gap-2 mb-2 align-items-center flex-wrap">
                  <div className="btn-group btn-group-sm">
                    {(['ALL', 'PL', 'BS', 'CF'] as const).map(s => (
                      <button key={s} className={`btn ${tmplFilter === s ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setTmplFilter(s)}>
                        {s === 'ALL' ? 'ทั้งหมด' : <><i className={`bi bi-${STMT_ICONS[s]} me-1`}></i>{s}</>}
                      </button>
                    ))}
                  </div>
                  <span className="ms-auto text-muted small">{filteredTemplates.length} templates</span>
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="text-center py-5 text-muted">
                    <i className="bi bi-file-earmark-x display-4 opacity-25 d-block mb-2"></i>
                    ยังไม่มี Template — กรอกฟอร์มด้านซ้ายหรือใช้{' '}
                    <button className="btn btn-link btn-sm p-0" onClick={() => setTab('setup')}>Quick Setup</button>
                  </div>
                ) : (
                  <div className="row g-2">
                    {filteredTemplates.map(t => {
                      const lineItems = Array.isArray(t.line_items) ? t.line_items : []
                      return (
                        <div key={t.id} className="col-12">
                          <div className={`card border-${selectedTemplate?.id === t.id ? 'success border-2' : 'light'} shadow-sm`}>
                            <div className="card-body py-2 px-3">
                              <div className="d-flex align-items-start gap-2">
                                <div className={`text-bg-${t.statement_type === 'PL' ? 'primary' : t.statement_type === 'BS' ? 'success' : 'warning'} rounded-2 d-flex align-items-center justify-content-center flex-shrink-0`} style={{ width: 38, height: 38, fontSize: 18 }}>
                                  <i className={`bi bi-${STMT_ICONS[t.statement_type]}`}></i>
                                </div>
                                <div className="flex-grow-1 overflow-hidden">
                                  <div className="d-flex align-items-center gap-1 flex-wrap">
                                    <span className="fw-semibold small">{t.template_name}</span>
                                    {t.is_default && <span className="badge bg-warning text-dark" style={{ fontSize: '0.6rem' }}><i className="bi bi-star-fill me-1"></i>Default</span>}
                                    <span className={`badge bg-${t.statement_type === 'PL' ? 'primary' : t.statement_type === 'BS' ? 'success' : 'warning text-dark'}`} style={{ fontSize: '0.65rem' }}>{STMT_LABELS[t.statement_type]}</span>
                                  </div>
                                  {t.description && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{t.description}</div>}
                                  <div className="mt-1 d-flex flex-wrap gap-1">
                                    {lineItems.slice(0, 7).map(li => (
                                      <span key={li.line_code} className={`badge bg-${DATA_TYPE_COLORS[li.data_type]} bg-opacity-75`} style={{ fontSize: '0.6rem' }}>{li.line_code}</span>
                                    ))}
                                    {lineItems.length > 7 && <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>+{lineItems.length - 7} more</span>}
                                    {lineItems.length === 0 && <span className="text-muted" style={{ fontSize: '0.7rem' }}>ยังไม่มี line items</span>}
                                  </div>
                                </div>
                                <div className="d-flex flex-column gap-1 flex-shrink-0">
                                  <button className="btn btn-outline-primary btn-sm py-0" onClick={() => editTemplate(t)}><i className="bi bi-pencil me-1"></i>Edit</button>
                                  <button className="btn btn-outline-danger btn-sm py-0" onClick={() => deleteTemplate(t.id)}><i className="bi bi-trash me-1"></i>Delete</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Stats */}
                <div className="mt-3 p-2 bg-light rounded-2">
                  <div className="small fw-semibold text-muted mb-1">สรุป Templates</div>
                  <div className="d-flex gap-4">
                    {STMT_TYPES.map(s => {
                      const count = templates.filter(t => t.statement_type === s).length
                      const deflt = templates.find(t => t.statement_type === s && t.is_default)
                      return (
                        <div key={s}>
                          <div className={`fw-bold text-${s === 'PL' ? 'primary' : s === 'BS' ? 'success' : 'warning'}`}>{count}</div>
                          <div className="text-muted" style={{ fontSize: '0.7rem' }}>{STMT_LABELS[s]}</div>
                          {deflt && <div className="text-warning" style={{ fontSize: '0.65rem' }}><i className="bi bi-star-fill"></i> {deflt.template_name.substring(0, 15)}{deflt.template_name.length > 15 ? '…' : ''}</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ Tab 4: Quick Setup ════════════════════════════════════════ */}
          {tab === 'setup' && (
            <div>
              <div className="alert alert-info d-flex gap-2 align-items-start">
                <i className="bi bi-lightning-fill fs-5 text-warning flex-shrink-0 mt-1"></i>
                <div>
                  <strong>Quick Setup สำหรับ CFO</strong><br />
                  <span className="small">ระบบจะสร้าง Dimensions มาตรฐาน 5 รายการและ Statement Templates ทั้ง P&L, Balance Sheet, Cash Flow ตามมาตรฐานการบัญชีไทยอัตโนมัติ ข้อมูลที่มีอยู่แล้วจะไม่ถูกเขียนทับ</span>
                </div>
              </div>

              <div className="row g-3">
                {/* Dimensions preview */}
                <div className="col-lg-5">
                  <div className="card border-primary">
                    <div className="card-header py-2 bg-primary text-white">
                      <strong><i className="bi bi-diagram-3 me-1"></i>Dimensions มาตรฐาน</strong>
                    </div>
                    <div className="card-body py-2">
                      <table className="table table-sm mb-0">
                        <thead className="table-light"><tr><th>Code</th><th>ชื่อ</th><th>Type</th></tr></thead>
                        <tbody>
                          {QUICK_DIMS.map(d => {
                            const exists = dimensions.some(x => x.dimension_code === d.dimension_code)
                            return (
                              <tr key={d.dimension_code}>
                                <td><code className="text-primary">{d.dimension_code}</code></td>
                                <td className="small">{d.dimension_name}</td>
                                <td>
                                  <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{d.dimension_type}</span>
                                  {exists && <span className="badge bg-success ms-1" style={{ fontSize: '0.6rem' }}><i className="bi bi-check"></i> มีแล้ว</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Templates preview */}
                <div className="col-lg-7">
                  <div className="card border-success">
                    <div className="card-header py-2 bg-success text-white">
                      <strong><i className="bi bi-file-earmark-ruled me-1"></i>Statement Templates มาตรฐาน (Thai GAAP)</strong>
                    </div>
                    <div className="card-body py-2">
                      {[QUICK_PL_TEMPLATE, QUICK_BS_TEMPLATE, QUICK_CF_TEMPLATE].map(t => {
                        const exists = templates.some(x => x.template_name === t.template_name)
                        return (
                          <div key={t.statement_type} className="d-flex align-items-start gap-2 mb-2 pb-2 border-bottom">
                            <div className={`text-bg-${t.statement_type === 'PL' ? 'primary' : t.statement_type === 'BS' ? 'success' : 'warning'} rounded-2 d-flex align-items-center justify-content-center flex-shrink-0`} style={{ width: 34, height: 34, fontSize: 16 }}>
                              <i className={`bi bi-${STMT_ICONS[t.statement_type]}`}></i>
                            </div>
                            <div>
                              <div className="small fw-semibold">{t.template_name}</div>
                              <div className="text-muted" style={{ fontSize: '0.7rem' }}>{t.line_items.length} line items — {t.description}</div>
                              {exists && <span className="badge bg-success" style={{ fontSize: '0.6rem' }}><i className="bi bi-check me-1"></i>มีแล้ว</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* CFO Guide */}
                <div className="col-12">
                  <div className="card border-0 bg-light">
                    <div className="card-header py-2">
                      <strong className="small"><i className="bi bi-book me-1 text-primary"></i>คู่มือ CFO — การใช้งาน Dimension Management</strong>
                    </div>
                    <div className="card-body py-2">
                      <div className="row g-3">
                        {[
                          { icon: 'diagram-3',       color: 'primary', title: '1. สร้าง Dimensions',        body: 'กำหนดมิติข้อมูล เช่น แผนก (DEPT), ศูนย์ต้นทุน (COSTCTR), โครงการ (PROJECT) เพื่อใช้ในการวิเคราะห์งบการเงิน' },
                          { icon: 'diagram-2',       color: 'success', title: '2. สร้าง Hierarchy',          body: 'กำหนดโครงสร้างลำดับชั้น เช่น ฝ่ายการเงิน → AP, AR เพื่อ Drill-down analysis และ rollup' },
                          { icon: 'file-earmark-ruled',color:'warning', title: '3. Statement Templates',      body: 'กำหนด template P&L, BS, CF พร้อม formula สำหรับ calculated items — ใช้ validate ข้อมูลก่อน import' },
                          { icon: 'graph-up-arrow',  color: 'danger',  title: '4. นำไปใช้งาน CFO',           body: 'Templates ใช้ใน Financial Statements, ETL Import validation, Budget vs Actual และ Report generation' },
                        ].map(s => (
                          <div key={s.title} className="col-md-3">
                            <div className={`border-start border-4 border-${s.color} ps-2`}>
                              <div className="fw-semibold small mb-1"><i className={`bi bi-${s.icon} me-1 text-${s.color}`}></i>{s.title}</div>
                              <div className="text-muted" style={{ fontSize: '0.75rem' }}>{s.body}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-12">
                  <div className="d-flex gap-2 flex-wrap">
                    <button className="btn btn-warning btn-lg" onClick={runQuickSetup} disabled={setupLoading}>
                      {setupLoading
                        ? <><span className="spinner-border spinner-border-sm me-2"></span>กำลังสร้าง…</>
                        : <><i className="bi bi-lightning-fill me-2"></i>เริ่ม Quick Setup ทันที</>
                      }
                    </button>
                    <button className="btn btn-outline-primary" onClick={() => setTab('dims')}>
                      <i className="bi bi-diagram-3 me-1"></i>ดู Dimensions
                    </button>
                    <button className="btn btn-outline-success" onClick={() => setTab('templates')}>
                      <i className="bi bi-file-earmark-ruled me-1"></i>ดู Templates
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
