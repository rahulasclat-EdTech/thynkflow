// web-admin/src/pages/AssignPage.jsx — VISUAL REWRITE
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  new:'#1e40af', hot:'#991b1b', warm:'#92400e', cold:'#475569',
  converted:'#14532d', not_interested:'#64748b', call_back:'#5b21b6',
}
const STATUS_BG = {
  new:'#dbeafe', hot:'#fee2e2', warm:'#fef3c7', cold:'#e2e8f0',
  converted:'#dcfce7', not_interested:'#f1f5f9', call_back:'#ede9fe',
}

function Badge({ status }) {
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: STATUS_BG[status]||'#f1f5f9', color: STATUS_COLORS[status]||'#64748b' }}>
      {status?.replace(/_/g,' ')}
    </span>
  )
}

// Summary card at the top
function SummaryCard({ icon, label, value, color, bg, onClick, active }) {
  return (
    <button onClick={onClick}
      className="flex-1 min-w-[140px] rounded-2xl p-4 text-left transition-all duration-200 border-2"
      style={{
        background: active ? color : bg,
        borderColor: active ? color : 'transparent',
        boxShadow: active ? `0 4px 20px ${color}33` : '0 1px 4px #0001',
      }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: active ? '#fff' : color }}>{label}</span>
      </div>
      <p className="text-3xl font-black" style={{ color: active ? '#fff' : color }}>{value}</p>
    </button>
  )
}

export default function AssignPage() {
  const [leads, setLeads]       = useState([])
  const [agents, setAgents]     = useState([])
  const [products, setProducts] = useState([])
  const [schools, setSchools]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [total, setTotal]       = useState(0)
  const [allLeads, setAllLeads] = useState([]) // for summary stats

  // filters
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAgent, setFilterAgent]   = useState('')
  const [filterSchool, setFilterSchool] = useState('')
  const [filterUnassigned, setFilterUnassigned]       = useState(false)
  const [filterNoProduct, setFilterNoProduct]         = useState(false)
  const [filterUnassignedAgent, setFilterUnassignedAgent] = useState(false)
  const [perPage, setPerPage]           = useState(100)
  const [activeTab, setActiveTab]       = useState('all') // 'all'|'no_agent'|'no_product'|'both_missing'|'converted'

  // selection & actions
  const [selected, setSelected]         = useState([])
  const [assignTo, setAssignTo]         = useState('')
  const [assignProduct, setAssignProduct] = useState('')
  const [actionMode, setActionMode]     = useState('agent')

  // Load agents + products + schools on mount + fetch all leads for summary
  useEffect(() => {
    ;(async () => {
      try {
        const r = await api.get('/chat/users')
        setAgents(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } catch {
        try {
          const r = await api.get('/users')
          setAgents(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
        } catch {}
      }
    })()
    api.get('/products/active').then(r => {
      setProducts(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
    }).catch(() => {})
    // Fetch all leads for summary stats
    api.get('/leads', { params: { per_page: 1000 } }).then(r => {
      const rows = Array.isArray(r.data) ? r.data : (r.data?.data || [])
      setAllLeads(rows)
      const list = [...new Set(rows.map(l => l.school_name).filter(Boolean))].sort((a,b) => a.localeCompare(b))
      setSchools(list)
    }).catch(() => {})
  }, [])

  // Summary stats
  const summary = {
    total:          allLeads.length,
    no_agent:       allLeads.filter(l => !l.assigned_to && !l.agent_name).length,
    no_product:     allLeads.filter(l => !l.product_id).length,
    both_missing:   allLeads.filter(l => (!l.assigned_to && !l.agent_name) && !l.product_id).length,
    converted:      allLeads.filter(l => l.status === 'converted').length,
    hot:            allLeads.filter(l => l.status === 'hot').length,
  }

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = { per_page: perPage, page: 1 }
      if (search)           params.search      = search
      if (filterStatus)     params.status      = filterStatus
      if (filterSchool)     params.school_name = filterSchool
      if (filterUnassigned || activeTab === 'no_agent') {
        params.unassigned = 'true'
      } else if (filterAgent) {
        params.assigned_to = filterAgent
      }
      const r = await api.get('/leads', { params })
      let rows = Array.isArray(r.data) ? r.data : (r.data?.data || [])
      const tot = r.data?.total || rows.length

      // Client-side tab filters
      if (activeTab === 'no_agent')     rows = rows.filter(l => !l.assigned_to && !l.agent_name)
      if (activeTab === 'no_product')   rows = rows.filter(l => !l.product_id)
      if (activeTab === 'both_missing') rows = rows.filter(l => (!l.assigned_to && !l.agent_name) && !l.product_id)
      if (activeTab === 'converted')    rows = rows.filter(l => l.status === 'converted')
      if (activeTab === 'hot')          rows = rows.filter(l => l.status === 'hot')

      setLeads(rows)
      setTotal(tot)
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [search, filterStatus, filterAgent, filterSchool, filterUnassigned, perPage, activeTab])

  useEffect(() => { fetchLeads() }, [fetchLeads])
  useEffect(() => {
    const t = setInterval(fetchLeads, 45000)
    return () => clearInterval(t)
  }, [fetchLeads])

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll    = () => setSelected(selected.length === leads.length ? [] : leads.map(l => l.id))

  const handleAssignAgent = async () => {
    if (!assignTo)        return toast.error('Select an agent')
    if (!selected.length) return toast.error('Select at least one lead')
    setSaving(true)
    try {
      await api.post('/leads/assign', { lead_ids: selected, assigned_to: assignTo })
      const name = agents.find(a => a.id === assignTo)?.name || 'agent'
      toast.success(`${selected.length} leads assigned to ${name}`)
      setLeads(prev => prev.map(l => selected.includes(l.id) ? { ...l, assigned_to: assignTo, agent_name: name } : l))
      setAllLeads(prev => prev.map(l => selected.includes(l.id) ? { ...l, assigned_to: assignTo, agent_name: name } : l))
      setSelected([])
      fetchLeads()
    } catch (err) { toast.error(err.message || 'Assignment failed') }
    finally { setSaving(false) }
  }

  const handleAssignProduct = async () => {
    if (!assignProduct)   return toast.error('Select a product')
    if (!selected.length) return toast.error('Select at least one lead')
    setSaving(true)
    try {
      let done = 0
      for (let i = 0; i < selected.length; i += 50) {
        const batch = selected.slice(i, i + 50)
        await Promise.all(batch.map(id => api.patch(`/leads/${id}/product`, { product_id: assignProduct })))
        done += batch.length
      }
      const pname = products.find(p => String(p.id) === String(assignProduct))?.name || 'product'
      toast.success(`${done} leads assigned to ${pname}`)
      setLeads(prev => prev.map(l => selected.includes(l.id) ? { ...l, product_id: assignProduct, product_name: pname } : l))
      setAllLeads(prev => prev.map(l => selected.includes(l.id) ? { ...l, product_id: assignProduct, product_name: pname } : l))
      setSelected([])
      fetchLeads()
    } catch (err) { toast.error(err.message || 'Product assignment failed') }
    finally { setSaving(false) }
  }

  const handleUnassign = async () => {
    if (!selected.length) return toast.error('Select at least one lead')
    if (!window.confirm(`Unassign ${selected.length} leads?`)) return
    setSaving(true)
    try {
      await api.post('/leads/assign', { lead_ids: selected, assigned_to: null })
      toast.success(`${selected.length} leads unassigned`)
      setLeads(prev => prev.map(l => selected.includes(l.id) ? { ...l, assigned_to: null, agent_name: null } : l))
      setAllLeads(prev => prev.map(l => selected.includes(l.id) ? { ...l, assigned_to: null, agent_name: null } : l))
      setSelected([])
      fetchLeads()
    } catch (err) { toast.error(err.message || 'Unassign failed') }
    finally { setSaving(false) }
  }

  const handleAction = () => {
    if (actionMode === 'agent')    handleAssignAgent()
    if (actionMode === 'product')  handleAssignProduct()
    if (actionMode === 'unassign') handleUnassign()
  }

  // Row color logic
  function getRowStyle(lead) {
    const noProduct = !lead.product_id
    const noAgent   = !lead.assigned_to && !lead.agent_name
    if (noProduct && noAgent) return { background: '#fef2f2', borderLeft: '4px solid #ef4444' }  // both missing — red
    if (noProduct)            return { background: '#fff7ed', borderLeft: '4px solid #f97316' }  // no product — orange
    if (noAgent)              return { background: '#f0fdf4', borderLeft: '4px solid #16a34a' }  // no agent — green
    return { borderLeft: '4px solid transparent' }
  }

  const TABS = [
    { key: 'all',          icon: '📋', label: 'All Leads',       value: summary.total,        color: '#4f46e5', bg: '#eef2ff' },
    { key: 'no_agent',     icon: '👤', label: 'No Agent',        value: summary.no_agent,     color: '#16a34a', bg: '#f0fdf4' },
    { key: 'no_product',   icon: '📦', label: 'No Product',      value: summary.no_product,   color: '#ea580c', bg: '#fff7ed' },
    { key: 'both_missing', icon: '⚠️', label: 'Both Missing',    value: summary.both_missing, color: '#dc2626', bg: '#fef2f2' },
    { key: 'hot',          icon: '🔥', label: 'Hot Leads',       value: summary.hot,          color: '#b91c1c', bg: '#fee2e2' },
    { key: 'converted',    icon: '✅', label: 'Converted',       value: summary.converted,    color: '#0891b2', bg: '#ecfeff' },
  ]

  return (
    <div className="space-y-5">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">↗ Assign Leads</h1>
          <p className="text-slate-500 text-sm">Showing <strong>{leads.length}</strong> leads · {selected.length} selected</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Show:</label>
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {[50,100,200,500,1000].map(n => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div className="flex flex-wrap gap-3">
        {TABS.map(tab => (
          <SummaryCard key={tab.key}
            icon={tab.icon} label={tab.label} value={tab.value}
            color={tab.color} bg={tab.bg}
            active={activeTab === tab.key}
            onClick={() => { setActiveTab(tab.key); setSelected([]) }}
          />
        ))}
      </div>

      {/* ── COLOUR LEGEND ── */}
      <div className="flex flex-wrap gap-3 text-xs font-semibold">
        <span className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-full">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> No Agent + No Product
        </span>
        <span className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 text-orange-700 px-3 py-1.5 rounded-full">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> No Product Assigned
        </span>
        <span className="flex items-center gap-1.5 bg-green-50 border border-green-200 text-green-700 px-3 py-1.5 rounded-full">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> No Agent Assigned
        </span>
        <span className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 text-slate-500 px-3 py-1.5 rounded-full">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Fully Assigned
        </span>
      </div>

      {/* ── ACTION BAR ── */}
      <div className="rounded-2xl p-4 border-2 border-indigo-200"
        style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f0fdf4 100%)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-indigo-700 min-w-fit">
            {selected.length > 0
              ? <span className="bg-indigo-600 text-white px-3 py-1 rounded-full">{selected.length} selected</span>
              : <span className="text-slate-400">Select leads below to take action</span>}
          </span>

          {/* Mode tabs */}
          <div className="flex gap-1 bg-white border border-indigo-200 rounded-xl p-1 shadow-sm">
            {[['agent','👤 Assign Agent'],['product','📦 Assign Product'],['unassign','🔓 Unassign']].map(([mode, label]) => (
              <button key={mode} onClick={() => setActionMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${actionMode===mode ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                {label}
              </button>
            ))}
          </div>

          {actionMode === 'agent' && (
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
              className="border-2 border-indigo-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white min-w-[200px]">
              <option value="">— Select Agent —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}

          {actionMode === 'product' && (
            <select value={assignProduct} onChange={e => setAssignProduct(e.target.value)}
              className="border-2 border-indigo-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white min-w-[200px]">
              <option value="">— Select Product —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {actionMode === 'unassign' && (
            <span className="text-sm text-red-600 font-semibold bg-red-50 px-3 py-1.5 rounded-lg border border-red-200">
              ⚠️ Removes agent from selected leads
            </span>
          )}

          <div className="flex-1" />

          <button onClick={handleAction}
            disabled={saving || !selected.length || (actionMode==='agent' && !assignTo) || (actionMode==='product' && !assignProduct)}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 ${actionMode==='unassign' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {saving ? '⏳ Processing…'
              : actionMode === 'agent'   ? `Assign ${selected.length||''} Leads →`
              : actionMode === 'product' ? `Assign Product →`
              : `Unassign ${selected.length||''} Leads`}
          </button>
        </div>
      </div>

      {/* ── FILTERS ── */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search name, phone, school…"
          className="border-2 rounded-xl px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300" />

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>

        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
          disabled={activeTab === 'no_agent'}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-40">
          <option value="">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Schools</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterAgent(''); setFilterSchool(''); setActiveTab('all') }}
          className="border-2 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 font-medium">
          ✕ Clear
        </button>
      </div>

      {/* ── SELECT HELPERS ── */}
      {leads.length > 0 && (
        <div className="flex items-center gap-3 text-sm bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
          <button onClick={toggleAll} className="text-indigo-600 hover:underline font-semibold">
            {selected.length === leads.length ? '☑ Deselect All' : `☐ Select All ${leads.length}`}
          </button>
          {selected.length > 0 && <>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600 font-medium">{selected.length} selected</span>
            <button onClick={() => setSelected([])} className="text-slate-400 hover:text-slate-700 text-xs border rounded px-2 py-0.5">Clear</button>
          </>}
        </div>
      )}

      {/* ── TABLE ── */}
      {loading ? (
        <div className="rounded-2xl border-2 border-slate-100 p-16 text-center text-slate-400">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-medium">Loading leads…</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center text-slate-400">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-semibold text-lg text-slate-500">No leads found</p>
          <p className="text-sm mt-1">Try changing the filters or tab above</p>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)' }}>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox"
                    checked={selected.length === leads.length && leads.length > 0}
                    onChange={toggleAll} className="rounded accent-white" />
                </th>
                {['Name','School','Phone','Status','Product','Assigned To','Type'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-indigo-100 font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map(lead => {
                const isSel    = selected.includes(lead.id)
                const rowStyle = getRowStyle(lead)
                return (
                  <tr key={lead.id}
                    onClick={() => toggleSelect(lead.id)}
                    className="cursor-pointer transition-all duration-150 hover:brightness-95"
                    style={{ ...rowStyle, ...(isSel ? { background: '#e0e7ff', borderLeft: '4px solid #4f46e5' } : {}) }}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={isSel}
                        onChange={() => toggleSelect(lead.id)}
                        onClick={e => e.stopPropagation()} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{lead.contact_name || lead.name || '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{lead.email || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[130px]">
                      <span className="truncate block">{lead.school_name || '—'}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-600 font-semibold text-xs">{lead.phone}</td>
                    <td className="px-4 py-3"><Badge status={lead.status} /></td>
                    <td className="px-4 py-3">
                      {lead.product_id
                        ? <span className="bg-violet-100 text-violet-700 text-xs font-bold px-2.5 py-1 rounded-full">
                            {lead.product_name || `#${lead.product_id}`}
                          </span>
                        : <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full border border-red-200">
                            ✕ None
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {lead.agent_name
                        ? <span className="flex items-center gap-1.5">
                            <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {lead.agent_name[0].toUpperCase()}
                            </span>
                            <span className="text-sm font-medium text-slate-700">{lead.agent_name}</span>
                          </span>
                        : <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full border border-green-200">
                            + Unassigned
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {lead.lead_type && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lead.lead_type==='B2B'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700'}`}>
                          {lead.lead_type}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Footer */}
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Showing <strong className="text-slate-700">{leads.length}</strong> leads</span>
            <div className="flex items-center gap-4">
              <span>🔴 {leads.filter(l => !l.product_id && (!l.assigned_to && !l.agent_name)).length} both missing</span>
              <span>🟠 {leads.filter(l => !l.product_id).length} no product</span>
              <span>🟢 {leads.filter(l => !l.assigned_to && !l.agent_name).length} no agent</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
