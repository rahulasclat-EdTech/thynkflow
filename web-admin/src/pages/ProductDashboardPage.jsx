// web-admin/src/pages/PerformancePage.jsx
// Add to App.jsx routes: <Route path="performance" element={<PerformancePage />} />
// Add to sidebar nav: { path: 'performance', label: '🏆 Performance', icon: '🏆' }

import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function pct(a, b) {
  return b > 0 ? Math.min(Math.round((a / b) * 100), 100) : 0
}

function ProgressRing({ value, max, size = 80, color = '#4f46e5' }) {
  const p    = pct(value, max)
  const r    = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = (p / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em"
        fontSize={size * 0.22} fontWeight="bold" fill={color}>{p}%</text>
    </svg>
  )
}

function TargetBar({ calls, target, name }) {
  const p     = pct(calls, target)
  const color = p >= 100 ? '#16a34a' : p >= 70 ? '#d97706' : p >= 40 ? '#f59e0b' : '#dc2626'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{name}</span>
        <span className="font-bold" style={{ color }}>{calls} / {target}</span>
      </div>
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, background: color }} />
      </div>
      <p className="text-xs" style={{ color }}>{p >= 100 ? '🎯 Target achieved!' : `${target - calls} more to go`}</p>
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

export default function PerformancePage() {
  const { user } = useAuth()
  const isAdmin  = user?.role_name === 'admin'

  const [tab, setTab]                   = useState('today')
  const [todayData, setTodayData]       = useState([])
  const [leaderboard, setLeaderboard]   = useState([])
  const [myStats, setMyStats]           = useState(null)
  const [targets, setTargets]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [lbPeriod, setLbPeriod]         = useState('week')
  const [editTarget, setEditTarget]     = useState(null)
  const [targetVal, setTargetVal]       = useState('')
  const [savingTarget, setSavingTarget] = useState(false)
  const [activityScore, setActivityScore] = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [todayR, lbR, myR, scoreR] = await Promise.all([
        api.get('/performance/today'),
        api.get('/performance/leaderboard'),
        api.get('/performance/my'),
        api.get('/performance/activity-score'),
      ])
      setTodayData(todayR.data?.data || [])
      setLeaderboard(lbR.data?.data || [])
      setMyStats(myR.data?.data || null)
      setActivityScore(scoreR.data?.data || [])
      if (isAdmin) {
        const tR = await api.get('/performance/targets')
        setTargets(tR.data?.data || [])
      }
    } catch (err) { toast.error('Failed to load performance data') }
    finally { setLoading(false) }
  }, [isAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    const t = setInterval(fetchAll, 60000)
    return () => clearInterval(t)
  }, [fetchAll])

  const saveTarget = async () => {
    if (!targetVal || isNaN(targetVal) || parseInt(targetVal) < 1)
      return toast.error('Enter a valid target number')
    setSavingTarget(true)
    try {
      await api.put(`/performance/targets/${editTarget.id}`, { daily_target: parseInt(targetVal) })
      toast.success(`Target set to ${targetVal} for ${editTarget.name}`)
      setEditTarget(null); setTargetVal('')
      fetchAll()
    } catch (err) { toast.error(err.message || 'Failed to save') }
    finally { setSavingTarget(false) }
  }

  const myRow = todayData.find(r => r.agent_id === user?.id)

  const lbData = leaderboard.map(r => ({
    ...r,
    score: lbPeriod === 'week' ? parseInt(r.calls_week||0) : parseInt(r.calls_month||0)
  })).sort((a, b) => b.score - a.score).map((r, i) => ({ ...r, rank: i + 1 }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">🏆 Performance</h1>
          <p className="text-slate-500 text-sm">Daily targets, leaderboard & agent stats</p>
        </div>
        <button onClick={fetchAll} className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
          🔄 Refresh
        </button>
      </div>

      {myRow && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Today's Calls", val: myRow.calls_today,       icon: '📞', color: '#4f46e5' },
            { label: 'Daily Target',   val: myRow.daily_target,      icon: '🎯', color: '#d97706' },
            { label: 'This Month',     val: myRow.calls_this_month,  icon: '📅', color: '#0ea5e9' },
            { label: 'Conversions',    val: myRow.conversions_month, icon: '✅', color: '#16a34a' },
          ].map(({ label, val, icon, color }) => (
            <div key={label} className="card p-4" style={{ borderLeft: `4px solid ${color}` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{icon}</span>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
              </div>
              <p className="text-3xl font-black" style={{ color }}>{val || 0}</p>
            </div>
          ))}
        </div>
      )}

      {myStats?.streak > 0 && (
        <div className="card p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 flex items-center gap-4">
          <span className="text-4xl">🔥</span>
          <div>
            <p className="font-bold text-amber-800 text-lg">{myStats.streak} Day Streak!</p>
            <p className="text-amber-600 text-sm">You've hit your daily target {myStats.streak} consecutive days. Keep it up!</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 flex-wrap">
        {[
          ['today',       "📞 Today's Progress"],
          ['leaderboard', '🏆 Leaderboard'],
          isAdmin && ['targets', '🎯 Set Targets'],
          ['history',     '📅 My History'],
          ['score',       '⭐ Activity Score'],
        ].filter(Boolean).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===key?'bg-indigo-600 text-white':'text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {tab === 'today' && (
            <div className="card p-5">
              <h2 className="font-bold text-slate-800 mb-5">📞 Today's Call Progress</h2>
              {isAdmin ? (
                <div className="space-y-5">
                  {todayData.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">No data yet</p>
                  ) : todayData.map(agent => (
                    <div key={agent.agent_id} className="flex items-center gap-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <ProgressRing value={agent.calls_today} max={agent.daily_target}
                        color={pct(agent.calls_today, agent.daily_target) >= 100 ? '#16a34a' : '#4f46e5'} />
                      <div className="flex-1">
                        <p className="font-bold text-slate-800 mb-2">{agent.agent_name}</p>
                        <TargetBar calls={parseInt(agent.calls_today||0)} target={parseInt(agent.daily_target||20)} name="" />
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-slate-400">This Month</p>
                        <p className="font-bold text-indigo-600 text-lg">{agent.calls_this_month||0}</p>
                        <p className="text-xs text-slate-400 mt-1">Conversions</p>
                        <p className="font-bold text-green-600">{agent.conversions_month||0}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                myRow ? (
                  <div className="flex flex-col items-center gap-6">
                    <ProgressRing value={parseInt(myRow.calls_today||0)} max={parseInt(myRow.daily_target||20)} size={140}
                      color={pct(myRow.calls_today, myRow.daily_target) >= 100 ? '#16a34a' : '#4f46e5'} />
                    <div className="w-full max-w-md">
                      <TargetBar calls={parseInt(myRow.calls_today||0)} target={parseInt(myRow.daily_target||20)} name="Today's Target" />
                    </div>
                    <div className="grid grid-cols-3 gap-4 w-full max-w-md text-center">
                      {[
                        { label: 'Calls Today', val: myRow.calls_today||0,       color: '#4f46e5' },
                        { label: 'This Month',  val: myRow.calls_this_month||0,  color: '#0ea5e9' },
                        { label: 'Converted',   val: myRow.conversions_month||0, color: '#16a34a' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="card p-3">
                          <p className="text-2xl font-black" style={{ color }}>{val}</p>
                          <p className="text-xs text-slate-500 mt-1">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <p className="text-center text-slate-400 py-8">No data yet for today</p>
              )}
            </div>
          )}

          {tab === 'leaderboard' && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-bold text-slate-800">🏆 Leaderboard</h2>
                <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                  {[['week','This Week'],['month','This Month']].map(([key, label]) => (
                    <button key={key} onClick={() => setLbPeriod(key)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${lbPeriod===key?'bg-white text-indigo-600 shadow-sm':'text-slate-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {lbData.length >= 3 && (
                <div className="flex items-end justify-center gap-4 px-6 pt-6 pb-4 bg-gradient-to-b from-indigo-50 to-white">
                  {[lbData[1], lbData[0], lbData[2]].map((agent, idx) => {
                    const heights = ['h-20', 'h-28', 'h-16']
                    const ranks   = [2, 1, 3]
                    const colors  = ['#94a3b8', '#f59e0b', '#cd7c2f']
                    return (
                      <div key={agent.agent_id} className="flex flex-col items-center gap-2">
                        <span className="text-2xl">{MEDALS[ranks[idx]-1]}</span>
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                          {agent.agent_name?.[0]?.toUpperCase()}
                        </div>
                        <p className="text-xs font-bold text-slate-700 text-center max-w-[80px] truncate">{agent.agent_name}</p>
                        <p className="text-sm font-black text-indigo-600">{agent.score} calls</p>
                        <div className={`w-20 ${heights[idx]} rounded-t-lg flex items-center justify-center text-white text-xs font-bold`}
                          style={{ background: colors[idx] }}>
                          #{ranks[idx]}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Rank','Agent','Calls Today','This Week','This Month','Conversions','Target',
                        ...(isAdmin ? ['Earnings'] : [])
                      ].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lbData.map(agent => {
                      const isMe = agent.agent_id === user?.id
                      const p    = pct(agent.calls_today, agent.daily_target)
                      return (
                        <tr key={agent.agent_id} className={`hover:bg-slate-50 ${isMe ? 'bg-indigo-50' : ''}`}>
                          <td className="px-4 py-3"><span className="text-lg">{MEDALS[agent.rank-1] || `#${agent.rank}`}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                {agent.agent_name?.[0]?.toUpperCase()}
                              </div>
                              <p className="font-semibold text-slate-800">
                                {agent.agent_name} {isMe && <span className="text-xs text-indigo-500">(You)</span>}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-indigo-600">{agent.calls_today||0}</span>
                              <span className="text-xs text-slate-400">/ {agent.daily_target}</span>
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width:`${p}%`, background: p>=100?'#16a34a':p>=70?'#d97706':'#4f46e5' }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{agent.calls_week||0}</td>
                          <td className="px-4 py-3 font-bold text-indigo-600">{agent.calls_month||0}</td>
                          <td className="px-4 py-3 font-bold text-green-600">{agent.conversions_month||0}</td>
                          <td className="px-4 py-3 text-slate-500">{agent.daily_target}</td>
                          {isAdmin && (
                            <td className="px-4 py-3 font-semibold text-green-600">
                              {agent.earnings_month != null ? `₹${Number(agent.earnings_month).toLocaleString('en-IN')}` : '—'}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'targets' && isAdmin && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-bold text-slate-800">🎯 Set Daily Call Targets</h2>
                  <p className="text-sm text-slate-500 mt-1">Set individual daily call targets for each agent.</p>
                </div>
              </div>
              <div className="space-y-3">
                {targets.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No agents found</p>
                ) : targets.map(agent => (
                  <div key={agent.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold flex-shrink-0">
                      {agent.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{agent.name}</p>
                      <p className="text-xs text-slate-400">{agent.email}</p>
                      {agent.updated_at && (
                        <p className="text-xs text-slate-300 mt-0.5">
                          Last set by {agent.set_by_name||'admin'} · {new Date(agent.updated_at).toLocaleDateString('en-IN')}
                        </p>
                      )}
                    </div>
                    {editTarget?.id === agent.id ? (
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" max="200"
                          value={targetVal} onChange={e => setTargetVal(e.target.value)}
                          className="input w-24 text-center text-lg font-bold"
                          placeholder="e.g. 30" autoFocus
                          onKeyDown={e => { if (e.key==='Enter') saveTarget(); if (e.key==='Escape') setEditTarget(null) }} />
                        <button onClick={saveTarget} disabled={savingTarget}
                          className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                          {savingTarget ? '...' : 'Save'}
                        </button>
                        <button onClick={() => setEditTarget(null)}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <p className="text-2xl font-black text-indigo-600">{agent.daily_target}</p>
                          <p className="text-xs text-slate-400">calls/day</p>
                        </div>
                        <button onClick={() => { setEditTarget(agent); setTargetVal(String(agent.daily_target)) }}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600">
                          ✏️ Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                <p className="text-sm font-semibold text-indigo-800 mb-3">📋 Bulk Set Same Target</p>
                <div className="flex items-center gap-3">
                  <input type="number" min="1" max="200" id="bulkTarget"
                    className="input w-32 text-center font-bold" placeholder="e.g. 30" />
                  <button onClick={async () => {
                    const val = document.getElementById('bulkTarget').value
                    if (!val || isNaN(val)) return toast.error('Enter a valid number')
                    setSavingTarget(true)
                    try {
                      await Promise.all(targets.map(a =>
                        api.put(`/performance/targets/${a.id}`, { daily_target: parseInt(val) })
                      ))
                      toast.success(`Target set to ${val} for all agents`)
                      fetchAll()
                    } catch { toast.error('Failed') }
                    finally { setSavingTarget(false) }
                  }} disabled={savingTarget}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                    {savingTarget ? 'Setting...' : 'Set for All Agents'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="card p-5">
              <h2 className="font-bold text-slate-800 mb-5">📅 My Call History (Last 30 Days)</h2>
              {!myStats?.daily?.length ? (
                <p className="text-center text-slate-400 py-8">No call history found</p>
              ) : (
                <div className="space-y-2">
                  {myStats.daily.map((day, i) => {
                    const p     = pct(day.calls, day.target)
                    const color = p >= 100 ? '#16a34a' : p >= 70 ? '#d97706' : '#dc2626'
                    const date  = new Date(day.date)
                    return (
                      <div key={i} className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-center w-14 flex-shrink-0">
                          <p className="text-xs font-bold text-slate-500">{date.toLocaleDateString('en-IN', { weekday:'short' })}</p>
                          <p className="text-sm font-bold text-slate-800">{date.toLocaleDateString('en-IN', { day:'numeric', month:'short' })}</p>
                        </div>
                        <div className="flex-1">
                          <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width:`${p}%`, background: color }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-bold text-sm" style={{ color }}>{day.calls}</span>
                          <span className="text-slate-400 text-xs">/ {day.target}</span>
                          {p >= 100 && <span>🎯</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {myStats?.daily?.length > 0 && (
                <div className="mt-5 grid grid-cols-3 gap-4">
                  {[
                    { label: 'Days Tracked',    val: myStats.daily.length, color: '#4f46e5' },
                    { label: 'Days Hit Target', val: myStats.daily.filter(d => parseInt(d.calls) >= parseInt(d.target)).length, color: '#16a34a' },
                    { label: 'Current Streak',  val: `${myStats.streak}🔥`, color: '#f59e0b' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="card p-4 text-center">
                      <p className="text-2xl font-black" style={{ color }}>{val}</p>
                      <p className="text-xs text-slate-500 mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'score' && (
            <div className="space-y-4">
              <div className="card p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100">
                <h3 className="font-bold text-indigo-800 mb-2">⭐ How Activity Score Works</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-indigo-100">
                    <span className="text-base">📞</span> <strong>1 point</strong> per call with notes
                  </span>
                  <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-indigo-100">
                    <span className="text-base">📅</span> <strong>2 points</strong> per follow-up completed
                  </span>
                  <span className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-indigo-100">
                    <span className="text-base">✅</span> <strong>10 points</strong> per conversion today
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {activityScore.length === 0 ? (
                  <div className="card p-10 text-center text-slate-400">No data yet</div>
                ) : activityScore.map((agent, i) => {
                  const isMe        = agent.agent_id === user?.id
                  const calls       = parseInt(agent.calls_today         || 0)
                  const followups   = parseInt(agent.followups_done_today || 0)
                  const conversions = parseInt(agent.conversions_today    || 0)
                  return (
                    <div key={agent.agent_id}
                      className={`card p-4 border-l-4 ${isMe ? 'border-indigo-500 bg-indigo-50/30' : 'border-slate-200'}`}>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-xl w-8 text-center">{MEDALS[i] || `#${i+1}`}</span>
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold flex-shrink-0">
                            {agent.agent_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">
                              {agent.agent_name} {isMe && <span className="text-xs text-indigo-500">(You)</span>}
                            </p>
                            <p className="text-xs text-slate-400">Target: {agent.daily_target} calls/day</p>
                          </div>
                        </div>
                        <div className="text-center flex-shrink-0">
                          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-black"
                            style={{ background: agent.grade_color }}>
                            {agent.grade}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">Grade</p>
                        </div>
                        <div className="text-center flex-shrink-0">
                          <p className="text-3xl font-black text-indigo-600">{agent.score}</p>
                          <p className="text-xs text-slate-400">Score</p>
                          <p className="text-xs mt-0.5" style={{ color: agent.trend==='up'?'#16a34a':agent.trend==='down'?'#dc2626':'#94a3b8' }}>
                            {agent.trend==='up'?'↑ Up':agent.trend==='down'?'↓ Down':'→ Same'}
                          </p>
                        </div>
                        <div className="flex gap-4 flex-shrink-0">
                          {[
                            { icon:'📞', label:'Calls',      val:calls,       pts: calls * 1 },
                            { icon:'📅', label:'Follow-ups', val:followups,   pts: followups * 2 },
                            { icon:'✅', label:'Converted',  val:conversions, pts: conversions * 10 },
                          ].map(({ icon, label, val, pts }) => (
                            <div key={label} className="text-center">
                              <p className="text-lg">{icon}</p>
                              <p className="text-sm font-bold text-slate-700">{val}</p>
                              <p className="text-xs text-slate-400">{label}</p>
                              <p className="text-xs font-semibold text-indigo-500">+{pts}pts</p>
                            </div>
                          ))}
                        </div>
                        <div className="w-full mt-2">
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>Call target progress</span>
                            <span style={{ color: agent.grade_color }}>{agent.call_pct}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width:`${agent.call_pct}%`, background: agent.grade_color }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
