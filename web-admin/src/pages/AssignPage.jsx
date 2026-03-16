import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function AssignPage() {
  const [leads, setLeads] = useState([])
  const [agents, setAgents] = useState([])
  const [selected, setSelected] = useState([])
  const [targetAgent, setTargetAgent] = useState('')
  const [filters, setFilters] = useState({ status: 'new', assigned_to: '' })
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 200, ...filters }
      Object.keys(params).forEach(k => !params[k] && delete params[k])
      const [leadsRes, agentsRes] = await Promise.all([
        api.get('/leads', { params }),
        api.get('/users/agents')
      ])
      setLeads(leadsRes.data)
      setAgents(agentsRes.data)
    } catch {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () => setSelected(selected.length === leads.length ? [] : leads.map(l => l.id))

  const handleAssign = async () => {
    if (!selected.length) return toast.error('Select at least one lead')
    if (!targetAgent) return toast.error('Select an agent')
    setAssigning(true)
    try {
      const res = await api.post('/leads/assign', { lead_ids: selected, agent_id: targetAgent })
      toast.success(res.message)
      setSelected([])
      fetchData()
    } catch (err) {
      toast.error(err.message || 'Assignment failed')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Assign Leads</h1>
        <p className="text-slate-500 text-sm">Select leads and assign them to an agent</p>
      </div>

      {/* Toolbar */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Filter by Status</label>
          <select className="input w-40" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option>
            <option value="new">New / Unattended</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
            <option value="call_back">Call Back</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Current Agent</label>
          <select className="input w-40" value={filters.assigned_to} onChange={e => setFilters({ ...filters, assigned_to: e.target.value })}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Assign to Agent</label>
            <select className="input w-44" value={targetAgent} onChange={e => setTargetAgent(e.target.value)}>
              <option value="">Select Agent...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button onClick={handleAssign} disabled={assigning || !selected.length || !targetAgent} className="btn-primary">
            {assigning ? 'Assigning...' : `Assign ${selected.length || ''} Leads`}
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700 font-medium">
          {selected.length} leads selected
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={selected.length === leads.length && leads.length > 0} onChange={toggleAll} />
              </th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">School / Name</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Phone</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Current Agent</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">City</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Loading...</td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">No leads match filters</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id} className={`hover:bg-slate-50 cursor-pointer ${selected.includes(lead.id) ? 'bg-blue-50' : ''}`} onClick={() => toggleSelect(lead.id)}>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggleSelect(lead.id)} />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{lead.school_name || lead.contact_name}</p>
                  {lead.school_name && <p className="text-xs text-slate-400">{lead.contact_name}</p>}
                </td>
                <td className="px-4 py-3 text-blue-600 font-medium">{lead.phone}</td>
                <td className="px-4 py-3">
                  {lead.agent_name || <span className="text-red-400 text-xs font-medium">Unassigned</span>}
                </td>
                <td className="px-4 py-3"><span className={`badge-${lead.status}`}>{lead.status?.replace('_', ' ')}</span></td>
                <td className="px-4 py-3 text-slate-500">{lead.city || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
