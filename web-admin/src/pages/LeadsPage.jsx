// web-admin/src/pages/LeadsPage.jsx — VISUAL REDESIGN
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
const PackageIcon = () => <Icon d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />

const STATUS_COLORS = {
  new:            'bg-blue-100 text-blue-800',
  hot:            'bg-red-100 text-red-800',
  warm:           'bg-orange-100 text-orange-800',
  cold:           'bg-slate-100 text-slate-700',
  converted:      'bg-green-100 text-green-800',
  not_interested: 'bg-gray-100 text-gray-600',
  call_back:      'bg-purple-100 text-purple-800',
}

const STATUS_DOT = {
  new:'#3b82f6', hot:'#ef4444', warm:'#f97316', cold:'#94a3b8',
  converted:'#22c55e', not_interested:'#9ca3af', call_back:'#a855f7',
}

function Badge({ status }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize inline-flex items-center gap-1 ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: STATUS_DOT[status] || '#9ca3af' }} />
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

// ── SUMMARY CARD ──────────────────────────────────────────────
function StatCard({ icon, label, value, sub, gradient, active, onClick, pulse }) {
  return (
    <button onClick={onClick}
      className="relative flex-1 min-w-[130px] rounded-2xl p-4 text-left transition-all duration-300 overflow-hidden group"
      style={{
        background: active ? gradient[0] : '#fff',
        boxShadow: active ? `0 8px 32px ${gradient[1]}44` : '0 1px 4px #0001',
        border: active ? `2px solid ${gradient[1]}` : '2px solid #f1f5f9',
        transform: active ? 'translateY(-2px)' : 'translateY(0)',
      }}>
      {/* bg glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${gradient[1]}11, ${gradient[1]}05)` }} />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xl">{icon}</span>
          {pulse && <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: gradient[1] }} />}
        </div>
        <p className="text-3xl font-black mb-0.5" style={{ color: active ? '#fff' : gradient[1] }}>{value ?? '—'}</p>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: active ? 'rgba(255,255,255,0.85)' : '#64748b' }}>{label}</p>
        {sub && <p className="text-xs mt-1" style={{ color: active ? 'rgba(255,255,255,0.7)' : '#94a3b8' }}>{sub}</p>}
      </div>
    </button>
  )
}

function SortableHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field
  return (
    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider cursor-pointer select-none transition-colors whitespace-nowrap"
      style={{ color: active ? '#6366f1' : '#94a3b8' }}
      onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        <span className="text-[10px]">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </div>
    </th>
  )
}

export default function LeadsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1 || user?.role_name === 'admin'

  const [leads, setLeads]           = useState([])
  const [allLeads, setAllLeads]     = useState([]) // for summary stats
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
  const [filterUnassigned, setFilterUnassigned] = useState(false)
  const [filterNoProduct, setFilterNoProduct]   = useState(false)
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir]     = useState('desc')
  const [activeTab, setActiveTab] = useState('all')

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
    name:'', phone:'', email:'', source:'', city:'',
    school_name:'', lead_type:'B2C', creation_comment:'',
    status:'new', assigned_to:'', product_id:'',
    product_detail:'', admin_remark:'', follow_up_date:'', notes:''
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
  const [timeline, setTimeline]       = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  const [editingProduct, setEditingProduct] = useState(false)
  const [productForm, setProductForm]       = useState({ product_id:'', product_detail:'' })
  const [savingProduct, setSavingProduct]   = useState(false)

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
    setPage(1)
  }

  // Summary stats from allLeads
  const stats = {
    total:      allLeads.length,
    b2b:        allLeads.filter(l => l.lead_type === 'B2B').length,
    b2c:        allLeads.filter(l => l.lead_type === 'B2C').length,
    no_agent:   allLeads.filter(l => !l.assigned_to && !l.agent_name).length,
    no_product: allLeads.filter(l => !l.product_id).length,
    hot:        allLeads.filter(l => l.status === 'hot').length,
    converted:  allLeads.filter(l => l.status === 'converted').length,
    call_back:  allLeads.filter(l => l.status === 'call_back').length,
  }

  const TABS = [
    { key:'all',        icon:'📋', label:'Total Leads',   value:stats.total,      gradient:['#4f46e5','#6366f1'], sub:'all leads' },
    { key:'b2b',        icon:'🏢', label:'B2B',           value:stats.b2b,        gradient:['#0369a1','#0ea5e9'], sub:'business leads' },
    { key:'b2c',        icon:'👤', label:'B2C',           value:stats.b2c,        gradient:['#7c3aed','#a855f7'], sub:'individual leads' },
    { key:'no_agent',   icon:'🚨', label:'No Agent',      value:stats.no_agent,   gradient:['#15803d','#22c55e'], sub:'need assignment', pulse:true },
    { key:'no_product', icon:'📦', label:'No Product',    value:stats.no_product, gradient:['#c2410c','#f97316'], sub:'need product', pulse:true },
    { key:'hot',        icon:'🔥', label:'Hot Leads',     value:stats.hot,        gradient:['#991b1b','#ef4444'], sub:'high priority' },
    { key:'converted',  icon:'✅', label:'Converted',     value:stats.converted,  gradient:['#065f46','#10b981'], sub:'this month' },
    { key:'call_back',  icon:'📞', label:'Call Back',     value:stats.call_back,  gradient:['#5b21b6','#8b5cf6'], sub:'awaiting call' },
  ]

  const sortedLeads = [...leads].sort((a, b) => {
    let va = a[sortField] || '', vb = b[sortField] || ''
    if (sortField === 'created_at') { va = new Date(va).getTime(); vb = new Date(vb).getTime() }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase() }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const filteredLeads = sortedLeads.filter(l => {
    if (activeTab === 'b2b' && l.lead_type !== 'B2B') return false
    if (activeTab === 'b2c' && l.lead_type !== 'B2C') return false
    if (activeTab === 'no_agent' && (l.assigned_to || l.agent_name)) return false
    if (activeTab === 'no_product' && l.product_id) return false
    if (activeTab === 'hot' && l.status !== 'hot') return false
    if (activeTab === 'converted' && l.status !== 'converted') return false
    if (activeTab === 'call_back' && l.status !== 'call_back') return false
    if (filterUnassigned && l.assigned_to) return false
    if (filterNoProduct && l.product_id) return false
    return true
  })

  // Row highlight logic
  function getRowMeta(lead) {
    const noProduct = !lead.product_id
    const noAgent   = !lead.assigned_to && !lead.agent_name
    if (noProduct && noAgent) return { bg:'#fff1f2', border:'#fca5a5', dot:'#ef4444', label:'Both Missing' }
    if (noProduct)            return { bg:'#fff7ed', border:'#fdba74', dot:'#f97316', label:'No Product' }
    if (noAgent)              return { bg:'#f0fdf4', border:'#86efac', dot:'#22c55e', label:'No Agent' }
    return { bg:'#fff', border:'transparent', dot:null, label:null }
  }

  const fetchAllLeads = useCallback(async () => {
    try {
      const r = await api.get('/leads', { params: { per_page: 1000 } })
      const rows = Array.isArray(r) ? r : (r?.data || r?.leads || [])
      setAllLeads(rows)
      const list = [...new Set(rows.map(l => l.school_name).filter(Boolean))].sort((a,b) => a.localeCompare(b))
      setSchools(list)
    } catch {}
  }, [])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page, per_page: PER_PAGE,
        ...(search        && { search }),
        ...(filterStatus  && { status: filterStatus }),
        ...(filterAgent   && { assigned_to: filterAgent }),
        ...(filterProduct && { product_id: filterProduct }),
        ...(filterSchool  && { school_name: filterSchool }),
        ...(filterUnassigned && { unassigned: 'true' }),
      })
      const [leadsRes, prodRes, agentRes, settRes] = await Promise.all([
        api.get(`/leads?${params}`),
        api.get('/products/active'),
        (async () => { try { return await api.get('/chat/users') } catch { try { return await api.get('/users') } catch { return {} } } })(),
        api.get('/settings'),
      ])
      const body = leadsRes || {}
      let rows = Array.isArray(body) ? body : (body.data || body.leads || [])
      const total = body.total || body.count || rows.length
      setLeads(rows); setTotalCount(total)

      const prodBody = prodRes || {}
      setProducts(Array.isArray(prodBody) ? prodBody : (prodBody.data || []))

      const agentBody = agentRes || {}
      setAgents(Array.isArray(agentBody) ? agentBody : (Array.isArray(agentBody.data) ? agentBody.data : []))

      const sBody = settRes || {}
      const s = Array.isArray(sBody) ? {} : (sBody.data || sBody || {})
      setSettings({
        statuses:   s.lead_status || s.statuses   || [],
        sources:    s.lead_source || s.sources     || [],
        cities:     s.city        || s.cities      || [],
        lead_types: s.lead_type   || s.lead_types  || [],
      })
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [page, PER_PAGE, search, filterStatus, filterAgent, filterProduct, filterSchool, filterUnassigned])

  useEffect(() => { fetchAll(); fetchAllLeads() }, [fetchAll])
  useEffect(() => { const t = setInterval(() => { fetchAll(); fetchAllLeads() }, 30000); return () => clearInterval(t) }, [fetchAll])

  const getPhone = (lead) => lead?.phone || lead?.mobile || ''
  const getName  = (lead) => lead?.name  || lead?.contact_name || lead?.school_name || ''

  const openDetail = async (lead) => {
    setSelectedLead(lead); setDetailTab('info'); setEditingInfo(false); setEditingProduct(false)
    setProductForm({ product_id: lead.product_id || '', product_detail: lead.product_detail || '' })
    setEditForm({
      name: getName(lead), phone: getPhone(lead), email: lead.email||'', city: lead.city||'',
      source: lead.source||'', school_name: lead.school_name||'', lead_type: lead.lead_type||'',
      creation_comment: lead.creation_comment||'', status: lead.status||'new',
      assigned_to: lead.assigned_to||'', admin_remark: lead.admin_remark||'',
      product_id: lead.product_id||'', product_detail: lead.product_detail||'',
      follow_up_date: lead.next_followup_date ? new Date(lead.next_followup_date).toISOString().split('T')[0] : '',
    })
    setShowDetailModal(true); fetchCommLogs(lead.id); fetchTimeline(lead)
  }

  const saveEditForm = async () => {
    if (!selectedLead) return
    setSavingEdit(true)
    try {
      await api.put(`/leads/${selectedLead.id}`, {
        contact_name: editForm.name, name: editForm.name,
        school_name: editForm.school_name, phone: editForm.phone, email: editForm.email,
        city: editForm.city, source: editForm.source, lead_type: editForm.lead_type,
        creation_comment: editForm.creation_comment, status: editForm.status,
        assigned_to: editForm.assigned_to || null, admin_remark: editForm.admin_remark,
        product_id: editForm.product_id || null, product_detail: editForm.product_detail || null,
      })
      const assignedAgent = agents.find(a => a.id === editForm.assigned_to)
      const updated = { ...selectedLead, ...editForm, agent_name: assignedAgent?.name || selectedLead.agent_name || '',
        product_name: products.find(p => String(p.id) === String(editForm.product_id))?.name || selectedLead.product_name || '' }
      setSelectedLead(updated)
      setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
      setAllLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l))
      if (editForm.follow_up_date) api.post('/followups', { lead_id: selectedLead.id, follow_up_date: editForm.follow_up_date, notes: editForm.admin_remark||'' }).catch(()=>{})
      setEditingInfo(false); toast.success('Lead updated ✓')
    } catch (err) { toast.error(err.message || 'Failed to update') }
    finally { setSavingEdit(false) }
  }

  const fetchCommLogs = async (leadId) => {
    setCommLoading(true)
    try { const res = await api.get(`/leads/${leadId}/communications`); const b = res||{}; setCommLogs(Array.isArray(b)?b:(b.data||[])) }
    catch { setCommLogs([]) } finally { setCommLoading(false) }
  }

  const fetchTimeline = async (lead) => {
    setTimelineLoading(true)
    try {
      const res = await api.get(`/leads/${lead.id}`)
      const fullLead = (res||{}).data || res || {}
      const events = []
      events.push({ id:'creation', type:'created', icon:'🌱', color:'#22c55e', title:'Lead Created', detail: fullLead.creation_comment||'', agent: fullLead.assigned_by_name||'System', time: fullLead.created_at })
      if (fullLead.assigned_at && fullLead.assigned_at !== fullLead.created_at)
        events.push({ id:'assigned', type:'assigned', icon:'👤', color:'#3b82f6', title:`Assigned to ${fullLead.agent_name||'—'}`, detail:'', agent:'Admin', time: fullLead.assigned_at })
      ;(fullLead.history||[]).forEach((h,i) => {
        if (h.next_followup_date) events.push({ id:`fu-${i}`, icon:'📅', color:'#f59e0b', title:`Follow-up: ${format(new Date(h.next_followup_date),'dd MMM yyyy')}`, detail:h.discussion||'', agent:h.agent_name||'—', time:h.called_at||h.created_at })
        else if (h.discussion) events.push({ id:`call-${i}`, icon:'📞', color:'#10b981', title:'Call Log', detail:h.discussion, agent:h.agent_name||'—', time:h.called_at||h.created_at })
      })
      const commRes = await api.get(`/leads/${lead.id}/communications`)
      const comms = Array.isArray(commRes) ? commRes : ((commRes||{}).data||[])
      comms.forEach((c,i) => {
        const icon = c.type==='call'?'📞':c.type==='whatsapp'?'💬':'✉️'
        const color = c.type==='call'?'#22c55e':c.type==='whatsapp'?'#10b981':'#3b82f6'
        events.push({ id:`comm-${i}`, icon, color, title:`${c.type} · ${c.direction||'outbound'}`, detail:c.note||'', agent:c.agent_name||'—', time:c.created_at })
      })
      events.push({ id:'status', icon:'🏷️', color:'#8b5cf6', title:`Status: ${(fullLead.status||'').replace(/_/g,' ')}`, detail:fullLead.admin_remark||'', agent:fullLead.agent_name||'—', time:fullLead.updated_at })
      events.sort((a,b) => new Date(a.time||0) - new Date(b.time||0))
      setTimeline(events)
    } catch { setTimeline([]) } finally { setTimelineLoading(false) }
  }

  const logComm = async (type, note='') => {
    if (!selectedLead) return
    setSavingComm(true)
    try {
      await api.post(`/leads/${selectedLead.id}/communications`, { type, direction:'outbound', note })
      toast.success(`${type} logged ✓`); setCommNote('')
      fetchCommLogs(selectedLead.id); fetchTimeline(selectedLead)
    } catch (err) { toast.error(err.message||'Failed') } finally { setSavingComm(false) }
  }

  const handleDirectCall = () => { if (!selectedLead?.phone) return toast.error('No phone'); window.open(`tel:${selectedLead.phone.replace(/\s+/g,'')}`, '_self'); logComm('call', commNote||'Call initiated') }
  const handleWhatsApp   = () => { if (!selectedLead?.phone) return toast.error('No phone'); const p=selectedLead.phone.replace(/[^0-9]/g,''); window.open(`https://wa.me/${p.startsWith('91')?p:'91'+p}`, '_blank'); logComm('whatsapp', commNote||'WhatsApp opened') }
  const handleEmail      = () => { if (!selectedLead?.email) return toast.error('No email'); window.open(`mailto:${selectedLead.email}`, '_self'); logComm('email', commNote||'Email opened') }

  const saveProductOnLead = async () => {
    if (!selectedLead) return
    setSavingProduct(true)
    try {
      const res = await api.patch(`/leads/${selectedLead.id}/product`, productForm)
      const updated = (res||{}).data || res
      setSelectedLead(updated); setLeads(prev => prev.map(l => l.id===updated.id?updated:l))
      setAllLeads(prev => prev.map(l => l.id===updated.id?updated:l))
      setEditingProduct(false); setEditForm(f=>({...f, product_id:productForm.product_id, product_detail:productForm.product_detail}))
      toast.success('Product updated ✓')
    } catch (err) { toast.error(err.message||'Failed') } finally { setSavingProduct(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name?.trim()) return toast.error('Name required')
    if (!form.phone?.trim()) return toast.error('Phone required')
    setSaving(true)
    try {
      const res = await api.post('/leads', { name:form.name.trim(), contact_name:form.name.trim(), school_name:form.school_name||null, lead_type:form.lead_type||null, creation_comment:form.creation_comment||null, phone:form.phone.trim(), email:form.email||null, city:form.city||null, source:form.source||null, status:form.status||'new', product_id:form.product_id||null, product_detail:form.product_detail||null, assigned_to:form.assigned_to||null, admin_remark:form.admin_remark||null })
      const newLead = (res||{}).data || res
      if (form.follow_up_date && newLead?.id) api.post('/followups',{lead_id:newLead.id,follow_up_date:form.follow_up_date,notes:form.notes||''}).catch(()=>{})
      toast.success('Lead created! 🎉'); setShowCreateModal(false); setForm(emptyForm)
      fetchAll(); fetchAllLeads()
    } catch (err) { toast.error(err.message||'Failed') } finally { setSaving(false) }
  }

  const parsePasteText = () => {
    const lines = pasteText.trim().split('\n').filter(l=>l.trim())
    if (!lines.length) return toast.error('Nothing to parse')
    const sep = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(sep).map(h=>h.trim().toLowerCase())
    const colIdx = (names) => names.reduce((best,n)=>{ const i=headers.findIndex(h=>h.includes(n)); return i!==-1?i:best },-1)
    const nameIdx=colIdx(['name','full name','student']), phoneIdx=colIdx(['phone','mobile','contact']), emailIdx=colIdx(['email']), cityIdx=colIdx(['city']), sourceIdx=colIdx(['source']), ltIdx=colIdx(['lead_type','type','b2b/b2c']), schoolIdx=colIdx(['school','organisation','organization']), commentIdx=colIdx(['comment','creation_comment']), productIdx=colIdx(['product','course','program'])
    const dataLines = nameIdx>=0?lines.slice(1):lines
    const rows = dataLines.map((line,i)=>{ const cols=line.split(sep).map(c=>c.trim().replace(/^"|"$/g,'')); return nameIdx>=0?{_key:i,name:cols[nameIdx]||'',phone:cols[phoneIdx]||'',email:cols[emailIdx]||'',city:cols[cityIdx]||'',source:cols[sourceIdx]||'',lead_type:cols[ltIdx]||'',school_name:cols[schoolIdx]||'',creation_comment:cols[commentIdx]||'',product:cols[productIdx]||''}:{_key:i,name:cols[0]||'',phone:cols[1]||'',email:'',city:'',source:'',product:''} }).filter(r=>r.name||r.phone)
    setPasteRows(rows); setPasteStep(2)
  }

  const submitPasteLeads = async () => {
    if (!pasteRows.length) return; setSaving(true)
    try {
      const productNames=[...new Set(pasteRows.map(r=>r.product).filter(Boolean))]; let productMap={}
      if (productNames.length) { const res=await api.post('/leads/lookup-products',{names:productNames}); productMap=(res||{}).data||(res||{})||{} }
      await api.post('/leads/bulk',{leads:pasteRows.map(r=>({name:r.name,phone:r.phone,email:r.email,city:r.city,source:r.source,school_name:r.school_name||'',lead_type:r.lead_type||pasteLeadType||'B2C',creation_comment:r.creation_comment||pasteComment||'',status:'new',product_id:r.product?(productMap[r.product.toLowerCase()]||null):(pasteProduct||null)}))})
      toast.success(`${pasteRows.length} leads imported 🎉`); setShowPasteModal(false); setPasteText(''); setPasteRows([]); setPasteStep(1); setPasteProduct(''); fetchAll(); fetchAllLeads()
    } catch (err) { toast.error(err.message||'Failed') } finally { setSaving(false) }
  }

  const handleFileChange = (e) => {
    const file=e.target.files?.[0]; if(!file) return; setImportFile(file)
    const reader=new FileReader()
    reader.onload=(evt)=>{ const wb=XLSX.read(evt.target.result,{type:'binary'}); const ws=wb.Sheets[wb.SheetNames[0]]; const raw=XLSX.utils.sheet_to_json(ws,{defval:''}); setImportRows(raw.map(obj=>{ const o={}; Object.entries(obj).forEach(([k,v])=>{ o[k.toLowerCase().trim()]=String(v).trim() }); return o })); setImportStep(2) }
    reader.readAsBinaryString(file)
  }

  const submitExcelLeads = async () => {
    if (!importRows.length) return; setSaving(true)
    try {
      const col=(row,...a)=>{ for(const x of a){ if(row[x]!==undefined&&row[x]!=='') return row[x] } return '' }
      const productNames=[...new Set(importRows.map(r=>col(r,'product','course','program')).filter(Boolean))]; let productMap={}
      if (productNames.length) { const res=await api.post('/leads/lookup-products',{names:productNames}); productMap=(res||{}).data||(res||{})||{} }
      const payload=importRows.map(r=>({ name:col(r,'name','full name','student name'), contact_name:col(r,'name','full name','student name'), phone:col(r,'phone','mobile','contact'), email:col(r,'email','mail'), city:col(r,'city','location'), source:col(r,'source','lead source'), school_name:col(r,'school name','school','organisation'), lead_type:col(r,'lead type','type','b2b/b2c','lead_type')||'B2C', creation_comment:col(r,'creation comment','comment','notes','creation_comment'), status:'new', product_id:(()=>{ const pn=col(r,'product','course','program'); return pn?(productMap[pn.toLowerCase()]||null):null })() })).filter(r=>r.name||r.phone)
      const CHUNK=100; let totalCreated=0
      for(let i=0;i<payload.length;i+=CHUNK){ const res=await api.post('/leads/bulk',{leads:payload.slice(i,i+CHUNK)}); totalCreated+=(res||{}).created||CHUNK }
      toast.success(`${totalCreated} leads imported 🎉`); setShowImportModal(false); setImportFile(null); setImportRows([]); setImportStep(1); if(fileInputRef.current)fileInputRef.current.value=''; fetchAll(); fetchAllLeads()
    } catch (err) { toast.error(err.message||'Failed') } finally { setSaving(false) }
  }

  const downloadTemplate = () => {
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([['Name','Phone','Email','City','Source','Lead Type','School Name','Product','Creation Comment'],['Rahul Sharma','9876543210','rahul@example.com','Mumbai','Website','B2C','Delhi Public School',products[0]?.name||'','April campaign']])
    XLSX.utils.book_append_sheet(wb,ws,'Leads'); XLSX.writeFile(wb,'thynkflow_leads_template.xlsx')
  }

  const totalPages  = Math.ceil(totalCount / PER_PAGE)
  const productName = (id) => products.find(p=>p.id===parseInt(id))?.name || '—'

  return (
    <div className="space-y-5">

      {/* ── HEADER ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">
            Leads <span className="text-indigo-500 font-bold text-lg">({totalCount})</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Showing {filteredLeads.length} · Page {page} of {totalPages||1}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadTemplate}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-2 border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors">
            <UploadIcon /> Template
          </button>
          <button onClick={() => { setShowImportModal(true); setImportStep(1); setImportRows([]) }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-2 border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors">
            <UploadIcon /> Import Excel
          </button>
          <button onClick={() => { setShowPasteModal(true); setPasteStep(1); setPasteRows([]) }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-indigo-50 border-2 border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors">
            <ClipIcon /> Copy Paste
          </button>
          <button onClick={() => { setForm(emptyForm); setShowCreateModal(true) }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-95">
            <PlusIcon /> Add Lead
          </button>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div className="flex flex-wrap gap-3">
        {TABS.map(tab => (
          <StatCard key={tab.key} icon={tab.icon} label={tab.label} value={tab.value}
            sub={tab.sub} gradient={tab.gradient} active={activeTab===tab.key}
            pulse={tab.pulse} onClick={() => { setActiveTab(tab.key); setPage(1) }} />
        ))}
      </div>

      {/* ── COLOUR LEGEND ── */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { dot:'#ef4444', label:'No Agent + No Product', bg:'#fff1f2', border:'#fca5a5', text:'#dc2626' },
          { dot:'#f97316', label:'No Product Assigned',   bg:'#fff7ed', border:'#fdba74', text:'#ea580c' },
          { dot:'#22c55e', label:'No Agent Assigned',     bg:'#f0fdf4', border:'#86efac', text:'#16a34a' },
          { dot:'#94a3b8', label:'Fully Assigned',        bg:'#f8fafc', border:'#e2e8f0', text:'#64748b' },
        ].map(({ dot, label, bg, border, text }) => (
          <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border"
            style={{ background: bg, borderColor: border, color: text }}>
            <span className="w-2 h-2 rounded-full" style={{ background: dot }} />{label}
          </span>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="🔍  Search name, phone, email, school…"
          className="border-2 rounded-xl px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 bg-white" />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        <select value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setPage(1) }}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
          <option value="">All Products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {isAdmin && (
          <select value={filterAgent} onChange={e => { setFilterAgent(e.target.value); setPage(1) }}
            className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setPage(1) }}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
          <option value="">All Schools</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={PER_PAGE} onChange={e => { setPER_PAGE(Number(e.target.value)); setPage(1) }}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
          {[25,50,100,200,500].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
        {(search||filterStatus||filterAgent||filterProduct||filterSchool||filterUnassigned||filterNoProduct||activeTab!=='all') && (
          <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterAgent(''); setFilterProduct(''); setFilterSchool(''); setFilterUnassigned(false); setFilterNoProduct(false); setActiveTab('all'); setPage(1) }}
            className="border-2 rounded-xl px-3 py-2 text-xs font-bold text-red-500 border-red-200 hover:bg-red-50">
            ✕ Clear All
          </button>
        )}
      </div>

      {/* Extra checkboxes */}
      <div className="flex gap-4">
        {[
          { checked: filterUnassigned, onChange: (v) => { setFilterUnassigned(v); setPage(1) }, label: '👤 Unassigned leads only', color: '#16a34a' },
          { checked: filterNoProduct,  onChange: (v) => setFilterNoProduct(v),                  label: '📦 No product assigned',  color: '#ea580c' },
        ].map(({ checked, onChange, label, color }) => (
          <label key={label} className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none"
            style={{ color: checked ? color : '#64748b' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
              className="w-4 h-4 rounded" style={{ accentColor: color }} />
            {label}
          </label>
        ))}
      </div>

      {/* ── TABLE ── */}
      {loading ? (
        <div className="rounded-2xl border-2 border-slate-100 p-16 text-center">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Loading leads…</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-bold text-slate-500 text-lg">No leads found</p>
          <p className="text-slate-400 text-sm mt-1">Try a different filter or tab</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden shadow-lg border-2 border-slate-100">
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 50%, #7c3aed 100%)' }}>
                <SortableHeader label="Name"    field="contact_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="School"  field="school_name"  sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-indigo-200">Type</th>
                <SortableHeader label="Phone"   field="phone"        sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Product" field="product_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Status"  field="status"       sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Agent"   field="agent_name"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortableHeader label="Date"    field="created_at"   sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-indigo-200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead, idx) => {
                const meta = getRowMeta(lead)
                return (
                  <tr key={lead.id}
                    onClick={() => openDetail(lead)}
                    className="cursor-pointer transition-all duration-150 hover:brightness-95 border-b border-slate-100"
                    style={{ background: meta.bg, borderLeft: `4px solid ${meta.border}` }}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800 text-sm">{lead.name || lead.contact_name || '—'}</div>
                      {lead.creation_comment && <div className="text-xs text-slate-400 truncate max-w-[150px] mt-0.5">📝 {lead.creation_comment}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[120px]">
                      <span className="truncate block">{lead.school_name || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.lead_type
                        ? <span className={`text-xs font-black px-2.5 py-1 rounded-full ${lead.lead_type==='B2B'?'bg-sky-100 text-sky-700':'bg-violet-100 text-violet-700'}`}>{lead.lead_type}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-600">{lead.phone}</td>
                    <td className="px-4 py-3">
                      {lead.product_id
                        ? <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 rounded-full text-xs font-bold border border-violet-200">
                            <PackageIcon size={10} /> {lead.product_name || productName(lead.product_id)}
                          </span>
                        : <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold border border-red-200">
                            ✕ None
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3"><Badge status={lead.status} /></td>
                    <td className="px-4 py-3">
                      {lead.agent_name
                        ? <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-black flex-shrink-0">
                              {lead.agent_name[0].toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-slate-700">{lead.agent_name}</span>
                          </div>
                        : <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-bold border border-green-200">
                            + Unassigned
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-medium">
                      {lead.created_at ? format(parseISO(lead.created_at), 'dd MMM yy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {[
                          { icon: <EditIcon />, fn: ()=>openDetail(lead), cls:'hover:bg-indigo-50 text-indigo-500' },
                          { icon: <PhoneIcon />, fn: ()=>{ const p=lead.phone||''; if(!p) return; window.open(`tel:${p.replace(/\s+/g,'')}`, '_self') }, cls:'hover:bg-green-50 text-green-500' },
                          { icon: <WAIcon />, fn: ()=>{ const p=(lead.phone||'').replace(/[^0-9]/g,''); if(!p) return; window.open(`https://wa.me/${p.startsWith('91')?p:'91'+p}`,'_blank') }, cls:'hover:bg-emerald-50 text-emerald-500' },
                          { icon: <MailIcon />, fn: ()=>{ if(!lead.email) return; window.open(`mailto:${lead.email}`,'_self') }, cls:'hover:bg-blue-50 text-blue-500' },
                        ].map(({ icon, fn, cls }, i) => (
                          <button key={i} onClick={fn} className={`p-1.5 rounded-lg transition-colors ${cls}`}>{icon}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Table footer */}
          <div className="px-5 py-3 flex items-center justify-between text-xs text-slate-500 bg-slate-50 border-t border-slate-100">
            <div className="flex gap-4">
              <span>🔴 {filteredLeads.filter(l=>!l.product_id&&(!l.assigned_to&&!l.agent_name)).length} both missing</span>
              <span>🟠 {filteredLeads.filter(l=>!l.product_id).length} no product</span>
              <span>🟢 {filteredLeads.filter(l=>!l.assigned_to&&!l.agent_name).length} no agent</span>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)}
                className="px-3 py-1.5 border-2 rounded-lg disabled:opacity-30 hover:bg-white font-semibold transition-colors">← Prev</button>
              <span className="px-3 font-bold text-slate-600">Page {page} / {totalPages||1}</span>
              <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}
                className="px-3 py-1.5 border-2 rounded-lg disabled:opacity-30 hover:bg-white font-semibold transition-colors">Next →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LEAD DETAIL MODAL ── */}
      {showDetailModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl"
              style={{ background: 'linear-gradient(135deg, #312e81, #4f46e5)' }}>
              <div>
                <h2 className="text-lg font-black text-white">{getName(selectedLead)}</h2>
                <p className="text-indigo-200 text-xs mt-0.5">{getPhone(selectedLead)} · {selectedLead.email || 'no email'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={selectedLead.status} />
                <button onClick={() => setShowDetailModal(false)} className="p-2 rounded-lg hover:bg-white/20 text-white"><XIcon /></button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b px-6 bg-slate-50">
              {[['info','ℹ️ Info'],['product','📦 Product'],['comms','💬 Comms'],['log','📋 Timeline']].map(([key,label]) => (
                <button key={key} onClick={() => setDetailTab(key)}
                  className={`px-4 py-3 text-sm font-bold border-b-2 -mb-px transition-all ${detailTab===key?'border-indigo-600 text-indigo-600 bg-white':'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

              {/* INFO TAB */}
              {detailTab==='info' && !editingInfo && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Name', getName(selectedLead)],['Phone', getPhone(selectedLead)||'—'],
                      ['Email', selectedLead.email||'—'],['Lead Type', selectedLead.lead_type||'—'],
                      ['School', selectedLead.school_name||'—'],['Source', selectedLead.source||'—'],
                      ['City', selectedLead.city||'—'],['Assigned To', selectedLead.agent_name||'—'],
                      ['Product', selectedLead.product_name||productName(selectedLead.product_id)||'—'],
                      ['Created', selectedLead.created_at?format(parseISO(selectedLead.created_at),'dd MMM yyyy HH:mm'):'—'],
                      ['Admin Remark', selectedLead.admin_remark||'—'],['Creation Note', selectedLead.creation_comment||'—'],
                    ].map(([label,val]) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
                        <div className="font-semibold text-slate-700 text-sm">{val}</div>
                      </div>
                    ))}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Status</p>
                      <Badge status={selectedLead.status} />
                    </div>
                  </div>
                  <button onClick={() => setEditingInfo(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-xl hover:bg-indigo-50 text-sm font-bold transition-colors">
                    <EditIcon /> Edit Lead Info
                  </button>
                </>
              )}

              {detailTab==='info' && editingInfo && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[['Name','name'],['Phone','phone'],['Email','email'],['City','city']].map(([label,field]) => (
                      <div key={field}>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
                        <input value={editForm[field]||''} onChange={e=>setEditForm(f=>({...f,[field]:e.target.value}))}
                          className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300" />
                      </div>
                    ))}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Source</label>
                      <select value={editForm.source||''} onChange={e=>setEditForm(f=>({...f,source:e.target.value}))}
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        <option value="">— Select —</option>
                        {settings.sources.map(s=><option key={s?.key||s} value={s?.label||s}>{s?.label||s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">School</label>
                      <input value={editForm.school_name||''} onChange={e=>setEditForm(f=>({...f,school_name:e.target.value}))} list="sl-edit"
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                      <datalist id="sl-edit">{schools.map(s=><option key={s} value={s}/>)}</datalist>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Lead Type</label>
                      <div className="flex gap-2">
                        {['B2B','B2C'].map(lt=>(
                          <button key={lt} type="button" onClick={()=>setEditForm(f=>({...f,lead_type:lt}))}
                            className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${editForm.lead_type===lt?'border-indigo-600 bg-indigo-600 text-white':'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                            {lt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Status</label>
                      <select value={editForm.status||''} onChange={e=>setEditForm(f=>({...f,status:e.target.value}))}
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        {Object.keys(STATUS_COLORS).map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Product</label>
                      <select value={editForm.product_id||''} onChange={e=>setEditForm(f=>({...f,product_id:e.target.value}))}
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        <option value="">— No product —</option>
                        {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                      </select>
                    </div>
                    {isAdmin && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Assign To</label>
                        <select value={editForm.assigned_to||''} onChange={e=>setEditForm(f=>({...f,assigned_to:e.target.value}))}
                          className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                          <option value="">— Select agent —</option>
                          {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">📅 Follow-up Date</label>
                      <input type="date" value={editForm.follow_up_date||''} min={new Date().toISOString().split('T')[0]}
                        onChange={e=>setEditForm(f=>({...f,follow_up_date:e.target.value}))}
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Admin Remark</label>
                      <textarea rows={2} value={editForm.admin_remark||''} onChange={e=>setEditForm(f=>({...f,admin_remark:e.target.value}))}
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveEditForm} disabled={savingEdit}
                      className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-200">
                      {savingEdit?'Saving…':'Save Changes ✓'}
                    </button>
                    <button onClick={()=>setEditingInfo(false)} className="px-4 py-2 border-2 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
                  </div>
                </div>
              )}

              {/* PRODUCT TAB */}
              {detailTab==='product' && (
                <div>
                  {!editingProduct ? (
                    <div className="rounded-2xl p-5 border-2" style={{ background:'linear-gradient(135deg,#f5f3ff,#ede9fe)', borderColor:'#c4b5fd' }}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black text-violet-500 uppercase tracking-widest mb-2">Assigned Product</p>
                          {selectedLead.product_id
                            ? <><p className="text-2xl font-black text-violet-900">{selectedLead.product_name||productName(selectedLead.product_id)}</p>
                                {selectedLead.product_detail && <p className="text-sm text-violet-700 mt-1">{selectedLead.product_detail}</p>}</>
                            : <p className="text-slate-500 italic">No product assigned yet</p>}
                        </div>
                        <button onClick={()=>{ setProductForm({product_id:selectedLead.product_id||'',product_detail:selectedLead.product_detail||''}); setEditingProduct(true) }}
                          className="flex items-center gap-1.5 px-4 py-2 bg-white border-2 border-violet-300 text-violet-700 rounded-xl text-sm font-bold hover:bg-violet-50 flex-shrink-0">
                          <EditIcon /> {selectedLead.product_id?'Update':'Assign'} Product
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-2 border-indigo-200 rounded-2xl p-5 space-y-3">
                      <h3 className="font-black text-slate-800">{selectedLead.product_id?'Update Product':'Assign Product'}</h3>
                      <select value={productForm.product_id} onChange={e=>setProductForm(f=>({...f,product_id:e.target.value}))}
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                        <option value="">— Select product —</option>
                        {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                      </select>
                      <textarea rows={2} value={productForm.product_detail} onChange={e=>setProductForm(f=>({...f,product_detail:e.target.value}))}
                        placeholder="Product notes…"
                        className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                      <div className="flex gap-2">
                        <button onClick={saveProductOnLead} disabled={savingProduct}
                          className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                          {savingProduct?'Saving…':'Save Product ✓'}
                        </button>
                        <button onClick={()=>setEditingProduct(false)} className="px-4 py-2 border-2 rounded-xl text-sm font-semibold hover:bg-slate-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* COMMS TAB */}
              {detailTab==='comms' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label:'Call Now', icon:'📞', bg:'#f0fdf4', border:'#86efac', color:'#16a34a', fn:handleDirectCall },
                      { label:'WhatsApp', icon:'💬', bg:'#ecfdf5', border:'#6ee7b7', color:'#059669', fn:handleWhatsApp },
                      { label:'Email',    icon:'✉️', bg:'#eff6ff', border:'#93c5fd', color:'#2563eb', fn:handleEmail },
                    ].map(({ label, icon, bg, border, color, fn }) => (
                      <button key={label} onClick={fn}
                        className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 font-bold text-sm transition-all hover:scale-105 active:scale-95"
                        style={{ background:bg, borderColor:border, color }}>
                        <span className="text-3xl">{icon}</span>{label}
                      </button>
                    ))}
                  </div>
                  <textarea rows={2} value={commNote} onChange={e=>setCommNote(e.target.value)}
                    placeholder="Note to log with action above…"
                    className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                  <div className="flex gap-2">
                    <select value={commType} onChange={e=>setCommType(e.target.value)}
                      className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="call">📞 Call</option>
                      <option value="whatsapp">💬 WhatsApp</option>
                      <option value="email">✉️ Email</option>
                    </select>
                    <button disabled={!commNote.trim()||savingComm} onClick={()=>logComm(commType,commNote)}
                      className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                      {savingComm?'Logging…':'Add Manual Log ✓'}
                    </button>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-700 mb-2">Recent Communications</h3>
                    {commLoading ? <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
                    : !commLogs.length ? <p className="text-sm text-slate-400 text-center py-6 bg-slate-50 rounded-xl">No communications logged yet</p>
                    : (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {commLogs.map(log => (
                          <div key={log.id} className={`bg-slate-50 rounded-xl p-3 border-l-4 ${log.type==='call'?'border-green-400':log.type==='whatsapp'?'border-emerald-400':'border-blue-400'}`}>
                            <div className="flex justify-between mb-1">
                              <span className="text-xs font-bold text-slate-700 capitalize">
                                {log.type==='call'?'📞':log.type==='whatsapp'?'💬':'✉️'} {log.type} · {log.direction}
                              </span>
                              <span className="text-xs text-slate-400">{log.created_at?format(parseISO(log.created_at),'dd MMM HH:mm'):''}</span>
                            </div>
                            {log.note && <p className="text-xs text-slate-600">{log.note}</p>}
                            <p className="text-xs text-slate-400 mt-0.5">by {log.agent_name}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TIMELINE TAB */}
              {detailTab==='log' && (
                <div>
                  <h3 className="text-sm font-black text-slate-700 mb-4">📋 Complete Lead Timeline</h3>
                  {timelineLoading ? (
                    <div className="text-center py-8"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"/><p className="text-slate-400 text-sm">Building timeline…</p></div>
                  ) : !timeline.length ? (
                    <p className="text-sm text-slate-400 text-center py-8 bg-slate-50 rounded-xl">No events recorded</p>
                  ) : (
                    <div className="relative pl-10">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-200 to-slate-100" />
                      <div className="space-y-3">
                        {timeline.map((event, i) => (
                          <div key={event.id||i} className="relative bg-white border-2 rounded-xl p-3 shadow-sm"
                            style={{ borderLeftColor: event.color, borderLeftWidth: 4 }}>
                            <div className="absolute -left-[2.2rem] top-3 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center text-[10px]"
                              style={{ borderColor: event.color }}>
                              {event.icon}
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800">{event.title}</p>
                                {event.detail && <p className="text-xs text-slate-500 mt-1 italic">"{event.detail}"</p>}
                                <p className="text-xs text-slate-400 mt-0.5">by {event.agent}</p>
                              </div>
                              <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                                {event.time ? format(new Date(event.time),'dd MMM HH:mm') : '—'}
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

      {/* ── CREATE MODAL ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl" style={{ background:'linear-gradient(135deg,#312e81,#4f46e5)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center"><PlusIcon /></div>
                <div>
                  <h2 className="text-lg font-black text-white">Add New Lead</h2>
                  <p className="text-indigo-200 text-xs">{isAdmin?'Admin — assign to any agent':'Will be assigned to you'}</p>
                </div>
              </div>
              <button onClick={()=>{ setShowCreateModal(false); setForm(emptyForm) }} className="p-2 rounded-xl hover:bg-white/20 text-white"><XIcon /></button>
            </div>
            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                {[['Full Name *','name','text',true],['Phone *','phone','tel',true],['Email','email','email',false],['City','city','text',false]].map(([label,field,type,req])=>(
                  <div key={field}>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">{label}</label>
                    <input required={req} type={type} value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
                      className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300" />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Source</label>
                  <select value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">— Select —</option>
                    {settings.sources.map(s=><option key={s?.key||s} value={s?.label||s}>{s?.label||s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Lead Type</label>
                  <div className="flex gap-2">
                    {['B2B','B2C'].map(lt=>(
                      <button key={lt} type="button" onClick={()=>setForm(f=>({...f,lead_type:lt}))}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all ${form.lead_type===lt?'border-indigo-600 bg-indigo-600 text-white':'border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                        {lt}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">School / Org</label>
                  <input value={form.school_name||''} onChange={e=>setForm(f=>({...f,school_name:e.target.value}))} list="sl-create"
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  <datalist id="sl-create">{schools.map(s=><option key={s} value={s}/>)}</datalist>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Product</label>
                  <select value={form.product_id} onChange={e=>setForm(f=>({...f,product_id:e.target.value}))}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="">— No product —</option>
                    {products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    {Object.keys(STATUS_COLORS).map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">📅 Follow-up Date</label>
                  <input type="date" value={form.follow_up_date} onChange={e=>setForm(f=>({...f,follow_up_date:e.target.value}))}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Notes / Remark</label>
                  <textarea rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    placeholder="Any initial notes…"
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">Assign To</label>
                  <select value={form.assigned_to||user?.id||''} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}
                    className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value={user?.id||''}>{user?.name||'Me'} (me)</option>
                    {agents.filter(a=>a.id!==user?.id).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </form>
            <div className="flex justify-between items-center px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={()=>{ setShowCreateModal(false); setForm(emptyForm) }}
                className="px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-100 text-slate-600">Cancel</button>
              <button onClick={handleCreate} disabled={saving||!form.name||!form.phone}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 disabled:opacity-40 shadow-lg shadow-indigo-200 active:scale-95 transition-all">
                {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Creating…</>:<><PlusIcon/>Create Lead</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PASTE MODAL ── */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-lg font-black">📋 Copy Paste Import</h2>
              <button onClick={()=>setShowPasteModal(false)} className="p-2 rounded-xl hover:bg-slate-100"><XIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {pasteStep===1 && (<>
                <p className="text-sm text-slate-500">Paste rows from Excel or Google Sheets. First row can be a header.</p>
                <textarea rows={8} value={pasteText} onChange={e=>setPasteText(e.target.value)}
                  placeholder="Name	Phone	Email	City	Source	Product"
                  className="w-full border-2 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Default Product</label>
                    <select value={pasteProduct} onChange={e=>setPasteProduct(e.target.value)}
                      className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="">— No product —</option>
                      {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Lead Type</label>
                    <div className="flex gap-2">
                      {['B2B','B2C'].map(lt=>(
                        <button key={lt} type="button" onClick={()=>setPasteLeadType(lt)}
                          className={`flex-1 py-2 rounded-xl text-xs font-black border-2 transition-all ${pasteLeadType===lt?'border-indigo-600 bg-indigo-600 text-white':'border-slate-200 text-slate-500'}`}>{lt}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <input value={pasteComment} onChange={e=>setPasteComment(e.target.value)}
                  placeholder="Upload comment (applies to all rows)…"
                  className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                <div className="flex justify-end gap-2">
                  <button onClick={()=>setShowPasteModal(false)} className="px-4 py-2 border-2 rounded-xl text-sm font-bold">Cancel</button>
                  <button onClick={parsePasteText} disabled={!pasteText.trim()}
                    className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">Parse Preview →</button>
                </div>
              </>)}
              {pasteStep===2 && (<>
                <p className="text-sm font-semibold text-slate-600">{pasteRows.length} leads parsed:</p>
                <div className="overflow-x-auto rounded-xl border-2 text-xs max-h-64">
                  <table className="min-w-full">
                    <thead className="bg-slate-50"><tr>
                      {['Name','Phone','Email','City','Source','Product'].map(h=><th key={h} className="px-3 py-2 text-left font-bold text-slate-500">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {pasteRows.map(r=>(
                        <tr key={r._key}>
                          <td className="px-3 py-1.5 font-medium">{r.name}</td>
                          <td className="px-3 py-1.5 font-mono">{r.phone}</td>
                          <td className="px-3 py-1.5">{r.email}</td>
                          <td className="px-3 py-1.5">{r.city}</td>
                          <td className="px-3 py-1.5">{r.source}</td>
                          <td className="px-3 py-1.5">{r.product?<span className="text-indigo-600 font-bold">{r.product}</span>:<span className="text-slate-300">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={()=>setPasteStep(1)} className="px-4 py-2 border-2 rounded-xl text-sm font-bold">← Back</button>
                  <button onClick={submitPasteLeads} disabled={saving}
                    className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50">
                    {saving?'Importing…':`Import ${pasteRows.length} Leads 🎉`}
                  </button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}

      {/* ── EXCEL IMPORT MODAL ── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-lg font-black">📊 Import from Excel</h2>
              <button onClick={()=>setShowImportModal(false)} className="p-2 rounded-xl hover:bg-slate-100"><XIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {importStep===1 && (<>
                <p className="text-sm text-slate-500">Upload <strong>.xlsx</strong> or <strong>.csv</strong>. Columns: Name, Phone, Email, City, Source, Product.</p>
                <div className="border-2 border-dashed border-indigo-200 rounded-2xl p-10 text-center hover:border-indigo-400 cursor-pointer hover:bg-indigo-50 transition-colors"
                  onClick={()=>fileInputRef.current?.click()}>
                  <div className="text-4xl mb-2">📂</div>
                  <p className="font-bold text-slate-600">Click to select file</p>
                  <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv supported</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                </div>
                <div className="flex justify-between">
                  <button onClick={downloadTemplate} className="px-4 py-2 border-2 border-indigo-200 rounded-xl text-sm font-bold text-indigo-600 hover:bg-indigo-50">Download Template</button>
                  <button onClick={()=>setShowImportModal(false)} className="px-4 py-2 border-2 rounded-xl text-sm font-bold">Cancel</button>
                </div>
              </>)}
              {importStep===2 && (<>
                <p className="text-sm font-semibold text-slate-600">{importRows.length} rows in <strong>{importFile?.name}</strong></p>
                <div className="overflow-x-auto rounded-xl border-2 text-xs max-h-64">
                  <table className="min-w-full">
                    <thead className="bg-slate-50"><tr>
                      {Object.keys(importRows[0]||{}).slice(0,7).map(h=><th key={h} className="px-3 py-2 text-left font-bold text-slate-500 capitalize">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {importRows.slice(0,10).map((r,i)=>(
                        <tr key={i}>{Object.entries(r).slice(0,7).map(([k,v])=>(
                          <td key={k} className={`px-3 py-1.5 ${(k==='product'||k==='course')?'text-indigo-600 font-bold':''}`}>{v}</td>
                        ))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={()=>{ setImportStep(1); setImportRows([]) }} className="px-4 py-2 border-2 rounded-xl text-sm font-bold">← Back</button>
                  <button onClick={submitExcelLeads} disabled={saving}
                    className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50">
                    {saving?'Importing…':`Import ${importRows.length} Leads 🎉`}
                  </button>
                </div>
              </>)}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
