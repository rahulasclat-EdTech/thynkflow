// web-admin/src/pages/FollowUpsPage.jsx
import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  new:            { bg: '#dbeafe', text: '#1e40af' },
  hot:            { bg: '#fee2e2', text: '#991b1b' },
  warm:           { bg: '#fef3c7', text: '#92400e' },
  cold:           { bg: '#e2e8f0', text: '#475569' },
  converted:      { bg: '#dcfce7', text: '#14532d' },
  not_interested: { bg: '#f1f5f9', text: '#64748b' },
  call_back:      { bg: '#ede9fe', text: '#5b21b6' },
}
const ALL_STATUSES = Object.keys(STATUS_COLORS)

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#f1f5f9', text: '#64748b' }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: c.bg, color: c.text }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

function formatDate(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd MMM yyyy') } catch { return String(d) }
}

function daysOverdue(d) {
  if (!d) return 0
  return Math.floor((new Date() - new Date(d)) / 86400000)
}

function UpdateModal({ followup, onClose, onSave }) {
  const [newStatus, setNewStatus]   = useState(followup.lead_status || 'new')
  const [discussion, setDiscussion] = useState('')
  const [nextDate, setNextDate]     = useState('')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    if (!discussion.trim()) return toast.error('Add call notes')
    setSaving(true)
    try {
      await api.post(`/leads/${followup.lead_id}/communications`, {
        type: 'call', direction: 'outbound', note: discussion
      })
      await api.patch(`/leads/${followup.lead_id}/status`, { status: newStatus })
      if (nextDate) {
        await api.post('/followups', {
          lead_id: followup.lead_id,
          follow_up_date: nextDate,
          notes: discussion
        }).catch(e => console.warn('Schedule followup failed:', e.message))
      }
      toast.success('Follow-up updated')
      onSave()
    } catch (err) {
      toast.error(err?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Update Follow-up</h3>
            <p className="text-sm text-slate-500">{followup.lead_name} · {followup.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">📝 Call Notes *</label>
            <textarea value={discussion} onChange={e => setDiscussion(e.target.value)}
              rows={3} placeholder="What was discussed on the call?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">📊 Update Status</label>
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map(s => {
                const c = STATUS_COLORS[s]
                const active = newStatus === s
                return (
                  <button key={s} onClick={() => setNewStatus(s)}
                    className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                    style={{ background: active ? c.text : c.bg, color: active ? '#fff' : c.text }}>
                    {s.replace(/_/g, ' ')}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">📅 Next Follow-up Date</label>
            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon, color, items, onUpdate, isAdmin }) {
  const [expanded, setExpanded] = useState(true)
  if (!items) return null

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: color }}>
            {items.length}
          </span>
        </div>
        <span className="text-slate-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        items.length === 0 ? (
          <div className="px-5 pb-5 text-center text-slate-400 text-sm py-8">
            <p className="text-3xl mb-2">🎉</p>
            <p>No follow-ups in this section</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-t border-slate-100">
                <tr>
                  {['Name / School', 'Phone', isAdmin && 'Agent', 'Product', 'Status', 'Follow-up Date', 'Notes', 'Actions']
                    .filter(Boolean).map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, i) => {
                  const overdue = item.followup_type === 'overdue'
                  const days = overdue ? daysOverdue(item.follow_up_date) : 0
                  return (
                    <tr key={item.lead_id || i} className={`hover:bg-slate-50 ${overdue ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3 font-medium max-w-[160px]">
                        <p className="truncate">{item.lead_name || item.contact_name || '—'}</p>
                        {item.school_name && item.school_name !== item.lead_name && (
                          <p className="text-xs text-slate-400 truncate">{item.school_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-blue-600 whitespace-nowrap">
                        <a href={`tel:${item.phone}`} className="hover:underline">{item.phone || '—'}</a>
                      </td>
                      {isAdmin && <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{item.agent_name || '—'}</td>}
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{item.product_name || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={item.lead_status} /></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs font-semibold ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                          {formatDate(item.follow_up_date)}
                          {overdue && days > 0 && <span className="ml-1 text-red-500">({days}d overdue ⚠️)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px]">
                        <span className="truncate block">{item.notes || '—'}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-2">
                          <a href={`tel:${item.phone}`}
                            className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200">
                            📞 Call
                          </a>
                          <a href={`https://wa.me/${(item.phone||'').replace(/[^0-9]/g,'')}`}
                            target="_blank" rel="noreferrer"
                            className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-200">
                            💬 WA
                          </a>
                          <button onClick={() => onUpdate(item)}
                            className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-200">
                            ✏️ Update
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

export default function FollowUpsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [data, setData]       = useState({ today: [], previous: [], next_3_days: [] })
  const [counts, setCounts]   = useState({ today: 0, previous: 0, next_3_days: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [agents, setAgents]   = useState([])
  const [products, setProducts] = useState([])
  const [filterAgent, setFilterAgent]     = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(r => {
        const list = r?.data || r || []
        setAgents(Array.isArray(list) ? list.filter(u => ['agent','admin'].includes(u.role_name)) : [])
      }).catch(() => {
        api.get('/chat/users').then(r => {
          const list = r?.data || r || []
          setAgents(Array.isArray(list) ? list : [])
        }).catch(() => {})
      })
    }
    api.get('/products/active').then(r => {
      const list = r?.data || r || []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => {})
  }, [isAdmin])

  const fetchAll = async (agentF, productF, statusF) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ section: 'all' })
      if (isAdmin && agentF) params.set('agent_id',    agentF)
      if (productF)          params.set('product_id',  productF)
      if (statusF)           params.set('lead_status', statusF)

      // NOTE: api interceptor returns res.data directly, so response IS the body
      const body = await api.get(`/followups?${params.toString()}`)
      const d    = body?.data || {}

      let todayItems = [], prevItems = [], nextItems = []
      if (Array.isArray(d)) {
        todayItems = d.filter(x => x.followup_type === 'today')
        prevItems  = d.filter(x => x.followup_type === 'overdue')
        nextItems  = d.filter(x => x.followup_type === 'upcoming')
      } else {
        todayItems = Array.isArray(d.today)       ? d.today       : []
        prevItems  = Array.isArray(d.previous)    ? d.previous    : []
        nextItems  = Array.isArray(d.next_3_days) ? d.next_3_days : []
      }

      setData({ today: todayItems, previous: prevItems, next_3_days: nextItems })
      setCounts(body?.counts || {
        today:       todayItems.length,
        previous:    prevItems.length,
        next_3_days: nextItems.length,
        total:       todayItems.length + prevItems.length + nextItems.length,
      })
    } catch (err) {
      const msg = err?.message || 'Failed to load follow-ups'
      setError(msg)
      toast.error(msg)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    fetchAll(filterAgent, filterProduct, filterStatus)
  }, [filterAgent, filterProduct, filterStatus])

  useEffect(() => {
    const t = setInterval(() => fetchAll(filterAgent, filterProduct, filterStatus), 60000)
    return () => clearInterval(t)
  }, [filterAgent, filterProduct, filterStatus])

  const handleUpdate = (item) => setSelected(item)
  const handleSaved  = () => { setSelected(null); fetchAll(filterAgent, filterProduct, filterStatus) }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📅 Follow-ups</h1>
          <p className="text-slate-500 text-sm">
            {loading ? 'Loading…' : `${counts.total} total — ${counts.today} today, ${counts.previous} overdue, ${counts.next_3_days} upcoming`}
          </p>
        </div>
        <button onClick={() => fetchAll(filterAgent, filterProduct, filterStatus)}
          className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium">
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to load follow-ups</p>
            <p className="text-xs text-red-500">{error}</p>
          </div>
          <button onClick={() => fetchAll(filterAgent, filterProduct, filterStatus)}
            className="ml-auto text-xs text-red-600 underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center border-l-4 border-amber-400">
          <p className="text-3xl font-black text-amber-500">{counts.today}</p>
          <p className="text-sm font-semibold text-slate-600 mt-1">Today</p>
          <p className="text-xs text-slate-400">Due today</p>
        </div>
        <div className="card p-4 text-center border-l-4 border-red-400">
          <p className="text-3xl font-black text-red-500">{counts.previous}</p>
          <p className="text-sm font-semibold text-slate-600 mt-1">Overdue</p>
          <p className="text-xs text-slate-400">Past due date</p>
        </div>
        <div className="card p-4 text-center border-l-4 border-blue-400">
          <p className="text-3xl font-black text-blue-500">{counts.next_3_days}</p>
          <p className="text-sm font-semibold text-slate-600 mt-1">Next 3 Days</p>
          <p className="text-xs text-slate-400">Upcoming</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
        {isAdmin && agents.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Agent:</label>
            <select className="input w-40 text-sm" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
              <option value="">All Agents</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        {products.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Product:</label>
            <select className="input w-44 text-sm" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
              <option value="">All Products</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Status:</label>
          <select className="input w-40 text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        {(filterAgent || filterProduct || filterStatus) && (
          <button onClick={() => { setFilterAgent(''); setFilterProduct(''); setFilterStatus('') }}
            className="text-xs text-slate-400 hover:text-slate-600 underline">Reset</button>
        )}
      </div>

      {loading ? (
        <div className="card p-16 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Loading follow-ups…
        </div>
      ) : (
        <div className="space-y-4">
          <Section
            title={`Today's Follow-ups — ${format(new Date(), 'dd MMM yyyy')}`}
            icon="⏰" color="#d97706"
            items={data.today}
            onUpdate={handleUpdate}
            isAdmin={isAdmin}
          />
          <Section
            title="Previous Pending (Overdue)"
            icon="🔴" color="#dc2626"
            items={data.previous}
            onUpdate={handleUpdate}
            isAdmin={isAdmin}
          />
          <Section
            title="Next 3 Days"
            icon="📆" color="#2563eb"
            items={data.next_3_days}
            onUpdate={handleUpdate}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {selected && (
        <UpdateModal
          followup={selected}
          onClose={() => setSelected(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  )
}
