// web-admin/src/pages/AssignPage.jsx
// Bulk assign leads to agents - admin only
// Features: filter by school, status, unassigned; select multiple leads; assign to agent
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  new:            { bg: '#dbeafe', text: '#1e40af' },
  hot:            { bg: '#fee2e2', text: '#991b1b' },
  warm:           { bg: '#fef3c7', text: '#92400e' },
  cold:           { bg: '#e2e8f0', text: '#475569' },
  converted:      { bg: '#dcfce7', text: '#14532d' },
  not_interested: { bg: '#f1f5f9', text: '#64748b' },
  call_back:      { bg: '#ede9fe', text: '#5b21b6' },
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: c.bg, color: c.text }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

export default function AssignPage() {
  const { user } = useAuth()

  const [leads, setLeads]       = useState([])
  const [agents, setAgents]     = useState([])
  const [schools, setSchools]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  // filters
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAgent, setFilterAgent]   = useState('')
  const [filterSchool, setFilterSchool] = useState('')
  const [filterUnassigned, setFilterUnassigned] = useState(false)

  // selection
  const [selected, setSelected]         = useState([]) // lead ids
  const [assignTo, setAssignTo]         = useState('')

  // Load agents + schools
  useEffect(() => {
    // Load agents
    ;(async () => {
      try {
        const r = await api.get('/chat/users')
        const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : [])
        setAgents(list)
      } catch {
        try {
          const r = await api.get('/users')
          const list = Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : [])
          setAgents(list)
        } catch {}
      }
    })()
    // Load school names from settings
    api.get('/settings').then(sRes => {
      const s = sRes.data?.data || sRes.data || {}
      const schoolList = (s.school_name || s.schools || [])
        .map(x => typeof x === 'string' ? x : (x.label || x.value || x))
        .filter(Boolean).sort((a, b) => a.localeCompare(b))
      if (schoolList.length) setSchools(schoolList)
    }).catch(() => {})
  }, [])

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = { per_page: 200 }
      if (search)         params.search      = search
      if (filterStatus)   params.status      = filterStatus
      if (filterAgent)    params.assigned_to = filterAgent
      if (filterSchool)   params.school_name = filterSchool
      if (filterUnassigned) params.unassigned = 'true'
      const r = await api.get('/leads', { params })
      const rows = Array.isArray(r.data) ? r.data : (r.data?.data || [])
      setLeads(rows)
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [search, filterStatus, filterAgent, filterSchool, filterUnassigned])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Load schools from leads directly (most reliable source)
  useEffect(() => {
    api.get('/leads', { params: { per_page: 500 } })
      .then(r => {
        const rows = Array.isArray(r.data) ? r.data : (r.data?.data || [])
        const fromLeads = [...new Set(rows.map(l => l.school_name).filter(Boolean))].sort((a,b) => a.localeCompare(b))
        if (fromLeads.length) setSchools(prev => [...new Set([...prev, ...fromLeads])].sort((a,b) => a.localeCompare(b)))
      }).catch(() => {})
  }, []) // Run once on mount - gets schools from actual lead data

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll    = () => setSelected(selected.length === leads.length ? [] : leads.map(l => l.id))

  const handleAssign = async () => {
    if (!assignTo)        return toast.error('Select an agent to assign to')
    if (!selected.length) return toast.error('Select at least one lead')
    setSaving(true)
    try {
      await api.post('/leads/assign', { lead_ids: selected, assigned_to: assignTo })
      const agentName = agents.find(a => a.id === assignTo)?.name || 'agent'
      toast.success(`${selected.length} leads assigned to ${agentName}`)
      setSelected([])
      fetchLeads()
    } catch (err) { toast.error(err.message || 'Assignment failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">↗ Assign Leads</h1>
        <p className="text-slate-500 text-sm">Select leads and assign them to agents in bulk</p>
      </div>

      {/* Assign bar */}
      <div className="card p-4 flex flex-wrap items-center gap-3 bg-indigo-50 border-indigo-200">
        <span className="text-sm font-semibold text-indigo-700">
          {selected.length > 0 ? `${selected.length} leads selected` : 'Select leads below, then assign'}
        </span>
        <div className="flex-1" />
        <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
          className="border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white min-w-[200px]">
          <option value="">— Select Agent to Assign —</option>
          {agents.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.role_name})</option>
          ))}
        </select>
        <button onClick={handleAssign} disabled={saving || !selected.length || !assignTo}
          className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {saving ? 'Assigning…' : `Assign ${selected.length > 0 ? selected.length : ''} Leads →`}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone…"
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-indigo-300" />

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* School Name Dropdown */}
        <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">All Schools</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
          <input type="checkbox" checked={filterUnassigned} onChange={e => setFilterUnassigned(e.target.checked)}
            className="rounded" />
          Unassigned only
        </label>
      </div>

      {/* Leads table */}
      {loading ? (
        <div className="card p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading leads…
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
              <input type="checkbox"
                checked={selected.length === leads.length && leads.length > 0}
                onChange={toggleAll}
                className="rounded" />
              {selected.length > 0 ? `${selected.length} of ${leads.length} selected` : `${leads.length} leads`}
            </label>
            {selected.length > 0 && (
              <button onClick={() => setSelected([])} className="text-xs text-slate-400 hover:text-slate-600">
                Clear selection
              </button>
            )}
          </div>

          {leads.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-4xl mb-3">📋</p>
              <p>No leads found for selected filters</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="w-10 px-4 py-3"></th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">School</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Phone</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Currently Assigned</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Lead Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map(lead => {
                  const isSelected = selected.includes(lead.id)
                  return (
                    <tr key={lead.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                      onClick={() => toggleSelect(lead.id)}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(lead.id)}
                          onClick={e => e.stopPropagation()} className="rounded" />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {lead.contact_name || lead.name || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {lead.school_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-blue-600">{lead.phone}</td>
                      <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                      <td className="px-4 py-3 text-slate-500">
                        {lead.agent_name
                          ? <span className="flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                                {lead.agent_name[0]}
                              </span>
                              {lead.agent_name}
                            </span>
                          : <span className="text-slate-300 italic text-xs">Unassigned</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {lead.lead_type && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lead.lead_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
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
