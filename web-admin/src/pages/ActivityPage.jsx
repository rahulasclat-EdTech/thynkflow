// web-admin/src/pages/ActivityPage.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO, differenceInDays } from 'date-fns'

const PRIORITY = {
  urgent: { bg:'#FFF1F2', text:'#BE123C', border:'#FECDD3', dot:'#F43F5E', label:'Urgent',  gradient:'from-rose-500 to-red-600' },
  high:   { bg:'#FFF7ED', text:'#C2410C', border:'#FED7AA', dot:'#F97316', label:'High',    gradient:'from-orange-500 to-amber-500' },
  medium: { bg:'#EFF6FF', text:'#1D4ED8', border:'#BFDBFE', dot:'#3B82F6', label:'Medium',  gradient:'from-blue-500 to-indigo-500' },
  low:    { bg:'#F9FAFB', text:'#6B7280', border:'#E5E7EB', dot:'#9CA3AF', label:'Low',     gradient:'from-slate-400 to-slate-500' },
}

const STATUS = {
  not_started: { bg:'#F8FAFC', text:'#64748B', label:'Not Started', icon:'○', bar:'#CBD5E1' },
  in_progress: { bg:'#EFF6FF', text:'#1D4ED8', label:'In Progress',  icon:'◑', bar:'#4F46E5' },
  on_hold:     { bg:'#FFFBEB', text:'#D97706', label:'On Hold',      icon:'⏸', bar:'#F59E0B' },
  completed:   { bg:'#F0FDF4', text:'#16A34A', label:'Completed',    icon:'✓', bar:'#22C55E' },
}

const PRIORITY_ORDER = { urgent:0, high:1, medium:2, low:3 }

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

// ── Mini sparkline for timeline ──────────────────────────
function Sparkline({ data, color = '#4F46E5', height = 32 }) {
  if (!data?.length) return null
  const max  = Math.max(...data, 1)
  const w    = 120
  const pts  = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = height - (v / max) * (height - 4)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`0,${height} ${pts} ${w},${height}`} fill={color} fillOpacity="0.08" stroke="none" />
    </svg>
  )
}

// ── Donut chart for overview ─────────────────────────────
function DonutChart({ segments, size = 80 }) {
  const r    = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{transform:'rotate(-90deg)'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={10} />
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circ
        const el = (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={seg.color} strokeWidth={10}
            strokeDasharray={`${dash - 1} ${circ - dash + 1}`}
            strokeDashoffset={-offset} strokeLinecap="butt" />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}

// ── Circle progress ──────────────────────────────────────
function CircleProgress({ pct, size = 56 }) {
  const r    = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const dash = (Math.min(pct, 100) / 100) * circ
  const color = pct >= 100 ? '#22C55E' : pct >= 60 ? '#4F46E5' : pct >= 30 ? '#F59E0B' : '#CBD5E1'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{transform:'rotate(-90deg)'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={5} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      <text x="50%" y="50%" textAnchor="middle" dy=".35em" fontSize={size*0.22} fontWeight="700"
        fill={color} style={{transform:'rotate(90deg)',transformOrigin:'center'}}>{pct}%</text>
    </svg>
  )
}

// ── Timeline bar chart ────────────────────────────────────
function TimelineChart({ activities }) {
  if (!activities?.length) return null
  // Group by due date week
  const now = new Date()
  const weeks = {}
  activities.forEach(a => {
    if (!a.due_date) return
    const d    = new Date(a.due_date)
    const diff = Math.floor(differenceInDays(d, now) / 7)
    const key  = diff < 0 ? 'Overdue' : diff === 0 ? 'This Week' : diff === 1 ? 'Next Week' : `+${diff}w`
    if (!weeks[key]) weeks[key] = { total:0, done:0, overdue: diff < 0 }
    weeks[key].total++
    const pct = parseInt(a.avg_completion || a.my_completion_pct || 0)
    if (pct >= 100) weeks[key].done++
  })

  const entries = Object.entries(weeks).sort((a, b) => {
    const order = { 'Overdue':-1, 'This Week':0, 'Next Week':1 }
    return (order[a[0]] ?? parseInt(a[0])) - (order[b[0]] ?? parseInt(b[0]))
  })

  const maxTotal = Math.max(...entries.map(([,v]) => v.total), 1)

  return (
    <div className="card p-5">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span>📅</span> Activity Timeline
        <span className="text-xs font-normal text-slate-400 ml-1">by due date</span>
      </h3>
      <div className="space-y-3">
        {entries.map(([label, data]) => {
          const donePct  = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0
          const barColor = data.overdue ? '#EF4444' : donePct === 100 ? '#22C55E' : '#4F46E5'
          const barW     = Math.round((data.total / maxTotal) * 100)
          return (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-20 text-right text-xs font-semibold flex-shrink-0 ${data.overdue ? 'text-red-500' : 'text-slate-600'}`}>
                {label}
              </div>
              <div className="flex-1 relative h-7 bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
                <div className="h-full rounded-lg transition-all duration-700 flex items-center px-2"
                  style={{ width:`${barW}%`, background:`${barColor}20`, borderRight:`2px solid ${barColor}` }}>
                </div>
                <div className="absolute inset-0 flex items-center px-3 gap-2">
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width:`${donePct}%`, background:barColor }} />
                  </div>
                  <span className="text-xs font-bold flex-shrink-0" style={{ color:barColor }}>{donePct}%</span>
                </div>
              </div>
              <div className="w-14 text-xs text-slate-500 flex-shrink-0">
                {data.done}/{data.total} done
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100">
        {[
          { color:'#EF4444', label:'Overdue' },
          { color:'#4F46E5', label:'In Progress' },
          { color:'#22C55E', label:'Completed' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background:color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Priority distribution chart ───────────────────────────
function PriorityChart({ activities }) {
  const counts = { urgent:0, high:0, medium:0, low:0 }
  activities.forEach(a => { if (counts[a.priority] !== undefined) counts[a.priority]++ })
  const total = Object.values(counts).reduce((s,v)=>s+v,0) || 1
  const segments = Object.entries(counts).map(([k,v]) => ({ value:v, color:PRIORITY[k].dot, label:PRIORITY[k].label }))
  return (
    <div className="card p-5">
      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><span>🎯</span> By Priority</h3>
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <DonutChart segments={segments} size={80} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-slate-700">{total}</span>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          {Object.entries(counts).map(([k, v]) => {
            const p = PRIORITY[k]
            return (
              <div key={k} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:p.dot }} />
                <span className="text-xs text-slate-600 flex-1">{p.label}</span>
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width:`${(v/total)*100}%`, background:p.dot }} />
                </div>
                <span className="text-xs font-bold text-slate-700 w-4 text-right">{v}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function ActivityPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [activities, setActivities] = useState([])
  const [agents, setAgents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('all')
  const [sortBy, setSortBy]         = useState('priority') // priority | dueDate | progress
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
  const [showCharts, setShowCharts] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [aR, uR] = await Promise.all([
        api.get('/activities'),
        isAdmin ? api.get('/users') : Promise.resolve({ data:[] }),
      ])
      const acts = aR?.data || aR || []
      setActivities(Array.isArray(acts) ? acts : [])
      const uList = uR?.data || uR || []
      setAgents(Array.isArray(uList) ? uList.filter(u=>['agent','admin'].includes(u.role_name)) : [])
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [isAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { const t=setInterval(fetchAll,45000); return ()=>clearInterval(t) }, [fetchAll])

  const fetchComments = async (id) => {
    setCommLoading(true)
    try { const r=await api.get(`/activities/${id}/comments`); setComments(r?.data||[]) }
    catch {} finally { setCommLoading(false) }
  }

  const openDetail = (a) => {
    setSelected(a)
    const mine = a.assignments?.find(x=>x.agent_id===user?.id)
    setProgress({ completion_pct:mine?.completion_pct||a.my_completion_pct||0, status:mine?.status||a.my_status||'not_started', comment:'' })
    setShowDetail(true); fetchComments(a.id)
  }

  const openCreate = () => { setEditActivity(null); setForm(emptyForm); setShowCreate(true) }
  const openEdit = (a) => {
    setEditActivity(a)
    setForm({ title:a.title, details:a.details||'', expected_days:a.expected_days,
      due_date:a.due_date?a.due_date.split('T')[0]:'', priority:a.priority,
      agent_ids:a.assignments?.map(x=>x.agent_id)||[] })
    setShowCreate(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title required')
    setSaving(true)
    try {
      const payload = { ...form, agent_ids:form.agent_ids.length?form.agent_ids:[user.id] }
      if (editActivity) {
        await api.put(`/activities/${editActivity.id}`, payload)
        if (form.agent_ids.length) await api.post(`/activities/${editActivity.id}/assign`,{agent_ids:form.agent_ids}).catch(()=>{})
        toast.success('Updated')
      } else { await api.post('/activities', payload); toast.success('Created & assigned!') }
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
    try { await api.patch(`/activities/${selected.id}/progress`, progress); toast.success('Saved!'); setShowDetail(false); fetchAll() }
    catch (err) { toast.error(err.message||'Failed') }
    finally { setSavingProgress(false) }
  }

  const toggleAgent = (id) => setForm(f => ({
    ...f, agent_ids:f.agent_ids.includes(id)?f.agent_ids.filter(x=>x!==id):[...f.agent_ids,id]
  }))

  const overdueCount   = activities.filter(isOverdue).length
  const completedCount = activities.filter(a=>parseInt(a.avg_completion||a.my_completion_pct||0)>=100).length
  const inProgressCount= activities.filter(a=>{const p=parseInt(a.avg_completion||a.my_completion_pct||0);return p>0&&p<100}).length

  const filtered = activities
    .filter(a => {
      if (tab==='mine')    return a.assignments?.some(x=>x.agent_id===user?.id)||a.my_status
      if (tab==='overdue') return isOverdue(a)
      return true
    })
    .sort((a, b) => {
      if (sortBy==='priority') return (PRIORITY_ORDER[a.priority]??2)-(PRIORITY_ORDER[b.priority]??2)
      if (sortBy==='dueDate')  return new Date(a.due_date||'9999')-new Date(b.due_date||'9999')
      if (sortBy==='progress') return parseInt(b.avg_completion||b.my_completion_pct||0)-parseInt(a.avg_completion||a.my_completion_pct||0)
      return 0
    })

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">✅ Activities</h1>
          <p className="text-slate-500 text-sm mt-0.5">{isAdmin?'Assign and track team activities':'Your assigned tasks and activities'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCharts(!showCharts)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">
            {showCharts ? '📊 Hide Charts' : '📊 Show Charts'}
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100">
            + {isAdmin?'Create Activity':'Add Activity'}
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total',       val:activities.length,  color:'#4F46E5', bg:'#EEF2FF', icon:'📋', sub:'activities' },
          { label:'Completed',   val:completedCount,     color:'#16A34A', bg:'#F0FDF4', icon:'✅', sub:'finished' },
          { label:'In Progress', val:inProgressCount,    color:'#D97706', bg:'#FFFBEB', icon:'⏳', sub:'ongoing' },
          { label:'Overdue',     val:overdueCount,       color:'#DC2626', bg:'#FEF2F2', icon:'⚠️', sub:'need attention' },
        ].map(({ label, val, color, bg, icon, sub }) => (
          <div key={label} className="card p-4 hover:shadow-md transition-shadow" style={{ borderTop:`3px solid ${color}` }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                <p className="text-3xl font-black mt-1" style={{ color }}>{val}</p>
                <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background:bg }}>
                {icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts ── */}
      {showCharts && activities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <TimelineChart activities={activities} />
          </div>
          <PriorityChart activities={activities} />
        </div>
      )}

      {/* ── Tabs + Sort ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {[
            ['all',     `All (${activities.length})`],
            ['mine',    '👤 Mine'],
            ['overdue', `⚠️ Overdue${overdueCount>0?` (${overdueCount})`:''}`],
          ].map(([key,label]) => (
            <button key={key} onClick={()=>setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
                ${tab===key
                  ? key==='overdue'?'bg-red-500 text-white shadow-md shadow-red-100':'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Sort:</span>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white">
            <option value="priority">Priority</option>
            <option value="dueDate">Due Date</option>
            <option value="progress">Progress</option>
          </select>
        </div>
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
          <p className="text-slate-400 text-sm mt-2">{tab==='overdue'?'🎉 No overdue activities!':'Click "+ Create Activity" to get started'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(activity => {
            const overdue  = isOverdue(activity)
            const pct      = parseInt(activity.avg_completion||activity.my_completion_pct||0)
            const myStatus = activity.my_status||'not_started'
            const p        = PRIORITY[activity.priority]||PRIORITY.medium
            const s        = STATUS[myStatus]||STATUS.not_started
            const dl       = daysLeft(activity.due_date)
            const barColor = pct>=100?'#22C55E':pct>=60?'#4F46E5':pct>=30?'#F59E0B':'#CBD5E1'

            return (
              <div key={activity.id} onClick={()=>openDetail(activity)}
                className={`bg-white rounded-2xl border cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 overflow-hidden
                  ${overdue?'border-red-200':'border-slate-100 hover:border-indigo-200'}`}>

                {/* Top color strip based on priority */}
                <div className={`h-1 w-full bg-gradient-to-r ${p.gradient}`} />

                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Circle */}
                    <div className="flex-shrink-0 mt-0.5"><CircleProgress pct={pct} size={58} /></div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-bold text-slate-800">{activity.title}</h3>
                            {overdue && <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full animate-pulse">⚠️ OVERDUE</span>}
                          </div>
                          {activity.details && <p className="text-sm text-slate-400 truncate">{activity.details}</p>}
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end gap-1.5" onClick={e=>e.stopPropagation()}>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:s.bg,color:s.text}}>
                            {s.icon} {s.label}
                          </span>
                          {isAdmin && (
                            <div className="flex gap-1">
                              <button onClick={()=>openEdit(activity)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors">✏️</button>
                              <button onClick={()=>handleDelete(activity.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">🗑️</button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tags row */}
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{background:p.bg,color:p.text,border:`1px solid ${p.border}`}}>
                          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{background:p.dot}} />{p.label}
                        </span>
                        {dl !== null && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            dl<0?'bg-red-100 text-red-600':dl===0?'bg-orange-100 text-orange-600':dl<=3?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-500'}`}>
                            📅 {dl<0?`${Math.abs(dl)}d overdue`:dl===0?'Due today':`${dl}d left`}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">⏱️ {activity.expected_days}d</span>
                        {isAdmin && activity.total_assigned>0 && (
                          <span className="text-xs text-slate-400">👥 {activity.total_completed}/{activity.total_assigned} done</span>
                        )}
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{width:`${pct}%`,background:barColor}} />
                        </div>
                        <span className="text-xs font-bold text-slate-500 w-8 text-right">{pct}%</span>
                      </div>

                      {/* Agent avatars */}
                      {isAdmin && activity.assignments?.length>0 && (
                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="flex -space-x-1.5">
                            {activity.assignments.slice(0,6).map(a => (
                              <div key={a.agent_id} title={`${a.agent_name} — ${a.completion_pct}%`}
                                className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                                style={{background: a.completion_pct>=100?'#22C55E':'#4F46E5'}}>
                                {a.agent_name?.[0]}
                              </div>
                            ))}
                            {activity.assignments.length>6 && (
                              <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-500 text-xs font-bold">
                                +{activity.assignments.length-6}
                              </div>
                            )}
                          </div>
                          {activity.created_by_name && (
                            <span className="text-xs text-slate-300">by {activity.created_by_name}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ════════════════ CREATE / EDIT MODAL ════════════════ */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{editActivity?'✏️ Edit Activity':'✅ Create Activity'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Fill in details and assign to agents</p>
              </div>
              <button onClick={()=>setShowCreate(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Activity Name *</label>
                <input required value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
                  placeholder="e.g. Call 50 leads this week" className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Details</label>
                <textarea rows={3} value={form.details} onChange={e=>setForm(f=>({...f,details:e.target.value}))}
                  placeholder="Describe what needs to be done…" className="input w-full resize-none" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Expected Days *</label>
                  <input type="number" min="1" required value={form.expected_days}
                    onChange={e=>setForm(f=>({...f,expected_days:parseInt(e.target.value)||1}))} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Priority</label>
                  <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} className="input w-full">
                    <option value="low">🟢 Low</option>
                    <option value="medium">🔵 Medium</option>
                    <option value="high">🟠 High</option>
                    <option value="urgent">🔴 Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e=>setForm(f=>({...f,due_date:e.target.value}))} className="input w-full" />
                </div>
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Assign To <span className="font-normal normal-case text-slate-400">(select one or more)</span>
                  </label>
                  {agents.length===0 ? <p className="text-sm text-slate-400">No agents found</p> : (
                    <div className="grid grid-cols-2 gap-2">
                      {agents.map(agent => {
                        const sel = form.agent_ids.includes(agent.id)
                        return (
                          <button key={agent.id} type="button" onClick={()=>toggleAgent(agent.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${sel?'border-indigo-400 bg-indigo-50':'border-slate-100 hover:border-slate-200'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${sel?'bg-indigo-600':'bg-slate-300'}`}>
                              {agent.name?.[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${sel?'text-indigo-800':'text-slate-700'}`}>{agent.name}</p>
                              <p className="text-xs text-slate-400 truncate">{agent.email}</p>
                            </div>
                            {sel && <span className="text-indigo-500 font-bold">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {form.agent_ids.length===0 && <p className="text-xs text-amber-600 mt-2">⚠️ Select at least one agent</p>}
                </div>
              )}
            </form>
            <div className="flex justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={()=>setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving||!form.title||(isAdmin&&!form.agent_ids.length)} className="btn-primary flex items-center gap-2">
                {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Saving…</>:editActivity?'💾 Save Changes':'✅ Create & Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ DETAIL MODAL ════════════════ */}
      {showDetail && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header with gradient */}
            <div className={`bg-gradient-to-r ${PRIORITY[selected.priority]?.gradient||'from-indigo-500 to-indigo-600'} px-6 py-4 rounded-t-2xl`}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-white/20 text-white text-xs font-bold rounded-full">
                      {PRIORITY[selected.priority]?.label||'Medium'}
                    </span>
                    {isOverdue(selected) && <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">⚠️ OVERDUE</span>}
                  </div>
                  <h2 className="font-bold text-white text-lg leading-tight">{selected.title}</h2>
                </div>
                <button onClick={()=>setShowDetail(false)} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 text-white flex-shrink-0">✕</button>
              </div>
              {/* Progress in header */}
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white rounded-full transition-all"
                    style={{width:`${parseInt(selected.avg_completion||selected.my_completion_pct||0)}%`}} />
                </div>
                <span className="text-white font-bold text-sm">{parseInt(selected.avg_completion||selected.my_completion_pct||0)}%</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {selected.details && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Details</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.details}</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['⏱️ Expected', `${selected.expected_days} days`],
                  ['📅 Due Date', selected.due_date?format(parseISO(selected.due_date),'dd MMM yyyy'):'No deadline'],
                  ['👤 Created By', selected.created_by_name||'Admin'],
                ].map(([label,val]) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                    <p className="font-semibold text-slate-800 text-sm">{val}</p>
                  </div>
                ))}
              </div>

              {isAdmin && selected.assignments?.length>0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Agent Progress</p>
                  <div className="space-y-2">
                    {selected.assignments.map(a => {
                      const s = STATUS[a.status]||STATUS.not_started
                      return (
                        <div key={a.agent_id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                            style={{background:a.completion_pct>=100?'#22C55E':'#4F46E5'}}>
                            {a.agent_name?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-sm font-semibold text-slate-800">{a.agent_name}</p>
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:s.bg,color:s.text}}>{s.icon} {s.label}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{width:`${a.completion_pct||0}%`,background:s.bar}} />
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
                        const pct=parseInt(e.target.value)
                        let status=progress.status
                        if(pct===0)status='not_started'
                        else if(pct===100)status='completed'
                        else if(status==='not_started'||status==='completed')status='in_progress'
                        setProgress(f=>({...f,completion_pct:pct,status}))
                      }} className="w-full accent-indigo-600" />
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                      <div className="h-full rounded-full transition-all"
                        style={{width:`${progress.completion_pct}%`,background:progress.completion_pct>=100?'#22C55E':progress.completion_pct>=60?'#4F46E5':'#F59E0B'}} />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(STATUS).map(([key,val]) => (
                        <button key={key} type="button" onClick={()=>setProgress(f=>({...f,status:key}))}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${progress.status===key?'border-indigo-400 bg-indigo-50 text-indigo-700':'border-slate-100 text-slate-600 hover:border-slate-200'}`}>
                          {val.icon} {val.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Note</label>
                    <textarea rows={2} value={progress.comment} onChange={e=>setProgress(f=>({...f,comment:e.target.value}))}
                      placeholder="What did you accomplish? Any blockers?" className="input w-full resize-none" />
                  </div>
                  <button onClick={saveProgress} disabled={savingProgress} className="btn-primary w-full justify-center">
                    {savingProgress?'Saving…':'💾 Save Progress'}
                  </button>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Update History</p>
                {commLoading ? <p className="text-sm text-slate-400 text-center py-4">Loading…</p>
                : comments.length===0 ? (
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
                        {c.completion_pct!=null && <p className="text-xs text-indigo-600 mt-1 font-semibold">Progress: {c.completion_pct}%</p>}
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
