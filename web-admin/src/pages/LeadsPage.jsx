// =============================================================
//  ThynkFlow — LeadsPage.jsx  (FULL REPLACEMENT)
//  web-admin/src/pages/LeadsPage.jsx
//
//  New features in this version:
//  1. Communication Panel (WhatsApp / Call / Email) with Activity Log
//  2. Product Assignment — 3 flows:
//       A. During lead creation (copy-paste or Excel import with Product column)
//       B. Post-call update (lead created without product)
//       C. Edit/update product on any existing lead
//  3. Direct-call-from-portal via tel: URI (opens device dialer)
//     + optional WebRTC / Twilio section commented at bottom
// =============================================================

import React, { useEffect, useState, useCallback, useRef } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'

// ─── icons (inline SVG helpers) ───────────────────────────────
const Icon = ({ d, cls = '', size = 16, fill = 'none', stroke = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cls}>
    <path d={d} />
  </svg>
)

const PhoneIcon = () => <Icon d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 013.29 5.18 2 2 0 015.27 3h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L9.91 10.91a16 16 0 006.18 6.18l1.27-.63a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
const WAIcon   = () => <Icon d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
const MailIcon = () => <Icon d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6" />
const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />
const EditIcon = () => <Icon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
const TrashIcon = () => <Icon d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
const XIcon    = () => <Icon d="M18 6L6 18M6 6l12 12" />
const UploadIcon = () => <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
const ClipIcon = () => <Icon d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z" />
const LogIcon  = () => <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
const PackageIcon = () => <Icon d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />

const API = 'https://thynkflow.onrender.com/api'

// ── status colours ──────────────────────────────────────────────
const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-800',
  hot: 'bg-red-100 text-red-800',
  warm: 'bg-orange-100 text-orange-800',
  cold: 'bg-slate-100 text-slate-700',
  converted: 'bg-green-100 text-green-800',
  not_interested: 'bg-gray-100 text-gray-600',
  call_back: 'bg-purple-100 text-purple-800',
}

function Badge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

// ═══════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════
export default function LeadsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  // ── data ──────────────────────────────────────────────────────
  const [leads, setLeads]             = useState([])
  const [products, setProducts]       = useState([])
  const [agents, setAgents]           = useState([])
  const [settings, setSettings]       = useState({ statuses: [], sources: [], cities: [], lead_types: [] })
  const [loading, setLoading]         = useState(true)
  const [totalCount, setTotalCount]   = useState(0)

  // ── filters ───────────────────────────────────────────────────
  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAgent, setFilterAgent]   = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterSchool, setFilterSchool]   = useState('')
  const [schools, setSchools]             = useState([]) // unique school names
  const [page, setPage]               = useState(1)
  const PER_PAGE = 25

  // ── modals ────────────────────────────────────────────────────
  const [showCreateModal, setShowCreateModal]     = useState(false)
  const [showPasteModal, setShowPasteModal]       = useState(false)
  const [showImportModal, setShowImportModal]     = useState(false)
  const [showDetailModal, setShowDetailModal]     = useState(false)
  const [selectedLead, setSelectedLead]           = useState(null)
  const [detailTab, setDetailTab]                 = useState('info') // 'info' | 'product' | 'comms'
  const [editingInfo, setEditingInfo]             = useState(false)
  const [editForm, setEditForm]                   = useState({})
  const [savingEdit, setSavingEdit]               = useState(false)

  // ── create form ───────────────────────────────────────────────
  const emptyForm = {
    name: '', phone: '', email: '', source: '', city: '',
    school_name: '', lead_type: 'B2C', creation_comment: '',
    status: 'new', assigned_to: '', product_id: '', // assigned_to set to user.id on open
    product_detail: '', admin_remark: '', follow_up_date: '',
    notes: ''
  }
  const [form, setForm]               = useState(emptyForm)
  const [saving, setSaving]           = useState(false)

  // ── paste modal ───────────────────────────────────────────────
  const [pasteText, setPasteText]     = useState('')
  const [pasteProduct, setPasteProduct]   = useState('')
  const [pasteLeadType, setPasteLeadType] = useState('B2C')
  const [pasteComment, setPasteComment]   = useState('')
  const [pasteRows, setPasteRows]     = useState([])
  const [pasteStep, setPasteStep]     = useState(1) // 1=paste, 2=preview

  // ── import modal ──────────────────────────────────────────────
  const [importFile, setImportFile]   = useState(null)
  const [importRows, setImportRows]   = useState([])
  const [importStep, setImportStep]   = useState(1)
  const fileInputRef                  = useRef()

  // ── communication panel ───────────────────────────────────────
  const [commLogs, setCommLogs]       = useState([])
  const [commLoading, setCommLoading] = useState(false)
  const [commNote, setCommNote]       = useState('')
  const [commType, setCommType]       = useState('call')
  const [savingComm, setSavingComm]   = useState(false)

  // ── product update (inline on detail) ─────────────────────────
  const [editingProduct, setEditingProduct] = useState(false)
  const [productForm, setProductForm] = useState({ product_id: '', product_detail: '' })
  const [savingProduct, setSavingProduct] = useState(false)

  // ══════════════════════════════════════════════════════════════
  //  FETCH
  // ══════════════════════════════════════════════════════════════
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page, per_page: PER_PAGE,
        ...(search && { search }),
        ...(filterStatus  && { status:     filterStatus }),
        ...(filterAgent   && { assigned_to: filterAgent }),
        ...(filterProduct && { product_id:  filterProduct }),
        ...(filterSchool  && { school_name: filterSchool }),
      })
      const [leadsRes, prodRes, agentRes, settRes] = await Promise.all([
        api.get(`/leads?${params}`),
        api.get('/products/active'),
        api.get('/chat/users').catch(() => ({ data: { data: [] } })),
        api.get('/settings'),
      ])
      // Leads endpoint may return { data, total } or just array
      const raw = leadsRes.data
      if (Array.isArray(raw)) {
        setLeads(raw); setTotalCount(raw.length)
      } else {
        setLeads(raw.data || []); setTotalCount(raw.total || 0)
      }
      setProducts(prodRes.data?.data || prodRes.data || [])
      setAgents(Array.isArray(agentRes.data?.data) ? agentRes.data.data : (Array.isArray(agentRes.data) ? agentRes.data : []))
      // settings returns { statuses, sources, cities } or similar
      const s = settRes.data?.data || settRes.data || {}
      const schoolList = (s.school_name || s.schools || [])
        .map(x => typeof x === 'string' ? x : (x.label || x.value || x))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      setSchools(schoolList)
      setSettings({
        statuses:   s.lead_status || s.statuses || s.status || [],
        sources:    s.lead_source || s.sources  || s.source  || [],
        cities:     s.city        || s.cities   || [],
        lead_types: s.lead_type   || s.lead_types || [],
        schools:    schoolList,
      })
    } catch (err) {
      toast.error('Failed to load leads')
    } finally { setLoading(false) }
  }, [page, search, filterStatus, filterAgent, filterProduct, filterSchool, isAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ══════════════════════════════════════════════════════════════
  //  OPEN LEAD DETAIL
  // ══════════════════════════════════════════════════════════════
  // helpers
  const getPhone = (lead) => lead?.phone || lead?.mobile || ''
  const getName  = (lead) => lead?.name || lead?.contact_name || lead?.school_name || ''

  const openDetail = async (lead) => {
    setSelectedLead(lead)
    setDetailTab('info')
    setEditingInfo(false)
    setEditingProduct(false)
    setProductForm({ product_id: lead.product_id || '', product_detail: lead.product_detail || '' })
    setEditForm({
      name:         getName(lead),
      phone:        getPhone(lead),
      email:        lead.email || '',
      city:         lead.city  || '',
      source:           lead.source || '',
      school_name:      lead.school_name || '',
      lead_type:        lead.lead_type || '',
      creation_comment: lead.creation_comment || '',
      status:       lead.status || 'new',
      assigned_to:  lead.assigned_to || '',
      admin_remark: lead.admin_remark || '',
    })
    setShowDetailModal(true)
    fetchCommLogs(lead.id)
  }

  const saveEditForm = async () => {
    if (!selectedLead) return
    setSavingEdit(true)
    try {
      await api.put(`/leads/${selectedLead.id}`, { ...editForm, contact_name: editForm.name, school_name: editForm.school_name })
      const updated = { ...selectedLead, ...editForm }
      setSelectedLead(updated)
      setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...editForm } : l))
      setEditingInfo(false)
      toast.success('Lead updated')
      // Auto-add school name to settings if new
      if (editForm.school_name?.trim()) {
        const sn = editForm.school_name.trim()
        if (!schools.includes(sn)) {
          api.post('/settings', { category: 'school_name', label: sn, key: sn.toLowerCase().replace(/[^a-z0-9]/g,'_'), color: '#0891b2', sort_order: 0 }).catch(() => {})
          setSchools(prev => [...new Set([...prev, sn])].sort((a,b) => a.localeCompare(b)))
        }
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update lead')
    } finally { setSavingEdit(false) }
  }

  // ══════════════════════════════════════════════════════════════
  //  COMMUNICATION LOGS
  // ══════════════════════════════════════════════════════════════
  const fetchCommLogs = async (leadId) => {
    setCommLoading(true)
    try {
      const res = await api.get(`/leads/${leadId}/communications`)
      setCommLogs(res.data?.data || res.data || [])
    } catch { setCommLogs([]) }
    finally { setCommLoading(false) }
  }

  const logComm = async (type, note = '', extra = {}) => {
    if (!selectedLead) return
    setSavingComm(true)
    try {
      await api.post(`/leads/${selectedLead.id}/communications`, {
        type, direction: 'outbound', note, ...extra
      })
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} logged`)
      setCommNote('')
      fetchCommLogs(selectedLead.id)
    } catch (err) {
      toast.error(err.message || 'Failed to log')
    } finally { setSavingComm(false) }
  }

  // Direct call from portal — opens device dialer
  const handleDirectCall = () => {
    if (!selectedLead?.phone) return toast.error('No phone number')
    const tel = `tel:${selectedLead.phone.replace(/\s+/g, '')}`
    window.open(tel, '_self')
    // Auto-log the call attempt
    logComm('call', commNote || 'Call initiated from portal')
  }

  const handleWhatsApp = () => {
    if (!selectedLead?.phone) return toast.error('No phone number')
    const phone = selectedLead.phone.replace(/[^0-9]/g, '')
    // Use wa.me — works on web & mobile
    const url = `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}`
    window.open(url, '_blank')
    logComm('whatsapp', commNote || 'WhatsApp opened from portal')
  }

  const handleEmail = () => {
    if (!selectedLead?.email) return toast.error('No email address')
    const subject = encodeURIComponent(`Following up — ThynkFlow`)
    const body    = encodeURIComponent(commNote || '')
    window.open(`mailto:${selectedLead.email}?subject=${subject}&body=${body}`, '_self')
    logComm('email', commNote || 'Email client opened from portal')
  }

  // ══════════════════════════════════════════════════════════════
  //  PRODUCT UPDATE ON LEAD
  // ══════════════════════════════════════════════════════════════
  const saveProductOnLead = async () => {
    if (!selectedLead) return
    setSavingProduct(true)
    try {
      const res = await api.patch(`/leads/${selectedLead.id}/product`, productForm)
      const updated = res.data?.data || res.data
      setSelectedLead(updated)
      // Refresh leads list too
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l))
      setEditingProduct(false)
      toast.success('Product updated on lead')
    } catch (err) {
      toast.error(err.message || 'Failed to update product')
    } finally { setSavingProduct(false) }
  }

  // ══════════════════════════════════════════════════════════════
  //  CREATE LEAD (single)
  // ══════════════════════════════════════════════════════════════
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name || !form.name.trim()) return toast.error('Name is required')
    if (!form.phone || !form.phone.trim()) return toast.error('Phone is required')
    setSaving(true)
    try {
      const res = await api.post('/leads', {
        name:             form.name.trim(),
        contact_name:     form.name.trim(),
        school_name:      form.school_name?.trim()      || null,
        lead_type:        form.lead_type                || null,
        creation_comment: form.creation_comment?.trim() || null,
        phone:            form.phone.trim(),
        email:          form.email.trim() || null,
        city:           form.city || null,
        source:         form.source || null,
        status:         form.status || 'new',
        product_id:     form.product_id     || null,
        product_detail: form.product_detail || null,
        assigned_to:    form.assigned_to    || null,
        admin_remark:   form.admin_remark   || null,
      })
      // Create follow-up if date provided
      if (form.follow_up_date) {
        const newLead = res.data?.data || res.data
        const leadId  = newLead?.id
        if (leadId) {
          await api.post('/followups', {
            lead_id:        leadId,
            follow_up_date: form.follow_up_date,
            notes:          form.notes || form.admin_remark || '',
          }).catch(() => {})
        }
      }
      toast.success('Lead created successfully!')
      // Auto-add school name to settings if new
      if (form.school_name?.trim()) {
        const sn = form.school_name.trim()
        if (!schools.includes(sn)) {
          api.post('/settings', { category: 'school_name', label: sn, key: sn.toLowerCase().replace(/[^a-z0-9]/g,'_'), color: '#0891b2', sort_order: 0 }).catch(() => {})
          setSchools(prev => [...new Set([...prev, sn])].sort((a,b) => a.localeCompare(b)))
        }
      }
      setShowCreateModal(false)
      setForm(emptyForm)
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'Failed to create lead')
    } finally { setSaving(false) }
  }

  // ══════════════════════════════════════════════════════════════
  //  PASTE MODAL — parse tab/comma separated text
  // ══════════════════════════════════════════════════════════════
  const parsePasteText = () => {
    const lines = pasteText.trim().split('\n').filter(l => l.trim())
    if (!lines.length) return toast.error('Nothing to parse')
    // Detect separator
    const sep = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase())
    const colIdx = (names) => names.reduce((best, n) => {
      const i = headers.findIndex(h => h.includes(n))
      return i !== -1 ? i : best
    }, -1)

    const nameIdx    = colIdx(['name', 'full name', 'student'])
    const phoneIdx   = colIdx(['phone', 'mobile', 'contact', 'number'])
    const emailIdx   = colIdx(['email', 'mail'])
    const cityIdx    = colIdx(['city', 'location'])
    const sourceIdx    = colIdx(['source', 'channel'])
    const leadTypeIdx  = colIdx(['lead_type', 'type', 'b2b/b2c', 'lead type'])
    const schoolIdx    = colIdx(['school_name', 'school', 'organisation', 'organization'])
    const commentIdx   = colIdx(['creation_comment', 'comment', 'upload comment'])
    const productIdx = colIdx(['product', 'course', 'program'])

    const dataLines = nameIdx >= 0 ? lines.slice(1) : lines // no header → treat all as data
    const rows = dataLines.map((line, i) => {
      const cols = line.split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
      if (nameIdx >= 0) {
        return {
          _key: i,
          name:    cols[nameIdx]    || '',
          phone:   cols[phoneIdx]   || '',
          email:   cols[emailIdx]   || '',
          city:    cols[cityIdx]    || '',
          source:           cols[sourceIdx]   || '',
          lead_type:        cols[leadTypeIdx]  || '',
          school_name:      cols[schoolIdx]    || '',
          creation_comment: cols[commentIdx]   || '',
          product: cols[productIdx] || '',
        }
      }
      // Fallback: assume col 0=name, col 1=phone
      return { _key: i, name: cols[0] || '', phone: cols[1] || '', email: '', city: '', source: '', product: '' }
    }).filter(r => r.name || r.phone)

    setPasteRows(rows)
    setPasteStep(2)
  }

  const submitPasteLeads = async () => {
    if (!pasteRows.length) return
    setSaving(true)
    try {
      // Resolve product names → IDs
      const productNames = [...new Set(pasteRows.map(r => r.product).filter(Boolean))]
      let productMap = {}
      if (productNames.length) {
        const res = await api.post('/leads/lookup-products', { names: productNames })
        productMap = res.data?.data || {}
      }
      const payload = pasteRows.map(r => ({
        name:       r.name,
        phone:            r.phone,
        email:            r.email,
        city:             r.city,
        source:           r.source,
        school_name:      r.school_name || '',
        lead_type:        r.lead_type || pasteLeadType || 'B2C',
        creation_comment: r.creation_comment || pasteComment || '',
        status:           'new',
        product_id: r.product ? (productMap[r.product.toLowerCase()] || null) : (pasteProduct || null),
      }))
      await api.post('/leads/bulk', { leads: payload })
      toast.success(`${payload.length} leads imported`)
      // Auto-add any new school names to settings
      const newSchools = [...new Set(payload.map(r => r.school_name).filter(Boolean))]
        .filter(s => !schools.includes(s))
      for (const sn of newSchools) {
        api.post('/settings', { category: 'school_name', label: sn, key: sn.toLowerCase().replace(/[^a-z0-9]/g,'_'), color: '#0891b2', sort_order: 0 }).catch(() => {})
      }
      if (newSchools.length) setSchools(prev => [...new Set([...prev, ...newSchools])].sort((a,b) => a.localeCompare(b)))
      setShowPasteModal(false)
      setPasteText(''); setPasteRows([]); setPasteStep(1); setPasteProduct('')
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'Bulk import failed')
    } finally { setSaving(false) }
  }

  // ══════════════════════════════════════════════════════════════
  //  EXCEL IMPORT — parses xlsx/csv, supports "Product" column
  // ══════════════════════════════════════════════════════════════
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb  = XLSX.read(evt.target.result, { type: 'binary' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const normalise = (obj) => {
        const o = {}
        Object.entries(obj).forEach(([k, v]) => { o[k.toLowerCase().trim()] = String(v).trim() })
        return o
      }
      setImportRows(raw.map(normalise))
      setImportStep(2)
    }
    reader.readAsBinaryString(file)
  }

  const submitExcelLeads = async () => {
    if (!importRows.length) return
    setSaving(true)
    try {
      const colAlias = (row, ...aliases) => {
        for (const a of aliases) { if (row[a] !== undefined && row[a] !== '') return row[a] }
        return ''
      }
      const productNames = [...new Set(importRows.map(r => colAlias(r, 'product', 'course', 'program')).filter(Boolean))]
      let productMap = {}
      if (productNames.length) {
        const res = await api.post('/leads/lookup-products', { names: productNames })
        productMap = res.data?.data || {}
      }
      const payload = importRows.map(r => ({
        name:             colAlias(r, 'name', 'full name', 'student name'),
        contact_name:     colAlias(r, 'name', 'full name', 'student name'),
        phone:            colAlias(r, 'phone', 'mobile', 'contact', 'phone number'),
        email:            colAlias(r, 'email', 'email address', 'mail'),
        city:             colAlias(r, 'city', 'location'),
        source:           colAlias(r, 'source', 'lead source', 'channel'),
        school_name:      colAlias(r, 'school name', 'school', 'organisation', 'organization', 'company'),
        lead_type:        colAlias(r, 'lead type', 'type', 'b2b/b2c', 'lead_type') || 'B2C',
        creation_comment: colAlias(r, 'creation comment', 'comment', 'upload comment', 'notes', 'creation_comment'),
        status:           'new',
        product_id: (() => {
          const pname = colAlias(r, 'product', 'course', 'program')
          return pname ? (productMap[pname.toLowerCase()] || null) : null
        })(),
      })).filter(r => r.name || r.phone)

      await api.post('/leads/bulk', { leads: payload })
      toast.success(`${payload.length} leads imported from Excel`)
      // Auto-add new school names to settings
      const xlNewSchools = [...new Set(payload.map(r => r.school_name).filter(Boolean))]
        .filter(s => !schools.includes(s))
      for (const sn of xlNewSchools) {
        api.post('/settings', { category: 'school_name', label: sn, key: sn.toLowerCase().replace(/[^a-z0-9]/g,'_'), color: '#0891b2', sort_order: 0 }).catch(() => {})
      }
      if (xlNewSchools.length) setSchools(prev => [...new Set([...prev, ...xlNewSchools])].sort((a,b) => a.localeCompare(b)))
      setShowImportModal(false)
      setImportFile(null); setImportRows([]); setImportStep(1)
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchAll()
    } catch (err) {
      toast.error(err.message || 'Excel import failed')
    } finally { setSaving(false) }
  }

  // Download template — includes Product column
  const downloadTemplate = () => {
    const wb  = XLSX.utils.book_new()
    const ws  = XLSX.utils.aoa_to_sheet([
      ['Name', 'Phone', 'Email', 'City', 'Source', 'Lead Type', 'School Name', 'Product', 'Creation Comment'],
      ['Rahul Sharma', '9876543210', 'rahul@example.com', 'Mumbai', 'Website', 'B2C', 'Delhi Public School', products[0]?.name || '', 'April campaign'],
      ['Priya Singh',  '9812345678', 'priya@example.com',  'Delhi',  'Referral', 'B2B', 'ABC Corp Pvt Ltd', products[1]?.name || '', 'Referral lead'],
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Leads')
    XLSX.writeFile(wb, 'thynkflow_leads_template.xlsx')
  }

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  const totalPages = Math.ceil(totalCount / PER_PAGE)
  const productName = (id) => products.find(p => p.id === parseInt(id))?.name || '—'

  return (
    <div className="p-4 max-w-full">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Leads <span className="text-gray-400 text-sm font-normal">({totalCount})</span></h1>
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

      {/* ── Filters ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search name, phone, email…"
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Products</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterAgent} onChange={e => { setFilterAgent(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {schools.length > 0 && (
          <select value={filterSchool} onChange={e => { setFilterSchool(e.target.value); setPage(1) }}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">All Schools</option>
            {schools.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {/* ── Leads Table ────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading leads…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Name','School','Type','Phone','Product','Status','Agent','Date','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!leads.length && (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">No leads found</td></tr>
              )}
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(lead)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{lead.name || lead.contact_name || lead.school_name}</div>
                    {lead.creation_comment && <div className="text-xs text-gray-400 truncate max-w-[160px]" title={lead.creation_comment}>📝 {lead.creation_comment}</div>}
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
                          <PackageIcon /> {productName(lead.product_id)}
                        </span>
                      : <span className="text-gray-400 text-xs italic">No product</span>
                    }
                  </td>
                  <td className="px-4 py-3"><Badge status={lead.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{lead.agent_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {lead.created_at ? format(parseISO(lead.created_at), 'dd MMM yy') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openDetail(lead)} className="p-1.5 rounded hover:bg-indigo-50 text-indigo-600" title="Open detail">
                        <EditIcon />
                      </button>
                      {/* Quick action buttons */}
                      <button onClick={() => {
                        const p = lead.phone || lead.mobile || ''
                        if (!p) return toast.error('No phone number')
                        window.open(`tel:${p.replace(/\s+/g,'')}`, '_self')
                      }} className="p-1.5 rounded hover:bg-green-50 text-green-600" title="Call now">
                        <PhoneIcon />
                      </button>
                      <button onClick={() => {
                        const phone = (lead.phone || lead.mobile || '').replace(/[^0-9]/g, '')
                        if (!phone) return toast.error('No phone number')
                        window.open(`https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}`, '_blank')
                      }} className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600" title="WhatsApp">
                        <WAIcon />
                      </button>
                      <button onClick={() => {
                        if (!lead.email) return toast.error('No email')
                        window.open(`mailto:${lead.email}`, '_self')
                      }} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Email">
                        <MailIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center mt-4">
          <button disabled={page === 1} onClick={() => setPage(p => p-1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span className="px-3 py-1.5 text-sm text-gray-600">{page} / {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p+1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           LEAD DETAIL MODAL (tabbed: Info | Product | Comms)
         ══════════════════════════════════════════════════════ */}
      {showDetailModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedLead.name}</h2>
                <p className="text-sm text-gray-500">{selectedLead.phone} · {selectedLead.email || 'no email'}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <XIcon />
              </button>
            </div>

            {/* tabs */}
            <div className="flex border-b px-6">
              {[['info','ℹ️ Info'], ['product','📦 Product'], ['comms','💬 Comms & Log']].map(([key, label]) => (
                <button key={key} onClick={() => setDetailTab(key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${detailTab === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* ─── TAB: INFO ──────────────────────────────── */}
              {detailTab === 'info' && (
                <div>
                  {!editingInfo ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {[
                          ['Name',         getName(selectedLead)],
                          ['Phone',        getPhone(selectedLead) || '—'],
                          ['Email',        selectedLead.email || '—'],
                          ['Lead Type',    selectedLead.lead_type || '—'],
                          ['School / Org',  selectedLead.school_name || '—'],
                          ['Source',       selectedLead.source || '—'],
                          ['City',         selectedLead.city || '—'],
                          ['Assigned To',  selectedLead.agent_name || '—'],
                          ['Created',      selectedLead.created_at ? format(parseISO(selectedLead.created_at), 'dd MMM yyyy HH:mm') : '—'],
                          ['Admin Remark', selectedLead.admin_remark || '—'],
                          ['Creation Note',selectedLead.creation_comment || '—'],
                        ].map(([label, val]) => (
                          <div key={label} className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs text-gray-500 mb-1">{label}</p>
                            <div className="font-medium text-gray-800 text-sm">{val}</div>
                          </div>
                        ))}
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">Status</p>
                          <div className="font-medium text-gray-800 text-sm"><Badge status={selectedLead.status} /></div>
                        </div>
                      </div>
                      <button onClick={() => setEditingInfo(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-indigo-300 text-indigo-600 rounded-xl hover:bg-indigo-50 text-sm font-medium">
                        <EditIcon /> Edit Lead Info
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="font-semibold text-gray-800 mb-1">Edit Lead</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
                          <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                          <input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                          <input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                          <select value={editForm.source} onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="">— Select source —</option>
                            {settings.sources.map(s => <option key={s?.key||s} value={s?.label||s}>{s?.label||s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Lead Type</label>
                          <select value={editForm.lead_type || ''} onChange={e => setEditForm(f => ({ ...f, lead_type: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="">— Select type —</option>
                            {settings.lead_types?.length > 0
                              ? settings.lead_types.map(t => <option key={t?.key||t} value={t?.label||t}>{t?.label||t}</option>)
                              : [['B2B','B2B'],['B2C','B2C']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">School / Organisation</label>
                          <input value={editForm.school_name || ''} onChange={e => setEditForm(f => ({ ...f, school_name: e.target.value }))}
                            placeholder="Type or select school name…"
                            list="school-list-edit"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          <datalist id="school-list-edit">
                            {schools.map(s => <option key={s} value={s} />)}
                          </datalist>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Creation Comment</label>
                          <input value={editForm.creation_comment || ''} onChange={e => setEditForm(f => ({ ...f, creation_comment: e.target.value }))}
                            placeholder="Upload batch, campaign name…"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Lead Type</label>
                          <div className="flex gap-2">
                            {(settings.lead_types.length > 0
                              ? settings.lead_types.map(t => typeof t === 'string' ? t : (t.label || t.value || t))
                              : ['B2B', 'B2C']
                            ).map(lt => (
                              <button key={lt} type="button"
                                onClick={() => setEditForm(f => ({ ...f, lead_type: lt }))}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${editForm.lead_type === lt ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600'}`}>
                                {lt}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                          <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Assign To</label>
                          <select value={editForm.assigned_to || user?.id || ''} onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value={user?.id || ''}>{user?.name || 'Me'} (me — default)</option>
                            {agents.filter(a => a.id !== user?.id).map(a => <option key={a.id} value={a.id}>{a.name} — {a.role_name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Admin Remark</label>
                          <textarea rows={2} value={editForm.admin_remark}
                            onChange={e => setEditForm(f => ({ ...f, admin_remark: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={saveEditForm} disabled={savingEdit}
                          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                          {savingEdit ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button onClick={() => setEditingInfo(false)}
                          className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── TAB: PRODUCT ──────────────────────────── */}
              {detailTab === 'product' && (
                <div>
                  {/* current product display */}
                  {!editingProduct ? (
                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide mb-1">Assigned Product</p>
                          {selectedLead.product_id
                            ? <>
                                <p className="text-lg font-bold text-indigo-900">{productName(selectedLead.product_id)}</p>
                                {selectedLead.product_detail && (
                                  <p className="text-sm text-indigo-700 mt-1">{selectedLead.product_detail}</p>
                                )}
                              </>
                            : <p className="text-gray-500 italic">No product assigned yet</p>
                          }
                        </div>
                        <button onClick={() => {
                          setProductForm({ product_id: selectedLead.product_id || '', product_detail: selectedLead.product_detail || '' })
                          setEditingProduct(true)
                        }} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-sm hover:bg-indigo-50">
                          <EditIcon /> {selectedLead.product_id ? 'Update' : 'Assign'} Product
                        </button>
                      </div>
                    </div>
                  ) : (
                    // edit form
                    <div className="border border-indigo-200 rounded-xl p-4 bg-white">
                      <h3 className="font-semibold text-gray-800 mb-3">{selectedLead.product_id ? 'Update Product' : 'Assign Product'}</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                          <select value={productForm.product_id} onChange={e => setProductForm(f => ({ ...f, product_id: e.target.value }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                            <option value="">— Select product —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Product Notes (optional)</label>
                          <textarea rows={2} value={productForm.product_detail}
                            onChange={e => setProductForm(f => ({ ...f, product_detail: e.target.value }))}
                            placeholder="e.g. 6-month plan, batch starting April…"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveProductOnLead} disabled={savingProduct}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                            {savingProduct ? 'Saving…' : 'Save Product'}
                          </button>
                          <button onClick={() => setEditingProduct(false)}
                            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* product history hint */}
                  <p className="text-xs text-gray-400 mt-3">
                    Product changes are saved directly on the lead and reflected in reports and the Product Dashboard.
                  </p>
                </div>
              )}

              {/* ─── TAB: COMMS & LOG ──────────────────────── */}
              {detailTab === 'comms' && (
                <div className="space-y-5">

                  {/* Quick action buttons */}
                  <div className="grid grid-cols-3 gap-3">
                    <button onClick={handleDirectCall}
                      className="flex flex-col items-center gap-2 p-4 bg-green-50 border-2 border-green-200 rounded-xl hover:bg-green-100 transition-colors group">
                      <span className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center group-hover:bg-green-600">
                        <PhoneIcon />
                      </span>
                      <span className="text-sm font-semibold text-green-800">Call Now</span>
                      <span className="text-xs text-green-600 text-center">Opens dialer on your device</span>
                    </button>

                    <button onClick={handleWhatsApp}
                      className="flex flex-col items-center gap-2 p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors group">
                      <span className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center group-hover:bg-emerald-600">
                        <WAIcon />
                      </span>
                      <span className="text-sm font-semibold text-emerald-800">WhatsApp</span>
                      <span className="text-xs text-emerald-600 text-center">Opens wa.me in new tab</span>
                    </button>

                    <button onClick={handleEmail}
                      className="flex flex-col items-center gap-2 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 transition-colors group">
                      <span className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center group-hover:bg-blue-600">
                        <MailIcon />
                      </span>
                      <span className="text-sm font-semibold text-blue-800">Email</span>
                      <span className="text-xs text-blue-600 text-center">Opens mail client</span>
                    </button>
                  </div>

                  {/* note for this comm */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Note / Discussion (optional — logged with the action above)</label>
                    <textarea rows={2} value={commNote} onChange={e => setCommNote(e.target.value)}
                      placeholder="e.g. Discussed pricing, follow up on Thursday…"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                  </div>

                  {/* manual log entry */}
                  <div className="flex gap-2">
                    <select value={commType} onChange={e => setCommType(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="call">📞 Call</option>
                      <option value="whatsapp">💬 WhatsApp</option>
                      <option value="email">✉️ Email</option>
                    </select>
                    <button disabled={!commNote.trim() || savingComm}
                      onClick={() => logComm(commType, commNote)}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">
                      <LogIcon /> {savingComm ? 'Logging…' : 'Add Manual Log'}
                    </button>
                  </div>

                  {/* ── Activity Log ────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Activity Log</h3>
                    {commLoading ? (
                      <p className="text-sm text-gray-400 text-center py-4">Loading logs…</p>
                    ) : !commLogs.length ? (
                      <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-xl">No communications logged yet</p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {commLogs.map(log => {
                          const icon = log.type === 'call' ? '📞' : log.type === 'whatsapp' ? '💬' : '✉️'
                          const color = log.type === 'call' ? 'border-l-green-400' : log.type === 'whatsapp' ? 'border-l-emerald-400' : 'border-l-blue-400'
                          return (
                            <div key={log.id} className={`bg-gray-50 rounded-lg p-3 border-l-4 ${color}`}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-semibold text-gray-700 capitalize">
                                  {icon} {log.type} · {log.direction}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {format(parseISO(log.created_at), 'dd MMM yy HH:mm')}
                                </span>
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
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           CREATE LEAD MODAL
         ══════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <PlusIcon />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Add New Lead</h2>
                  <p className="text-indigo-200 text-xs">{isAdmin ? 'Admin — can assign to any agent' : 'Lead will be assigned to you'}</p>
                </div>
              </div>
              <button onClick={() => { setShowCreateModal(false); setForm(emptyForm) }}
                className="p-2 rounded-lg hover:bg-white/20 text-white">
                <XIcon />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Section 1: Basic Info */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Basic Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="e.g. 9876543210"
                      type="tel"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="rahul@example.com"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">City</label>
                    <input
                      value={form.city}
                      onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="e.g. Delhi"
                      list="city-list-create"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    <datalist id="city-list-create">{settings.cities.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                </div>
              </div>

              {/* Section 2: Lead Details */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Lead Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Source</label>
                    <select
                      value={form.source}
                      onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent">
                      <option value="">— Select source —</option>
                      {settings.sources.map(s => <option key={s?.key||s} value={s?.label||s}>{s?.label||s}</option>)}
                    </select>
                  </div>

                  {/* Lead Type */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Lead Type</label>
                    <select
                      value={form.lead_type}
                      onChange={e => setForm(f => ({ ...f, lead_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent">
                      <option value="">— Select type —</option>
                      {settings.lead_types?.length > 0
                        ? settings.lead_types.map(t => <option key={t?.key||t} value={t?.label||t}>{t?.label||t}</option>)
                        : [['B2B','B2B'],['B2C','B2C']].map(([v,l]) => <option key={v} value={v}>{l}</option>)
                      }
                    </select>
                  </div>

                  {/* School Name - dropdown + free type */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">School / Organisation Name</label>
                    <input
                      value={form.school_name || ''}
                      onChange={e => setForm(f => ({ ...f, school_name: e.target.value }))}
                      placeholder="Type or select school name…"
                      list="school-list-create"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    <datalist id="school-list-create">
                      {schools.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>


                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Initial Status</label>
                    <select
                      value={form.status}
                      onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent">
                      {Object.keys(STATUS_COLORS).map(s => (
                        <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Product */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Product Interest <span className="text-gray-300 font-normal normal-case">(optional)</span>
                </h3>
                <select
                  value={form.product_id}
                  onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent mb-2">
                  <option value="">— No product selected yet —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                  ))}
                </select>
                {form.product_id && (
                  <input
                    value={form.product_detail}
                    onChange={e => setForm(f => ({ ...f, product_detail: e.target.value }))}
                    placeholder="Product notes e.g. 6-month plan, April batch…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                )}
              </div>

              {/* Section 4: Notes & Follow-up */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Notes & Follow-up</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes / Remark</label>
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Any initial notes about this lead…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Creation Comment <span className="text-gray-300 font-normal">(upload / import note)</span></label>
                    <input
                      value={form.creation_comment || ''}
                      onChange={e => setForm(f => ({ ...f, creation_comment: e.target.value }))}
                      placeholder="e.g. Uploaded from April 2026 Excel, Cold calling campaign…"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Schedule Follow-up <span className="text-gray-300 font-normal">(optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={form.follow_up_date}
                      onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent" />
                    {form.follow_up_date && (
                      <p className="text-xs text-indigo-600 mt-1">📅 Follow-up will be scheduled automatically</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Assign to user - default is logged-in user, option to change */}
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Assign To <span className="text-gray-300 font-normal normal-case">(default: you)</span>
                </h3>
                <select
                  value={form.assigned_to || user?.id || ''}
                  onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent">
                  <option value={user?.id || ''}>{user?.name || 'Me'} (me — default)</option>
                  {agents.filter(a => a.id !== user?.id).map(a => (
                    <option key={a.id} value={a.id}>{a.name} — {a.role_name}</option>
                  ))}
                </select>
              </div>

              {/* Lead preview card */}
              {(form.name || form.phone) && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-wide mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {(form.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{form.name || '—'}</p>
                      <p className="text-sm text-gray-500">{form.phone || '—'} {form.email ? `· ${form.email}` : ''}</p>
                    </div>
                    <div className="ml-auto">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[form.status] || 'bg-gray-100 text-gray-600'}`}>
                        {form.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  {form.product_id && (
                    <p className="text-xs text-indigo-600 mt-2">
                      📦 {products.find(p => String(p.id) === String(form.product_id))?.name}
                    </p>
                  )}
                  {form.follow_up_date && (
                    <p className="text-xs text-indigo-600 mt-1">
                      📅 Follow-up: {new Date(form.follow_up_date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              )}
            </form>

            {/* Footer */}
            <div className="flex justify-between items-center px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setForm(emptyForm) }}
                className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-100 text-gray-600">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.name || !form.phone}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-200">
                {saving
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Creating…</>
                  : <><PlusIcon /> Create Lead</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           PASTE MODAL
         ══════════════════════════════════════════════════════ */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-bold">Copy Paste Import</h2>
              <button onClick={() => setShowPasteModal(false)} className="p-2 rounded-lg hover:bg-gray-100"><XIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {pasteStep === 1 && (
                <>
                  <p className="text-sm text-gray-500">
                    Paste rows from Excel / Google Sheets. Supported columns: <strong>Name, Phone, Email, City, Source, Product</strong>.
                    First row can be a header.
                  </p>
                  <textarea rows={8} value={pasteText} onChange={e => setPasteText(e.target.value)}
                    placeholder="Name	Phone	Email	City	Source	Product&#10;Rahul	9876543210	r@x.com	Delhi	Website	MBA Prep"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />

                  {/* Default product for all pasted leads */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Default Product for all pasted leads <span className="text-gray-400">(used only if no Product column in data)</span>
                    </label>
                    <select value={pasteProduct} onChange={e => setPasteProduct(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                      <option value="">— No product —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  {/* Lead Type for paste */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Lead Type (applies to all rows)</label>
                    <div className="flex gap-2">
                      {(settings.lead_types.length > 0
                        ? settings.lead_types.map(t => typeof t === 'string' ? t : (t.label || t.value || t))
                        : ['B2B', 'B2C']
                      ).map(lt => (
                        <button key={lt} type="button"
                          onClick={() => setPasteLeadType(lt)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${pasteLeadType === lt ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                          {lt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Upload Comment */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Upload Comment (applies to all rows)</label>
                    <input value={pasteComment} onChange={e => setPasteComment(e.target.value)}
                      placeholder="e.g. Uploaded from WhatsApp list, March batch…"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowPasteModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                    <button onClick={parsePasteText} disabled={!pasteText.trim()}
                      className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40">
                      Parse Preview →
                    </button>
                  </div>
                </>
              )}

              {pasteStep === 2 && (
                <>
                  <p className="text-sm text-gray-600">{pasteRows.length} leads parsed — review below:</p>
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
                            <td className="px-3 py-1.5">
                              {r.product
                                ? <span className="text-indigo-600 font-medium">{r.product}</span>
                                : <span className="text-gray-400 italic">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setPasteStep(1)} className="px-4 py-2 border rounded-lg text-sm">← Back</button>
                    <button onClick={submitPasteLeads} disabled={saving}
                      className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                      {saving ? 'Importing…' : `Import ${pasteRows.length} Leads`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
           EXCEL IMPORT MODAL
         ══════════════════════════════════════════════════════ */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-bold">Import from Excel</h2>
              <button onClick={() => setShowImportModal(false)} className="p-2 rounded-lg hover:bg-gray-100"><XIcon /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {importStep === 1 && (
                <>
                  <p className="text-sm text-gray-500">
                    Upload an <strong>.xlsx</strong> or <strong>.csv</strong> file. Supported columns: <strong>Name, Phone, Email, City, Source, Product</strong>. Download the template to see the format.
                  </p>
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-300 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}>
                    <UploadIcon />
                    <p className="mt-2 text-sm text-gray-600">Click to select file or drag & drop</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv supported</p>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                  </div>
                  <div className="flex justify-between">
                    <button onClick={downloadTemplate} className="px-4 py-2 border rounded-lg text-sm text-indigo-600 hover:bg-indigo-50">
                      Download Template
                    </button>
                    <button onClick={() => setShowImportModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                  </div>
                </>
              )}

              {importStep === 2 && (
                <>
                  <p className="text-sm text-gray-600">{importRows.length} rows found in <strong>{importFile?.name}</strong> — preview:</p>
                  <div className="overflow-x-auto rounded-lg border text-xs max-h-64">
                    <table className="min-w-full">
                      <thead className="bg-gray-50"><tr>
                        {Object.keys(importRows[0] || {}).slice(0,7).map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 capitalize">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.slice(0, 10).map((r, i) => (
                          <tr key={i}>
                            {Object.entries(r).slice(0,7).map(([k, v]) => (
                              <td key={k} className={`px-3 py-1.5 ${(k === 'product' || k === 'course') ? 'text-indigo-600 font-medium' : ''}`}>{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 10 && <p className="text-xs text-gray-400">…and {importRows.length - 10} more rows</p>}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setImportStep(1); setImportRows([]) }} className="px-4 py-2 border rounded-lg text-sm">← Back</button>
                    <button onClick={submitExcelLeads} disabled={saving}
                      className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                      {saving ? 'Importing…' : `Import ${importRows.length} Leads`}
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

/*
 ══════════════════════════════════════════════════════════════════
  DIRECT CALLING FROM LAPTOP → PHONE  (Advanced / Optional)
 ══════════════════════════════════════════════════════════════════

 The "Call Now" button above uses   window.open(`tel:${phone}`, '_self')
 This works PERFECTLY when the agent is on a phone/tablet — the dialer opens.
 On a laptop, it depends on the OS:
   ✅ macOS — opens FaceTime / iPhone mirroring if paired
   ✅ Windows — opens Skype, Teams, or default calling app if configured
   ✅ Android Chrome — opens dialer directly
   ⚠️ Windows without calling app — may do nothing

 FOR TRUE LAPTOP → MOBILE CALLING (VoIP):
 We recommend integrating Twilio Client (browser SDK).
 When you're ready, here's what to add:

 Backend (add to backend/src/routes/leads.js or a new twilio.js):
 ─────────────────────────────────────────────────────────────────
   const twilio = require('twilio')
   const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

   router.post('/twilio/token', auth, (req, res) => {
     const AccessToken = twilio.jwt.AccessToken
     const VoiceGrant  = AccessToken.VoiceGrant
     const grant = new VoiceGrant({ outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID, incomingAllow: true })
     const token = new AccessToken(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET, { identity: `agent_${req.user.id}` })
     token.addGrant(grant)
     res.json({ token: token.toJwt() })
   })

 Frontend (inside the Comms tab, replace handleDirectCall):
 ─────────────────────────────────────────────────────────────────
   import { Device } from '@twilio/voice-sdk'
   let twilioDevice = null

   const initTwilio = async () => {
     const res = await api.post('/leads/twilio/token')
     twilioDevice = new Device(res.data.token, { edge: 'ashburn' })
     await twilioDevice.register()
   }

   const handleVoIPCall = async () => {
     if (!twilioDevice) await initTwilio()
     const call = await twilioDevice.connect({ params: { To: selectedLead.phone } })
     logComm('call', 'VoIP call from portal')
   }

 ENV vars needed: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY,
                  TWILIO_API_SECRET, TWILIO_TWIML_APP_SID, TWILIO_PHONE_NUMBER

 npm install: backend → twilio    |    frontend → @twilio/voice-sdk
 ══════════════════════════════════════════════════════════════════
*/
