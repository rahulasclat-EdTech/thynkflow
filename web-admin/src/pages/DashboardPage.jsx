// web-admin/src/pages/DashboardPage.jsx — COMPLETE REPLACEMENT
// ✅ FIX: STATUS_COLORS now built dynamically from /api/settings so any new
//         status added in Settings page auto-appears everywhere — badges,
//         status breakdown cards, drill-down modals, follow-up rows, etc.
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'

// ── Fallback palette for statuses that have no color in app_settings ──────
const FALLBACK_COLORS = [
  { bg: '#dbeafe', text: '#1e40af' }, { bg: '#fee2e2', text: '#991b1b' },
  { bg: '#fef3c7', text: '#92400e' }, { bg: '#e2e8f0', text: '#475569' },
  { bg: '#dcfce7', text: '#14532d' }, { bg: '#f1f5f9', text: '#64748b' },
  { bg: '#ede9fe', text: '#5b21b6' }, { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#ecfdf5', text: '#065f46' }, { bg: '#fff7ed', text: '#9a3412' },
]

// Built at runtime from /api/settings — key → { bg, text }
let _statusColorCache = {}

function getStatusColor(key, index = 0) {
  if (_statusColorCache[key]) return _statusColorCache[key]
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

// Builds the cache from the settings API response array
// items: [{ key, color, label }]
function buildStatusColorCache(items) {
  const cache = {}
  items.forEach((item, i) => {
    const hex   = item.color || '#6366f1'
    const alpha = hex + '28' // ~16% opacity for bg
    cache[item.key] = {
      bg:   alpha,
      text: hex,
    }
  })
  // Always keep safe fallbacks for the original 7
  const defaults = {
    new:            { bg: '#dbeafe', text: '#1e40af' },
    hot:            { bg: '#fee2e2', text: '#991b1b' },
    warm:           { bg: '#fef3c7', text: '#92400e' },
    cold:           { bg: '#e2e8f0', text: '#475569' },
    converted:      { bg: '#dcfce7', text: '#14532d' },
    not_interested: { bg: '#f1f5f9', text: '#64748b' },
    call_back:      { bg: '#ede9fe', text: '#5b21b6' },
  }
  _statusColorCache = { ...defaults, ...cache }
}

function StatusBadge({ status }) {
  const c = _statusColorCache[status] || FALLBACK_COLORS[0]
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: c.bg, color: c.text }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

function KPICard({ label, value, icon, color = '#2563eb', sub, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white border border-slate-200 rounded-2xl p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {onClick && <span className="text-xs text-blue-500 font-medium">drill ↗</span>}
      </div>
      <p className="text-3xl font-black" style={{ color }}>{value ?? 0}</p>
      <p className="text-sm font-semibold text-slate-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
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
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">✕</button>
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
                    <td className="px-4 py-3 font-medium">{l.school_name||l.contact_name||l.name||'—'}</td>
                    <td className="px-4 py-3 text-blue-600">{l.phone}</td>
                    <td className="px-4 py-3 text-slate-500">{l.agent_name||'—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">{l.admin_remark||l.creation_comment||'—'}</td>
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

  const [stats, setStats]               = useState(null)
  const [critical, setCritical]         = useState(null)
  const [agentData, setAgentData]       = useState([])
  const [followups, setFollowups]       = useState([])
  const [loading, setLoading]           = useState(true)
  const [drillDown, setDrillDown]       = useState(null)
  const [showCritical, setShowCritical] = useState(false)
  // ✅ Dynamic statuses fetched from Settings page
  const [allStatuses, setAllStatuses]   = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [dashRes, critRes, agentRes, fuRes, settRes] = await Promise.all([
        api.get('/dashboard').catch(() => ({ data: {} })),
        api.get('/dashboard/critical').catch(() => ({ data: {} })),
        api.get('/reports/agent-wise').catch(() => ({ data: [] })),
        api.get('/reports/upcoming-followups').catch(() => ({ data: [] })),
        api.get('/settings').catch(() => ({ data: {} })),
      ])

      // ✅ Build color cache from settings so new statuses get correct colors
      const sData    = settRes.data?.data || settRes.data || {}
      const statuses = sData.lead_status || sData.statuses || []
      if (statuses.length) {
        buildStatusColorCache(statuses)
        setAllStatuses(statuses)
      }

      const rawTotals = dashRes.data?.data?.totals || {}
      setStats(rawTotals)

      setCritical(critRes.data?.data || {})

      const agents = agentRes.data?.data || agentRes.data || []
      setAgentData(Array.isArray(agents) ? agents : [])

      const fu = fuRes.data?.data || fuRes.data || []
      setFollowups(Array.isArray(fu) ? fu.slice(0, 5) : [])
    } catch (err) { console.error('Dashboard error:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openDrill = async (title, params) => {
    try {
      const r = await api.get('/leads', { params: { ...params, per_page: 200 } })
      const leads = Array.isArray(r.data) ? r.data : (r.data?.data || [])
      setDrillDown({ title, leads })
    } catch { setDrillDown({ title, leads: [] }) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ✅ Fixed counts (not status-dependent)
  const totalLeads = parseInt(stats?.total_leads || 0)
  const unattended = parseInt(stats?.unattended  || 0)
  const todayCalls = parseInt(stats?.today_calls || 0)
  const weekCalls  = parseInt(stats?.week_calls  || 0)
  const monthCalls = parseInt(stats?.month_calls || 0)

  // ✅ Dynamic per-status counts — works for any status key including new ones
  const getStatusCount = (key) => {
    // dashboard returns both direct key (e.g. 'hot') AND legacy alias (e.g. 'hot_leads')
    return parseInt(stats?.[key] || stats?.[key + '_leads'] || stats?.[key.replace(/_/g,'')] || 0)
  }

  // Legacy vars kept so existing JSX below still compiles unchanged
  const converted     = getStatusCount('converted')
  const hot           = getStatusCount('hot')
  const warm          = getStatusCount('warm')
  const convRate      = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0'

  // ✅ Build status breakdown from the status_breakdown array returned by backend
  // Falls back to reading individual keys from stats if array not present
  const statusBreakdown = (() => {
    const raw = stats?.__statusBreakdown || []
    if (raw.length) return raw
    // Fallback: build from allStatuses + stats keys
    if (allStatuses.length) {
      return allStatuses.map(s => ({ status: s.key, count: getStatusCount(s.key) }))
    }
    // Last resort: original 7
    return ['new','hot','warm','cold','call_back','not_interested','converted']
      .map(k => ({ status: k, count: getStatusCount(k) }))
  })()

  const critUnattended = (critical?.unattended       || []).length
  const critMissed     = (critical?.missed_followups || []).length
  const hasCritical    = critUnattended > 0 || critMissed > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isAdmin ? '🏢 Admin Dashboard' : `👋 Hello, ${user?.name?.split(' ')[0]}`}
          </h1>
          <p className="text-slate-500 text-sm">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasCritical && (
            <button onClick={() => setShowCritical(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 animate-pulse">
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
                  🔴 {critUnattended} leads unattended &gt;5 days
                </button>
              )}
              {critMissed > 0 && (
                <button onClick={() => setShowCritical(true)} className="text-sm text-red-700 hover:underline">
                  ⏰ {critMissed} follow-ups missed &gt;3 days
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
          <p className="text-3xl font-black text-blue-600">{todayCalls}</p>
        </div>
        <div className="card p-4 text-center border-l-4 border-purple-500">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Calls This Week</p>
          <p className="text-3xl font-black text-purple-600">{weekCalls}</p>
        </div>
        <div className="card p-4 text-center border-l-4 border-indigo-500">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Calls This Month</p>
          <p className="text-3xl font-black text-indigo-600">{monthCalls}</p>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Leads"  value={totalLeads} icon="👥" color="#2563eb"
          onClick={() => openDrill('All Leads', {})} />
        <KPICard label="Converted"    value={converted}  icon="✅" color="#16a34a"
          sub={`${convRate}% rate`}
          onClick={() => openDrill('Converted Leads', { status: 'converted' })} />
        <KPICard label="Hot Leads"    value={hot}        icon="🔥" color="#dc2626"
          onClick={() => openDrill('Hot Leads', { status: 'hot' })} />
        <KPICard label="Unattended"   value={unattended} icon="🔴" color="#ea580c"
          sub=">5 days no activity"
          onClick={() => openDrill('Unattended Leads', { unattended: 'true' })} />
      </div>

      {/* ✅ Status breakdown — fully dynamic, shows ALL statuses including new ones */}
      <div className="card p-5">
        <h3 className="font-bold text-slate-800 mb-4">📊 Lead Status Breakdown</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statusBreakdown.map((item, idx) => {
            const c     = _statusColorCache[item.status] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
            const val   = item.count || 0
            const label = item.status?.replace(/_/g, ' ')
            return (
              <div key={item.status}
                className="p-4 rounded-xl cursor-pointer hover:shadow-md transition-all border-2 border-transparent hover:border-opacity-50"
                style={{ backgroundColor: c.bg, borderColor: c.text }}
                onClick={() => openDrill(`${label} Leads`, { status: item.status })}>
                <p className="text-2xl font-black" style={{ color: c.text }}>{val}</p>
                <p className="text-xs font-semibold mt-1 capitalize" style={{ color: c.text }}>{label}</p>
                <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${totalLeads > 0 ? Math.max((val / totalLeads) * 100, 2) : 0}%`,
                    backgroundColor: c.text
                  }} />
                </div>
              </div>
            )
          })}
          {/* Unattended is not a status — always shown as special card */}
          <div className="p-4 rounded-xl cursor-pointer hover:shadow-md transition-all border-2 border-transparent hover:border-opacity-50"
            style={{ backgroundColor: '#ffedd5', borderColor: '#ea580c' }}
            onClick={() => openDrill('Unattended Leads', { unattended: 'true' })}>
            <p className="text-2xl font-black" style={{ color: '#ea580c' }}>{unattended}</p>
            <p className="text-xs font-semibold mt-1" style={{ color: '#ea580c' }}>Unattended</p>
            <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${totalLeads > 0 ? Math.max((unattended / totalLeads) * 100, 2) : 0}%`,
                backgroundColor: '#ea580c'
              }} />
            </div>
          </div>
        </div>
      </div>

      {/* Agent Leaderboard — admin sees all, agent sees none */}
      {isAdmin && agentData.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">🏅 Agent Leaderboard</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>{['Agent','Leads','Calls','Hot','Warm','Converted','Conv %'].map(h=>(
                <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agentData.slice(0, 8).map((a, i) => {
                const rate = a.total_leads > 0 ? ((a.converted / a.total_leads) * 100).toFixed(1) : 0
                const medals = ['🥇','🥈','🥉']
                return (
                  <tr key={a.agent_id} className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => openDrill(`${a.agent_name}'s Leads`, { agent_id: a.agent_id })}>
                    <td className="px-4 py-3 font-semibold">{medals[i] || ''} {a.agent_name}</td>
                    <td className="px-4 py-3 font-bold text-blue-600">{a.total_leads}</td>
                    <td className="px-4 py-3">{a.total_calls || 0}</td>
                    <td className="px-4 py-3 font-bold text-red-500">{a.hot || 0}</td>
                    <td className="px-4 py-3 font-bold text-amber-500">{a.warm || 0}</td>
                    <td className="px-4 py-3 font-bold text-green-600">{a.converted || 0}</td>
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
                <div key={f.id} className={`px-5 py-3 flex items-center gap-4 ${isOverdue ? 'bg-red-50' : ''}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-green-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{f.school_name || f.contact_name || '—'}</p>
                    <p className="text-xs text-slate-400">{f.agent_name} · {f.phone}</p>
                  </div>
                  <StatusBadge status={f.lead_status || f.status} />
                  <span className={`text-xs font-semibold flex-shrink-0 ${isOverdue ? 'text-red-600' : 'text-slate-600'}`}>
                    {dateVal ? (() => { try { return format(new Date(dateVal), 'dd MMM') } catch { return '—' } })() : '—'}
                    {isOverdue ? ' ⚠️' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Critical Alerts Modal */}
      {showCritical && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCritical(false)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-red-700">🚨 Critical Alerts</h2>
                <p className="text-sm text-slate-400">Requires immediate attention</p>
              </div>
              <button onClick={() => setShowCritical(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Unattended leads >5 days */}
              {(critical?.unattended || []).length > 0 && (
                <div className="p-5">
                  <h3 className="font-bold text-slate-800 mb-3">🔴 Leads Unattended &gt;5 Days ({critical.unattended.length})</h3>
                  <table className="w-full text-sm">
                    <thead className="bg-red-50"><tr>
                      {['Name','Phone','Agent','Status','Days Idle'].map(h=>(
                        <th key={h} className="text-left px-3 py-2 text-xs text-slate-500 font-semibold">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {critical.unattended.map(l => (
                        <tr key={l.id} className="hover:bg-red-50">
                          <td className="px-3 py-2 font-medium">{l.name || '—'}</td>
                          <td className="px-3 py-2 text-blue-600">{l.phone}</td>
                          <td className="px-3 py-2 text-slate-500">{l.agent_name || '—'}</td>
                          <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                          <td className="px-3 py-2 font-bold text-red-600">{l.days_idle} days</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Missed follow-ups >3 days */}
              {(critical?.missed_followups || []).length > 0 && (
                <div className="p-5 border-t border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3">⏰ Follow-ups Missed &gt;3 Days ({critical.missed_followups.length})</h3>
                  <table className="w-full text-sm">
                    <thead className="bg-orange-50"><tr>
                      {['Name','Phone','Agent','Status','Days Overdue','Scheduled Date'].map(h=>(
                        <th key={h} className="text-left px-3 py-2 text-xs text-slate-500 font-semibold">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {critical.missed_followups.map(f => (
                        <tr key={f.id} className="hover:bg-orange-50">
                          <td className="px-3 py-2 font-medium">{f.lead_name || '—'}</td>
                          <td className="px-3 py-2 text-blue-600">{f.phone}</td>
                          <td className="px-3 py-2 text-slate-500">{f.agent_name || '—'}</td>
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
