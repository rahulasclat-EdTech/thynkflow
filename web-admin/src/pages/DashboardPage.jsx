// web-admin/src/pages/DashboardPage.jsx — COMPLETE REPLACEMENT
// Fixes: correct calculation, agent scope, adds critical alerts, notifications
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'

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

function KPICard({ label, value, icon, color = '#2563eb', sub, onClick, trend }) {
  return (
    <div onClick={onClick}
      className={`bg-white border border-slate-200 rounded-2xl p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {trend !== undefined && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {trend >= 0 ? '+' : ''}{trend}
          </span>
        )}
      </div>
      <p className="text-3xl font-black" style={{ color }}>{value ?? 0}</p>
      <p className="text-sm font-semibold text-slate-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      {onClick && <p className="text-xs text-blue-500 mt-2 font-medium">Click to drill down ↗</p>}
    </div>
  )
}

function DrillModal({ title, leads, onClose }) {
  if (!leads) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-slate-400">{leads.length} leads</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>{['Name','Phone','Agent','Status','Remark'].map(h=>(
                <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.length === 0
                ? <tr><td colSpan={5} className="text-center py-10 text-slate-400">No leads found</td></tr>
                : leads.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{l.school_name||l.contact_name||'—'}</td>
                    <td className="px-4 py-3 text-blue-600">{l.phone}</td>
                    <td className="px-4 py-3 text-slate-500">{l.agent_name||'—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">{l.admin_remark||'—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [stats, setStats]         = useState(null)
  const [critical, setCritical]   = useState(null)
  const [agentData, setAgentData] = useState([])
  const [followups, setFollowups] = useState([])
  const [loading, setLoading]     = useState(true)
  const [drillDown, setDrillDown] = useState(null)
  const [showCritical, setShowCritical] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [dashRes, critRes, agentRes, fuRes] = await Promise.all([
        api.get('/dashboard/stats').catch(() => ({ data: {} })),
        api.get('/dashboard/critical').catch(() => ({ data: {} })),
        isAdmin ? api.get('/reports/agent-wise').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        api.get('/reports/upcoming-followups').catch(() => ({ data: [] })),
      ])

      const t = dashRes.data?.data?.totals || {}
      setStats(t)
      setCritical(critRes.data?.data || {})
      setAgentData(Array.isArray(agentRes.data?.data) ? agentRes.data.data : (Array.isArray(agentRes.data) ? agentRes.data : []))
      const fu = Array.isArray(fuRes.data?.data) ? fuRes.data.data : (Array.isArray(fuRes.data) ? fuRes.data : [])
      setFollowups(fu.slice(0, 5))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [isAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openDrill = async (title, params) => {
    try {
      const r = await api.get('/leads', { params: { ...params, per_page: 200 } })
      setDrillDown({ title, leads: Array.isArray(r.data) ? r.data : (r.data?.data || []) })
    } catch { setDrillDown({ title, leads: [] }) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const t             = stats || {}
  const totalLeads    = parseInt(t.total_leads    || 0)
  const converted     = parseInt(t.converted      || 0)
  const hot           = parseInt(t.hot            || t.hot_leads || 0)
  const warm          = parseInt(t.warm           || t.warm_leads || 0)
  const cold          = parseInt(t.cold           || t.cold_leads || 0)
  const callBack      = parseInt(t.call_back      || t.call_back_leads || 0)
  const notInterested = parseInt(t.not_interested || t.not_interested_leads || 0)
  const newLeads      = parseInt(t.new_leads      || 0)
  const unattended    = parseInt(t.unattended     || 0)
  const convRate      = totalLeads > 0 ? ((converted/totalLeads)*100).toFixed(1) : '0'

  const critUnattended    = (critical?.unattended         || []).length
  const critMissed        = (critical?.missed_followups   || []).length
  const hasCritical       = critUnattended > 0 || critMissed > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isAdmin ? '🏢 Admin Dashboard' : `👋 Welcome, ${user?.name?.split(' ')[0]}`}
          </h1>
          <p className="text-slate-500 text-sm">
            {format(new Date(), 'EEEE, dd MMMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasCritical && (
            <button onClick={() => setShowCritical(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors animate-pulse">
              🚨 {critUnattended + critMissed} Critical Alerts
            </button>
          )}
          <button onClick={fetchAll} className="btn-secondary text-sm">🔄 Refresh</button>
        </div>
      </div>

      {/* Critical alert banner */}
      {hasCritical && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-4">
          <span className="text-2xl">🚨</span>
          <div className="flex-1">
            <p className="font-bold text-red-800">Action Required</p>
            <div className="flex flex-wrap gap-4 mt-1">
              {critUnattended > 0 && (
                <button onClick={() => setShowCritical(true)} className="text-sm text-red-700 hover:underline">
                  🔴 {critUnattended} leads unattended for &gt;5 days
                </button>
              )}
              {critMissed > 0 && (
                <button onClick={() => setShowCritical(true)} className="text-sm text-red-700 hover:underline">
                  ⏰ {critMissed} follow-ups missed for &gt;3 days
                </button>
              )}
            </div>
          </div>
          <button onClick={() => setShowCritical(true)}
            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">
            View All
          </button>
        </div>
      )}

      {/* Call stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center border-l-4 border-blue-500">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Calls Today</p>
          <p className="text-3xl font-black text-blue-600">{t.today_calls || 0}</p>
        </div>
        <div className="card p-4 text-center border-l-4 border-purple-500">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Calls This Week</p>
          <p className="text-3xl font-black text-purple-600">{t.week_calls || 0}</p>
        </div>
        <div className="card p-4 text-center border-l-4 border-indigo-500">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Calls This Month</p>
          <p className="text-3xl font-black text-indigo-600">{t.month_calls || 0}</p>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Leads"   value={totalLeads}    icon="👥"  color="#2563eb"
          onClick={() => openDrill('All Leads', {})} />
        <KPICard label="Converted"     value={converted}     icon="✅"  color="#16a34a"
          sub={`${convRate}% conversion rate`}
          onClick={() => openDrill('Converted Leads', { status: 'converted' })} />
        <KPICard label="Hot Leads"     value={hot}           icon="🔥"  color="#dc2626"
          onClick={() => openDrill('Hot Leads', { status: 'hot' })} />
        <KPICard label="Unattended"    value={unattended}    icon="🔴"  color="#ea580c"
          sub=">5 days no activity"
          onClick={() => openDrill('Unattended Leads', { unattended: 'true' })} />
      </div>

      {/* Status breakdown */}
      <div className="card p-5">
        <h3 className="font-bold text-slate-800 mb-4">📊 Lead Status Breakdown</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'New',           val: newLeads,      key: 'new',            color: '#1e40af', bg: '#dbeafe' },
            { label: 'Warm',          val: warm,          key: 'warm',           color: '#92400e', bg: '#fef3c7' },
            { label: 'Cold',          val: cold,          key: 'cold',           color: '#475569', bg: '#e2e8f0' },
            { label: 'Call Back',     val: callBack,      key: 'call_back',      color: '#5b21b6', bg: '#ede9fe' },
            { label: 'Not Interested',val: notInterested, key: 'not_interested', color: '#64748b', bg: '#f1f5f9' },
            { label: 'Converted',     val: converted,     key: 'converted',      color: '#14532d', bg: '#dcfce7' },
            { label: 'Hot',           val: hot,           key: 'hot',            color: '#991b1b', bg: '#fee2e2' },
            { label: 'Unattended',    val: unattended,    key: null,             color: '#ea580c', bg: '#ffedd5' },
          ].map(item => (
            <div key={item.label}
              className="p-4 rounded-xl cursor-pointer hover:shadow-md transition-all border border-transparent hover:border-blue-200"
              style={{ backgroundColor: item.bg }}
              onClick={() => item.key ? openDrill(`${item.label} Leads`, { status: item.key }) : openDrill('Unattended Leads', { unattended: 'true' })}>
              <p className="text-2xl font-black" style={{ color: item.color }}>{item.val}</p>
              <p className="text-xs font-semibold mt-1" style={{ color: item.color }}>{item.label}</p>
              <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${totalLeads > 0 ? Math.max((item.val/totalLeads)*100, 2) : 0}%`,
                  backgroundColor: item.color
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Leaderboard (admin only) */}
      {isAdmin && agentData.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">🏅 Agent Leaderboard</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Agent','Leads','Calls','Hot','Warm','Converted','Conv %'].map(h=>(
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agentData.slice(0, 5).map((a, i) => {
                const rate = a.total_leads > 0 ? ((a.converted/a.total_leads)*100).toFixed(1) : 0
                const medals = ['🥇','🥈','🥉']
                return (
                  <tr key={a.agent_id} className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => openDrill(`${a.agent_name}'s Leads`, { agent_id: a.agent_id })}>
                    <td className="px-4 py-3 font-semibold">{medals[i] || ''} {a.agent_name}</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{a.total_leads}</td>
                    <td className="px-4 py-3">{a.total_calls}</td>
                    <td className="px-4 py-3 font-bold text-red-500">{a.hot}</td>
                    <td className="px-4 py-3 font-bold text-amber-500">{a.warm}</td>
                    <td className="px-4 py-3 font-bold text-green-600">{a.converted}</td>
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

      {/* Upcoming follow-ups */}
      {followups.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">📅 Upcoming Follow-ups</h3>
            <a href="/followups" className="text-sm text-blue-600 hover:underline">View all →</a>
          </div>
          <div className="divide-y divide-slate-100">
            {followups.map(f => {
              const dateVal = f.next_followup_date || f.follow_up_date
              const isOverdue = dateVal && new Date(dateVal) < new Date()
              return (
                <div key={f.id} className={`px-5 py-3 flex items-center gap-4 ${isOverdue?'bg-red-50':''}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue?'bg-red-500':'bg-green-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{f.school_name||f.contact_name||'—'}</p>
                    <p className="text-xs text-slate-400">{f.agent_name} · {f.phone}</p>
                  </div>
                  <StatusBadge status={f.lead_status||f.status} />
                  <span className={`text-xs font-semibold flex-shrink-0 ${isOverdue?'text-red-600':'text-slate-600'}`}>
                    {dateVal ? (() => { try { return format(new Date(dateVal), 'dd MMM') } catch { return '—' } })() : '—'}
                    {isOverdue ? ' ⚠️' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CRITICAL ALERTS MODAL ── */}
      {showCritical && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCritical(false)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-red-700">🚨 Critical Alerts</h2>
                <p className="text-sm text-slate-400">Requires immediate attention</p>
              </div>
              <button onClick={() => setShowCritical(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Unattended leads */}
              {(critical?.unattended || []).length > 0 && (
                <div className="p-5">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Leads Unattended &gt;5 Days ({critical.unattended.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead className="bg-red-50">
                      <tr>{['Name','Phone','Agent','Status','Idle Days'].map(h=>(
                        <th key={h} className="text-left px-3 py-2 text-xs text-slate-500 font-semibold">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {critical.unattended.map(l => (
                        <tr key={l.id} className="hover:bg-red-50">
                          <td className="px-3 py-2 font-medium">{l.name||'—'}</td>
                          <td className="px-3 py-2 text-blue-600">{l.phone}</td>
                          <td className="px-3 py-2 text-slate-500">{l.agent_name||'—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                          <td className="px-3 py-2 font-bold text-red-600">{l.days_idle} days</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Missed follow-ups */}
              {(critical?.missed_followups || []).length > 0 && (
                <div className="p-5 border-t border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    Follow-ups Missed &gt;3 Days ({critical.missed_followups.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead className="bg-orange-50">
                      <tr>{['Name','Phone','Agent','Status','Days Overdue','Scheduled Date'].map(h=>(
                        <th key={h} className="text-left px-3 py-2 text-xs text-slate-500 font-semibold">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {critical.missed_followups.map(f => (
                        <tr key={f.id} className="hover:bg-orange-50">
                          <td className="px-3 py-2 font-medium">{f.lead_name||'—'}</td>
                          <td className="px-3 py-2 text-blue-600">{f.phone}</td>
                          <td className="px-3 py-2 text-slate-500">{f.agent_name||'—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={f.lead_status} /></td>
                          <td className="px-3 py-2 font-bold text-orange-600">{f.days_overdue} days</td>
                          <td className="px-3 py-2 text-slate-500">
                            {f.follow_up_date ? (() => { try { return format(new Date(f.follow_up_date), 'dd MMM yyyy') } catch { return '—' } })() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowCritical(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {drillDown && <DrillModal title={drillDown.title} leads={drillDown.leads} onClose={() => setDrillDown(null)} />}
    </div>
  )
}
