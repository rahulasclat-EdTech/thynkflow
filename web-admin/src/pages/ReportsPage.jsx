// web-admin/src/pages/ReportsPage.jsx — COMPLETE REPLACEMENT
// Fixes: overview calculation, agent scoping, adds weekly/monthly comparison,
//        detailed daily report, call stats, pipeline tabs, follow-up date column
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { format, subDays, startOfMonth, endOfMonth, startOfWeek } from 'date-fns'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'

const TABS = [
  { key: 'overview',    label: '📊 Overview' },
  { key: 'status',      label: '🏷️ Status Wise' },
  { key: 'agent',       label: '👤 Agent Wise' },
  { key: 'daily',       label: '📞 Daily Calls' },
  { key: 'weekly',      label: '📅 Weekly' },
  { key: 'monthly',     label: '📆 Monthly' },
  { key: 'pipeline',    label: '🔽 Pipeline' },
  { key: 'pending',     label: '⏳ Pending Follow-ups' },
  { key: 'upcoming',    label: '📅 Upcoming Follow-ups' },
  { key: 'conversion',  label: '✅ Conversion' },
]

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
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize" style={{ background: c.bg, color: c.text }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

function StatCard({ label, value, color = '#2563eb', icon, onClick, sub }) {
  return (
    <div onClick={onClick}
      className={`bg-white border border-slate-200 rounded-xl p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        {onClick && <span className="text-xs text-blue-500 font-medium">drill ↗</span>}
      </div>
      <p className="text-3xl font-black" style={{ color }}>{value ?? 0}</p>
      <p className="text-sm text-slate-500 mt-1 font-medium">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function DrillModal({ title, leads, onClose }) {
  if (!leads) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-400">{leads.length} records</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                {['Name / School','Phone','Agent','Status','Remark / Notes','Date'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.length === 0
                ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">No records found</td></tr>
                : leads.map((row, i) => (
                  <tr key={row.id || i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.school_name || row.contact_name || row.lead_name || '—'}</td>
                    <td className="px-4 py-3 text-blue-600">{row.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{row.agent_name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status || row.lead_status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[180px] truncate">{row.discussion || row.notes || row.last_remark || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {(row.called_at || row.follow_up_date || row.next_followup_date || row.created_at)
                        ? (() => { try { return format(new Date(row.called_at || row.follow_up_date || row.next_followup_date || row.created_at), 'dd MMM yyyy, hh:mm a') } catch { return '—' } })()
                        : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={() => {
            const ws = XLSX.utils.json_to_sheet(leads)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Drill Down')
            XLSX.writeFile(wb, `${title.replace(/\s/g, '_')}.xlsx`)
          }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">📥 Export</button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [tab, setTab]           = useState('overview')
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0])
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [overviewData, setOverviewData] = useState(null)
  const [callStats, setCallStats]       = useState(null)
  const [pipelineData, setPipelineData] = useState(null)
  const [drillDown, setDrillDown]       = useState(null)
  const [activePipelineTab, setActivePipelineTab] = useState('status')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'overview') {
        const [dashRes, statsRes, statusRes, agentRes, callRes] = await Promise.all([
          api.get('/dashboard/stats').catch(() => ({ data: {} })),
          api.get('/reports/overview').catch(() => ({ data: {} })),
          api.get('/reports/status-wise').catch(() => ({ data: [] })),
          api.get('/reports/agent-wise').catch(() => ({ data: [] })),
          api.get('/reports/call-stats').catch(() => ({ data: {} })),
        ])
        // Merge data from both endpoints, preferring direct overview values
        const dashTotals = dashRes.data?.data?.totals || {}
        const overviewStats = statsRes.data?.data || {}
        const merged = {
          total_leads:          parseInt(overviewStats.total_leads    || dashTotals.total_leads    || 0),
          hot_leads:            parseInt(overviewStats.hot_leads      || dashTotals.hot_leads      || dashTotals.hot || 0),
          warm_leads:           parseInt(overviewStats.warm_leads     || dashTotals.warm_leads     || dashTotals.warm || 0),
          cold_leads:           parseInt(overviewStats.cold_leads     || dashTotals.cold_leads     || dashTotals.cold || 0),
          converted_leads:      parseInt(overviewStats.converted_leads|| dashTotals.converted_leads|| dashTotals.converted || 0),
          not_interested_leads: parseInt(overviewStats.not_interested_leads || dashTotals.not_interested_leads || dashTotals.not_interested || 0),
          call_back_leads:      parseInt(overviewStats.call_back_leads|| dashTotals.call_back_leads|| dashTotals.call_back || 0),
          new_leads:            parseInt(overviewStats.new_leads      || dashTotals.new_leads      || 0),
          unattended:           parseInt(overviewStats.unattended     || dashTotals.unattended     || 0),
        }
        const statusArr = Array.isArray(statusRes.data?.data) ? statusRes.data.data : (Array.isArray(statusRes.data) ? statusRes.data : [])
        const agentArr  = Array.isArray(agentRes.data?.data)  ? agentRes.data.data  : (Array.isArray(agentRes.data)  ? agentRes.data  : [])
        setOverviewData({ totals: merged, status: statusArr, agents: agentArr })
        setCallStats(callRes.data?.data || callRes.data || {})
        setData([])
      } else if (tab === 'status') {
        const r = await api.get('/reports/status-wise')
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } else if (tab === 'agent') {
        const r = await api.get('/reports/agent-wise')
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } else if (tab === 'daily') {
        const r = await api.get('/reports/daily-calls', { params: { date: dateFilter } })
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } else if (tab === 'weekly') {
        const r = await api.get('/reports/weekly-comparison')
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } else if (tab === 'monthly') {
        const r = await api.get('/reports/monthly-comparison')
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } else if (tab === 'pipeline') {
        const r = await api.get('/reports/pipeline')
        setPipelineData(r.data?.data || null)
        setData([])
      } else if (tab === 'pending') {
        const r = await api.get('/reports/pending-followups')
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } else if (tab === 'upcoming') {
        const r = await api.get('/reports/upcoming-followups')
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      } else if (tab === 'conversion') {
        const r = await api.get('/reports/conversion')
        setData(Array.isArray(r.data?.data) ? r.data.data : (Array.isArray(r.data) ? r.data : []))
      }
    } catch (err) {
      console.error('Report error:', err)
      setData([])
    } finally { setLoading(false) }
  }, [tab, dateFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const openDrill = async (title, params) => {
    try {
      const r = await api.get('/leads', { params: { ...params, per_page: 200 } })
      const leads = Array.isArray(r.data) ? r.data : (r.data?.data || [])
      setDrillDown({ title, leads })
    } catch { setDrillDown({ title, leads: [] }) }
  }

  const openDataDrill = (title, rows) => setDrillDown({ title, leads: rows || [] })

  const exportExcel = () => {
    const rows = tab === 'overview' ? [] : data
    if (!rows.length) return
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    XLSX.writeFile(wb, `report_${tab}_${dateFilter}.xlsx`)
  }

  const totals = overviewData?.totals || {}
  const totalLeads  = totals.total_leads || 0
  const converted   = totals.converted_leads || 0
  const unattended  = totals.unattended || 0
  const hot         = totals.hot_leads || 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📊 Reports & Analytics</h1>
          <p className="text-slate-500 text-sm">Full CRM reporting suite</p>
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

      {/* Date filter */}
      {tab === 'daily' && (
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-slate-600">Date:</label>
          <input type="date" className="input w-44" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading report…
        </div>
      ) : (
        <>
          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Call stats bar */}
              {callStats && (
                <div className="grid grid-cols-3 gap-4">
                  <StatCard label="Calls Today"    value={callStats.today        || 0} icon="📞" color="#2563eb" />
                  <StatCard label="Calls This Week" value={callStats.this_week    || 0} icon="📅" color="#7c3aed" />
                  <StatCard label="Calls This Month"value={callStats.this_month   || 0} icon="📆" color="#0891b2" />
                </div>
              )}

              {/* Main KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Leads"  value={totalLeads} icon="👥" color="#2563eb"
                  onClick={() => openDrill('All Leads', {})} />
                <StatCard label="Unattended"   value={unattended} icon="🔴" color="#dc2626"
                  sub=">5 days idle"
                  onClick={() => openDrill('Unattended Leads (>5 days)', { unattended: 'true' })} />
                <StatCard label="Converted"    value={converted}  icon="✅" color="#16a34a"
                  sub={`${totalLeads > 0 ? ((converted/totalLeads)*100).toFixed(1) : 0}% rate`}
                  onClick={() => openDrill('Converted Leads', { status: 'converted' })} />
                <StatCard label="Hot Leads"    value={hot}        icon="🔥" color="#d97706"
                  onClick={() => openDrill('Hot Leads', { status: 'hot' })} />
              </div>

              {/* Rates */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4 text-center">
                  <p className="text-3xl font-black text-green-600">
                    {totalLeads > 0 ? ((converted/totalLeads)*100).toFixed(1) : 0}%
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Conversion Rate</p>
                </div>
                <div className="card p-4 text-center">
                  <p className="text-3xl font-black text-blue-600">
                    {totalLeads > 0 ? (((totalLeads-unattended)/totalLeads)*100).toFixed(1) : 0}%
                  </p>
                  <p className="text-sm text-slate-500 mt-1">Attendance Rate</p>
                </div>
                <div className="card p-4 text-center cursor-pointer hover:shadow-md transition-all"
                  onClick={() => openDrill('Warm Leads', { status: 'warm' })}>
                  <p className="text-3xl font-black text-amber-500">{totals.warm_leads || 0}</p>
                  <p className="text-sm text-slate-500 mt-1">Warm Leads ↗</p>
                </div>
                <div className="card p-4 text-center cursor-pointer hover:shadow-md transition-all"
                  onClick={() => openDrill('Call Back Leads', { status: 'call_back' })}>
                  <p className="text-3xl font-black text-purple-600">{totals.call_back_leads || 0}</p>
                  <p className="text-sm text-slate-500 mt-1">Call Back ↗</p>
                </div>
              </div>

              {/* Status breakdown */}
              {overviewData?.status?.length > 0 && (
                <div className="card p-5">
                  <h3 className="font-bold text-slate-800 mb-4">Lead Status Breakdown</h3>
                  <div className="space-y-3">
                    {overviewData.status.map(row => {
                      const total = overviewData.status.reduce((s, r) => s + parseInt(r.count || 0), 0)
                      const pct   = total > 0 ? Math.round((parseInt(row.count)/total)*100) : 0
                      const c     = STATUS_COLORS[row.status] || STATUS_COLORS.new
                      return (
                        <div key={row.status}
                          className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 p-2 rounded-lg transition-colors"
                          onClick={() => openDrill(`${row.status?.replace(/_/g,' ')} Leads`, { status: row.status })}>
                          <div className="w-28 flex-shrink-0"><StatusBadge status={row.status} /></div>
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
              )}

              {/* Agent leaderboard */}
              {overviewData?.agents?.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">🏅 Agent Leaderboard</h3>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Agent','Leads','Calls','Hot','Warm','Converted','Conv %'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overviewData.agents.map((a, i) => {
                        const rate = a.total_leads > 0 ? ((a.converted/a.total_leads)*100).toFixed(1) : 0
                        const medals = ['🥇','🥈','🥉']
                        return (
                          <tr key={a.agent_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium">{medals[i] || ''} {a.agent_name}</td>
                            <td className="px-4 py-3 text-blue-600 cursor-pointer hover:underline font-bold"
                              onClick={() => openDrill(`${a.agent_name}'s Leads`, { agent_id: a.agent_id })}>
                              {a.total_leads} ↗
                            </td>
                            <td className="px-4 py-3">{a.total_calls}</td>
                            <td className="px-4 py-3 font-bold text-red-500">{a.hot}</td>
                            <td className="px-4 py-3 font-bold text-amber-500">{a.warm}</td>
                            <td className="px-4 py-3 font-bold text-green-600 cursor-pointer hover:underline"
                              onClick={() => openDrill(`${a.agent_name}'s Converted`, { agent_id: a.agent_id, status: 'converted' })}>
                              {a.converted} ↗
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${parseFloat(rate)>=20?'text-green-600':parseFloat(rate)>=10?'text-amber-500':'text-red-400'}`}>
                                {rate}%
                              </span>
                            </td>
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
              {data.length === 0
                ? <div className="card p-12 text-center text-slate-400">No data</div>
                : data.map(row => {
                    const total = data.reduce((s, r) => s + parseInt(r.count || 0), 0)
                    const pct   = total > 0 ? Math.round((parseInt(row.count)/total)*100) : 0
                    const c     = STATUS_COLORS[row.status] || STATUS_COLORS.new
                    return (
                      <div key={row.status}
                        className="card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                        onClick={() => openDrill(`${row.status?.replace(/_/g,' ')} Leads`, { status: row.status })}>
                        <div className="w-32 flex-shrink-0"><StatusBadge status={row.status} /></div>
                        <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full flex items-center px-3"
                            style={{ width: `${Math.max(pct, 2)}%`, background: c.text }}>
                            {pct > 5 && <span className="text-white text-xs font-bold">{pct}%</span>}
                          </div>
                        </div>
                        <span className="text-lg font-black text-slate-800 w-12 text-right">{row.count}</span>
                        <span className="text-blue-500 text-sm">View ↗</span>
                      </div>
                    )
                  })
              }
              <div className="card p-4 bg-blue-50 border-blue-200 flex items-center justify-between">
                <span className="font-semibold text-blue-800">Total</span>
                <span className="text-2xl font-black text-blue-700">{data.reduce((s, r) => s + parseInt(r.count || 0), 0)}</span>
              </div>
            </div>
          )}

          {/* ── AGENT WISE ── */}
          {tab === 'agent' && (
            <div className="card overflow-hidden">
              {data.length === 0
                ? <div className="p-12 text-center text-slate-400">No data</div>
                : <>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        {['Agent','Total Leads','Calls','Hot','Warm','Cold','Converted','Conv %','Actions'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map((row, i) => {
                        const rate = row.total_leads > 0 ? ((row.converted/row.total_leads)*100).toFixed(1) : 0
                        const medals = ['🥇','🥈','🥉']
                        return (
                          <tr key={row.agent_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium">{medals[i] || ''} {row.agent_name}</td>
                            <td className="px-4 py-3 font-bold text-blue-600 cursor-pointer hover:underline"
                              onClick={() => openDrill(`${row.agent_name}'s Leads`, { agent_id: row.agent_id })}>
                              {row.total_leads} ↗
                            </td>
                            <td className="px-4 py-3">{row.total_calls}</td>
                            <td className="px-4 py-3 font-bold text-red-500">{row.hot}</td>
                            <td className="px-4 py-3 font-bold text-amber-500">{row.warm}</td>
                            <td className="px-4 py-3 text-slate-500">{row.cold}</td>
                            <td className="px-4 py-3 font-bold text-green-600 cursor-pointer hover:underline"
                              onClick={() => openDrill(`${row.agent_name}'s Converted`, { agent_id: row.agent_id, status: 'converted' })}>
                              {row.converted} ↗
                            </td>
                            <td className="px-4 py-3">
                              <span className={`font-bold ${parseFloat(rate)>=20?'text-green-600':parseFloat(rate)>=10?'text-amber-500':'text-red-400'}`}>
                                {rate}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button className="text-blue-600 text-xs font-medium hover:underline"
                                onClick={() => openDrill(`${row.agent_name}'s All Leads`, { agent_id: row.agent_id })}>
                                View All
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="px-4 py-3 font-bold">Total</td>
                        {['total_leads','total_calls','hot','warm','cold','converted'].map(k => (
                          <td key={k} className="px-4 py-3 font-bold">{data.reduce((s,r) => s + parseInt(r[k]||0), 0)}</td>
                        ))}
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </>
              }
            </div>
          )}

          {/* ── DAILY CALLS ── */}
          {tab === 'daily' && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <StatCard label="Total Calls"    value={data.length}                                                      icon="📞" color="#2563eb" onClick={() => openDataDrill('All Calls', data)} />
                <StatCard label="Fresh (New)"    value={data.filter(d=>d.status==='new').length}                          icon="🆕" color="#0891b2" onClick={() => openDataDrill('Fresh Calls', data.filter(d=>d.status==='new'))} />
                <StatCard label="Hot Leads"      value={data.filter(d=>d.status==='hot').length}                          icon="🔥" color="#dc2626" onClick={() => openDataDrill('Hot Lead Calls', data.filter(d=>d.status==='hot'))} />
                <StatCard label="Warm Leads"     value={data.filter(d=>d.status==='warm').length}                         icon="☀️" color="#d97706" onClick={() => openDataDrill('Warm Lead Calls', data.filter(d=>d.status==='warm'))} />
                <StatCard label="Follow-ups Set" value={data.filter(d=>d.followup_created).length}                        icon="📅" color="#16a34a" onClick={() => openDataDrill('Follow-ups Created', data.filter(d=>d.followup_created))} />
              </div>
              {/* Agent breakdown for admin */}
              {isAdmin && data.length > 0 && (() => {
                const agentMap = {}
                data.forEach(r => {
                  const k = r.agent_name || 'Unassigned'
                  agentMap[k] = (agentMap[k] || 0) + 1
                })
                return (
                  <div className="card p-4">
                    <h3 className="font-bold text-slate-700 mb-3">Agent Breakdown — {dateFilter}</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(agentMap).sort((a,b) => b[1]-a[1]).map(([name, count]) => (
                        <div key={name} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 cursor-pointer hover:shadow-sm"
                          onClick={() => openDataDrill(`${name}'s Calls on ${dateFilter}`, data.filter(r => (r.agent_name||'Unassigned') === name))}>
                          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">{name[0]}</div>
                          <span className="text-sm font-semibold text-slate-700">{name}</span>
                          <span className="text-lg font-black text-blue-600">{count}</span>
                          <span className="text-xs text-blue-400">↗</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
              {/* Detailed table */}
              <div className="card overflow-hidden">
                {data.length === 0
                  ? <div className="p-12 text-center text-slate-400"><p className="text-4xl mb-3">📭</p><p>No calls logged for this date</p></div>
                  : <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['School / Name','Phone','Agent','Status','Discussion','Follow-up','Called At'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.map((row, i) => (
                          <tr key={row.id||i} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium">{row.school_name || row.contact_name || '—'}</td>
                            <td className="px-4 py-3 text-blue-600">{row.phone}</td>
                            <td className="px-4 py-3 text-slate-500">{row.agent_name || '—'}</td>
                            <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                            <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">{row.discussion || '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.followup_created ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                {row.followup_created ? '✓ Set' : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {row.called_at ? (() => { try { return format(new Date(row.called_at), 'hh:mm a') } catch { return '—' } })() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                }
              </div>
            </div>
          )}

          {/* ── WEEKLY COMPARISON ── */}
          {tab === 'weekly' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800">📅 Last 4 Weeks Comparison</h3>
              {data.length === 0
                ? <div className="card p-12 text-center text-slate-400">No data for last 4 weeks</div>
                : <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {data.map((row, i) => {
                      const weekStart = (() => { try { return format(new Date(row.week_start), 'dd MMM') } catch { return '—' } })()
                      const weekEnd   = (() => { try { return format(new Date(new Date(row.week_start).getTime() + 6*86400000), 'dd MMM') } catch { return '—' } })()
                      return (
                        <div key={i} className="card p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-sm font-bold text-slate-700">{i === 0 ? 'This Week' : `${i} week${i>1?'s':''} ago`}</p>
                              <p className="text-xs text-slate-400">{weekStart} – {weekEnd}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${i===0?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600'}`}>
                              Week {i+1}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {[['Calls',row.total_calls,'#2563eb'],['Contacted',row.leads_contacted,'#7c3aed'],['Converted',row.converted,'#16a34a'],['Hot',row.hot,'#dc2626'],['Warm',row.warm,'#d97706'],['Follow-ups',row.followups_created,'#0891b2']].map(([label,val,color])=>(
                              <div key={label} className="text-center p-2 bg-slate-50 rounded-xl">
                                <p className="text-xl font-black" style={{color}}>{val||0}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Comparison table */}
                  <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Week-on-Week Comparison</h3></div>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50"><tr>
                        {['Week','Calls','Contacted','Converted','Hot','Warm','Follow-ups','Conv %'].map(h=>(
                          <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.map((row, i) => {
                          const wl = (() => { try { return format(new Date(row.week_start), 'dd MMM') } catch { return '—' } })()
                          const rate = row.leads_contacted > 0 ? ((row.converted/row.leads_contacted)*100).toFixed(1) : 0
                          return (
                            <tr key={i} className={i===0?'bg-blue-50 font-semibold':''}>
                              <td className="px-4 py-3">{wl}</td>
                              <td className="px-4 py-3 font-bold text-blue-600">{row.total_calls||0}</td>
                              <td className="px-4 py-3">{row.leads_contacted||0}</td>
                              <td className="px-4 py-3 font-bold text-green-600">{row.converted||0}</td>
                              <td className="px-4 py-3 text-red-500">{row.hot||0}</td>
                              <td className="px-4 py-3 text-amber-500">{row.warm||0}</td>
                              <td className="px-4 py-3 text-purple-500">{row.followups_created||0}</td>
                              <td className="px-4 py-3 font-bold">{rate}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              }
            </div>
          )}

          {/* ── MONTHLY COMPARISON ── */}
          {tab === 'monthly' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800">📆 Last 3 Months Comparison</h3>
              {data.length === 0
                ? <div className="card p-12 text-center text-slate-400">No data for last 3 months</div>
                : <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {data.map((row, i) => (
                      <div key={i} className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-base font-bold text-slate-700">{row.month_label}</p>
                          {i===0 && <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">Current</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[['Calls',row.total_calls,'#2563eb'],['New Leads',row.new_leads,'#0891b2'],['Contacted',row.leads_contacted,'#7c3aed'],['Converted',row.converted,'#16a34a'],['Hot',row.hot,'#dc2626'],['Warm',row.warm,'#d97706']].map(([label,val,color])=>(
                            <div key={label} className="text-center p-2 bg-slate-50 rounded-xl">
                              <p className="text-xl font-black" style={{color}}>{val||0}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-100 text-center">
                          <p className="text-xs text-slate-400">Conversion Rate</p>
                          <p className="text-xl font-black text-green-600">
                            {row.leads_contacted > 0 ? ((row.converted/row.leads_contacted)*100).toFixed(1) : 0}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              }
            </div>
          )}

          {/* ── PIPELINE ── */}
          {tab === 'pipeline' && pipelineData && (
            <div className="space-y-4">
              {/* Sub-tabs */}
              <div className="flex gap-2">
                {[['status','🔽 By Status'],['agent','👤 By Agent'],['product','📦 By Product']].map(([k,l])=>(
                  <button key={k} onClick={() => setActivePipelineTab(k)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activePipelineTab===k?'bg-blue-600 text-white':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {activePipelineTab === 'status' && (
                <div className="card p-5 space-y-3">
                  <h3 className="font-bold text-slate-800">Sales Funnel</h3>
                  {(() => {
                    const rows = pipelineData.by_status || []
                    const total = rows.reduce((s,r) => s+parseInt(r.count||0), 0)
                    const order = ['new','call_back','warm','hot','converted']
                    const ordered = order.map(s => rows.find(r => r.status===s)).filter(Boolean)
                    return ordered.map((row, i) => {
                      const pct = total > 0 ? Math.round((parseInt(row.count)/total)*100) : 0
                      const c = STATUS_COLORS[row.status] || STATUS_COLORS.new
                      return (
                        <div key={row.status} className="flex items-center gap-4 cursor-pointer"
                          onClick={() => openDrill(`${row.status.replace(/_/g,' ')} Leads`, { status: row.status })}>
                          <div className="w-24 text-right flex-shrink-0"><StatusBadge status={row.status} /></div>
                          <div className="flex-1">
                            <div className="h-10 rounded-lg flex items-center justify-between px-4"
                              style={{ width: `${100 - i*10}%`, background: c.text }}>
                              <span className="text-white font-bold">{row.count}</span>
                              <span className="text-white text-xs opacity-80">{pct}%</span>
                            </div>
                          </div>
                          <span className="text-blue-500 text-xs">↗</span>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}

              {activePipelineTab === 'agent' && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Agent-wise Pipeline</h3></div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>
                      {['Agent','Total','New','Hot','Warm','Converted'].map(h=>(
                        <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(pipelineData.by_agent||[]).map(a=>(
                        <tr key={a.agent_id} className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => openDrill(`${a.agent_name}'s Pipeline`, { agent_id: a.agent_id })}>
                          <td className="px-4 py-3 font-medium">{a.agent_name}</td>
                          <td className="px-4 py-3 font-bold text-blue-600">{a.total}</td>
                          <td className="px-4 py-3">{a.new_leads}</td>
                          <td className="px-4 py-3 font-bold text-red-500">{a.hot}</td>
                          <td className="px-4 py-3 font-bold text-amber-500">{a.warm}</td>
                          <td className="px-4 py-3 font-bold text-green-600">{a.converted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activePipelineTab === 'product' && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Product-wise Pipeline</h3></div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>
                      {['Product','Total Leads','Hot','Converted','Conv %'].map(h=>(
                        <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(pipelineData.by_product||[]).map(p=>{
                        const rate = p.total > 0 ? ((p.converted/p.total)*100).toFixed(1) : 0
                        return (
                          <tr key={p.product_id} className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => openDrill(`${p.product_name} Leads`, { product_id: p.product_id })}>
                            <td className="px-4 py-3 font-medium">{p.product_name}</td>
                            <td className="px-4 py-3 font-bold text-blue-600">{p.total}</td>
                            <td className="px-4 py-3 font-bold text-red-500">{p.hot}</td>
                            <td className="px-4 py-3 font-bold text-green-600">{p.converted}</td>
                            <td className="px-4 py-3 font-bold">{rate}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── PENDING / UPCOMING FOLLOW-UPS ── */}
          {['pending','upcoming'].includes(tab) && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Total" value={data.length} icon="📋" color="#2563eb"
                  onClick={() => openDataDrill('All Follow-ups', data)} />
                <StatCard label="Hot Leads" value={data.filter(d=>d.lead_status==='hot'||d.status==='hot').length} icon="🔥" color="#dc2626"
                  onClick={() => openDataDrill('Hot Lead Follow-ups', data.filter(d=>d.lead_status==='hot'||d.status==='hot'))} />
                <StatCard label="Overdue" value={data.filter(d=>d.followup_type==='missed').length} icon="⚠️" color="#7c3aed"
                  onClick={() => openDataDrill('Overdue Follow-ups', data.filter(d=>d.followup_type==='missed'))} />
              </div>
              <div className="card overflow-hidden">
                {data.length === 0
                  ? <div className="p-12 text-center text-slate-400"><p className="text-4xl mb-3">🎉</p><p>No follow-ups found</p></div>
                  : <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          {['Name / School','Phone','Agent','Lead Status','Notes','Scheduled Date'].map(h=>(
                            <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.map((row, i) => {
                          const dateVal = row.next_followup_date || row.follow_up_date
                          const isOverdue = dateVal && new Date(dateVal) < new Date()
                          return (
                            <tr key={row.id||i} className={`hover:bg-slate-50 ${isOverdue?'bg-red-50':''}`}>
                              <td className="px-4 py-3 font-medium">{row.school_name||row.contact_name||'—'}</td>
                              <td className="px-4 py-3 text-blue-600">{row.phone}</td>
                              <td className="px-4 py-3 text-slate-500">{row.agent_name||'—'}</td>
                              <td className="px-4 py-3"><StatusBadge status={row.lead_status||row.status} /></td>
                              <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">{row.notes||row.discussion||'—'}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-medium ${isOverdue?'text-red-600 font-bold':'text-slate-600'}`}>
                                  {dateVal ? (() => { try { return format(new Date(dateVal), 'dd MMM yyyy') } catch { return '—' } })() : '—'}
                                  {isOverdue ? ' ⚠️' : ''}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                }
              </div>
            </div>
          )}

          {/* ── CONVERSION ── */}
          {tab === 'conversion' && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">Agent Conversion Performance</h3>
              </div>
              {data.length === 0
                ? <div className="p-12 text-center text-slate-400">No data</div>
                : <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200"><tr>
                      {['Agent','Assigned','Calls','Hot+Warm','Converted','Conv %','Performance'].map(h=>(
                        <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map(row => {
                        const interested = parseInt(row.hot||0) + parseInt(row.warm||0)
                        const rate = parseFloat(row.conversion_rate || 0)
                        const perfColor = rate>=20?'#16a34a':rate>=10?'#d97706':'#dc2626'
                        return (
                          <tr key={row.agent_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-bold text-slate-800">{row.agent_name}</td>
                            <td className="px-4 py-3 text-blue-600 font-medium cursor-pointer hover:underline"
                              onClick={() => openDrill(`${row.agent_name}'s Leads`, { agent_id: row.agent_id })}>
                              {row.total_leads} ↗
                            </td>
                            <td className="px-4 py-3">{row.total_calls}</td>
                            <td className="px-4 py-3 text-amber-600 cursor-pointer hover:underline"
                              onClick={() => openDrill(`${row.agent_name}'s Hot+Warm`, { agent_id: row.agent_id })}>
                              {interested} ↗
                            </td>
                            <td className="px-4 py-3 text-green-600 font-bold cursor-pointer hover:underline"
                              onClick={() => openDrill(`${row.agent_name}'s Converted`, { agent_id: row.agent_id, status: 'converted' })}>
                              {row.converted} ↗
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-lg font-black" style={{color:perfColor}}>{rate}%</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate*3)}%`, background: perfColor }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
              }
            </div>
          )}
        </>
      )}

      {drillDown && <DrillModal title={drillDown.title} leads={drillDown.leads} onClose={() => setDrillDown(null)} />}
    </div>
  )
}
