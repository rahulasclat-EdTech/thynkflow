// web-admin/src/pages/LoginReportPage.jsx
// Add to App.jsx routes: <Route path="login-report" element={<AdminRoute><LoginReportPage /></AdminRoute>} />
// Add to sidebar nav: { to: '/login-report', label: 'Login Report', icon: '🔐', adminOnly: true }

import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import MultiSelect from '../components/common/MultiSelect'

export default function LoginReportPage() {
  const [rollup, setRollup]     = useState([])
  const [logs, setLogs]         = useState([])
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [selectedUser, setSelectedUser] = useState(null) // user_id or null = rollup view
  const [filterUser, setFilterUser] = useState([])
  const [from, setFrom] = useState('')
  const [to, setTo]     = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Users list — independent of the login-activity call, so if that one
    // fails the "All Users" dropdown still populates instead of staying empty.
    try {
      const userRes = await api.get('/users')
      const userBody = userRes || {}
      setUsers(Array.isArray(userBody) ? userBody : (Array.isArray(userBody.data) ? userBody.data : []))
    } catch (err) {
      console.error('Failed to load users:', err)
      toast.error(err?.message || 'Failed to load users list')
    }

    try {
      const params = {
        ...(filterUser.length && { user_id: filterUser[0] }),
        ...(from && { from }),
        ...(to && { to }),
      }
      const r = await api.get('/reports/login-activity', { params })
      setLogs(r.data || [])
      setRollup(r.rollup || [])
    } catch (err) {
      console.error('Failed to load login activity:', err)
      toast.error(err?.message || 'Failed to load login report')
    }

    setLoading(false)
  }, [filterUser, from, to])

  useEffect(() => { fetchData() }, [fetchData])

  const visibleLogs = selectedUser ? logs.filter(l => l.user_id === selectedUser) : logs

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-800">🔐 Login Report</h1>
        <p className="text-sm text-slate-500">Every login attempt, user-wise — successes, failures, IP and last-seen.</p>
      </div>

      {/* Per-user rollup cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rollup.map(u => (
          <button key={u.user_id}
            onClick={() => setSelectedUser(selectedUser === u.user_id ? null : u.user_id)}
            className={`text-left rounded-2xl p-4 border-2 transition-all ${selectedUser === u.user_id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-white hover:border-indigo-200'}`}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800">{u.user_name}</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase font-bold">{u.role_name}</span>
            </div>
            <p className="text-xs text-slate-400">{u.user_email}</p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="font-black text-green-600">{u.total_logins ?? 0}<span className="text-[10px] font-medium text-slate-400 ml-1">logins</span></span>
              {parseInt(u.failed_logins) > 0 && (
                <span className="font-black text-red-500">{u.failed_logins}<span className="text-[10px] font-medium text-slate-400 ml-1">failed</span></span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Last login: {u.last_login_at ? format(parseISO(u.last_login_at), 'dd MMM yyyy, h:mm a') : 'Never'}
            </p>
            {u.last_ip && <p className="text-[10px] text-slate-300 font-mono mt-0.5">{u.last_ip}</p>}
          </button>
        ))}
      </div>

      {/* Filters for the detail log */}
      <div className="flex flex-wrap gap-2 items-center">
        <MultiSelect placeholder="All Users" value={filterUser} onChange={setFilterUser}
          options={users.map(u => ({ value: u.id, label: u.name }))} />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        {selectedUser && (
          <button onClick={() => setSelectedUser(null)} className="text-xs font-bold text-indigo-600 hover:underline">
            ✕ clear user selection
          </button>
        )}
      </div>

      {/* Detail log table */}
      <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['User','Role','Status','Reason','IP Address','Device','When'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && visibleLogs.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No login activity found</td></tr>
            )}
            {!loading && visibleLogs.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-semibold text-slate-700">{l.user_name || l.email || 'Unknown'}</td>
                <td className="px-4 py-2.5 capitalize text-slate-500">{l.role_name || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${l.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {l.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400">{l.reason || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{l.ip_address || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[220px] truncate" title={l.user_agent}>{l.user_agent || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{l.logged_in_at ? format(parseISO(l.logged_in_at), 'dd MMM yyyy, h:mm a') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
