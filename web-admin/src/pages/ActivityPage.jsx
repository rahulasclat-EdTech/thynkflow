// web-admin/src/pages/ActivityPage.jsx
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO, differenceInDays } from 'date-fns'

const PRIORITY = {
  urgent: { bg:'#FEF2F2', text:'#DC2626', border:'#FECACA', dot:'#EF4444', label:'Urgent' },
  high:   { bg:'#FFF7ED', text:'#C2410C', border:'#FED7AA', dot:'#F97316', label:'High'   },
  medium: { bg:'#EFF6FF', text:'#1D4ED8', border:'#BFDBFE', dot:'#3B82F6', label:'Medium' },
  low:    { bg:'#F9FAFB', text:'#6B7280', border:'#E5E7EB', dot:'#9CA3AF', label:'Low'    },
}

const STATUS = {
  not_started: { bg:'#F9FAFB', text:'#6B7280', label:'Not Started', icon:'○' },
  in_progress: { bg:'#EFF6FF', text:'#1D4ED8', label:'In Progress',  icon:'◑' },
  on_hold:     { bg:'#FFFBEB', text:'#D97706', label:'On Hold',      icon:'⏸' },
  completed:   { bg:'#F0FDF4', text:'#16A34A', label:'Completed',    icon:'✓' },
}

function isOverdue(a) {
  if (!a.due_date) return false
  const s = a.my_status || a.status
  if (s === 'completed') return false
  return differenceInDays(new Date(), new Date(a.due_date)) > 0
}

function daysLeft(due_date) {
  if (!due_date) return null
  return differenceInDays(new Date(due_date), new Date())
}

function CircleProgress({ pct, size = 56 }) {
  const r    = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (Math.min(pct, 100) / 100) * circ
  const color = pct >= 100 ? '#16A34A' : pct >= 60 ? '#4F46E5' : pct >= 30 ? '#F59E0B' : '#E5E7EB'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fontSize={size*0.23} fontWeight="700"
        fill={color} style={{ transform:'rotate(90deg)', transformOrigin:'center' }}>{pct}%</text>
    </svg>
  )
}

export default function ActivityPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [activities, setActivities] = useState([])
  const [agents, setAgents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selected, setSelected]     = useState(null)
  const [comments, setComments]     = useState([])
  const [commLoading, setCommLoading] = useState(false)
  const [editActivity, setEditActivity] = useState(null)
  const emptyForm = { title:'', details:'', expected_days:7, due_date:'', priority:'medium', agent_ids:[] }
  const [form, setForm]             = useState(emptyForm)
  const [saving, setSaving]         = useState(false)
  const [progress, setProgress]     = useState({ completion_pct:0, status:'not_started', comment:'' })
  const [savingProgress, setSavingProgress] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [aR, uR] = await Promise.all([
        api.get('/activities'),
        isAdmin ? api.get('/users') : Promise.resolve({ data: [] }),
      ])
      const acts = aR?.data || aR || []
      setActivities(Array.isArray(acts) ? acts : [])
      const uList = uR?.data || uR || []
      setAgents(Array.isArray(uList) ? uList.filter(u => ['agent','admin'].includes(u.role_name)) : [])
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [isAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => {
    const t = setInterval(fetchAll, 45000)
    return () => clearInterval(t)
  }, [fetchAll])

  const fetchComments = async (id) => {
    setCommLoading(true)
    try {
      const r = await api.get(`/activities/${id}/comments`)
      setComments(r?.data || [])
    } catch {} finally { setCommLoading(false) }
  }

  const openDetail = (a) => {
    setSelected(a)
    const mine = a.assignments?.find(x => x.agent_id === user?.id)
    setProgress({
      completion_pct: mine?.completion_pct || a.my_completion_pct || 0,
      status: mine?.status || a.my_status || 'not_started',
      comment: ''
    })
    setShowDetail(true)
    fetchComments(a.id)
  }

  const openCreate = () => { setEditActivity(null); setForm(emptyForm); setShowCreate(true) }
  const openEdit   = (a) => {
    setEditActivity(a)
    setForm({ title:a.title, details:a.details||'', expected_days:a.expected_days,
      due_date: a.due_date ? a.due_date.split('T')[0] : '',
      priority: a.priority, agent_ids: a.assignments?.map(x => x.agent_id)||[] })
    setShowCreate(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title required')
    setSaving(true)
    try {
      const payload = { ...form, agent_ids: form.agent_ids.length ? form.agent_ids : [user.id] }
      if (editActivity) {
        await api.put(`/activities/${editActivity.id}`, payload)
        if (form.agent_ids.length) await api.post(`/activities/${editActivity.id}/assign`, { agent_ids: form.agent_ids }).catch(()=>{})
        toast.success('Updated')
      } else {
        await api.post('/activities', payload)
        toast.success('Created & assigned!')
      }
      setShowCreate(false); setForm(emptyForm); fetchAll()
    } catch (err) { toast.error(err.message||'Failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this activity?')) return
    try { await api.delete(`/activities/${id}`); toast.success('Deleted'); fetchAll() }
    catch (err) { toast.error(err.message) }
  }

  const saveProgress = async () => {
    if (!selected) return
    setSavingProgress(true)
    try {
      await api.patch(`/activities/${selected.id}/progress`, progress)
      toast.success('Progress saved!')
      setShowDetail(false); fetchAll()
    } catch (err) { toast.error(err.message||'Failed') }
    finally { setSavingProgress(false) }
  }

  const toggleAgent = (id) => setForm(f => ({
    ...f, agent_ids: f.agent_ids.includes(id) ? f.agent_ids.filter(x=>x!==id) : [...f.agent_ids, id]
  }))

  const filtered = activities.filter(a => {
    if (tab === 'mine')    return a.assignments?.some(x => x.agent_id === user?.id) || a.my_status
    if (tab === 'overdue') return isOverdue(a)
    return true
  })
  const overdueCount = activities.filter(isOverdue).length
  const completedCount = activities.filter(a => (a.avg_completion||a.my_completion_pct||0) >= 100).length

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">✅ Activities</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAdmin ? 'Assign and track team activities' : 'Your assigned tasks and activities'}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100">
          <span className="text-base">+</span> {isAdmin ? 'Create Activity' : 'Add Activity'}
        </button>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total',     val:activities.length,  color:'#4F46E5', bg:'#EEF2FF', icon:'📋' },
          { label:'Completed', val:completedCount,     color:'#16A34A', bg:'#F0FDF4', icon:'✅' },
          { label:'Overdue',   val:overdueCount,       color:'#DC2626', bg:'#FEF2F2', icon:'⚠️' },
          { label:'In Progress',val:activities.filter(a=>{const p=a.avg_completion||a.my_completion_pct||0; return p>0&&p<100}).length, color:'#D97706', bg:'#FFFBEB', icon:'⏳' },
        ].map(({ label, val, color, bg, icon }) => (
          <div key={label} className="card p-4" style={{ borderLeft:`4px solid ${color}` }}>
            <div className="flex items-center gap-2 mb-1">
              <span>{icon}</span>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
            </div>
            <p className="text-3xl font-black" style={{ color }}>{val}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {[
          ['all',     `All (${activities.length})`],
          ['mine',    '👤 My Activities'],
          ['overdue', `⚠️ Overdue${overdueCount > 0 ? ` (${overdueCount})` : ''}`],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${tab === key
                ? key==='overdue' ? 'bg-red-500 text-white shadow-md shadow-red-100' : 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Activity Cards ── */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-slate-600 font-semibold text-lg">No activities found</p>
          <p className="text-slate-400 text-sm mt-2">
            {tab==='overdue' ? '🎉 No overdue activities — great work!' : 'Click "+ Create Activity" to get started'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(activity => {
            const overdue  = isOverdue(activity)
            const pct      = parseInt(activity.avg_completion || activity.my_completion_pct || 0)
            const myStatus = activity.my_status || 'not_started'
            const p        = PRIORITY[activity.priority] || PRIORITY.medium
            const s        = STATUS[myStatus] || STATUS.not_started
            const dl       = daysLeft(activity.due_date)

            return (
              <div key={activity.id} onClick={() => openDetail(activity)}
                className={`card p-5 cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 ${overdue ? 'border-l-4 border-red-400' : 'border-l-4 border-transparent hover:border-indigo-300'}`}>
                <div className="flex items-start gap-4">

                  {/* Progress Circle */}
                  <div className="flex-shrink-0 mt-0.5">
                    <CircleProgress pct={pct} size={56} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-bold text-slate-800 text-base">{activity.title}</h3>
                          {overdue && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">⚠️ OVERDUE</span>
                          )}
                        </div>
                        {activity.details && (
                          <p className="text-sm text-slate-400 truncate mb-2">{activity.details}</p>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Priority badge */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background:p.bg, color:p.text, border:`1px solid ${p.border}` }}>
                            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background:p.dot }} />
                            {p.label}
                          </span>
                          {/* Days left */}
                          {dl !== null && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              dl < 0 ? 'bg-red-100 text-red-600' :
                              dl === 0 ? 'bg-orange-100 text-orange-600' :
                              dl <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              📅 {dl < 0 ? `${Math.abs(dl)}d overdue` : dl === 0 ? 'Due today' : `${dl}d left`}
                            </span>
                          )}
                          <span className="text-xs text-slate-400">⏱️ {activity.expected_days}d expected</span>
                          {isAdmin && activity.total_assigned > 0 && (
                            <span className="text-xs text-slate-400">👥 {activity.total_completed}/{activity.total_assigned} done</span>
                          )}
                        </div>
                      </div>

                      {/* Right side */}
                      <div className="flex-shrink-0 flex flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
                        {/* Status badge */}
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background:s.bg, color:s.text }}>
                          {s.icon} {s.label}
                        </span>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <button onClick={() => openEdit(activity)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 text-sm transition-colors">✏️</button>
                            <button onClick={() => handleDelete(activity.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 text-sm transition-colors">🗑️</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width:`${pct}%`, background: pct>=100?'#16A34A':pct>=60?'#4F46E5':pct>=30?'#F59E0B':'#E5E7EB' }} />
                      </div>
                    </div>

                    {/* Agent avatars (admin) */}
                    {isAdmin && activity.assignments?.length > 0 && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          {activity.assignments.slice(0,5).map(a => (
                            <div key={a.agent_id} title={`${a.agent_name} — ${a.completion_pct}%`}
                              className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
                              {a.agent_name?.[0]}
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">{activity.assignments.length} assigned</span>
                        {activity.created_by_name && (
                          <span className="text-xs text-slate-300 ml-auto">by {activity.created_by_name}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════════════════════════════
           CREATE / EDIT MODAL
         ════════════════════════════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{editActivity ? '✏️ Edit Activity' : '✅ Create Activity'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Fill in details and assign to agents</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Activity Name *</label>
                <input required value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))}
                  placeholder="e.g. Call 50 leads this week"
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Details</label>
                <textarea rows={3} value={form.details} onChange={e => setForm(f=>({...f,details:e.target.value}))}
                  placeholder="Describe what needs to be done…"
                  className="input w-full resize-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Expected Days *</label>
                  <input type="number" min="1" required value={form.expected_days}
                    onChange={e => setForm(f=>({...f,expected_days:parseInt(e.target.value)||1}))}
                    className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value}))} className="input w-full">
                    <option value="low">🟢 Low</option>
                    <option value="medium">🔵 Medium</option>
                    <option value="high">🟠 High</option>
                    <option value="urgent">🔴 Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f=>({...f,due_date:e.target.value}))} className="input w-full" />
                </div>
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Assign To Agents <span className="font-normal normal-case text-slate-400">(select one or more)</span>
                  </label>
                  {agents.length === 0 ? <p className="text-sm text-slate-400">No agents found</p> : (
                    <div className="grid grid-cols-2 gap-2">
                      {agents.map(agent => {
                        const sel = form.agent_ids.includes(agent.id)
                        return (
                          <button key={agent.id} type="button" onClick={() => toggleAgent(agent.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${sel?'border-indigo-400 bg-indigo-50':'border-slate-100 hover:border-slate-200'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${sel?'bg-indigo-600':'bg-slate-300'}`}>
                              {agent.name?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${sel?'text-indigo-800':'text-slate-700'}`}>{agent.name}</p>
                              <p className="text-xs text-slate-400 truncate">{agent.email}</p>
                            </div>
                            {sel && <span className="text-indigo-500 flex-shrink-0 font-bold">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {form.agent_ids.length === 0 && (
                    <p className="text-xs text-amber-600 mt-2">⚠️ Select at least one agent</p>
                  )}
                </div>
              )}
            </form>

            <div className="flex justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving||!form.title||(isAdmin&&!form.agent_ids.length)}
                className="btn-primary flex items-center gap-2">
                {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Saving…</> : editActivity ? '💾 Save Changes' : '✅ Create & Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
           DETAIL MODAL
         ════════════════════════════════════════ */}
      {showDetail && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {(() => { const p = PRIORITY[selected.priority]||PRIORITY.medium; return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background:p.bg, color:p.text, border:`1px solid ${p.border}` }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:p.dot}} />{p.label}
                    </span>
                  )})()}
                  {isOverdue(selected) && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">⚠️ OVERDUE</span>}
                </div>
                <h2 className="font-bold text-slate-800 text-lg leading-tight">{selected.title}</h2>
              </div>
              <button onClick={() => setShowDetail(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500 flex-shrink-0">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Info grid */}
              {selected.details && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Details</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.details}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['⏱️ Expected', `${selected.expected_days} days`],
                  ['📅 Due Date', selected.due_date ? format(parseISO(selected.due_date),'dd MMM yyyy') : 'No deadline'],
                  ['👤 Created By', selected.created_by_name || 'Admin'],
                ].map(([label, val]) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                    <p className="font-semibold text-slate-800 text-sm">{val}</p>
                  </div>
                ))}
              </div>

              {/* Admin: agent progress */}
              {isAdmin && selected.assignments?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Agent Progress</p>
                  <div className="space-y-2">
                    {selected.assignments.map(a => {
                      const s = STATUS[a.status] || STATUS.not_started
                      return (
                        <div key={a.agent_id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {a.agent_name?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-sm font-semibold text-slate-800">{a.agent_name}</p>
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:s.bg,color:s.text}}>{s.icon} {s.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{width:`${a.completion_pct||0}%`,background:a.completion_pct>=100?'#16A34A':a.completion_pct>=60?'#4F46E5':'#F59E0B'}} />
                              </div>
                              <span className="text-xs font-bold text-slate-600 w-8 text-right">{a.completion_pct||0}%</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Agent: update progress */}
              {!isAdmin && (
                <div className="border-2 border-indigo-100 rounded-xl p-5 bg-indigo-50/30">
                  <p className="text-sm font-bold text-indigo-800 mb-4">📊 Update Your Progress</p>
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-600">Completion</label>
                      <span className="text-2xl font-black text-indigo-600">{progress.completion_pct}%</span>
                    </div>
                    <input type="range" min="0" max="100" step="5" value={progress.completion_pct}
                      onChange={e => {
                        const pct = parseInt(e.target.value)
                        let status = progress.status
                        if (pct===0) status='not_started'
                        else if (pct===100) status='completed'
                        else if (status==='not_started'||status==='completed') status='in_progress'
                        setProgress(f => ({...f, completion_pct:pct, status}))
                      }}
                      className="w-full accent-indigo-600" />
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                      <div className="h-full rounded-full transition-all"
                        style={{width:`${progress.completion_pct}%`,background:progress.completion_pct>=100?'#16A34A':progress.completion_pct>=60?'#4F46E5':'#F59E0B'}} />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(STATUS).map(([key, val]) => (
                        <button key={key} type="button" onClick={() => setProgress(f=>({...f,status:key}))}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${progress.status===key?'border-indigo-400 bg-indigo-50 text-indigo-700':'border-slate-100 text-slate-600 hover:border-slate-200'}`}>
                          {val.icon} {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note / Comment</label>
                    <textarea rows={2} value={progress.comment} onChange={e => setProgress(f=>({...f,comment:e.target.value}))}
                      placeholder="What did you accomplish? Any blockers?"
                      className="input w-full resize-none" />
                  </div>
                  <button onClick={saveProgress} disabled={savingProgress}
                    className="btn-primary w-full justify-center">
                    {savingProgress ? 'Saving…' : '💾 Save Progress'}
                  </button>
                </div>
              )}

              {/* Update history */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Update History</p>
                {commLoading ? (
                  <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
                ) : comments.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl">
                    <p className="text-slate-400 text-sm">No updates yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {comments.map(c => (
                      <div key={c.id} className="bg-slate-50 rounded-xl p-3 border-l-4 border-indigo-300">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700">{c.agent_name}</span>
                          <span className="text-xs text-slate-400">{format(parseISO(c.created_at),'dd MMM HH:mm')}</span>
                        </div>
                        <p className="text-sm text-slate-600">{c.comment}</p>
                        {c.completion_pct != null && (
                          <p className="text-xs text-indigo-600 mt-1 font-semibold">Progress: {c.completion_pct}%</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
