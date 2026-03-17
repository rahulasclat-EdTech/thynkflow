import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import * as XLSX from 'xlsx'

const TABS = [
  { key: 'overview', label: '📊 Overview' },
  { key: 'status', label: '🏷️ Status Wise' },
  { key: 'agent', label: '👤 Agent Wise' },
  { key: 'daily', label: '📞 Daily Calls' },
  { key: 'pipeline', label: '🔽 Pipeline' },
  { key: 'pending', label: '⏳ Pending Follow-ups' },
  { key: 'upcoming', label: '📅 Upcoming Follow-ups' },
  { key: 'conversion', label: '✅ Conversion' },
]

const STATUS_COLORS = {
  new: { bg: '#dbeafe', text: '#1e40af' },
  hot: { bg: '#fee2e2', text: '#991b1b' },
  warm: { bg: '#fef3c7', text: '#92400e' },
  cold: { bg: '#e2e8f0', text: '#475569' },
  converted: { bg: '#dcfce7', text: '#14532d' },
  not_interested: { bg: '#f1f5f9', text: '#64748b' },
  call_back: { bg: '#ede9fe', text: '#5b21b6' },
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

// Drill-down popup modal
function DrillDownModal({ title, leads, onClose }) {
  if (!leads) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-400 mt-0.5">{leads.length} leads</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">School / Name</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Phone</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Last Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400">No leads found</td></tr>
              ) : leads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{lead.school_name || lead.contact_name || '—'}</td>
                  <td className="px-4 py-3 text-blue-600 font-medium">{lead.phone}</td>
                  <td className="px-4 py-3 text-slate-500">{lead.agent_name || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={lead.status || lead.last_status} /></td>
                  <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">{lead.last_remark || lead.discussion || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    </div>
  )
}

// Clickable stat card
function StatCard({ label, value, color, onClick, icon }) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        {onClick && <span className="text-xs text-blue-500 font-medium">click to drill ↗</span>}
      </div>
      <p className="text-3xl font-black" style={{ color }}>{value ?? 0}</p>
      <p className="text-sm text-slate-500 mt-1 font-medium">{label}</p>
    </div>
  )
}

export default function ReportsPage() {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [drillDown, setDrillDown] = useState(null) // { title, leads }
  const [overviewData, setOverviewData] = useState(null)
  const [conversionData, setConversionData] = useState([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      let res
      if (tab === 'overview') {
        const [dash, statusRes, agentRes] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/reports/status-wise'),
          api.get('/reports/agent-wise'),
        ])
        setOverviewData({ dash: dash.data, status: statusRes.data, agents: agentRes.data })
        setData([])
      } else if (tab === 'status') {
        res = await api.get('/reports/status-wise')
        setData(res.data || [])
      } else if (tab === 'agent') {
        res = await api.get('/reports/agent-wise')
        setData(res.data || [])
      } else if (tab === 'daily') {
        res = await api.get('/reports/daily-calls', { params: { date: dateFilter } })
        setData(res.data || [])
      } else if (tab === 'pending') {
        res = await api.get('/reports/pending-followups')
        setData(res.data || [])
      } else if (tab === 'upcoming') {
        res = await api.get('/reports/upcoming-followups')
        setData(res.data || [])
      } else if (tab === 'pipeline') {
        res = await api.get('/reports/status-wise')
        setData(res.data || [])
      } else if (tab === 'conversion') {
        res = await api.get('/reports/agent-wise')
        setData(res.data || [])
      }
    } catch (err) {
      console.error('Report fetch error:', err)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [tab, dateFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const openDrillDown = async (title, params) => {
    try {
      const res = await api.get('/leads', { params: { ...params, limit: 200 } })
      setDrillDown({ title, leads: res.data || [] })
    } catch {
      setDrillDown({ title, leads: [] })
    }
  }

  const openDailyDrillDown = async (title, calls) => {
    setDrillDown({ title, leads: calls || [] })
  }

  const exportExcel = () => {
    const exportData = tab === 'overview' ? [] : data
    if (!exportData.length) return
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `thynkflow_${tab}_${dateFilter}.xlsx`)
  }

  const totalLeads = overviewData?.dash?.totals?.total_leads || 0
  const converted = overviewData?.dash?.totals?.converted || 0
  const unattended = overviewData?.dash?.totals?.unattended || 0
  const hot = overviewData?.dash?.totals?.hot || 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📊 Reports & Analytics</h1>
          <p className="text-slate-500 text-sm">Corporate CRM reporting suite</p>
        </div>
        <button onClick={exportExcel} className="btn-secondary">📥 Export Excel</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Date filters */}
      {tab === 'daily' && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-slate-600">Date:</label>
          <input type="date" className="input w-44" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading report...
        </div>
      ) : (
        <>
          {/* ── OVERVIEW ── */}
          {tab === 'overview' && overviewData && (
            <div className="space-y-6">
              {/* KPI Cards - all clickable with drill down */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Leads" value={totalLeads} color="#2563eb" icon="👥"
                  onClick={() => openDrillDown('All Leads', {})} />
                <StatCard label="Unattended" value={unattended} color="#dc2626" icon="🔴"
                  onClick={() => openDrillDown('Unattended Leads', { unattended: 'true' })} />
                <StatCard label="Converted" value={converted} color="#16a34a" icon="✅"
                  onClick={() => openDrillDown('Converted Leads', { status: 'converted' })} />
                <StatCard label="Hot Leads" value={hot} color="#d97706" icon="🔥"
                  onClick={() => openDrillDown('Hot Leads', { status: 'hot' })} />
              </div>

              {/* Quick rates */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4 text-center">
                  <p className="text-3xl font-black text-green-600">
                    {totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : 0}%
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Conversion Rate</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-black text-blue-600">
                    {totalLeads > 0 ? (((totalLeads - unattended) / totalLeads) * 100).toFixed(1) : 0}%
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Attendance Rate</p>
                </div>
                <div className="card p-4 text-center cursor-pointer hover:shadow-md transition-all"
                  onClick={() => openDrillDown('Warm Leads', { status: 'warm' })}>
                  <p className="text-3xl font-black text-amber-500">
                    {overviewData.status?.find(s => s.status === 'warm')?.count || 0}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Warm Leads ↗</p>
                </div>
                <div className="card p-4 text-center cursor-pointer hover:shadow-md transition-all"
                  onClick={() => openDrillDown('Call Back Leads', { status: 'call_back' })}>
                  <p className="text-3xl font-black text-purple-600">
                    {overviewData.status?.find(s => s.status === 'call_back')?.count || 0}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Call Back ↗</p>
                </div>
              </div>

              {/* Status breakdown */}
              <div className="card p-5">
                <h3 className="font-bold text-slate-800 mb-4">Lead Status Breakdown</h3>
                <div className="space-y-3">
                  {overviewData.status?.map(row => {
                    const total = overviewData.status.reduce((s, r) => s + parseInt(r.count), 0)
                    const pct = total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0
                    const c = STATUS_COLORS[row.status] || STATUS_COLORS.new
                    return (
                      <div key={row.status}
                        className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors"
                        onClick={() => openDrillDown(`${row.status?.replace(/_/g, ' ')} Leads`, { status: row.status })}>
                        <div className="w-28 flex-shrink-0">
                          <StatusBadge status={row.status} />
                        </div>
                        <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full flex items-center px-2 transition-all duration-500"
                            style={{ width: `${Math.max(pct, 3)}%`, background: c.text }}>
                            {pct > 8 && <span className="text-white text-xs font-bold">{pct}%</span>}
                          </div>
                        </div>
                        <span className="text-sm font-bold text-slate-700 w-12 text-right">{row.count}</span>
                        <span className="text-xs text-blue-500">↗</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Agent leaderboard */}
              {overviewData.agents?.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">🏅 Agent Leaderboard</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Leads</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Calls</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Hot</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Converted</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Conv %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overviewData.agents.map((agent, i) => {
                        const rate = agent.total_leads > 0 ? ((agent.converted / agent.total_leads) * 100).toFixed(1) : 0
                        const medals = ['🥇', '🥈', '🥉']
                        return (
                          <tr key={agent.agent_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium">{medals[i] || ''} {agent.agent_name}</td>
                            <td className="px-4 py-3">{agent.total_leads}</td>
                            <td className="px-4 py-3">{agent.total_calls}</td>
                            <td className="px-4 py-3"><StatusBadge status="hot" /></td>
                            <td className="px-4 py-3 text-green-600 font-bold">{agent.converted}</td>
                            <td className="px-4 py-3 font-bold text-blue-600">{rate}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── STATUS WISE ── */}
          {tab === 'status' && (
            <div className="space-y-2">
              {data.length === 0 ? (
                <div className="card p-12 text-center text-slate-400">No data</div>
              ) : data.map(row => {
                const total = data.reduce((s, r) => s + parseInt(r.count), 0)
                const pct = total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0
                const c = STATUS_COLORS[row.status] || STATUS_COLORS.new
                return (
                  <div key={row.status}
                    className="card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                    onClick={() => openDrillDown(`${row.status?.replace(/_/g, ' ')} Leads`, { status: row.status })}>
                    <div className="w-32 flex-shrink-0"><StatusBadge status={row.status} /></div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full flex items-center px-3"
                        style={{ width: `${Math.max(pct, 2)}%`, background: c.text }}>
                        {pct > 5 && <span className="text-white text-xs font-bold">{pct}%</span>}
                      </div>
                    </div>
                    <span className="text-lg font-black text-slate-800 w-12 text-right">{row.count}</span>
                    <span className="text-blue-500 text-sm font-medium">View all ↗</span>
                  </div>
                )
              })}
              {/* Summary */}
              <div className="card p-4 bg-blue-50 border-blue-200 flex items-center justify-between">
                <span className="font-semibold text-blue-800">Total</span>
                <span className="text-2xl font-black text-blue-700">{data.reduce((s, r) => s + parseInt(r.count), 0)}</span>
              </div>
            </div>
          )}

          {/* ── AGENT WISE ── */}
          {tab === 'agent' && (
            <div className="card overflow-hidden">
              {data.length === 0 ? (
                <div className="p-12 text-center text-slate-400">No data</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Total Leads</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Total Calls</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Hot</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Warm</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Converted</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Conv. %</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.map((row, i) => {
                      const rate = row.total_leads > 0 ? ((row.converted / row.total_leads) * 100).toFixed(1) : 0
                      const medals = ['🥇', '🥈', '🥉']
                      return (
                        <tr key={row.agent_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{medals[i] || ''} {row.agent_name}</td>
                          <td className="px-4 py-3 font-bold text-blue-600 cursor-pointer hover:underline"
                            onClick={() => openDrillDown(`${row.agent_name}'s Leads`, { agent_id: row.agent_id })}>
                            {row.total_leads} ↗
                          </td>
                          <td className="px-4 py-3">{row.total_calls}</td>
                          <td className="px-4 py-3"><span className="font-bold text-red-500">{row.hot}</span></td>
                          <td className="px-4 py-3"><span className="font-bold text-amber-500">{row.warm}</span></td>
                          <td className="px-4 py-3 font-bold text-green-600 cursor-pointer hover:underline"
                            onClick={() => openDrillDown(`${row.agent_name}'s Converted`, { agent_id: row.agent_id, status: 'converted' })}>
                            {row.converted} ↗
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-bold ${parseFloat(rate) >= 20 ? 'text-green-600' : parseFloat(rate) >= 10 ? 'text-amber-500' : 'text-red-400'}`}>
                              {rate}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button className="text-blue-600 text-xs font-medium hover:underline"
                              onClick={() => openDrillDown(`${row.agent_name}'s All Leads`, { agent_id: row.agent_id })}>
                              View All
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-700">Total</td>
                      <td className="px-4 py-3 font-bold">{data.reduce((s, r) => s + parseInt(r.total_leads || 0), 0)}</td>
                      <td className="px-4 py-3 font-bold">{data.reduce((s, r) => s + parseInt(r.total_calls || 0), 0)}</td>
                      <td className="px-4 py-3 font-bold text-red-500">{data.reduce((s, r) => s + parseInt(r.hot || 0), 0)}</td>
                      <td className="px-4 py-3 font-bold text-amber-500">{data.reduce((s, r) => s + parseInt(r.warm || 0), 0)}</td>
                      <td className="px-4 py-3 font-bold text-green-600">{data.reduce((s, r) => s + parseInt(r.converted || 0), 0)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          )}

          {/* ── DAILY CALLS ── */}
          {tab === 'daily' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Calls Today" value={data.length} color="#2563eb" icon="📞"
                  onClick={() => openDailyDrillDown('All Calls Today', data)} />
                <StatCard label="Hot Leads Called" value={data.filter(d => d.status === 'hot').length} color="#dc2626" icon="🔥"
                  onClick={() => openDailyDrillDown('Hot Leads Called Today', data.filter(d => d.status === 'hot'))} />
                <StatCard label="Converted Today" value={data.filter(d => d.status === 'converted').length} color="#16a34a" icon="✅"
                  onClick={() => openDailyDrillDown('Converted Today', data.filter(d => d.status === 'converted'))} />
                <StatCard label="Call Backs Set" value={data.filter(d => d.status === 'call_back').length} color="#7c3aed" icon="🔄"
                  onClick={() => openDailyDrillDown('Call Backs Set Today', data.filter(d => d.status === 'call_back'))} />
              </div>

              <div className="card overflow-hidden">
                {data.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <p className="text-4xl mb-3">📭</p>
                    <p>No calls logged for this date</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">School / Name</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Phone</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Status</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Discussion</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Called At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map((row, i) => (
                        <tr key={row.id || i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{row.school_name || row.contact_name || '—'}</td>
                          <td className="px-4 py-3 text-blue-600">{row.phone}</td>
                          <td className="px-4 py-3 text-slate-500">{row.agent_name || '—'}</td>
                          <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                          <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">{row.discussion || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {row.called_at ? (() => {
                              try { return format(new Date(row.called_at), 'hh:mm a') } catch { return '—' }
                            })() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── PIPELINE ── */}
          {tab === 'pipeline' && (
            <div className="space-y-4">
              <div className="card p-5">
                <h3 className="font-bold text-slate-800 mb-5">🔽 Sales Pipeline Funnel</h3>
                {data.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No data</p>
                ) : (() => {
                  const total = data.reduce((s, r) => s + parseInt(r.count), 0)
                  const pipelineOrder = ['new', 'call_back', 'warm', 'hot', 'converted']
                  const ordered = pipelineOrder
                    .map(s => data.find(d => d.status === s))
                    .filter(Boolean)
                  return (
                    <div className="space-y-3">
                      {ordered.map((row, i) => {
                        const pct = total > 0 ? Math.round((parseInt(row.count) / total) * 100) : 0
                        const c = STATUS_COLORS[row.status] || STATUS_COLORS.new
                        const width = 100 - (i * 10)
                        return (
                          <div key={row.status} className="flex items-center gap-4 cursor-pointer"
                            onClick={() => openDrillDown(`${row.status?.replace(/_/g, ' ')} Leads`, { status: row.status })}>
                            <div className="w-24 text-right flex-shrink-0">
                              <StatusBadge status={row.status} />
                            </div>
                            <div className="flex-1">
                              <div className="h-10 rounded-lg flex items-center justify-between px-4 transition-all hover:opacity-90"
                                style={{ width: `${width}%`, background: c.text }}>
                                <span className="text-white text-sm font-bold">{row.count}</span>
                                <span className="text-white text-xs opacity-80">{pct}%</span>
                              </div>
                            </div>
                            <span className="text-blue-500 text-xs">↗</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* Lost/Not interested */}
              <div className="card p-5">
                <h3 className="font-bold text-slate-800 mb-4">Lost Leads Analysis</h3>
                <div className="grid grid-cols-2 gap-4">
                  {['not_interested', 'cold'].map(status => {
                    const row = data.find(d => d.status === status)
                    return (
                      <div key={status}
                        className="p-4 rounded-xl border border-slate-200 cursor-pointer hover:shadow-md transition-all"
                        onClick={() => openDrillDown(`${status?.replace(/_/g, ' ')} Leads`, { status })}>
                        <StatusBadge status={status} />
                        <p className="text-3xl font-black text-slate-700 mt-2">{row?.count || 0}</p>
                        <p className="text-xs text-blue-500 mt-1">Click to view ↗</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── CONVERSION REPORT ── */}
          {tab === 'conversion' && (
            <div className="space-y-4">
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-bold text-slate-800">Agent Conversion Performance</h3>
                  <p className="text-sm text-slate-400 mt-0.5">Click on any number to see detailed leads</p>
                </div>
                {data.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">No data</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Assigned</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Contacted</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Interested</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Converted</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Conv. Rate</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Performance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map(row => {
                        const contacted = parseInt(row.total_leads || 0) - parseInt(row.unattended || 0)
                        const interested = parseInt(row.hot || 0) + parseInt(row.warm || 0)
                        const rate = row.total_leads > 0 ? ((row.converted / row.total_leads) * 100).toFixed(1) : 0
                        const perfColor = parseFloat(rate) >= 20 ? '#16a34a' : parseFloat(rate) >= 10 ? '#d97706' : '#dc2626'
                        return (
                          <tr key={row.agent_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-bold text-slate-800">{row.agent_name}</td>
                            <td className="px-4 py-3 text-blue-600 font-medium cursor-pointer hover:underline"
                              onClick={() => openDrillDown(`${row.agent_name}'s Leads`, { agent_id: row.agent_id })}>
                              {row.total_leads} ↗
                            </td>
                            <td className="px-4 py-3">{row.total_calls}</td>
                            <td className="px-4 py-3 text-amber-600 font-medium cursor-pointer hover:underline"
                              onClick={() => openDrillDown(`${row.agent_name}'s Hot+Warm`, { agent_id: row.agent_id, status: 'hot' })}>
                              {interested} ↗
                            </td>
                            <td className="px-4 py-3 text-green-600 font-bold cursor-pointer hover:underline"
                              onClick={() => openDrillDown(`${row.agent_name}'s Converted`, { agent_id: row.agent_id, status: 'converted' })}>
                              {row.converted} ↗
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-lg font-black" style={{ color: perfColor }}>{rate}%</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, parseFloat(rate) * 3)}%`, background: perfColor }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── PENDING / UPCOMING FOLLOW-UPS ── */}
          {['pending', 'upcoming'].includes(tab) && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Total" value={data.length} color="#2563eb" icon="📋"
                  onClick={() => openDailyDrillDown('All Follow-ups', data)} />
                <StatCard label="Hot Leads" value={data.filter(d => d.lead_status === 'hot' || d.status === 'hot').length} color="#dc2626" icon="🔥"
                  onClick={() => openDailyDrillDown('Hot Lead Follow-ups', data.filter(d => d.lead_status === 'hot' || d.status === 'hot'))} />
                <StatCard label="Overdue" value={data.filter(d => d.followup_type === 'missed').length} color="#7c3aed" icon="⚠️"
                  onClick={() => openDailyDrillDown('Overdue Follow-ups', data.filter(d => d.followup_type === 'missed'))} />
              </div>

              <div className="card overflow-hidden">
                {data.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <p className="text-4xl mb-3">🎉</p>
                    <p>No follow-ups found</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">School / Name</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Phone</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Status</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Discussion</th>
                        <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Follow-up Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map((row, i) => (
                        <tr key={row.id || i} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{row.school_name || row.contact_name || '—'}</td>
                          <td className="px-4 py-3 text-blue-600">{row.phone}</td>
                          <td className="px-4 py-3 text-slate-500">{row.agent_name || '—'}</td>
                          <td className="px-4 py-3"><StatusBadge status={row.lead_status || row.status} /></td>
                          <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">{row.discussion || '—'}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {row.next_followup_date ? (() => {
                              try { return format(new Date(row.next_followup_date), 'dd MMM yyyy') } catch { return '—' }
                            })() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Drill-down popup */}
      {drillDown && (
        <DrillDownModal
          title={drillDown.title}
          leads={drillDown.leads}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  )
}
