// =============================================================
//  ThynkFlow — LeadsPage.jsx  (FIXED)
//  Fixes:
//  1. Product not removed on edit — editForm now preserves product_id
//  2. Column sorting on table headers
//  3. Unassigned leads + No product filter checkboxes
//  4. Full lead timeline log (creation → calls → followups → status changes)
// =============================================================

import React, { useEffect, useState, useCallback, useRef } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'

const Icon = ({ d, cls = '', size = 16, fill = 'none', stroke = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
    <path d={d} />
  </svg>
)

const PhoneIcon   = () => <Icon d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 013.29 5.18 2 2 0 015.27 3h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.91 10.91a16 16 0 006.18 6.18l1.27-.63a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
const WAIcon      = () => <Icon d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
const MailIcon    = () => <Icon d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6" />
const PlusIcon    = () => <Icon d="M12 5v14M5 12h14" />
const EditIcon    = () => <Icon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
const XIcon       = () => <Icon d="M18 6L6 18M6 6l12 12" />
const UploadIcon  = () => <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
const ClipIcon    = () => <Icon d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z" />
const LogIcon     = () => <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
const PackageIcon = () => <Icon d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
const SortAsc     = () => <Icon d="M3 6h18M3 12h12M3 18h6" size={12} />
const SortDesc    = () => <Icon d="M3 6h6M3 12h12M3 18h18" size={12} />

const STATUS_COLORS = {
  new:            'bg-blue-100 text-blue-800',
  hot:            'bg-red-100 text-red-800',
  warm:           'bg-orange-100 text-orange-800',
  cold:           'bg-slate-100 text-slate-700',
  converted:      'bg-green-100 text-green-800',
  not_interested: 'bg-gray-100 text-gray-600',
  call_back:      'bg-purple-100 text-purple-800',
}

function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

function SortableHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 transition-colors"
      onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        <span className="opacity-40">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </div>
    </th>
  )
}

export default function LeadsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [leads, setLeads]           = useState([])
  const [products, setProducts]     = useState([])
  const [agents, setAgents]         = useState([])
  const [settings, setSettings]     = useState({ statuses: [], sources: [], cities: [], lead_types: [] })
  const [loading, setLoading]       = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // filters
  const [search, setSearch]               = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterAgent, setFilterAgent]     = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterSchool, setFilterSchool]   = useState('')
  const [schools, setSchools]             = useState([])
  const [page, setPage]                   = useState(1)
  const [PER_PAGE, setPER_PAGE]           = useState(50)
  // FIX 2: new filter checkboxes
  const [filterUnassigned, setFilterUnassigned]   = useState(false)
  const [filterNoProduct, setFilterNoProduct]     = useState(false)
  // FIX 2: sorting
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir]     = useState('desc')

  // modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPasteModal, setShowPasteModal]   = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedLead, setSelectedLead]       = useState(null)
  const [detailTab, setDetailTab]             = useState('info')
  const [editingInfo, setEditingInfo]         = useState(false)
  const [editForm, setEditForm]               = useState({})
  const [savingEdit, setSavingEdit]           = useState(false)

  const emptyForm = {
    name: '', phone: '', email: '', source: '', city: '',
    school_name: '', lead_type: 'B2C', creation_comment: '',
    status: 'new', assigned_to: '', product_id: '',
    product_detail: '', admin_remark: '', follow_up_date: '', notes: ''
  }
  const [form, setForm]   = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [pasteText, setPasteText]         = useState('')
  const [pasteProduct, setPasteProduct]   = useState('')
  const [pasteLeadType, setPasteLeadType] = useState('B2C')
  const [pasteComment, setPasteComment]   = useState('')
  const [pasteRows, setPasteRows]         = useState([])
  const [pasteStep, setPasteStep]         = useState(1)

  const [importFile, setImportFile]   = useState(null)
  const [importRows, setImportRows]   = useState([])
  const [importStep, setImportStep]   = useState(1)
  const fileInputRef                  = useRef()

  const [commLogs, setCommLogs]       = useState([])
  const [commLoading, setCommLoading] = useState(false)
  const [commNote, setCommNote]       = useState('')
  const [commType, setCommType]       = useState('call')
  const [savingComm, setSavingComm]   = useState(false)
  // FIX 3: full timeline
  const [timeline, setTimeline]       = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  const [editingProduct, setEditingProduct]   = useState(false)
  const [productForm, setProductForm]         = useState({ product_id: '', product_detail: '' })
  const [savingProduct, setSavingProduct]     = useState(false)

  // FIX 2: sort handler
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  // client-side sort of leads array
  const sortedLeads = [...leads].sort((a, b) => {
    let va = a[sortField] || ''
    let vb = b[sortField] || ''
    if (sortField === 'created_at') {
      va = new Date(va).getTime()
      vb = new Date(vb).getTime()
    } else {
      va = String(va).toLowerCase()
      vb = String(vb).toLowerCase()
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  // client-side filter for unassigned/no-product
  const filteredLeads = sortedLeads.filter(l => {
    if (filterUnassigned && l.assigned_to) return false
    if (filterNoProduct && l.product_id) return false
    return true
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page, per_page: PER_PAGE,
        ...(search        && { search }),
        ...(filterStatus  && { status:      filterStatus }),
        ...(filterAgent   && { assigned_to: filterAgent }),
        ...(filterProduct && { product_id:  filterProduct }),
        ...(filterSchool  && { school_name: filterSchool }),
        ...(filterUnassigned && { unassigned: 'true' }),
      })
      const [leadsRes, prodRes, agentRes, settRes] = await Promise.all([
        api.get(`/leads?${params}`),
        api.get('/products/active'),
        (async () => {
          try { return await api.get('/chat/users') }
          catch { try { return await api.get('/users') } catch { return {} } }
        })(),
        api.get('/settings'),
      ])
      // interceptor returns body directly
      const body = leadsRes || {}
      let rows = [], total = 0
      if (Array.isArray(body)) {
        rows = body; total = body.length
      } else {
        rows  = body.data  || body.leads || []
        total = body.total || body.count || rows.length
      }
      setLeads(rows)
      setTotalCount(total)

      const prodBody  = prodRes || {}
      setProducts(Array.isArray(prodBody) ? prodBody : (prodBody.data || prodBody || []))

      const agentBody = agentRes || {}
      const agentList = Array.isArray(agentBody) ? agentBody : (Array.isArray(agentBody.data) ? agentBody.data : [])
      setAgents(agentList)

      const sBody = settRes || {}
      const s = Array.isArray(sBody) ? {} : (sBody.data || sBody || {})
      const schoolList = (s.school_name || s.schools || [])
        .map(x => typeof x === 'string' ? x : (x.label || x.value || x))
        .filter(Boolean).sort((a, b) => a.localeCompare(b))
      setSchools(schoolList)
      setSettings({
        statuses:   s.lead_status || s.statuses || [],
        sources:    s.lead_source || s.sources  || [],
        cities:     s.city        || s.cities   || [],
        lead_types: s.lead_type   || s.lead_types || [],
      })
    } catch (err) {
      toast.error('Failed to load leads')
    } finally { setLoading(false) }
  }, [page, PER_PAGE, search, filterStatus, filterAgent, filterProduct, filterSchool, filterUnassigned])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    const t = setInterval(fetchAll, 30000)
    return () => clearInterval(t)
  }, [fetchAll])

  const getPhone = (lead) => lead?.phone || lead?.mobile || ''
  const getName  = (lead) => lead?.name  || lead?.contact_name || lead?.school_name || ''

  const openDetail = async (lead) => {
    setSelectedLead(lead)
    setDetailTab('info')
    setEditingInfo(false)
    setEditingProduct(false)
    setProductForm({ product_id: lead.product_id || '', product_detail: lead.product_detail || '' })
    // FIX 1: include product_id in editForm so it's preserved on save
    setEditForm({
      name:             getName(lead),
      phone:            getPhone(lead),
      email:            lead.email            || '',
      city:             lead.city             || '',
      source:           lead.source           || '',
      school_name:      lead.school_name      || '',
      lead_type:        lead.lead_type        || '',
      creation_comment: lead.creation_comment || '',
      status:           lead.status           || 'new',
      assigned_to:      lead.assigned_to      || '',
      admin_remark:     lead.admin_remark     || '',
      product_id:       lead.product_id       || '',   // ← FIX 1
      product_detail:   lead.product_detail   || '',   // ← FIX 1
      follow_up_date: lead.next_followup_date
        ? new Date(lead.next_followup_date).toISOString().split('T')[0] : '',
    })
    setShowDetailModal(true)
    fetchCommLogs(lead.id)
    fetchTimeline(lead)
  }

  // FIX 1: saveEditForm now sends product_id + product_detail
  const saveEditForm = async () => {
    if (!selectedLead) return
    setSavingEdit(true)
    try {
      await api.put(`/leads/${selectedLead.id}`, {
        contact_name:     editForm.name,
        name:             editForm.name,
        school_name:      editForm.school_name,
        phone:            editForm.phone,
        email:            editForm.email,
        city:             editForm.city,
        source:           editForm.source,
        lead_type:        editForm.lead_type,
        creation_comment: editForm.creation_comment,
        status:           editForm.status,
        assigned_to:      editForm.assigned_to || null,
        admin_remark:     editForm.admin_remark,
        product_id:       editForm.product_id   || null,   // ← FIX 1
        product_detail:   editForm.product_detail || null, // ← FIX 1
      })
      const assignedAgent = agents.find(a => a.id === editForm.assigned_to)
      const updated = {
        ...selectedLead, ...editForm,
        agent_name:   assignedAgent?.name || selectedLead.agent_name || '',
        product_name: products.find(p => String(p.id) === String(editForm.product_id))?.name || selectedLead.product_name || '',
      }
      setSelectedLead(updated)
      setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
      if (editForm.follow_up_date) {
        api.post('/followups', {
          lead_id: selectedLead.id,
          follow_up_date: editForm.follow_up_date,
          notes: editForm.admin_remark || ''
        }).catch(() => {})
      }
      setEditingInfo(false)
      toast.success('Lead updated')
      fetchTimeline(updated)
    } catch (err) {
      toast.error(err.message || 'Failed to update lead')
    } finally { setSavingEdit(false) }
  }

  const fetchCommLogs = async (leadId) => {
    setCommLoading(true)
    try {
      const res = await api.get(`/leads/${leadId}/communications`)
      const body = res || {}
      setCommLogs(Array.isArray(body) ? body : (body.data || body || []))
    } catch { setCommLogs([]) }
    finally { setCommLoading(false) }
  }

  // FIX 3: Build full timeline from lead data + call_logs + comm_logs
  const fetchTimeline = async (lead) => {
    setTimelineLoading(true)
    try {
      // Fetch full lead detail with history
      const res = await api.get(`/leads/${lead.id}`)
      const body = res || {}
      const fullLead = body.data || body

      const events = []

      // Creation event
      events.push({
        id:      'creation',
        type:    'created',
        icon:    '🌱',
        color:   'border-l-green-400',
        title:   'Lead Created',
        detail:  fullLead.creation_comment || '',
        agent:   fullLead.assigned_by_name || fullLead.agent_name || 'System',
        time:    fullLead.created_at,
      })

      // Assignment event if different from creation
      if (fullLead.assigned_at && fullLead.assigned_at !== fullLead.created_at) {
        events.push({
          id:     'assigned',
          type:   'assigned',
          icon:   '👤',
          color:  'border-l-blue-400',
          title:  `Assigned to ${fullLead.agent_name || '—'}`,
          detail: '',
          agent:  fullLead.assigned_by_name || 'Admin',
          time:   fullLead.assigned_at,
        })
      }

      // Call logs / history
      const history = fullLead.history || []
      history.forEach((h, i) => {
        if (h.next_followup_date) {
          events.push({
            id:     `followup-${i}`,
            type:   'followup',
            icon:   '📅',
            color:  'border-l-amber-400',
            title:  `Follow-up Scheduled: ${format(new Date(h.next_followup_date), 'dd MMM yyyy')}`,
            detail: h.discussion || '',
            agent:  h.agent_name || '—',
            time:   h.called_at || h.created_at,
          })
        } else if (h.discussion) {
          events.push({
            id:     `call-${i}`,
            type:   'call',
            icon:   '📞',
            color:  'border-l-green-400',
            title:  `Call Log`,
            detail: h.discussion,
            agent:  h.agent_name || '—',
            time:   h.called_at || h.created_at,
          })
        }
      })

      // Communication logs
      const commRes = await api.get(`/leads/${lead.id}/communications`)
      const commBody = commRes || {}
      const comms = Array.isArray(commBody) ? commBody : (commBody.data || [])
      comms.forEach((c, i) => {
        const icon = c.type === 'call' ? '📞' : c.type === 'whatsapp' ? '💬' : '✉️'
        const color = c.type === 'call' ? 'border-l-green-400' : c.type === 'whatsapp' ? 'border-l-emerald-400' : 'border-l-blue-400'
        events.push({
          id:     `comm-${i}`,
          type:   c.type,
          icon,
          color,
          title:  `${c.type?.charAt(0).toUpperCase()}${c.type?.slice(1)} — ${c.direction || 'outbound'}`,
          detail: c.note || '',
          agent:  c.agent_name || '—',
          time:   c.created_at,
        })
      })

      // Status update event (current status)
      events.push({
        id:     'current-status',
        type:   'status',
        icon:   '🏷️',
        color:  'border-l-purple-400',
        title:  `Current Status: ${(fullLead.status || '').replace(/_/g, ' ')}`,
        detail: fullLead.admin_remark || '',
        agent:  fullLead.agent_name || '—',
        time:   fullLead.updated_at,
      })

      // Sort all events by time ascending
      events.sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0))
      setTimeline(events)
    } catch (e) {
      console.error('Timeline error:', e)
      setTimeline([])
    } finally { setTimelineLoading(false) }
  }

  const logComm = async (type, note = '') => {
    if (!selectedLead) return
    setSavingComm(true)
    try {
      await api.post(`/leads/${selectedLead.id}/communications`, { type, direction: 'outbound', note })
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} logged`)
      setCommNote('')
      fetchCommLogs(selectedLead.id)
      fetchTimeline(selectedLead)
    } catch (err) {
      toast.error(err.message || 'Failed to log')
    } finally { setSavingComm(false) }
  }

  const handleDirectCall = () => {
    if (!selectedLead?.phone) return toast.error('No phone number')
    window.open(`tel:${selectedLead.phone.replace(/\s+/g, '')}`, '_self')
    logComm('call', commNote || 'Call initiated from portal')
  }

  const handleWhatsApp = () => {
    if (!selectedLead?.phone) return toast.error('No phone number')
    const phone = selectedLead.phone.replace(/[^0-9]/g, '')
    window.open(`https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}`, '_blank')
    logComm('whatsapp', commNote || 'WhatsApp opened from portal')
  }

  const handleEmail = () => {
    if (!selectedLead?.email) return toast.error('No email address')
    window.open(`mailto:${selectedLead.email}?subject=${encodeURIComponent('Following up — ThynkFlow')}`, '_self')
    logComm('email', commNote || 'Email client opened from portal')
  }

  const saveProductOnLead = async () => {
    if (!selectedLead) return
    setSavingProduct(true)
    try {
      const res = await api.patch(`/leads/${selectedLead.id}/product`, productForm)
      const body = res || {}
      const updated = body.data || body
      setSelectedLead(updated)
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
      setEditingProduct(false)
      // also update editForm product_id so subsequent saves preserve it
      setEditForm(f => ({ ...f, product_id: productForm.product_id, product_detail: productForm.product_detail }))
      toast.success('Product updated on lead')
    } catch (err) {
      toast.error(err.message || 'Failed to update product')
    } finally { setSavingProduct(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name?.trim()) return toast.error('Name is required')
    if (!form.phone?.trim()) return toast.error('Phone is required')
    setSaving(true)
    try {
      const res = await api.post('/leads', {
        name: form.name.trim(), contact_name: form.name.trim(),
        school_name: form.school_name?.trim() || null,
        lead_type: form.lead_type || null,
        creation_comment: form.creation_comment?.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        city: form.city || null,
        source: form.source || null,
        status: form.status || 'new',
        product_id: form.product_id || null,
        product_detail: form.product_detail || null,
        assigned_to: form.assigned_to || null,
        admin_remark: form.admin_remark || null,
      })
      const body   = res || {}
      const newLead = body.data || body
      if (form.follow_up_date && newLead?.id) {
        api.post('/followups', { lead_id: newLead.id, follow_up_date: form.follow_up_date, notes: form.notes || '' }).catch(() => {})
      }
      toast.success('Lead created!')
      setShowCreateModal(false)
      setForm(emptyForm)
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to create lead')
    } finally { setSaving(false) }
  }

  const parsePasteText = () => {
    const lines = pasteText.trim().split('\n').filter(l => l.trim())
    if (!lines.length) return toast.error('Nothing to parse')
    const sep = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase())
    const colIdx = (names) => names.reduce((best, n) => {
      const i = headers.findIndex(h => h.includes(n)); return i !== -1 ? i : best
    }, -1)
    const nameIdx    = colIdx(['name','full name','student'])
    const phoneIdx   = colIdx(['phone','mobile','contact','number'])
    const emailIdx   = colIdx(['email','mail'])
    const cityIdx    = colIdx(['city','location'])
    const sourceIdx  = colIdx(['source','channel'])
    const ltIdx      = colIdx(['lead_type','type','b2b/b2c','lead type'])
    const schoolIdx  = colIdx(['school_name','school','organisation','organization'])
    const commentIdx = colIdx(['creation_comment','comment','upload comment'])
    const productIdx = colIdx(['product','course','program'])
    const dataLines = nameIdx >= 0 ? lines.slice(1) : lines
    const rows = dataLines.map((line, i) => {
      const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g,''))
      if (nameIdx >= 0) return {
        _key: i, name: cols[nameIdx]||'', phone: cols[phoneIdx]||'',
        email: cols[emailIdx]||'', city: cols[cityIdx]||'',
        source: cols[sourceIdx]||'', lead_type: cols[ltIdx]||'',
        school_name: cols[schoolIdx]||'', creation_comment: cols[commentIdx]||'',
        product: cols[productIdx]||'',
      }
      return { _key: i, name: cols[0]||'', phone: cols[1]||'', email:'', city:'', source:'', product:'' }
    }).filter(r => r.name || r.phone)
    setPasteRows(rows); setPasteStep(2)
  }

  const submitPasteLeads = async () => {
    if (!pasteRows.length) return
    setSaving(true)
    try {
      const productNames = [...new Set(pasteRows.map(r => r.product).filter(Boolean))]
      let productMap = {}
      if (productNames.length) {
        const res = await api.post('/leads/lookup-products', { names: productNames })
        const body = res || {}
        productMap = body.data || body || {}
      }
      const payload = pasteRows.map(r => ({
        name: r.name, phone: r.phone, email: r.email, city: r.city,
        source: r.source, school_name: r.school_name||'',
        lead_type: r.lead_type||pasteLeadType||'B2C',
        creation_comment: r.creation_comment||pasteComment||'',
        status: 'new',
        product_id: r.product ? (productMap[r.product.toLowerCase()]||null) : (pasteProduct||null),
      }))
      await api.post('/leads/bulk', { leads: payload })
      toast.success(`${payload.length} leads imported`)
      setShowPasteModal(false); setPasteText(''); setPasteRows([]); setPasteStep(1); setPasteProduct('')
      fetchAll()
    } catch (err) { toast.error(err.message||'Bulk import failed') }
    finally { setSaving(false) }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportFile(file)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target.result, { type:'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval:'' })
      const normalise = (obj) => { const o={}; Object.entries(obj).forEach(([k,v]) => { o[k.toLowerCase().trim()]=String(v).trim() }); return o }
      setImportRows(raw.map(normalise)); setImportStep(2)
    }
    reader.readAsBinaryString(file)
  }

  const submitExcelLeads = async () => {
    if (!importRows.length) return
    setSaving(true)
    try {
      const colAlias = (row, ...aliases) => { for (const a of aliases) { if (row[a]!==undefined&&row[a]!=='') return row[a] } return '' }
      const productNames = [...new Set(importRows.map(r => colAlias(r,'product','course','program')).filter(Boolean))]
      let productMap = {}
      if (productNames.length) {
        const res = await api.post('/leads/lookup-products', { names: productNames })
        const body = res || {}
        productMap = body.data || body || {}
      }
      const payload = importRows.map(r => ({
        name:             colAlias(r,'name','full name','student name'),
        contact_name:     colAlias(r,'name','full name','student name'),
        phone:            colAlias(r,'phone','mobile','contact','phone number'),
        email:            colAlias(r,'email','email address','mail'),
        city:             colAlias(r,'city','location'),
        source:           colAlias(r,'source','lead source','channel'),
        school_name:      colAlias(r,'school name','school','organisation','organization','company'),
        lead_type:        colAlias(r,'lead type','type','b2b/b2c','lead_type')||'B2C',
        creation_comment: colAlias(r,'creation comment','comment','upload comment','notes','creation_comment'),
        status:           'new',
        product_id: (() => { const pname=colAlias(r,'product','course','program'); return pname?(productMap[pname.toLowerCase()]||null):null })(),
      })).filter(r => r.name||r.phone)
      const CHUNK=100; let totalCreated=0
      for (let i=0; i<payload.length; i+=CHUNK) {
        const res = await api.post('/leads/bulk', { leads: payload.slice(i,i+CHUNK) })
        const body = res || {}
        totalCreated += body.created||CHUNK
      }
      toast.success(`${totalCreated} of ${payload.length} leads imported`)
      setShowImportModal(false); setImportFile(null); setImportRows([]); setImportStep(1)
      if (fileInputRef.current) fileInputRef.current.value=''
      fetchAll()
    } catch (err) { toast.error(err.message||'Excel import failed') }
    finally { setSaving(false) }
  }

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name','Phone','Email','City','Source','Lead Type','School Name','Product','Creation Comment'],
      ['Rahul Sharma','9876543210','rahul@example.com','Mumbai','Website','B2C','Delhi Public School',products[0]?.name||'','April campaign'],
    ])
    XLSX.utils.book_append_sheet(wb,ws,'Leads')
    XLSX.writeFile(wb,'thynkflow_leads_template.xlsx')
  }

  const totalPages  = Math.ceil(totalCount / PER_PAGE)
  const productName = (id) => products.find(p => p.id===parseInt(id))?.name || '—'

  return (
    <div className="p-4 max-w-full">

      {/* Header */}
      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">Leads <span className="text-gray-400 text-sm font-normal">({totalCount})</span></h1>
          <select value={PER_PAGE} onChange={e => { setPER_PAGE(Number(e.target.value)); setPage(1) }}
            className="border rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {[25,50,100,200,500].map(n => <option key={n} value={n}>{n} per page</option>)}
          </select>
          <span className="text-xs text-gray-400">Page {page} of {totalPages||1}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <UploadIcon /> Template
          </button>
          <button onClick={() => { setShowImportModal(true); setImportStep(1); setImportRows([]) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            <UploadIcon /> Import Excel
          </button>
          <button onClick={() => { setShowPasteModal(true); setPasteStep(1); setPasteRows([]) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100">
            <ClipIcon /> Copy Paste
          </button>
          <button onClick={() => { setForm(emptyForm); setShowCreateModal(true) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            <PlusIcon /> Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search name, phone, email…"
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        <select value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {isAdmin && (
          <select value={filterAgent} onChange={e => { setFilterAgent(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Schools</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* FIX 2: Quick filter checkboxes */}
      <div className="flex flex-wrap gap-4 mb-4 px-1">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterUnassigned} onChange={e => { setFilterUnassigned(e.target.checked); setPage(1) }}
            className="w-4 h-4 rounded accent-indigo-600" />
          <span className="font-medium">Unassigned leads only</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterNoProduct} onChange={e => setFilterNoProduct(e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-600" />
          <span className="font-medium">No product assigned</span>
        </label>
        {(filterUnassigned || filterNoProduct || filterStatus || filterAgent || filterProduct || filterSchool || search) && (
          <button onClick={() => {
            setFilterUnassigned(false); setFilterNoProduct(false)
            setFilterStatus(''); setFilterAgent(''); setFilterProduct('')
            setFilterSchool(''); setSearch(''); setPage(1)
          }} className="text-xs text-red-500 hover:text-red-700 underline font-medium">
            ✕ Clear all filters
          </button>
        )}
      </div>

      {/* Leads Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading leads…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <SortableHeader label="Name"    field="contact_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="School"  field="school_name"  sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <SortableHeader label="Phone"   field="phone"        sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Product" field="product_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status"  field="status"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Agent"   field="agent_name"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Date"    field="created_at"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!filteredLeads.length && (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">No leads found</td></tr>
              )}
              {filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(lead)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{lead.name || lead.contact_name || lead.school_name}</div>
                    {lead.creation_comment && <div className="text-xs text-gray-400 truncate max-w-[160px]">📝 {lead.creation_comment}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{lead.school_name || '—'}</td>
                  <td className="px-4 py-3">
                    {lead.lead_type
                      ? <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lead.lead_type==='B2B'?'bg-blue-100 text-blue-700':'bg-green-100 text-green-700'}`}>{lead.lead_type}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{lead.phone}</td>
                  <td className="px-4 py-3">
                    {lead.product_id
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                          <PackageIcon /> {lead.product_name || productName(lead.product_id)}
                        </span>
                      : <span className="text-red-400 text-xs font-medium">⚠ No product</span>
                    }
                  </td>
                  <td className="px-4 py-3"><Badge status={lead.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{lead.agent_name || <span className="text-red-400 text-xs">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {lead.created_at ? format(parseISO(lead.created_at), 'dd MMM yy') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openDetail(lead)} className="p-1.5 rounded hover:bg-indigo-50 text-indigo-600"><EditIcon /></button>
                      <button onClick={() => { const p=lead.phone||''; if(!p) return toast.error('No phone'); window.open(`tel:${p.replace(/\s+/g,'')}`, '_self') }}
                        className="p-1.5 rounded hover:bg-green-50 text-green-600"><PhoneIcon /></button>
                      <button onClick={() => { const p=(lead.phone||'').replace(/[^0-9]/g,''); if(!p) return toast.error('No phone'); window.open(`https://wa.me/${p.startsWith('91')?p:'91'+p}`,'_blank') }}
                        className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"><WAIcon /></button>
                      <button onClick={() => { if(!lead.email) return toast.error('No email'); window.open(`mailto:${lead.email}`, '_self') }}
                        className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><MailIcon /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex gap-2 justify-center items-center mt-4">
        <button disabled={page===1} onClick={() => setPage(p=>p-1)}
          className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
        <span className="px-3 py-1.5 text-sm text-gray-600">Page {page} of {totalPages||1} · {totalCount} total</span>
        <button disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}
          className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
      </div>

      {/* LEAD DETAIL MODAL */}
      {showDetailModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{getName(selectedLead)}</h2>
                <p className="text-sm text-gray-500">{selectedLead.phone} · {selectedLead.email || 'no email'}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 rounded-lg hover:bg-gray-100"><XIcon /></button>
            </div>

            {/* FIX 3: Added 'log' tab */}
            <div className="flex border-b px-6">
              {[['info','ℹ️ Info'],['product','📦 Product'],['comms','💬 Comms'],['log','📋 Full Log']].map(([key,label]) => (
                <button key={key} onClick={() => setDetailTab(key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${detailTab===key?'border-indigo-600 text-indigo-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* TAB: INFO */}
              {detailTab==='info' && (
                <div>
                  {!editingInfo ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          ['Name',          getName(selectedLead)],
                          ['Phone',         getPhone(selectedLead)||'—'],
                          ['Email',         selectedLead.email||'—'],
                          ['Lead Type',     selectedLead.lead_type||'—'],
                          ['School / Org',  selectedLead.school_name||'—'],
                          ['Source',        selectedLead.source||'—'],
                          ['City',          selectedLead.city||'—'],
                          ['Assigned To',   selectedLead.agent_name||'—'],
                          ['Product',       selectedLead.product_name||productName(selectedLead.product_id)||'—'],
                          ['Created',       selectedLead.created_at?format(parseISO(selectedLead.created_at),'dd MMM yyyy HH:mm'):'—'],
                          ['Admin Remark',  selectedLead.admin_remark||'—'],
                          ['Creation Note', selectedLead.creation_comment||'—'],
                        ].map(([label,val]) => (
                          <div key={label} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs text-gray-500 mb-1">{label}</p>
                            <div className="font-medium text-gray-800 text-sm">{val}</div>
                          </div>
                        ))}
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">Status</p>
                          <Badge status={selectedLead.status} />
                        </div>
                      </div>
                      <button onClick={() => setEditingInfo(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-xl hover:bg-indigo-50 text-sm font-medium">
                        <EditIcon /> Edit Lead Info
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-800">Edit Lead</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {[['Name','name'],['Phone','phone'],['Email','email'],['City','city']].map(([label,field]) => (
                          <div key={field}>
                            <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                            <input value={editForm[field]||''} onChange={e => setEditForm(f=>({...f,[field]:e.target.value}))}
                              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          </div>
                        ))}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                          <select value={editForm.source||''} onChange={e => setEditForm(f=>({...f,source:e.target.value}))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="">— Select —</option>
                            {settings.sources.map(s => <option key={s?.key||s} value={s?.label||s}>{s?.label||s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">School / Organisation</label>
                          <input value={editForm.school_name||''} onChange={e => setEditForm(f=>({...f,school_name:e.target.value}))}
                            list="school-list-edit"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          <datalist id="school-list-edit">{schools.map(s=><option key={s} value={s}/>)}</datalist>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Lead Type</label>
                          <div className="flex gap-2">
                            {['B2B','B2C'].map(lt => (
                              <button key={lt} type="button" onClick={() => setEditForm(f=>({...f,lead_type:lt}))}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 ${editForm.lead_type===lt?'border-indigo-600 bg-indigo-600 text-white':'border-slate-200 text-slate-600'}`}>
                                {lt}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                          <select value={editForm.status||''} onChange={e => setEditForm(f=>({...f,status:e.target.value}))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                          </select>
                        </div>
                        {/* FIX 1: Product in edit form */}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
                          <select value={editForm.product_id||''} onChange={e => setEditForm(f=>({...f,product_id:e.target.value}))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="">— No product —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                          </select>
                        </div>
                        {isAdmin && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Assign To</label>
                            <select value={editForm.assigned_to||''} onChange={e => setEditForm(f=>({...f,assigned_to:e.target.value}))}
                              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                              <option value="">— Select agent —</option>
                              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Admin Remark</label>
                          <textarea rows={2} value={editForm.admin_remark||''} onChange={e => setEditForm(f=>({...f,admin_remark:e.target.value}))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">📅 Next Follow-up Date</label>
                          <input type="date" value={editForm.follow_up_date||''} min={new Date().toISOString().split('T')[0]}
                            onChange={e => setEditForm(f=>({...f,follow_up_date:e.target.value}))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={saveEditForm} disabled={savingEdit}
                          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                          {savingEdit?'Saving…':'Save Changes'}
                        </button>
                        <button onClick={() => setEditingInfo(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: PRODUCT */}
              {detailTab==='product' && (
                <div>
                  {!editingProduct ? (
                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide mb-1">Assigned Product</p>
                          {selectedLead.product_id
                            ? <><p className="text-lg font-bold text-indigo-900">{selectedLead.product_name||productName(selectedLead.product_id)}</p>
                                {selectedLead.product_detail && <p className="text-sm text-indigo-700 mt-1">{selectedLead.product_detail}</p>}</>
                            : <p className="text-gray-500 italic">No product assigned yet</p>}
                        </div>
                        <button onClick={() => { setProductForm({product_id:selectedLead.product_id||'',product_detail:selectedLead.product_detail||''}); setEditingProduct(true) }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50">
                          <EditIcon /> {selectedLead.product_id?'Update':'Assign'} Product
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-indigo-200 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-3">{selectedLead.product_id?'Update Product':'Assign Product'}</h3>
                      <div className="space-y-3">
                        <select value={productForm.product_id} onChange={e => setProductForm(f=>({...f,product_id:e.target.value}))}
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                          <option value="">— Select product —</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                        </select>
                        <textarea rows={2} value={productForm.product_detail} onChange={e => setProductForm(f=>({...f,product_detail:e.target.value}))}
                          placeholder="Product notes (optional)…"
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={saveProductOnLead} disabled={savingProduct}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                            {savingProduct?'Saving…':'Save Product'}
                          </button>
                          <button onClick={() => setEditingProduct(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: COMMS */}
              {detailTab==='comms' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label:'Call Now', sub:'Opens dialer', bg:'bg-green-50', border:'border-green-200', iconBg:'bg-green-500', fn:handleDirectCall, Icon:PhoneIcon },
                      { label:'WhatsApp', sub:'Opens wa.me',  bg:'bg-emerald-50', border:'border-emerald-200', iconBg:'bg-emerald-500', fn:handleWhatsApp, Icon:WAIcon },
                      { label:'Email',    sub:'Opens mail',   bg:'bg-blue-50', border:'border-blue-200', iconBg:'bg-blue-500', fn:handleEmail, Icon:MailIcon },
                    ].map(({ label, sub, bg, border, iconBg, fn, Icon }) => (
                      <button key={label} onClick={fn}
                        className={`flex flex-col items-center gap-2 p-4 ${bg} border-2 ${border} rounded-xl hover:opacity-90 transition-colors`}>
                        <span className={`w-10 h-10 ${iconBg} text-white rounded-full flex items-center justify-center`}><Icon /></span>
                        <span className="text-sm font-semibold">{label}</span>
                        <span className="text-xs text-center opacity-60">{sub}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Note (logged with action above)</label>
                    <textarea rows={2} value={commNote} onChange={e => setCommNote(e.target.value)}
                      placeholder="e.g. Discussed pricing, follow up Thursday…"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <select value={commType} onChange={e => setCommType(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="call">📞 Call</option>
                      <option value="whatsapp">💬 WhatsApp</option>
                      <option value="email">✉️ Email</option>
                    </select>
                    <button disabled={!commNote.trim()||savingComm} onClick={() => logComm(commType, commNote)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">
                      <LogIcon /> {savingComm?'Logging…':'Add Manual Log'}
                    </button>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Communications</h3>
                    {commLoading ? <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
                    : !commLogs.length ? <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-xl">No communications logged yet</p>
                    : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {commLogs.map(log => {
                          const icon  = log.type==='call'?'📞':log.type==='whatsapp'?'💬':'✉️'
                          const color = log.type==='call'?'border-l-green-400':log.type==='whatsapp'?'border-l-emerald-400':'border-l-blue-400'
                          return (
                            <div key={log.id} className={`bg-gray-50 rounded-lg p-3 border-l-4 ${color}`}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-semibold text-gray-700 capitalize">{icon} {log.type} · {log.direction}</span>
                                <span className="text-xs text-gray-400">{log.created_at?format(parseISO(log.created_at),'dd MMM yy HH:mm'):''}</span>
                              </div>
                              {log.note && <p className="text-sm text-gray-600">{log.note}</p>}
                              <p className="text-xs text-gray-400 mt-0.5">by {log.agent_name}</p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* FIX 3: TAB: FULL LOG / TIMELINE */}
              {detailTab==='log' && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">📋 Complete Lead Timeline</h3>
                  {timelineLoading ? (
                    <div className="text-center py-8 text-gray-400">
                      <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      Building timeline…
                    </div>
                  ) : !timeline.length ? (
                    <p className="text-sm text-gray-400 text-center py-8 bg-gray-50 rounded-xl">No events recorded yet</p>
                  ) : (
                    <div className="relative">
                      {/* vertical line */}
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                      <div className="space-y-4 pl-10">
                        {timeline.map((event, i) => (
                          <div key={event.id || i} className={`relative bg-white border rounded-xl p-3 border-l-4 ${event.color} shadow-sm`}>
                            {/* dot */}
                            <div className="absolute -left-[2.15rem] top-3 w-4 h-4 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center text-[10px]">
                              {event.icon}
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800">{event.title}</p>
                                {event.detail && <p className="text-xs text-gray-500 mt-1 italic">"{event.detail}"</p>}
                                <p className="text-xs text-gray-400 mt-1">by {event.agent}</p>
                              </div>
                              <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
                                {event.time ? format(new Date(event.time), 'dd MMM yy HH:mm') : '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center"><PlusIcon /></div>
                <div>
                  <h2 className="text-lg font-bold text-white">Add New Lead</h2>
                  <p className="text-indigo-200 text-xs">{isAdmin?'Admin — can assign to any agent':'Lead will be assigned to you'}</p>
                </div>
              </div>
              <button onClick={() => { setShowCreateModal(false); setForm(emptyForm) }} className="p-2 rounded-lg hover:bg-white/20 text-white"><XIcon /></button>
            </div>
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Full Name *</label>
                  <input required value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone *</label>
                  <input required value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))}
                    placeholder="9876543210" type="tel"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">City</label>
                  <input value={form.city} onChange={e => setForm(f=>({...f,city:e.target.value}))} list="city-list-create"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <datalist id="city-list-create">{settings.cities.map(c=><option key={c} value={c}/>)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Source</label>
                  <select value={form.source} onChange={e => setForm(f=>({...f,source:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">— Select —</option>
                    {settings.sources.map(s => <option key={s?.key||s} value={s?.label||s}>{s?.label||s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Lead Type</label>
                  <select value={form.lead_type} onChange={e => setForm(f=>({...f,lead_type:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">— Select —</option>
                    {(settings.lead_types?.length>0?settings.lead_types:['B2B','B2C']).map(t => <option key={t?.key||t} value={t?.label||t}>{t?.label||t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">School / Org</label>
                  <input value={form.school_name||''} onChange={e => setForm(f=>({...f,school_name:e.target.value}))}
                    list="school-list-create"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <datalist id="school-list-create">{schools.map(s=><option key={s} value={s}/>)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Product</label>
                  <select value={form.product_id} onChange={e => setForm(f=>({...f,product_id:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">— No product —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">📅 Follow-up Date</label>
                  <input type="date" value={form.follow_up_date} onChange={e => setForm(f=>({...f,follow_up_date:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes / Remark</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}
                    placeholder="Any initial notes…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assign To</label>
                  <select value={form.assigned_to||user?.id||''} onChange={e => setForm(f=>({...f,assigned_to:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value={user?.id||''}>{user?.name||'Me'} (me)</option>
                    {agents.filter(a=>a.id!==user?.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </form>
            <div className="flex justify-between items-center px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              <button type="button" onClick={() => { setShowCreateModal(false); setForm(emptyForm) }}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-100 text-gray-600">Cancel</button>
              <button onClick={handleCreate} disabled={saving||!form.name||!form.phone}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
                {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Creating…</>:<><PlusIcon/>Create Lead</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASTE MODAL */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-bold">Copy Paste Import</h2>
              <button onClick={() => setShowPasteModal(false)} className="p-2 rounded-lg hover:bg-gray-100"><XIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {pasteStep===1 && (
                <>
                  <p className="text-sm text-gray-500">Paste rows from Excel / Google Sheets. First row can be a header.</p>
                  <textarea rows={8} value={pasteText} onChange={e => setPasteText(e.target.value)}
                    placeholder="Name	Phone	Email	City	Source	Product"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default Product</label>
                    <select value={pasteProduct} onChange={e => setPasteProduct(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="">— No product —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Lead Type</label>
                    <div className="flex gap-2">
                      {['B2B','B2C'].map(lt => (
                        <button key={lt} type="button" onClick={() => setPasteLeadType(lt)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 ${pasteLeadType===lt?'border-indigo-600 bg-indigo-600 text-white':'border-slate-200 text-slate-600'}`}>
                          {lt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input value={pasteComment} onChange={e => setPasteComment(e.target.value)}
                    placeholder="Upload comment (applies to all rows)…"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowPasteModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                    <button onClick={parsePasteText} disabled={!pasteText.trim()}
                      className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">Parse Preview →</button>
                  </div>
                </>
              )}
              {pasteStep===2 && (
                <>
                  <p className="text-sm text-gray-600">{pasteRows.length} leads parsed:</p>
                  <div className="overflow-x-auto rounded-lg border text-xs max-h-64">
                    <table className="min-w-full">
                      <thead className="bg-gray-50"><tr>
                        {['Name','Phone','Email','City','Source','Product'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {pasteRows.map(r => (
                          <tr key={r._key}>
                            <td className="px-3 py-1.5">{r.name}</td>
                            <td className="px-3 py-1.5 font-mono">{r.phone}</td>
                            <td className="px-3 py-1.5">{r.email}</td>
                            <td className="px-3 py-1.5">{r.city}</td>
                            <td className="px-3 py-1.5">{r.source}</td>
                            <td className="px-3 py-1.5">{r.product?<span className="text-indigo-600 font-medium">{r.product}</span>:<span className="text-gray-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setPasteStep(1)} className="px-4 py-2 border rounded-lg text-sm">← Back</button>
                    <button onClick={submitPasteLeads} disabled={saving}
                      className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                      {saving?'Importing…':`Import ${pasteRows.length} Leads`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-bold">Import from Excel</h2>
              <button onClick={() => setShowImportModal(false)} className="p-2 rounded-lg hover:bg-gray-100"><XIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {importStep===1 && (
                <>
                  <p className="text-sm text-gray-500">Upload <strong>.xlsx</strong> or <strong>.csv</strong>. Columns: Name, Phone, Email, City, Source, Product.</p>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-300 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}>
                    <UploadIcon />
                    <p className="mt-2 text-sm text-gray-600">Click to select file</p>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                  </div>
                  <div className="flex justify-between">
                    <button onClick={downloadTemplate} className="px-4 py-2 border rounded-lg text-sm text-indigo-600 hover:bg-indigo-50">Download Template</button>
                    <button onClick={() => setShowImportModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                  </div>
                </>
              )}
              {importStep===2 && (
                <>
                  <p className="text-sm text-gray-600">{importRows.length} rows in <strong>{importFile?.name}</strong></p>
                  <div className="overflow-x-auto rounded-lg border text-xs max-h-64">
                    <table className="min-w-full">
                      <thead className="bg-gray-50"><tr>
                        {Object.keys(importRows[0]||{}).slice(0,7).map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 capitalize">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.slice(0,10).map((r,i) => (
                          <tr key={i}>{Object.entries(r).slice(0,7).map(([k,v]) => (
                            <td key={k} className={`px-3 py-1.5 ${(k==='product'||k==='course')?'text-indigo-600 font-medium':''}`}>{v}</td>
                          ))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setImportStep(1); setImportRows([]) }} className="px-4 py-2 border rounded-lg text-sm">← Back</button>
                    <button onClick={submitExcelLeads} disabled={saving}
                      className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                      {saving?'Importing…':`Import ${importRows.length} Leads`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
