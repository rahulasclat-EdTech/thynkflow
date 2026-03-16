import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { format } from 'date-fns'
import LeadDetailModal from '../components/leads/LeadDetailModal'
import * as XLSX from 'xlsx'

const TABS = [
  { key: 'status', label: 'Status Wise' },
  { key: 'agent', label: 'Agent Wise' },
  { key: 'daily', label: 'Daily Calls' },
  { key: 'pending', label: 'Pending Follow-ups' },
  { key: 'upcoming', label: 'Upcoming Follow-ups' },
]

export default function ReportsPage() {
  const [tab, setTab] = useState('status')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [selectedLead, setSelectedLead] = useState(null)
  const [expandedStatus, setExpandedStatus] = useState(null)
  const [statusLeads, setStatusLeads] = useState([])

  useEffect(() => { fetchData() }, [tab, dateFilter])

  const fetchData = async () => {
    setLoading(true)
    try {
      let res
      if (tab === 'status') res = await api.get('/reports/status-wise')
      else if (tab === 'agent') res = await api.get('/reports/agent-wise')
      else if (tab === 'daily') res = await api.get('/reports/daily-calls', { params: { date: dateFilter } })
      else if (tab === 'pending') res = await api.get('/reports/pending-followups')
      else if (tab === 'upcoming') res = await api.get('/reports/upcoming-followups')
      setData(res.data || [])
    } finally {
      setLoading(false)
    }
  }

  const expandStatus = async (status) => {
    if (expandedStatus === status) { setExpandedStatus(null); return }
    setExpandedStatus(status)
    const res = await api.get('/leads', { params: { status, limit: 100 } })
    setStatusLeads(res.data)
  }

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `thynkflow_${tab}_report_${dateFilter}.xlsx`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm">Analytics and insights</p>
        </div>
        <button onClick={exportExcel} className="btn-secondary">📥 Export Excel</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setExpandedStatus(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Date:</label>
          <input type="date" className="input w-44" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-slate-400">Loading report...</div>
      ) : data.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No data available</div>
      ) : (
        <>
          {/* STATUS WISE */}
          {tab === 'status' && (
            <div className="space-y-2">
              {data.map(row => (
                <div key={row.status}>
                  <div className="card p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => expandStatus(row.status)}>
                    <div className="flex items-center gap-3">
                      <span className={`badge-${row.status}`}>{row.status?.replace('_', ' ')}</span>
                      <span className="text-sm text-slate-600">{row.count} leads</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, (row.count / data.reduce((s, r) => s + parseInt(r.count), 0)) * 100)}%` }} />
                      </div>
                      <span className="text-slate-400 text-sm">{expandedStatus === row.status ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {expandedStatus === row.status && (
                    <div className="border border-t-0 border-slate-200 rounded-b-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50"><tr>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">School / Name</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Phone</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Agent</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold">Last Remark</th>
                          <th className="px-4 py-2"></th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {statusLeads.map(lead => (
                            <tr key={lead.id} className="hover:bg-slate-50">
                              <td className="px-4 py-2 font-medium">{lead.school_name || lead.contact_name}</td>
                              <td className="px-4 py-2 text-blue-600">{lead.phone}</td>
                              <td className="px-4 py-2 text-slate-500">{lead.agent_name || '—'}</td>
                              <td className="px-4 py-2 text-slate-400 text-xs max-w-xs truncate">{lead.last_remark || '—'}</td>
                              <td className="px-4 py-2"><button onClick={() => setSelectedLead(lead.id)} className="text-blue-600 text-xs font-medium">View</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AGENT WISE */}
          {tab === 'agent' && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200"><tr>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Agent</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Total Leads</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Total Calls</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Hot</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Warm</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Converted</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Conv. Rate</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(row => (
                    <tr key={row.agent_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{row.agent_name}</td>
                      <td className="px-4 py-3">{row.total_leads}</td>
                      <td className="px-4 py-3">{row.total_calls}</td>
                      <td className="px-4 py-3"><span className="badge-hot">{row.hot}</span></td>
                      <td className="px-4 py-3"><span className="badge-warm">{row.warm}</span></td>
                      <td className="px-4 py-3"><span className="badge-converted">{row.converted}</span></td>
                      <td className="px-4 py-3 font-semibold text-green-600">
                        {row.total_leads > 0 ? ((row.converted / row.total_leads) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* DAILY CALLS / PENDING / UPCOMING */}
          {['daily', 'pending', 'upcoming'].includes(tab) && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200"><tr>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">School / Name</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Agent</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Remark</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">{tab === 'daily' ? 'Called At' : 'Follow-up Date'}</th>
                  <th className="px-4 py-3"></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{row.school_name || row.contact_name || '—'}</td>
                      <td className="px-4 py-3 text-blue-600">{row.phone}</td>
                      <td className="px-4 py-3 text-slate-500">{row.agent_name}</td>
                      <td className="px-4 py-3"><span className={`badge-${row.status}`}>{row.status?.replace('_', ' ')}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">{row.discussion || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {tab === 'daily'
                          ? format(new Date(row.called_at), 'hh:mm a')
                          : row.next_followup_date ? format(new Date(row.next_followup_date), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedLead(row.lead_id)} className="text-blue-600 text-xs font-medium">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <LeadDetailModal leadId={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  )
}
