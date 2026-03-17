import React, { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  RadialBarChart, RadialBar, LineChart, Line, CartesianGrid
} from 'recharts'
import api from '../utils/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../context/AuthContext'

const STATUS_COLORS = {
  new: '#3b82f6', hot: '#ef4444', warm: '#f59e0b',
  cold: '#94a3b8', converted: '#22c55e',
  not_interested: '#64748b', call_back: '#a855f7'
}

const CARD_CONFIGS = [
  { key: 'total_leads', label: 'Total Leads', icon: '👥', bg: 'from-blue-600 to-blue-700', text: 'text-white' },
  { key: 'unattended', label: 'Unattended', icon: '🔴', bg: 'from-red-500 to-red-600', text: 'text-white' },
  { key: 'converted', label: 'Converted', icon: '✅', bg: 'from-green-500 to-green-600', text: 'text-white' },
  { key: 'hot', label: 'Hot Leads', icon: '🔥', bg: 'from-orange-500 to-orange-600', text: 'text-white' },
]

function KPICard({ label, value, icon, bg, text, sub, trend }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${bg} p-5 shadow-lg`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {trend !== undefined && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend >= 0 ? 'bg-white/20 text-white' : 'bg-white/20 text-white'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className={`text-4xl font-black ${text} mb-1`}>{value ?? 0}</p>
      <p className={`text-sm font-semibold ${text} opacity-80`}>{label}</p>
      {sub && <p className={`text-xs ${text} opacity-60 mt-1`}>{sub}</p>}
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-sm">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value}</p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('7')
  const [callTrend, setCallTrend] = useState([])
  const [conversionFunnel, setConversionFunnel] = useState([])

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/dashboard/stats')
      setData(res.data)

      const days = parseInt(dateRange)
      const trendData = []
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i)
        const dateStr = format(date, 'dd MMM')
        try {
          const r = await api.get('/reports/daily-calls', {
            params: { date: format(date, 'yyyy-MM-dd') }
          })
          trendData.push({ date: dateStr, calls: r.data.length })
        } catch {
          trendData.push({ date: dateStr, calls: 0 })
        }
      }
      setCallTrend(trendData)

      if (res.data.status_breakdown) {
        const total = res.data.totals?.total_leads || 1
        const funnel = [
          { name: 'Total Leads', value: parseInt(res.data.totals?.total_leads || 0), fill: '#3b82f6' },
          { name: 'Contacted', value: parseInt(res.data.totals?.total_leads || 0) - parseInt(res.data.totals?.unattended || 0), fill: '#8b5cf6' },
          { name: 'Interested', value: (res.data.status_breakdown.find(s => s.status === 'hot')?.count || 0) * 1 + (res.data.status_breakdown.find(s => s.status === 'warm')?.count || 0) * 1, fill: '#f59e0b' },
          { name: 'Converted', value: parseInt(res.data.totals?.converted || 0), fill: '#22c55e' },
        ]
        setConversionFunnel(funnel)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-slate-400 text-sm">Loading dashboard...</p>
      </div>
    </div>
  )

  const { totals, status_breakdown, today_calls, pending_followups, agent_performance, recent_activity } = data || {}

  const conversionRate = totals?.total_leads > 0
    ? ((totals.converted / totals.total_leads) * 100).toFixed(1)
    : 0

  const attendanceRate = totals?.total_leads > 0
    ? (((totals.total_leads - totals.unattended) / totals.total_leads) * 100).toFixed(1)
    : 0

  const pieData = status_breakdown?.map(s => ({
    name: s.status.replace('_', ' '),
    value: parseInt(s.count),
    color: STATUS_COLORS[s.status] || '#94a3b8'
  })) || []

  return (
    <div className="space-y-8 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Analytics Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {format(new Date(), 'EEEE, dd MMMM yyyy')} · Welcome back, <span className="text-blue-600 font-semibold">{user?.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="input w-36 text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
          </select>
          <button onClick={fetchDashboard} className="btn-secondary text-sm">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {CARD_CONFIGS.map(c => (
          <KPICard
            key={c.key}
            label={c.label}
            value={totals?.[c.key]}
            icon={c.icon}
            bg={c.bg}
            text={c.text}
          />
        ))}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-blue-600">{today_calls ?? 0}</p>
          <p className="text-sm text-slate-500 mt-1 font-medium">Today's Calls</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-red-500">{pending_followups ?? 0}</p>
          <p className="text-sm text-slate-500 mt-1 font-medium">Pending Follow-ups</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-green-600">{conversionRate}%</p>
          <p className="text-sm text-slate-500 mt-1 font-medium">Conversion Rate</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-3xl font-black text-purple-600">{attendanceRate}%</p>
          <p className="text-sm text-slate-500 mt-1 font-medium">Attendance Rate</p>
        </div>
      </div>

      {/* Call Trend + Status Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-2">
          <SectionHeader title="📞 Call Activity Trend" subtitle={`Last ${dateRange} days`} />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={callTrend}>
              <defs>
                <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="calls" name="Calls" stroke="#3b82f6" strokeWidth={3} fill="url(#callGrad)" dot={{ fill: '#3b82f6', r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <SectionHeader title="🎯 Lead Status Mix" />
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(val, name) => [val, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {pieData.slice(0, 4).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  <span className="text-slate-600 capitalize font-medium">{item.name}</span>
                </div>
                <span className="font-bold text-slate-700">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Conversion Funnel + Agent Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <SectionHeader title="🔽 Conversion Funnel" subtitle="Lead journey from assignment to close" />
          <div className="space-y-3 mt-2">
            {conversionFunnel.map((item, i) => {
              const max = conversionFunnel[0]?.value || 1
              const pct = Math.round((item.value / max) * 100)
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-slate-700">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800">{item.value}</span>
                      <span className="text-xs text-slate-400">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg flex items-center px-3 transition-all duration-700"
                      style={{ width: `${pct}%`, background: item.fill }}
                    >
                      {pct > 15 && <span className="text-white text-xs font-bold">{pct}%</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 p-3 bg-green-50 rounded-xl border border-green-100">
            <p className="text-sm font-semibold text-green-700">
              🏆 Overall Conversion Rate: <span className="text-2xl font-black">{conversionRate}%</span>
            </p>
          </div>
        </div>

        {isAdmin && agent_performance?.length > 0 && (
          <div className="card p-5">
            <SectionHeader title="🏅 Agent Leaderboard" subtitle="Performance this period" />
            <div className="space-y-3">
              {agent_performance.map((agent, i) => {
                const convRate = agent.total_leads > 0
                  ? ((agent.converted / agent.total_leads) * 100).toFixed(0)
                  : 0
                const medals = ['🥇', '🥈', '🥉']
                return (
                  <div key={agent.agent_id} className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                    <span className="text-xl flex-shrink-0">{medals[i] || `${i + 1}`}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{agent.name}</p>
                        <span className="text-xs font-bold text-green-600">{convRate}% conv.</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>👥 {agent.total_leads} leads</span>
                        <span>📞 {agent.total_calls} calls</span>
                        <span>✅ {agent.converted} converted</span>
                      </div>
                      <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min(100, convRate)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Status Bar Chart */}
      <div className="card p-5">
        <SectionHeader title="📊 Lead Status Breakdown" subtitle="Total leads by current status" />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={status_breakdown?.map(s => ({ ...s, count: parseInt(s.count) })) || []} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="status" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={90}
              tickFormatter={v => v.replace('_', ' ')} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name="Leads" radius={[0, 6, 6, 0]}>
              {status_breakdown?.map((entry, i) => (
                <Cell key={i} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Activity */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">⚡ Live Activity Feed</h3>
          <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-1 rounded-full">
            {recent_activity?.length || 0} recent
          </span>
        </div>
        <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
          {!recent_activity?.length ? (
            <p className="text-center text-slate-400 py-10 text-sm">No activity yet today</p>
          ) : (
            recent_activity.map((act, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-black flex-shrink-0">
                  {act.agent_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">
                    <span className="font-bold">{act.agent_name}</span> called{' '}
                    <span className="font-bold text-blue-600">{act.school_name || act.contact_name || 'a lead'}</span>
                  </p>
                  {act.discussion && (
                    <p className="text-xs text-slate-400 truncate mt-0.5 italic">"{act.discussion}"</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`badge-${act.status} text-xs`}>{act.status?.replace('_', ' ')}</span>
                  <span className="text-xs text-slate-300">{format(new Date(act.called_at), 'hh:mm a')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
