// web-admin/src/pages/AssignPage.jsx — COMPLETE REWRITE
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

export default function AssignPage() {
  const [leads, setLeads]       = useState([])
  const [agents, setAgents]     = useState([])
  const [products, setProducts] = useState([])
  const [schools, setSchools]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [total, setTotal]       = useState(0)

  // filters
  const [search, setSearch]                 = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterAgent, setFilterAgent]       = useState('')
  const [filterSchool, setFilterSchool]     = useState('')
  const [filterUnassigned, setFilterUnassigned] = useState(false)
  const [perPage, setPerPage]               = useState(100)

  // selection & actions
  const [selected, setSelected]   = useState([])
  const [assignTo, setAssignTo]   = useState('')
  const [assignProduct, setAssignProduct] = useState('')
  const [actionMode, setActionMode] = useState('agent') // 'agent' | 'product' | 'unassign'

  // Load agents + products + schools on mount
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
    // Load school names from leads
    api.get('/leads', { params: { per_page: 1000 } }).then(r => {
      const rows = Array.isArray(r.data) ? r.data : (r.data?.data || [])
      const list = [...new Set(rows.map(l => l.school_name).filter(Boolean))].sort((a,b) => a.localeCompare(b))
      setSchools(list)
    }).catch(() => {})
  }, [])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = { per_page: perPage, page: 1 }
      if (search)           params.search      = search
      if (filterStatus)     params.status      = filterStatus
      if (filterSchool)     params.school_name = filterSchool
      // unassigned filter: don't pass assigned_to when filtering unassigned
      if (filterUnassigned) {
        params.unassigned = 'true'
      } else if (filterAgent) {
        params.assigned_to = filterAgent
      }
      const r = await api.get('/leads', { params })
      let rows = Array.isArray(r.data) ? r.data : (r.data?.data || [])
      const tot = r.data?.total || rows.length
      // Client-side unassigned filter as backup (in case backend doesn't support it)
      if (filterUnassigned) {
        rows = rows.filter(l => !l.assigned_to && !l.agent_name)
      }
      setLeads(rows)
      setTotal(tot)
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [search, filterStatus, filterAgent, filterSchool, filterUnassigned, perPage])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Auto-refresh every 45 seconds
  useEffect(() => {
    const t = setInterval(fetchLeads, 45000)
    return () => clearInterval(t)
  }, [fetchLeads])

  const toggleSelect  = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll     = () => setSelected(selected.length === leads.length ? [] : leads.map(l => l.id))
  const selectPage    = () => setSelected(leads.map(l => l.id))

  // ── ASSIGN TO AGENT ───────────────────────────────────────────
  const handleAssignAgent = async () => {
    if (!assignTo)        return toast.error('Select an agent')
    if (!selected.length) return toast.error('Select at least one lead')
    setSaving(true)
    try {
      await api.post('/leads/assign', { lead_ids: selected, assigned_to: assignTo })
      const name = agents.find(a => a.id === assignTo)?.name || 'agent'
      toast.success(`${selected.length} leads assigned to ${name}`)
      // Update local state immediately so label changes instantly
      setLeads(prev => prev.map(l =>
        selected.includes(l.id)
          ? { ...l, assigned_to: assignTo, agent_name: name }
          : l
      ))
      setSelected([])
      fetchLeads() // also refetch to get fresh data
    } catch (err) { toast.error(err.message || 'Assignment failed') }
    finally { setSaving(false) }
  }

  // ── ASSIGN PRODUCT IN BULK ────────────────────────────────────
  const handleAssignProduct = async () => {
    if (!assignProduct)   return toast.error('Select a product')
    if (!selected.length) return toast.error('Select at least one lead')
    setSaving(true)
    try {
      let done = 0
      // Send in batches of 50
      for (let i = 0; i < selected.length; i += 50) {
        const batch = selected.slice(i, i + 50)
        await Promise.all(batch.map(id =>
          api.patch(`/leads/${id}/product`, { product_id: assignProduct })
        ))
        done += batch.length
      }
      const pname = products.find(p => String(p.id) === String(assignProduct))?.name || 'product'
      toast.success(`${done} leads assigned to ${pname}`)
      // Update local state immediately
      setLeads(prev => prev.map(l =>
        selected.includes(l.id)
          ? { ...l, product_id: assignProduct, product_name: pname }
          : l
      ))
      setSelected([])
      fetchLeads()
    } catch (err) { toast.error(err.message || 'Product assignment failed') }
    finally { setSaving(false) }
  }

  // ── UNASSIGN ALL SELECTED ─────────────────────────────────────
  const handleUnassign = async () => {
    if (!selected.length) return toast.error('Select at least one lead')
    if (!window.confirm(`Unassign ${selected.length} leads? They will become unassigned.`)) return
    setSaving(true)
    try {
      await api.post('/leads/assign', { lead_ids: selected, assigned_to: null })
      toast.success(`${selected.length} leads unassigned`)
      // Update local state immediately
      setLeads(prev => prev.map(l =>
        selected.includes(l.id)
          ? { ...l, assigned_to: null, agent_name: null }
          : l
      ))
      setSelected([])
      fetchLeads()
    } catch (err) { toast.error(err.message || 'Unassign failed') }
    finally { setSaving(false) }
  }

  const handleAction = () => {
    if (actionMode === 'agent')   handleAssignAgent()
    if (actionMode === 'product') handleAssignProduct()
    if (actionMode === 'unassign') handleUnassign()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">↗ Assign Leads</h1>
          <p className="text-slate-500 text-sm">
            Showing {leads.length} of {total} leads
            {filterUnassigned && ' (unassigned only)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Show:</label>
          <select value={perPage} onChange={e => setPerPage(Number(e.target.value))}
            className="border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {[50, 100, 200, 500, 1000].map(n => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Action bar */}
      <div className="card p-4 bg-indigo-50 border-indigo-200">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-indigo-700 min-w-fit">
            {selected.length > 0 ? `${selected.length} selected` : 'Select leads below'}
          </span>

          {/* Action mode selector */}
          <div className="flex gap-1 bg-white border border-indigo-200 rounded-lg p-0.5">
            {[['agent','👤 Assign Agent'],['product','📦 Assign Product'],['unassign','🔓 Unassign']].map(([mode, label]) => (
              <button key={mode} onClick={() => setActionMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${actionMode === mode ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Agent select */}
          {actionMode === 'agent' && (
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
              className="border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white min-w-[200px]">
              <option value="">— Select Agent —</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.role_name})</option>)}
            </select>
          )}

          {/* Product select */}
          {actionMode === 'product' && (
            <select value={assignProduct} onChange={e => setAssignProduct(e.target.value)}
              className="border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white min-w-[200px]">
              <option value="">— Select Product —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          {actionMode === 'unassign' && (
            <span className="text-sm text-red-600 font-medium">This will remove agent assignment from selected leads</span>
          )}

          <div className="flex-1" />

          <button onClick={handleAction}
            disabled={saving || !selected.length || (actionMode==='agent' && !assignTo) || (actionMode==='product' && !assignProduct)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${actionMode === 'unassign' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {saving ? 'Processing…' : actionMode === 'agent' ? `Assign ${selected.length || ''} Leads →` : actionMode === 'product' ? `Assign Product →` : `Unassign ${selected.length || ''} Leads`}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone, school…"
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300" />

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => (
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
          ))}
        </select>

        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
          disabled={filterUnassigned}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-40">
          <option value="">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Schools</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 select-none">
          <input type="checkbox" checked={filterUnassigned} onChange={e => { setFilterUnassigned(e.target.checked); if(e.target.checked) setFilterAgent('') }}
            className="rounded" />
          Unassigned only
        </label>

        <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterAgent(''); setFilterSchool(''); setFilterUnassigned(false) }}
          className="border rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">
          Clear filters
        </button>
      </div>

      {/* Select helpers */}
      {leads.length > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <button onClick={toggleAll} className="text-indigo-600 hover:underline font-medium">
            {selected.length === leads.length ? 'Deselect all' : `Select all ${leads.length} on page`}
          </button>
          {selected.length > 0 && (
            <span className="text-slate-400">· {selected.length} selected</span>
          )}
          {selected.length > 0 && (
            <button onClick={() => setSelected([])} className="text-slate-400 hover:text-slate-600">Clear selection</button>
          )}
        </div>
      )}

      {/* Leads table */}
      {loading ? (
        <div className="card p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading leads…
        </div>
      ) : (
        <div className="card overflow-hidden">
          {leads.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-4xl mb-3">📋</p>
              <p>No leads found for selected filters</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox"
                      checked={selected.length === leads.length && leads.length > 0}
                      onChange={toggleAll} className="rounded" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">School</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Phone</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Product</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Assigned To</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map(lead => {
                  const isSel = selected.includes(lead.id)
                  return (
                    <tr key={lead.id}
                      className={`cursor-pointer transition-colors ${isSel ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                      onClick={() => toggleSelect(lead.id)}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isSel}
                          onChange={() => toggleSelect(lead.id)}
                          onClick={e => e.stopPropagation()} className="rounded" />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {lead.contact_name || lead.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs max-w-[140px] truncate">
                        {lead.school_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-blue-600">{lead.phone}</td>
                      <td className="px-4 py-3"><Badge status={lead.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {lead.product_name || lead.product_id ? (
                          <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                            {lead.product_name || `Product ${lead.product_id}`}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {lead.agent_name
                          ? <span className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {lead.agent_name[0]}
                              </span>
                              <span className="text-sm text-slate-700">{lead.agent_name}</span>
                            </span>
                          : <span className="text-xs text-orange-500 font-medium bg-orange-50 px-2 py-0.5 rounded-full">Unassigned</span>
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
          )}
        </div>
      )}
    </div>
  )
}
