// web-admin/src/hooks/useLeadStatuses.js
// Single source of truth for "what lead statuses exist" across the app.
// Pulls from the admin-managed Status Master (GET /api/settings/lead_status)
// instead of every page hardcoding its own 7-item list — which was the
// root cause of pages only ever showing new/hot/warm/cold/converted/
// not_interested/call_back and never any custom status an admin added
// (e.g. "Interested", "Proposal Shared").
//
// Cached in module scope for the lifetime of the tab, since the status
// list rarely changes and this hook gets used on many pages — avoids
// refetching it on every page navigation.
import { useEffect, useState } from 'react'
import api from '../utils/api'

let _cache = null
let _cachePromise = null

// Call this after adding/editing/deleting a status in the Status Master
// admin UI so other already-open pages pick up the change on next mount.
export function invalidateLeadStatusCache() {
  _cache = null
  _cachePromise = null
}

export default function useLeadStatuses() {
  const [statuses, setStatuses] = useState(_cache || [])
  const [loading, setLoading]   = useState(!_cache)

  useEffect(() => {
    let alive = true
    if (_cache) { setStatuses(_cache); setLoading(false); return }
    if (!_cachePromise) {
      _cachePromise = api.get('/settings/lead_status')
        .then(r => {
          const body = r || {}
          const list = Array.isArray(body) ? body : (body.data || [])
          _cache = list
          return list
        })
        .catch(() => [])
    }
    _cachePromise.then(list => { if (alive) { setStatuses(list); setLoading(false) } })
    return () => { alive = false }
  }, [])

  const colorFor = (key) => statuses.find(s => s.key === key)?.color || '#64748b'
  const labelFor = (key) => statuses.find(s => s.key === key)?.label || (key || '').replace(/_/g, ' ')
  const options  = statuses.map(s => ({ value: s.key, label: s.label }))
  const keys     = statuses.map(s => s.key)

  return { statuses, loading, colorFor, labelFor, options, keys }
}
