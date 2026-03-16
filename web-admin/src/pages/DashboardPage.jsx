import React, { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import api from '../utils/api'
import { format } from 'date-fns'

const STATUS_COLORS = {
  new: '#3b82f6', hot: '#ef4444', warm: '#f59e0b',
  cold: '#94a3b8', converted: '#22c55e', not_interested: '#64748b', call_back: '#a855f7'
}

const STAT_CARDS = [
  { key: 'total_leads', label: 'Total Leads', icon: '👥', color: 'bg-blue-50 text-blue-700' },
  { key: 'unattended', label: 'Unattended', icon: '🔴', color: 'bg-red-50 text-red-700' },
  { key: 'converted', label: 'Converted', icon: '✅', color: 'bg-green-50 text-green-700' },
  { key: 'hot', label: 'Hot Leads', icon: '🔥', color: 'bg-orange-50 text-orange-700' },
]

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${color}`}>{label}</span>
      </div>
      <p className="text-3xl font-bold text-slate-800">{value ?? '—'}</p>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats').then(res => setData(res.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading dashboard...</div>

  const { totals, status_breakdown, today_calls, pending_followups, agent_performance, recent_activity } = data || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
        </div>
        <div className="flex gap-3">
          <div className="card px-4 py-2 text-center">
            <p className="text-2xl font-bold text-blue-600">{today_calls ?? 0}</p>
            <p className="text-xs text-slate-500">Today's Calls</p>
          </div>
          <div className="card px-4 py-2 text-center">
            <p className="text-2xl font-bold text-red-500">{pending_followups ?? 0}</p>
            <p className="text-xs text-slate-500">Pending Follow-ups</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(c => (
          <StatCard key={c.key} label={c.label} value={totals?.[c.key]} icon={c.icon} color={c.color} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Pie */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-700 mb-4">Lead Status Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={status_breakdown} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, count }) => `${status}: ${count}`}>
                {status_breakdown?.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Agent Performance */}
        {agent_performance?.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold text-slate-700 mb-4">Agent Performance</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agent_performance}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total_leads" name="Leads" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="converted" name="Converted" fill="#22c55e" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700">Recent Activity</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {recent_activity?.length === 0 && (
            <p className="text-center text-slate-400 py-8 text-sm">No activity yet today</p>
          )}
          {recent_activity?.map((act, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold flex-shrink-0">
                {act.agent_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">
                  {act.agent_name} called <span className="text-blue-600">{act.school_name || act.contact_name || 'Lead'}</span>
                </p>
                {act.discussion && <p className="text-xs text-slate-400 truncate mt-0.5">"{act.discussion}"</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`badge-${act.status}`}>{act.status?.replace('_', ' ')}</span>
                <span className="text-xs text-slate-400">{format(new Date(act.called_at), 'hh:mm a')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
