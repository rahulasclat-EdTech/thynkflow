// web-admin/src/components/NotificationBell.jsx
// Drop this component into Layout.jsx header area
// Usage: <NotificationBell />
import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../utils/api'

const TYPE_ICONS = {
  lead_assigned:      '👤',
  followup_scheduled: '📅',
  missed_followup:    '⚠️',
  default:            '🔔',
}

function timeAgo(d) {
  if (!d) return ''
  const diff = Date.now() - new Date(d)
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  return Math.floor(diff / 86400000) + 'd ago'
}

export default function NotificationBell() {
  const [notifs, setNotifs]   = useState([])
  const [unread, setUnread]   = useState(0)
  const [open, setOpen]       = useState(false)
  const ref = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/notifications')
      setNotifs(r.data?.data || [])
      setUnread(r.data?.unread || 0)
    } catch {}
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000) // poll every 30s
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all')
      setUnread(0)
      setNotifs(n => n.map(x => ({ ...x, is_read: true })))
    } catch {}
  }

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setNotifs(n => n.map(x => x.id === id ? { ...x, is_read: true } : x))
      setUnread(u => Math.max(0, u - 1))
    } catch {}
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="relative w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-bold text-slate-800">Notifications {unread > 0 && <span className="text-red-600">({unread})</span>}</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline font-medium">Mark all read</button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <span className="text-3xl mb-2">🔔</span>
                <p className="text-sm">No notifications</p>
              </div>
            ) : notifs.map(n => (
              <div key={n.id}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/50' : ''}`}
                onClick={() => markRead(n.id)}>
                <span className="text-xl flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] || TYPE_ICONS.default}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${!n.is_read ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{n.title}</p>
                  {n.message && <p className="text-xs text-slate-400 mt-0.5 truncate">{n.message}</p>}
                  <p className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0 mt-2" />}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-center text-slate-400">Showing last 50 notifications</p>
          </div>
        </div>
      )}
    </div>
  )
}
