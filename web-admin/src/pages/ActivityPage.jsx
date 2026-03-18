// =============================================================
//  ThynkFlow — ActivityPage.jsx  (NEW PAGE)
//  web-admin/src/pages/ActivityPage.jsx
//
//  ADD TO App.jsx:
//    import ActivityPage from './pages/ActivityPage'
//    <Route path="activities" element={<ActivityPage />} />
//
//  ADD TO Layout.jsx sidebar:
//    { name: 'Activities', path: '/activities', icon: '✅' }
// =============================================================

import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO, differenceInDays } from 'date-fns'

// ── constants ─────────────────────────────────────────────
const PRIORITY_COLORS = {
  urgent: { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300',    dot: 'bg-red-500' },
  high:   { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', dot: 'bg-orange-500' },
  medium: { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-300',   dot: 'bg-blue-500' },
  low:    { bg: 'bg-gray-100',   text: 'text-gray-600',   border: 'border-gray-200',   dot: 'bg-gray-400' },
}

const STATUS_COLORS = {
  not_started: { bg: 'bg-gray-100',   text: 'text-gray-600',   label: 'Not Started' },
  in_progress: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'In Progress' },
  on_hold:     { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'On Hold' },
  completed:   { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Completed' },
}

// ── small components ──────────────────────────────────────
function PriorityBadge({ priority }) {
  const c = PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>
      {priority?.charAt(0).toUpperCase() + priority?.slice(1)}
    </span>
  )
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.not_started
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

function ProgressBar({ pct, showLabel = true }) {
  const color = pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct || 0}%` }} />
      </div>
      {showLabel && <span className="text-xs font-bold text-gray-600 w-8 text-right">{pct || 0}%</span>}
    </div>
  )
}

function isOverdue(activity) {
  if (!activity.due_date) return false
  const status = activity.my_status || activity.status
  if (status === 'completed') return false
  return differenceInDays(new Date(), new Date(activity.due_date)) > 0
}

// ══════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════
export default function ActivityPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [activities, setActivities]   = useState([])
  const [agents, setAgents]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [tab, setTab]                 = useState('all') // all | mine | overdue

  // modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [comments, setComments]       = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)

  // create form
  const emptyForm = { title: '', details: '', expected_days: 7, due_date: '',
                      priority: 'medium', agent_ids: [] }
  const [form, setForm]               = useState(emptyForm)
  const [saving, setSaving]           = useState(false)
  const [editActivity, setEditActivity] = useState(null)

  // progress update
  const [progressForm, setProgressForm] = useState({ completion_pct: 0, status: 'not_started', comment: '' })
  const [savingProgress, setSavingProgress] = useState(false)

  // ── fetch ───────────────────────────────────────────────
  const fetchActivities = useCallback(async () => {
    setLoading(true)
    try {
      const [actRes, agentRes] = await Promise.all([
        api.get('/activities'),
        isAdmin ? api.get('/users?role=agent') : Promise.resolve({ data: [] }),
      ])
      setActivities(actRes.data?.data || actRes.data || [])
      setAgents(Array.isArray(agentRes.data) ? agentRes.data : agentRes.data?.data || [])
    } catch (err) {
      toast.error('Failed to load activities')
    } finally { setLoading(false) }
  }, [isAdmin])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  const fetchComments = async (activityId) => {
    setCommentsLoading(true)
    try {
      const res = await api.get(`/activities/${activityId}/comments`)
      setComments(res.data?.data || [])
    } catch {} finally { setCommentsLoading(false) }
  }

  // ── open detail ────────────────────────────────────────
  const openDetail = (activity) => {
    setSelectedActivity(activity)
    const myAssignment = activity.assignments?.find(a => a.agent_id === user?.id)
    setProgressForm({
      completion_pct: myAssignment?.completion_pct || activity.my_completion_pct || 0,
      status:         myAssignment?.status         || activity.my_status         || 'not_started',
      comment: ''
    })
    setShowDetailModal(true)
    fetchComments(activity.id)
  }

  // ── create / edit ──────────────────────────────────────
  const openCreate = () => {
    setEditActivity(null)
    setForm(emptyForm)
    setShowCreateModal(true)
  }

  const openEdit = (activity) => {
    setEditActivity(activity)
    setForm({
      title:         activity.title,
      details:       activity.details || '',
      expected_days: activity.expected_days,
      due_date:      activity.due_date ? activity.due_date.split('T')[0] : '',
      priority:      activity.priority,
      agent_ids:     activity.assignments?.map(a => a.agent_id) || [],
    })
    setShowCreateModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    if (!isAdmin && !form.agent_ids.length) {
      setForm(f => ({ ...f, agent_ids: [user.id] }))
    }
    setSaving(true)
    try {
      if (editActivity) {
        await api.put(`/activities/${editActivity.id}`, form)
        // update assignments if changed
        if (form.agent_ids.length) {
          await api.post(`/activities/${editActivity.id}/assign`, { agent_ids: form.agent_ids }).catch(() => {})
        }
        toast.success('Activity updated')
      } else {
        const payload = { ...form, agent_ids: form.agent_ids.length ? form.agent_ids : [user.id] }
        await api.post('/activities', payload)
        toast.success('Activity created & assigned!')
      }
      setShowCreateModal(false)
      setForm(emptyForm)
      fetchActivities()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this activity?')) return
    try {
      await api.delete(`/activities/${id}`)
      toast.success('Deleted')
      fetchActivities()
    } catch (err) { toast.error(err.message) }
  }

  // ── progress update ────────────────────────────────────
  const saveProgress = async () => {
    if (!selectedActivity) return
    setSavingProgress(true)
    try {
      await api.patch(`/activities/${selectedActivity.id}/progress`, progressForm)
      toast.success('Progress updated!')
      setShowDetailModal(false)
      fetchActivities()
    } catch (err) {
      toast.error(err.message || 'Failed to update')
    } finally { setSavingProgress(false) }
  }

  // ── toggle agent selection ─────────────────────────────
  const toggleAgent = (agentId) => {
    setForm(f => ({
      ...f,
      agent_ids: f.agent_ids.includes(agentId)
        ? f.agent_ids.filter(id => id !== agentId)
        : [...f.agent_ids, agentId]
    }))
  }

  // ── filter ─────────────────────────────────────────────
  const filtered = activities.filter(a => {
    if (tab === 'mine')    return a.assignments?.some(x => x.agent_id === user?.id) || a.my_status
    if (tab === 'overdue') return isOverdue(a)
    return true
  })

  const overdueCount = activities.filter(isOverdue).length

  // ══════════════════════════════════════════════════════
  return (
    <div className="p-4 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">✅ Activities</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? 'Assign and track team activities' : 'Your assigned tasks and activities'}
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-200">
          + {isAdmin ? 'Create Activity' : 'Add Activity'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          ['all',     `All (${activities.length})`],
          ['mine',    'My Activities'],
          ['overdue', `⚠️ Overdue${overdueCount > 0 ? ` (${overdueCount})` : ''}`],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all
              ${tab === key
                ? key === 'overdue' ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Activity List */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading activities…</div>
      ) : !filtered.length ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-3">📋</p>
          <p className="text-gray-500 font-medium">No activities found</p>
          <p className="text-gray-400 text-sm mt-1">
            {tab === 'overdue' ? 'No overdue activities — great!' : 'Click "+ Create Activity" to get started'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(activity => {
            const overdue  = isOverdue(activity)
            const avgPct   = parseInt(activity.avg_completion || activity.my_completion_pct || 0)
            const myStatus = activity.my_status || 'not_started'

            return (
              <div key={activity.id}
                className={`bg-white rounded-2xl border-2 p-5 cursor-pointer hover:shadow-md transition-all
                  ${overdue ? 'border-red-200 bg-red-50/30' : 'border-gray-100 hover:border-indigo-200'}`}
                onClick={() => openDetail(activity)}>

                <div className="flex items-start gap-4">
                  {/* Left: progress circle */}
                  <div className="flex-shrink-0">
                    <div className="relative w-14 h-14">
                      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                        <circle cx="28" cy="28" r="22" fill="none" stroke="#E5E7EB" strokeWidth="4" />
                        <circle cx="28" cy="28" r="22" fill="none"
                          stroke={avgPct === 100 ? '#16A34A' : avgPct >= 60 ? '#4F46E5' : avgPct >= 30 ? '#F59E0B' : '#E5E7EB'}
                          strokeWidth="4"
                          strokeDasharray={`${(avgPct / 100) * 138.2} 138.2`}
                          strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                        {avgPct}%
                      </span>
                    </div>
                  </div>

                  {/* Middle: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-bold text-gray-900 text-base">{activity.title}</h3>
                      <PriorityBadge priority={activity.priority} />
                      {overdue && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">⚠️ OVERDUE</span>}
                    </div>

                    {activity.details && (
                      <p className="text-sm text-gray-500 truncate mb-2">{activity.details}</p>
                    )}

                    <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
                      <span>⏱️ {activity.expected_days} day{activity.expected_days !== 1 ? 's' : ''}</span>
                      {activity.due_date && (
                        <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                          📅 Due {format(parseISO(activity.due_date), 'dd MMM yyyy')}
                        </span>
                      )}
                      <span>👤 by {activity.created_by_name || 'Admin'}</span>
                      {isAdmin && activity.total_assigned > 0 && (
                        <span>👥 {activity.total_completed}/{activity.total_assigned} completed</span>
                      )}
                    </div>
                  </div>

                  {/* Right: status + actions */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-2" onClick={e => e.stopPropagation()}>
                    <StatusBadge status={isAdmin ? undefined : myStatus} />
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(activity)}
                          className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500 text-sm">✏️</button>
                        <button onClick={() => handleDelete(activity.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 text-sm">🗑️</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3">
                  <ProgressBar pct={avgPct} />
                </div>

                {/* Agent avatars (admin view) */}
                {isAdmin && activity.assignments?.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {activity.assignments.slice(0, 5).map(a => (
                        <div key={a.agent_id}
                          className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                          title={`${a.agent_name} — ${a.completion_pct}%`}>
                          {a.agent_name?.charAt(0)}
                        </div>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">
                      {activity.assignments.length} agent{activity.assignments.length !== 1 ? 's' : ''} assigned
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
           CREATE / EDIT MODAL
         ══════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

            <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <h2 className="text-lg font-bold text-white">{editActivity ? 'Edit Activity' : 'Create New Activity'}</h2>
                  <p className="text-indigo-200 text-xs">Fill in details and assign to agents</p>
                </div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-lg hover:bg-white/20 text-white text-xl">✕</button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Activity Name *
                </label>
                <input
                  required
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Call 50 leads this week"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>

              {/* Details */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Activity Details
                </label>
                <textarea
                  rows={3}
                  value={form.details}
                  onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
                  placeholder="Describe what needs to be done, any specific instructions…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
              </div>

              {/* Expected days + Priority + Due date */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Expected Days *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={form.expected_days}
                    onChange={e => setForm(f => ({ ...f, expected_days: parseInt(e.target.value) || 1 }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Priority</label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="low">🟢 Low</option>
                    <option value="medium">🔵 Medium</option>
                    <option value="high">🟠 High</option>
                    <option value="urgent">🔴 Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>

              {/* Assign to agents (admin) */}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Assign To Agents <span className="text-gray-300 font-normal normal-case">(select one or more)</span>
                  </label>
                  {agents.length === 0 ? (
                    <p className="text-sm text-gray-400">No agents found</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {agents.map(agent => {
                        const selected = form.agent_ids.includes(agent.id)
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => toggleAgent(agent.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all
                              ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0
                              ${selected ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                              {agent.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className={`text-sm font-semibold truncate ${selected ? 'text-indigo-900' : 'text-gray-700'}`}>
                                {agent.name}
                              </p>
                              <p className="text-xs text-gray-400 truncate">{agent.email}</p>
                            </div>
                            {selected && <span className="ml-auto text-indigo-500 flex-shrink-0">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {form.agent_ids.length === 0 && (
                    <p className="text-xs text-amber-600 mt-2">⚠️ Select at least one agent to assign</p>
                  )}
                </div>
              )}

              {/* Preview */}
              {form.title && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-indigo-500 uppercase mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{form.title}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span>⏱️ {form.expected_days} days</span>
                        {form.due_date && <span>📅 Due {format(new Date(form.due_date), 'dd MMM yyyy')}</span>}
                        {form.agent_ids.length > 0 && (
                          <span>👥 {form.agent_ids.length} agent{form.agent_ids.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                    <PriorityBadge priority={form.priority} />
                  </div>
                </div>
              )}
            </form>

            <div className="flex justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              <button onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.title || (isAdmin && !form.agent_ids.length)}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
                {saving
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Saving…</>
                  : editActivity ? '💾 Save Changes' : '✅ Create & Assign'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
           DETAIL / PROGRESS MODAL
         ══════════════════════════════════════════════════ */}
      {showDetailModal && selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-3">
                <PriorityBadge priority={selectedActivity.priority} />
                <h2 className="font-bold text-gray-900 text-lg">{selectedActivity.title}</h2>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-2 rounded-lg hover:bg-gray-100 text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Activity info */}
              {selectedActivity.details && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Details</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedActivity.details}</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Expected', `${selectedActivity.expected_days} days`],
                  ['Due Date', selectedActivity.due_date ? format(parseISO(selectedActivity.due_date), 'dd MMM yyyy') : 'No deadline'],
                  ['Created By', selectedActivity.created_by_name || 'Admin'],
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="font-semibold text-gray-800 text-sm mt-0.5">{val}</p>
                  </div>
                ))}
              </div>

              {/* Admin: see all agent progress */}
              {isAdmin && selectedActivity.assignments?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase mb-2">Agent Progress</p>
                  <div className="space-y-2">
                    {selectedActivity.assignments.map(a => (
                      <div key={a.agent_id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                        <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                          {a.agent_name?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-gray-800">{a.agent_name}</p>
                            <StatusBadge status={a.status} />
                          </div>
                          <ProgressBar pct={a.completion_pct} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent: update own progress */}
              {!isAdmin && (
                <div className="border-2 border-indigo-100 rounded-xl p-5 bg-indigo-50/30">
                  <p className="text-sm font-bold text-indigo-800 mb-4">📊 Update Your Progress</p>

                  {/* % slider */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-semibold text-gray-600">Completion</label>
                      <span className="text-2xl font-black text-indigo-600">{progressForm.completion_pct}%</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100" step="5"
                      value={progressForm.completion_pct}
                      onChange={e => {
                        const pct = parseInt(e.target.value)
                        let status = progressForm.status
                        if (pct === 0)   status = 'not_started'
                        else if (pct === 100) status = 'completed'
                        else if (status === 'not_started' || status === 'completed') status = 'in_progress'
                        setProgressForm(f => ({ ...f, completion_pct: pct, status }))
                      }}
                      className="w-full accent-indigo-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                    </div>
                    <ProgressBar pct={progressForm.completion_pct} showLabel={false} />
                  </div>

                  {/* Status */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-2">Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(STATUS_COLORS).map(([key, val]) => (
                        <button key={key} type="button"
                          onClick={() => setProgressForm(f => ({ ...f, status: key }))}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all
                            ${progressForm.status === key
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                              : 'border-gray-100 text-gray-600 hover:border-gray-200'}`}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Comment */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Add Note / Comment</label>
                    <textarea
                      rows={2}
                      value={progressForm.comment}
                      onChange={e => setProgressForm(f => ({ ...f, comment: e.target.value }))}
                      placeholder="What did you accomplish? Any blockers?"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
                  </div>

                  <button onClick={saveProgress} disabled={savingProgress}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                    {savingProgress ? 'Saving…' : '💾 Save Progress'}
                  </button>
                </div>
              )}

              {/* Comments / history */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Update History</p>
                {commentsLoading ? (
                  <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
                ) : comments.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-xl">No updates yet</p>
                ) : (
                  <div className="space-y-2">
                    {comments.map(c => (
                      <div key={c.id} className="bg-gray-50 rounded-xl p-3 border-l-4 border-indigo-300">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-gray-700">{c.agent_name}</span>
                          <span className="text-xs text-gray-400">{format(parseISO(c.created_at), 'dd MMM HH:mm')}</span>
                        </div>
                        <p className="text-sm text-gray-600">{c.comment}</p>
                        {c.completion_pct !== null && (
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
