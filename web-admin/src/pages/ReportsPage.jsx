// web-admin/src/pages/ReportsPage.jsx — v5 FIXED
// Fixes:
// 1. isAdmin uses role_id === 1 (not role_name which doesn't exist on req.user)
// 2. Agents fetch uses correct interceptor response path r?.data
// 3. Products fetch uses correct interceptor response path
// 4. followup_created → next_followup_date (column doesn't exist in call_logs)

import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'

const TABS = [
  { key: 'overview',   label: '📊 Overview' },
  { key: 'status',     label: '🏷️ Status Wise' },
  { key: 'agent',      label: '👤 Agent Wise' },
  { key: 'daily',      label: '📞 Daily Calls' },
  { key: 'weekly',     label: '📅 Weekly' },
  { key: 'monthly',    label: '📆 Monthly' },
  { key: 'pipeline',   label: '🔽 Pipeline' },
  { key: 'pending',    label: '⏳ Pending Follow-ups' },
  { key: 'upcoming',   label: '📅 Upcoming Follow-ups' },
  { key: 'conversion', label: '✅ Conversion' },
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
const ALL_STATUSES = ['new','hot','warm','cold','call_back','not_interested','converted']

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#f1f5f9', text: '#64748b' }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: c.bg, color: c.text }}>
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
        {onClick && <span className="text-xs text-blue-500 font-medium">↗</span>}
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
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>{['Name / School','Phone','Agent','Status','Notes','Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.length === 0
                ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">No records</td></tr>
                : leads.map((row, i) => (
                  <tr key={row.id || i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{row.school_name || row.contact_name || row.name || '—'}</td>
                    <td className="px-4 py-3 text-blue-600">{row.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{row.agent_name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={row.status || row.lead_status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">{row.discussion || row.notes || row.admin_remark || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {(() => {
                        const d = row.called_at || row.follow_up_date || row.next_followup_date || row.created_at
                        try { return d ? format(new Date(d), 'dd MMM yyyy') : '—' } catch { return '—' }
                      })()}
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
            XLSX.utils.book_append_sheet(wb, ws, 'Report')
            XLSX.writeFile(wb, `${title.replace(/\s/g,'_')}.xlsx`)
          }} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">📥 Export</button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}

function AgentSelect({ agents, value, onChange, label = 'Agent', allLabel = 'All Agents' }) {
  if (!agents.length) return null
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-slate-600 whitespace-nowrap">{label}:</label>
      <select className="input w-44 text-sm" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  )
}

export default function ReportsPage() {
  const { user } = useAuth()

  // FIX 1: Use role_id for isAdmin check — role_name column doesn't exist on users table
  const isAdmin = user?.role_id === 1 || user?.role_name === 'admin'

  const today      = new Date().toISOString().split('T')[0]
  const monthAgo   = new Date(Date.now() - 30*86400000).toISOString().split('T')[0]
  const monthAhead = new Date(Date.now() + 30*86400000).toISOString().split('T')[0]

  const [tab, setTab]                       = useState('overview')
  const [data, setData]                     = useState([])
  const [loading, setLoading]               = useState(false)
  const [agents, setAgents]                 = useState([])
  const [products, setProducts]             = useState([])

  const [dateFilter, setDateFilter]         = useState(today)
  const [filterAgentDaily, setFilterAgentDaily]     = useState('')
  const [filterAgentWeekly, setFilterAgentWeekly]   = useState('')
  const [filterAgentMonthly, setFilterAgentMonthly] = useState('')

  const [fuDateFrom, setFuDateFrom]         = useState(monthAgo)
  const [fuDateTo, setFuDateTo]             = useState(monthAhead)
  const [fuAgent, setFuAgent]               = useState('')
  const [fuProduct, setFuProduct]           = useState('')
  const [fuStatus, setFuStatus]             = useState('')

  const [overview, setOverview]             = useState(null)
  const [callStats, setCallStats]           = useState({})
  const [pipeline, setPipeline]             = useState({ by_status: [], by_agent: [], by_product: [] })
  const [pipelineTab, setPipelineTab]       = useState('status')
  const [drillDown, setDrillDown]           = useState(null)

  useEffect(() => {
    if (isAdmin) {
      // FIX 2: Use /chat/users which works for all roles, correct response path r?.data
      api.get('/chat/users')
        .then(r => {
          const list = r?.data || r || []
          setAgents(Array.isArray(list) ? list : [])
        })
        .catch(() => {
          // Fallback to /users
          api.get('/users').then(r => {
            const list = r?.data || r || []
            setAgents(Array.isArray(list) ? list.filter(u => ['agent','admin'].includes(u.role_name)) : [])
          }).catch(() => {})
        })
    }

    // FIX 3: Correct interceptor response path for products
    api.get('/products/active').then(r => {
      const list = r?.data || r || []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => {})
  }, [isAdmin])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'overview') {
        const [ovRes, statusRes, agentRes, callRes] = await Promise.all([
          api.get('/reports/overview').catch(() => ({})),
          api.get('/reports/status-wise').catch(() => ({})),
          api.get('/reports/agent-wise').catch(() => ({})),
          api.get('/reports/call-stats').catch(() => ({})),
        ])
        const ov = ovRes?.data || {}
        setOverview(ov)
        const statusArr = Array.isArray(statusRes?.data) ? statusRes.data : []
        const agentArr  = Array.isArray(agentRes?.data)  ? agentRes.data  : []
        setData({ status: statusArr, agents: agentArr })
        setCallStats(callRes?.data || {})

      } else if (tab === 'status') {
        const r = await api.get('/reports/status-wise')
        setData(Array.isArray(r?.data) ? r.data : [])

      } else if (tab === 'agent') {
        const r = await api.get('/reports/agent-wise')
        const rows = Array.isArray(r?.data) ? r.data : []
        setData(isAdmin ? rows : rows.filter(a => a.agent_id === user?.id))

      } else if (tab === 'daily') {
        const params = { date: dateFilter }
        if (isAdmin && filterAgentDaily) params.agent_id = filterAgentDaily
        const r = await api.get('/reports/daily-calls', { params })
        setData(Array.isArray(r?.data) ? r.data : [])

      } else if (tab === 'weekly') {
        const params = {}
        if (isAdmin && filterAgentWeekly) params.agent_id = filterAgentWeekly
        const r = await api.get('/reports/weekly-comparison', { params })
        setData(Array.isArray(r?.data) ? r.data : [])

      } else if (tab === 'monthly') {
        const params = {}
        if (isAdmin && filterAgentMonthly) params.agent_id = filterAgentMonthly
        const r = await api.get('/reports/monthly-comparison', { params })
        setData(Array.isArray(r?.data) ? r.data : [])

      } else if (tab === 'pipeline') {
        const r = await api.get('/reports/pipeline')
        const d = r?.data || {}
        setPipeline({
          by_status:  Array.isArray(d.by_status)  ? d.by_status  : [],
          by_agent:   Array.isArray(d.by_agent)   ? d.by_agent   : [],
          by_product: Array.isArray(d.by_product) ? d.by_product : [],
        })

      } else if (tab === 'pending') {
        const params = { from: fuDateFrom, to: fuDateTo }
        if (isAdmin && fuAgent) params.agent_id   = fuAgent
        if (fuProduct)          params.product_id = fuProduct
        if (fuStatus)           params.status     = fuStatus
        const r = await api.get('/reports/pending-followups', { params })
        setData(Array.isArray(r?.data) ? r.data : [])

      } else if (tab === 'upcoming') {
        const params = { from: fuDateFrom, to: fuDateTo }
        if (isAdmin && fuAgent) params.agent_id   = fuAgent
        if (fuProduct)          params.product_id = fuProduct
        if (fuStatus)           params.status     = fuStatus
        const r = await api.get('/reports/upcoming-followups', { params })
        setData(Array.isArray(r?.data) ? r.data : [])

      } else if (tab === 'conversion') {
        const r = await api.get('/reports/conversion')
        setData(Array.isArray(r?.data) ? r.data : [])
      }
    } catch (err) {
      console.error('Report error:', err)
      setData([])
      if (tab === 'pipeline') setPipeline({ by_status: [], by_agent: [], by_product: [] })
    } finally { setLoading(false) }
  }, [tab, dateFilter, filterAgentDaily, filterAgentWeekly, filterAgentMonthly,
      fuDateFrom, fuDateTo, fuAgent, fuProduct, fuStatus, isAdmin, user?.id])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const t = setInterval(fetchData, 60000)
    return () => clearInterval(t)
  }, [fetchData])

  const openDrill = async (title, params) => {
    try {
      const r = await api.get('/leads', { params: { ...params, per_page: 200 } })
      setDrillDown({ title, leads: Array.isArray(r?.data) ? r.data : (r?.data?.data || []) })
    } catch { setDrillDown({ title, leads: [] }) }
  }
  const openDataDrill = (title, rows) => setDrillDown({ title, leads: rows || [] })

  const ov         = overview || {}
  const totalLeads = parseInt(ov.total_leads          || 0)
  const hot        = parseInt(ov.hot_leads            || 0)
  const warm       = parseInt(ov.warm_leads           || 0)
  const converted  = parseInt(ov.converted_leads      || 0)
  const callBack   = parseInt(ov.call_back_leads      || 0)
  const newLeads   = parseInt(ov.new_leads            || 0)
  const unattended = parseInt(ov.unattended           || 0)
  const convRate   = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0'

  const statusData  = tab === 'overview' ? (data?.status  || []) : (Array.isArray(data) ? data : [])
  const agentDataOv = tab === 'overview' ? (data?.agents  || []) : (Array.isArray(data) ? data : [])

  const FUFilters = (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">From:</label>
        <input type="date" className="input w-36 text-sm" value={fuDateFrom} onChange={e => setFuDateFrom(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">To:</label>
        <input type="date" className="input w-36 text-sm" value={fuDateTo} onChange={e => setFuDateTo(e.target.value)} />
      </div>
      {isAdmin && <AgentSelect agents={agents} value={fuAgent} onChange={setFuAgent} />}
      {products.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Product:</label>
          <select className="input w-44 text-sm" value={fuProduct} onChange={e => setFuProduct(e.target.value)}>
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Status:</label>
        <select className="input w-40 text-sm" value={fuStatus} onChange={e => setFuStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
      </div>
      <button onClick={() => { setFuDateFrom(monthAgo); setFuDateTo(monthAhead); setFuAgent(''); setFuProduct(''); setFuStatus('') }}
        className="text-xs text-slate-400 hover:text-slate-600 underline">Reset</button>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">📊 Reports & Analytics</h1>
        <p className="text-slate-500 text-sm">Full CRM reporting suite</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter bars */}
      {tab === 'daily' && (
        <div className="flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600">Date:</label>
            <input type="date" className="input w-44" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
          </div>
          {isAdmin && <AgentSelect agents={agents} value={filterAgentDaily} onChange={setFilterAgentDaily} />}
        </div>
      )}
      {tab === 'weekly' && isAdmin && (
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
          <AgentSelect agents={agents} value={filterAgentWeekly} onChange={setFilterAgentWeekly} label="Filter by Agent" />
        </div>
      )}
      {tab === 'monthly' && isAdmin && (
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
          <AgentSelect agents={agents} value={filterAgentMonthly} onChange={setFilterAgentMonthly} label="Filter by Agent" />
        </div>
      )}
      {(tab === 'pending' || tab === 'upcoming') && FUFilters}

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
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Calls Today"     value={callStats.today      || 0} icon="📞" color="#2563eb" />
                <StatCard label="Calls This Week"  value={callStats.this_week  || 0} icon="📅" color="#7c3aed" />
                <StatCard label="Calls This Month" value={callStats.this_month || 0} icon="📆" color="#0891b2" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Leads" value={totalLeads} icon="👥" color="#2563eb" onClick={() => openDrill('All Leads', {})} />
                <StatCard label="Converted"   value={converted}  icon="✅" color="#16a34a" sub={`${convRate}% rate`} onClick={() => openDrill('Converted Leads', { status: 'converted' })} />
                <StatCard label="Hot Leads"   value={hot}        icon="🔥" color="#dc2626" onClick={() => openDrill('Hot Leads', { status: 'hot' })} />
                <StatCard label="Unattended"  value={unattended} icon="🔴" color="#ea580c" sub=">5 days idle" onClick={() => openDrill('Unattended Leads', { unattended: 'true' })} />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4 text-center"><p className="text-3xl font-black text-green-600">{convRate}%</p><p className="text-sm text-slate-500 mt-1">Conversion Rate</p></div>
                <div className="card p-4 text-center cursor-pointer hover:shadow-md" onClick={() => openDrill('Warm Leads',{status:'warm'})}><p className="text-3xl font-black text-amber-500">{warm}</p><p className="text-sm text-slate-500 mt-1">Warm Leads ↗</p></div>
                <div className="card p-4 text-center cursor-pointer hover:shadow-md" onClick={() => openDrill('Call Back',{status:'call_back'})}><p className="text-3xl font-black text-purple-600">{callBack}</p><p className="text-sm text-slate-500 mt-1">Call Back ↗</p></div>
                <div className="card p-4 text-center cursor-pointer hover:shadow-md" onClick={() => openDrill('New Leads',{status:'new'})}><p className="text-3xl font-black text-blue-600">{newLeads}</p><p className="text-sm text-slate-500 mt-1">New Leads ↗</p></div>
              </div>
              {statusData.length > 0 && (
                <div className="card p-5">
                  <h3 className="font-bold text-slate-800 mb-4">Lead Status Breakdown</h3>
                  <div className="space-y-3">
                    {statusData.map(row => {
                      const total = statusData.reduce((s,r) => s+parseInt(r.count||0), 0)
                      const pct   = total>0 ? Math.round((parseInt(row.count)/total)*100) : 0
                      const c     = STATUS_COLORS[row.status] || STATUS_COLORS.new
                      return (
                        <div key={row.status} className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 p-2 rounded-lg"
                          onClick={() => openDrill(`${row.status?.replace(/_/g,' ')} Leads`,{status:row.status})}>
                          <div className="w-28 flex-shrink-0"><StatusBadge status={row.status}/></div>
                          <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full flex items-center px-2" style={{width:`${Math.max(pct,3)}%`,background:c.text}}>
                              {pct>8&&<span className="text-white text-xs font-bold">{pct}%</span>}
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
              {agentDataOv.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">🏅 Agent Leaderboard</h3></div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr>
                      {['Agent','Leads','Calls','Hot','Warm','Converted','Conv %'].map(h=>(
                        <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {agentDataOv.map((a,i)=>{
                        const rate=a.total_leads>0?((a.converted/a.total_leads)*100).toFixed(1):0
                        return (
                          <tr key={a.agent_id} className="hover:bg-slate-50 cursor-pointer" onClick={()=>openDrill(`${a.agent_name}'s Leads`,{assigned_to:a.agent_id})}>
                            <td className="px-4 py-3 font-medium">{['🥇','🥈','🥉'][i]||''} {a.agent_name}</td>
                            <td className="px-4 py-3 font-bold text-blue-600">{a.total_leads} ↗</td>
                            <td className="px-4 py-3">{a.total_calls||0}</td>
                            <td className="px-4 py-3 font-bold text-red-500">{a.hot||0}</td>
                            <td className="px-4 py-3 font-bold text-amber-500">{a.warm||0}</td>
                            <td className="px-4 py-3 font-bold text-green-600">{a.converted||0}</td>
                            <td className="px-4 py-3"><span className={`font-bold ${parseFloat(rate)>=20?'text-green-600':parseFloat(rate)>=10?'text-amber-500':'text-red-400'}`}>{rate}%</span></td>
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
              {!statusData.length ? <div className="card p-12 text-center text-slate-400">No data</div>
                : statusData.map(row => {
                    const total = statusData.reduce((s,r) => s+parseInt(r.count||0), 0)
                    const pct   = total>0 ? Math.round((parseInt(row.count)/total)*100) : 0
                    const c     = STATUS_COLORS[row.status] || STATUS_COLORS.new
                    return (
                      <div key={row.status} className="card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all"
                        onClick={() => openDrill(`${row.status?.replace(/_/g,' ')} Leads`,{status:row.status})}>
                        <div className="w-32 flex-shrink-0"><StatusBadge status={row.status}/></div>
                        <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full flex items-center px-3" style={{width:`${Math.max(pct,2)}%`,background:c.text}}>
                            {pct>5&&<span className="text-white text-xs font-bold">{pct}%</span>}
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
                <span className="text-2xl font-black text-blue-700">{statusData.reduce((s,r)=>s+parseInt(r.count||0),0)}</span>
              </div>
            </div>
          )}

          {/* ── AGENT WISE ── */}
          {tab === 'agent' && (
            <div className="card overflow-hidden">
              {!agentDataOv.length ? <div className="p-12 text-center text-slate-400">No data</div>
                : <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200"><tr>
                        {['Agent','Total','Calls','New','Hot','Warm','Cold','Call Back','Not Int.','Converted','Conv %','Unattended','Actions'].map(h=>(
                          <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {(Array.isArray(data)?data:[]).map((row,i)=>{
                          const rate=row.total_leads>0?((row.converted/row.total_leads)*100).toFixed(1):0
                          return (
                            <tr key={row.agent_id} className="hover:bg-slate-50">
                              <td className="px-3 py-3 font-medium whitespace-nowrap">{['🥇','🥈','🥉'][i]||''} {row.agent_name}</td>
                              <td className="px-3 py-3 font-bold text-blue-600 cursor-pointer hover:underline" onClick={()=>openDrill(`${row.agent_name}'s Leads`,{assigned_to:row.agent_id})}>{row.total_leads} ↗</td>
                              <td className="px-3 py-3">{row.total_calls||0}</td>
                              <td className="px-3 py-3">{row.new_leads||0}</td>
                              <td className="px-3 py-3 font-bold text-red-500">{row.hot||0}</td>
                              <td className="px-3 py-3 font-bold text-amber-500">{row.warm||0}</td>
                              <td className="px-3 py-3 text-slate-500">{row.cold||0}</td>
                              <td className="px-3 py-3 text-purple-600">{row.call_back||0}</td>
                              <td className="px-3 py-3 text-slate-400">{row.not_interested||0}</td>
                              <td className="px-3 py-3 font-bold text-green-600 cursor-pointer hover:underline" onClick={()=>openDrill(`${row.agent_name} Converted`,{assigned_to:row.agent_id,status:'converted'})}>{row.converted||0} ↗</td>
                              <td className="px-3 py-3"><span className={`font-bold ${parseFloat(rate)>=20?'text-green-600':parseFloat(rate)>=10?'text-amber-500':'text-red-400'}`}>{rate}%</span></td>
                              <td className="px-3 py-3 text-orange-500">{row.unattended||0}</td>
                              <td className="px-3 py-3"><button className="text-blue-600 text-xs font-medium hover:underline" onClick={()=>openDrill(`${row.agent_name}'s Leads`,{assigned_to:row.agent_id})}>View All</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200"><tr>
                        <td className="px-3 py-3 font-bold">Total</td>
                        {['total_leads','total_calls','new_leads','hot','warm','cold','call_back','not_interested','converted'].map(k=>(
                          <td key={k} className="px-3 py-3 font-bold">{(Array.isArray(data)?data:[]).reduce((s,r)=>s+parseInt(r[k]||0),0)}</td>
                        ))}
                        <td colSpan={3}/>
                      </tr></tfoot>
                    </table>
                  </div>
              }
            </div>
          )}

          {/* ── DAILY CALLS ── */}
          {tab === 'daily' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  ['Total Calls',    (Array.isArray(data)?data:[]).length,                                          '📞','#2563eb',null],
                  ['Fresh (New)',    (Array.isArray(data)?data:[]).filter(d=>d.status==='new').length,              '🆕','#0891b2','new'],
                  ['Hot Leads',      (Array.isArray(data)?data:[]).filter(d=>d.status==='hot').length,             '🔥','#dc2626','hot'],
                  ['Warm Leads',     (Array.isArray(data)?data:[]).filter(d=>d.status==='warm').length,            '☀️','#d97706','warm'],
                  // FIX 4: next_followup_date instead of followup_created (column doesn't exist in call_logs)
                  ['Follow-ups Set', (Array.isArray(data)?data:[]).filter(d=>d.next_followup_date).length,         '📅','#16a34a',null],
                ].map(([label,val,icon,color,status])=>(
                  <StatCard key={label} label={label} value={val} icon={icon} color={color}
                    onClick={()=>{const rows=Array.isArray(data)?data:[];openDataDrill(label,status?rows.filter(d=>d.status===status):rows)}} />
                ))}
              </div>

              {isAdmin && Array.isArray(data) && data.length > 0 && (()=>{
                const agentMap={}
                data.forEach(r=>{const k=r.agent_name||'Unassigned';agentMap[k]=(agentMap[k]||0)+1})
                return (
                  <div className="card p-4">
                    <h3 className="font-bold text-slate-700 mb-3">Agent Breakdown — {dateFilter}</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(agentMap).sort((a,b)=>b[1]-a[1]).map(([name,count])=>(
                        <div key={name} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2 cursor-pointer hover:shadow-sm"
                          onClick={()=>openDataDrill(`${name}'s Calls`,data.filter(r=>(r.agent_name||'Unassigned')===name))}>
                          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">{name[0]}</div>
                          <span className="text-sm font-semibold text-slate-700">{name}</span>
                          <span className="text-lg font-black text-blue-600">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div className="card overflow-hidden">
                {!Array.isArray(data) || !data.length
                  ? <div className="p-12 text-center text-slate-400"><p className="text-4xl mb-3">📭</p><p>No calls for this date</p></div>
                  : <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200"><tr>
                        {['School / Name','Phone','Agent','Status','Discussion','Follow-up','Called At'].map(h=>(
                          <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.map((row,i)=>(
                          <tr key={row.id||i} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium">{row.school_name||row.contact_name||'—'}</td>
                            <td className="px-4 py-3 text-blue-600">{row.phone}</td>
                            <td className="px-4 py-3 text-slate-500">{row.agent_name||'—'}</td>
                            <td className="px-4 py-3"><StatusBadge status={row.status}/></td>
                            <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">{row.discussion||'—'}</td>
                            {/* FIX 4: use next_followup_date — followup_created column does not exist in call_logs */}
                            <td className="px-4 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.next_followup_date?'bg-green-100 text-green-700':'bg-slate-100 text-slate-500'}`}>
                                {row.next_followup_date
                                  ? `✓ ${(()=>{try{return format(new Date(row.next_followup_date),'dd MMM')}catch{return'Set'}})()}`
                                  : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {row.called_at?(()=>{try{return format(new Date(row.called_at),'hh:mm a')}catch{return'—'}})():'—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                }
              </div>
            </div>
          )}

          {/* ── WEEKLY ── */}
          {tab === 'weekly' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800">📅 Last 4 Weeks Comparison</h3>
              {!Array.isArray(data)||!data.length
                ? <div className="card p-12 text-center text-slate-400">No data for last 4 weeks</div>
                : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {data.map((row,i)=>{
                      const wl=(()=>{try{return format(new Date(row.week_start),'dd MMM')}catch{return'—'}})()
                      const we=(()=>{try{return format(new Date(new Date(row.week_start).getTime()+6*86400000),'dd MMM')}catch{return''}})()
                      const base=parseInt(row.leads_contacted||0)||parseInt(row.new_leads||0)||1
                      const rate=((parseInt(row.converted||0)/base)*100).toFixed(1)
                      return (
                        <div key={i} className="card p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="text-sm font-bold text-slate-700">{i===0?'This Week':`${i} week${i>1?'s':''} ago`}</p>
                              <p className="text-xs text-slate-400">{wl} – {we}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${i===0?'bg-blue-100 text-blue-700':'bg-slate-100 text-slate-600'}`}>Week {i+1}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            {[['Calls',row.total_calls,'#2563eb'],['New Leads',row.new_leads||row.leads_contacted,'#7c3aed'],['Converted',row.converted,'#16a34a'],['Hot',row.hot,'#dc2626'],['Warm',row.warm,'#d97706'],['Contacted',row.leads_contacted,'#0891b2']].map(([label,val,color])=>(
                              <div key={label} className="text-center p-2 bg-slate-50 rounded-xl">
                                <p className="text-xl font-black" style={{color}}>{val||0}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-slate-100 text-center">
                            <p className="text-xs text-slate-400">Conv Rate</p>
                            <p className="text-xl font-black text-green-600">{rate}%</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          )}

          {/* ── MONTHLY ── */}
          {tab === 'monthly' && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800">📆 Last 3 Months Comparison</h3>
              {!Array.isArray(data)||!data.length
                ? <div className="card p-12 text-center text-slate-400">No data</div>
                : <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {data.map((row,i)=>{
                      const base=parseInt(row.leads_contacted||0)||parseInt(row.new_leads||0)||1
                      const rate=((parseInt(row.converted||0)/base)*100).toFixed(1)
                      return (
                        <div key={i} className="card p-5">
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-base font-bold text-slate-700">{row.month_label}</p>
                            {i===0&&<span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">Current</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {[['Calls',row.total_calls,'#2563eb'],['New Leads',row.new_leads||row.leads_contacted,'#0891b2'],['Contacted',row.leads_contacted,'#7c3aed'],['Converted',row.converted,'#16a34a'],['Hot',row.hot,'#dc2626'],['Warm',row.warm,'#d97706']].map(([label,val,color])=>(
                              <div key={label} className="text-center p-2 bg-slate-50 rounded-xl">
                                <p className="text-xl font-black" style={{color}}>{val||0}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-slate-100 text-center">
                            <p className="text-xs text-slate-400">Conversion Rate</p>
                            <p className="text-xl font-black text-green-600">{rate}%</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
              }
            </div>
          )}

          {/* ── PIPELINE ── */}
          {tab === 'pipeline' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {[['status','🔽 By Status'],['agent','👤 By Agent'],['product','📦 By Product']].map(([k,l])=>(
                  <button key={k} onClick={()=>setPipelineTab(k)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${pipelineTab===k?'bg-blue-600 text-white':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {pipelineTab==='status'&&(
                <div className="card p-5 space-y-3">
                  <h3 className="font-bold text-slate-800">Sales Funnel</h3>
                  {!pipeline.by_status.length ? <p className="text-center text-slate-400 py-8">No pipeline data</p>
                    : (()=>{
                        const total=pipeline.by_status.reduce((s,r)=>s+parseInt(r.count||0),0)
                        const order=['new','call_back','warm','hot','converted','not_interested','cold']
                        const sorted=[...order.map(s=>pipeline.by_status.find(r=>r.status===s)).filter(Boolean),...pipeline.by_status.filter(r=>!order.includes(r.status))]
                        return sorted.map((row,i)=>{
                          const pct=total>0?Math.round((parseInt(row.count)/total)*100):0
                          const c=STATUS_COLORS[row.status]||STATUS_COLORS.new
                          return (
                            <div key={row.status} className="flex items-center gap-4 cursor-pointer" onClick={()=>openDrill(`${row.status.replace(/_/g,' ')} Leads`,{status:row.status})}>
                              <div className="w-28 text-right flex-shrink-0"><StatusBadge status={row.status}/></div>
                              <div className="flex-1">
                                <div className="h-10 rounded-lg flex items-center justify-between px-4" style={{width:`${Math.max(100-i*8,30)}%`,background:c.text}}>
                                  <span className="text-white font-bold">{row.count}</span>
                                  <span className="text-white text-xs opacity-80">{pct}%</span>
                                </div>
                              </div>
                              <span className="text-blue-500 text-xs">↗</span>
                            </div>
                          )
                        })
                      })()
                  }
                </div>
              )}

              {pipelineTab==='agent'&&(
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Agent Pipeline — All Statuses</h3></div>
                  {!pipeline.by_agent.length ? <p className="text-center text-slate-400 p-8">No data</p>
                    : <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50"><tr>
                            {['Agent','Total','New','Hot','Warm','Cold','Call Back','Not Int.','Converted'].map(h=>(
                              <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {pipeline.by_agent.map(a=>(
                              <tr key={a.agent_id} className="hover:bg-slate-50 cursor-pointer" onClick={()=>openDrill(`${a.agent_name}'s Leads`,{assigned_to:a.agent_id})}>
                                <td className="px-3 py-3 font-medium whitespace-nowrap">{a.agent_name}</td>
                                <td className="px-3 py-3 font-bold text-blue-600">{a.total}</td>
                                <td className="px-3 py-3">{a.new_leads||0}</td>
                                <td className="px-3 py-3 font-bold text-red-500">{a.hot||0}</td>
                                <td className="px-3 py-3 font-bold text-amber-500">{a.warm||0}</td>
                                <td className="px-3 py-3 text-slate-500">{a.cold||0}</td>
                                <td className="px-3 py-3 text-purple-600">{a.call_back||0}</td>
                                <td className="px-3 py-3 text-slate-400">{a.not_interested||0}</td>
                                <td className="px-3 py-3 font-bold text-green-600">{a.converted||0}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t"><tr>
                            <td className="px-3 py-3 font-bold">Total</td>
                            {['total','new_leads','hot','warm','cold','call_back','not_interested','converted'].map(k=>(
                              <td key={k} className="px-3 py-3 font-bold">{pipeline.by_agent.reduce((s,r)=>s+parseInt(r[k]||0),0)}</td>
                            ))}
                          </tr></tfoot>
                        </table>
                      </div>
                  }
                </div>
              )}

              {pipelineTab==='product'&&(
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Product Pipeline — All Statuses</h3></div>
                  {!pipeline.by_product.length ? <p className="text-center text-slate-400 p-8">No data</p>
                    : <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50"><tr>
                            {['Product','Total','New','Hot','Warm','Cold','Call Back','Not Int.','Converted','Conv %'].map(h=>(
                              <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {pipeline.by_product.map(p=>{
                              const rate=p.total>0?((p.converted/p.total)*100).toFixed(1):0
                              return (
                                <tr key={p.product_id} className="hover:bg-slate-50 cursor-pointer" onClick={()=>openDrill(`${p.product_name} Leads`,{product_id:p.product_id})}>
                                  <td className="px-3 py-3 font-medium whitespace-nowrap">{p.product_name}</td>
                                  <td className="px-3 py-3 font-bold text-blue-600">{p.total}</td>
                                  <td className="px-3 py-3">{p.new_leads||0}</td>
                                  <td className="px-3 py-3 font-bold text-red-500">{p.hot||0}</td>
                                  <td className="px-3 py-3 font-bold text-amber-500">{p.warm||0}</td>
                                  <td className="px-3 py-3 text-slate-500">{p.cold||0}</td>
                                  <td className="px-3 py-3 text-purple-600">{p.call_back||0}</td>
                                  <td className="px-3 py-3 text-slate-400">{p.not_interested||0}</td>
                                  <td className="px-3 py-3 font-bold text-green-600">{p.converted||0}</td>
                                  <td className="px-3 py-3 font-bold">{rate}%</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t"><tr>
                            <td className="px-3 py-3 font-bold">Total</td>
                            {['total','new_leads','hot','warm','cold','call_back','not_interested','converted'].map(k=>(
                              <td key={k} className="px-3 py-3 font-bold">{pipeline.by_product.reduce((s,r)=>s+parseInt(r[k]||0),0)}</td>
                            ))}
                            <td/>
                          </tr></tfoot>
                        </table>
                      </div>
                  }
                </div>
              )}
            </div>
          )}

          {/* ── PENDING / UPCOMING ── */}
          {['pending','upcoming'].includes(tab) && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total" value={Array.isArray(data)?data.length:0} icon="📋" color="#2563eb" onClick={()=>openDataDrill('All Follow-ups',Array.isArray(data)?data:[])} />
                <StatCard label="Hot Leads" value={(Array.isArray(data)?data:[]).filter(d=>d.lead_status==='hot').length} icon="🔥" color="#dc2626" onClick={()=>openDataDrill('Hot Follow-ups',(Array.isArray(data)?data:[]).filter(d=>d.lead_status==='hot'))} />
                <StatCard label="Warm Leads" value={(Array.isArray(data)?data:[]).filter(d=>d.lead_status==='warm').length} icon="☀️" color="#d97706" onClick={()=>openDataDrill('Warm Follow-ups',(Array.isArray(data)?data:[]).filter(d=>d.lead_status==='warm'))} />
                <StatCard label="Overdue" value={(Array.isArray(data)?data:[]).filter(d=>d.followup_type==='missed').length} icon="⚠️" color="#7c3aed" onClick={()=>openDataDrill('Overdue',(Array.isArray(data)?data:[]).filter(d=>d.followup_type==='missed'))} />
              </div>

              {Array.isArray(data) && data.length > 0 && (()=>{
                const agentMap={}
                data.forEach(r=>{const k=r.agent_name||'Unassigned';agentMap[k]=(agentMap[k]||0)+1})
                return (
                  <div className="card p-4">
                    <h3 className="font-bold text-slate-700 mb-3">By Agent</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(agentMap).sort((a,b)=>b[1]-a[1]).map(([name,count])=>(
                        <div key={name} className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 cursor-pointer hover:shadow-sm"
                          onClick={()=>openDataDrill(`${name}'s Follow-ups`,data.filter(r=>(r.agent_name||'Unassigned')===name))}>
                          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">{name[0]}</div>
                          <span className="text-sm font-semibold text-slate-700">{name}</span>
                          <span className="text-lg font-black text-blue-600">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {Array.isArray(data) && data.length > 0 && (()=>{
                const prodMap={}
                data.forEach(r=>{const k=r.product_name||'No Product';prodMap[k]=(prodMap[k]||0)+1})
                return (
                  <div className="card p-4">
                    <h3 className="font-bold text-slate-700 mb-3">By Product</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(prodMap).sort((a,b)=>b[1]-a[1]).map(([name,count])=>(
                        <div key={name} className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 cursor-pointer hover:shadow-sm"
                          onClick={()=>openDataDrill(`${name} Follow-ups`,data.filter(r=>(r.product_name||'No Product')===name))}>
                          <span className="text-sm font-semibold text-slate-700">{name}</span>
                          <span className="text-lg font-black text-indigo-600">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {Array.isArray(data) && data.length > 0 && (()=>{
                const statusMap={}
                data.forEach(r=>{const k=r.lead_status||r.status||'unknown';statusMap[k]=(statusMap[k]||0)+1})
                return (
                  <div className="card p-4">
                    <h3 className="font-bold text-slate-700 mb-3">By Status</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(statusMap).sort((a,b)=>b[1]-a[1]).map(([status,count])=>(
                        <div key={status} className="flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer border hover:shadow-sm"
                          style={{background:STATUS_COLORS[status]?.bg||'#f1f5f9',borderColor:(STATUS_COLORS[status]?.text||'#ccc')+'33'}}
                          onClick={()=>openDataDrill(`${status} Follow-ups`,data.filter(r=>(r.lead_status||r.status)===status))}>
                          <StatusBadge status={status}/>
                          <span className="text-lg font-black" style={{color:STATUS_COLORS[status]?.text||'#475569'}}>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div className="card overflow-hidden">
                {!Array.isArray(data) || !data.length
                  ? <div className="p-12 text-center text-slate-400"><p className="text-4xl mb-3">🎉</p><p>No follow-ups for this filter</p></div>
                  : <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200"><tr>
                        {['Name / School','Phone','Agent','Product','Lead Status','Notes','Date'].map(h=>(
                          <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.map((row,i)=>{
                          const dateVal=row.next_followup_date||row.follow_up_date
                          const isOverdue=dateVal&&new Date(dateVal)<new Date()
                          return (
                            <tr key={row.id||i} className={`hover:bg-slate-50 ${isOverdue?'bg-red-50':''}`}>
                              <td className="px-4 py-3 font-medium">{row.school_name||row.contact_name||'—'}</td>
                              <td className="px-4 py-3 text-blue-600">{row.phone}</td>
                              <td className="px-4 py-3 text-slate-500">{row.agent_name||'—'}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{row.product_name||'—'}</td>
                              <td className="px-4 py-3"><StatusBadge status={row.lead_status||row.status}/></td>
                              <td className="px-4 py-3 text-xs text-slate-400 max-w-[140px] truncate">{row.notes||row.discussion||'—'}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-medium ${isOverdue?'text-red-600 font-bold':'text-slate-600'}`}>
                                  {dateVal?(()=>{try{return format(new Date(dateVal),'dd MMM yyyy')}catch{return'—'}})():'—'}
                                  {isOverdue?' ⚠️':''}
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
              <div className="px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">Agent Conversion Performance</h3></div>
              {!Array.isArray(data) || !data.length ? <div className="p-12 text-center text-slate-400">No data</div>
                : <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200"><tr>
                      {['Agent','Assigned','Calls','Hot+Warm','Converted','Conv %','Bar'].map(h=>(
                        <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.map(row=>{
                        const interested=parseInt(row.hot||0)+parseInt(row.warm||0)
                        const rate=parseFloat(row.conversion_rate||0)
                        const perfColor=rate>=20?'#16a34a':rate>=10?'#d97706':'#dc2626'
                        return (
                          <tr key={row.agent_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-bold">{row.agent_name}</td>
                            <td className="px-4 py-3 text-blue-600 cursor-pointer hover:underline" onClick={()=>openDrill(`${row.agent_name}'s Leads`,{assigned_to:row.agent_id})}>{row.total_leads} ↗</td>
                            <td className="px-4 py-3">{row.total_calls||0}</td>
                            <td className="px-4 py-3 text-amber-600">{interested}</td>
                            <td className="px-4 py-3 text-green-600 font-bold cursor-pointer hover:underline" onClick={()=>openDrill(`${row.agent_name} Converted`,{assigned_to:row.agent_id,status:'converted'})}>{row.converted||0} ↗</td>
                            <td className="px-4 py-3"><span className="text-lg font-black" style={{color:perfColor}}>{rate}%</span></td>
                            <td className="px-4 py-3">
                              <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{width:`${Math.min(100,rate*3)}%`,background:perfColor}}/>
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
