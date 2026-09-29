// web-admin/src/components/leads/LeadManageModals.jsx
// Two modals used by LeadsPage:
//   • DuplicatesModal   — groups of leads that share a phone number,
//                         with "keep this one, delete the rest" actions
//   • DeletedLeadsModal — the separate register of deleted leads
//                         (admins can restore)
import React, { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import api from '../../utils/api'

const fmt = (d, f = 'dd MMM yy') => { try { return d ? format(parseISO(d), f) : '—' } catch { return '—' } }

function Shell({ title, subtitle, onClose, children, gradient }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl" style={{ background: gradient }}>
          <div>
            <h2 className="text-lg font-black text-white">{title}</h2>
            {subtitle && <p className="text-white/70 text-xs mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/20 text-white text-lg leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
export function DuplicatesModal({ onClose, onChanged }) {
  const [groups, setGroups]   = useState([])
  const [meta, setMeta]       = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/leads/duplicates')
      setGroups(r.data || [])
      setMeta({ groups: r.total_groups || 0, extra: r.extra_copies || 0 })
    } catch (e) { toast.error(e?.message || 'Failed to load duplicates') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (ids, msg) => {
    if (!ids.length) return
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      const r = await api.post('/leads/bulk-delete', { ids, reason: 'Duplicate lead' })
      toast.success(r.message || 'Deleted')
      await load(); onChanged && onChanged()
    } catch (e) { toast.error(e?.message || 'Delete failed') }
    finally { setBusy(false) }
  }

  return (
    <Shell title="🔁 Duplicate Leads"
      subtitle={loading ? 'Scanning…' : `${meta.groups} duplicate group(s) · ${meta.extra} extra copies · matched on phone number (last 10 digits)`}
      gradient="linear-gradient(135deg,#9a3412,#f97316)" onClose={onClose}>
      {loading ? (
        <p className="text-center text-slate-400 py-12">Scanning for duplicates…</p>
      ) : groups.length === 0 ? (
        <div className="text-center py-12"><p className="text-5xl mb-2">✅</p><p className="font-bold text-slate-500">No duplicate leads found</p></div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => {
            const oldest = g.leads[0]
            return (
              <div key={g.key} className="border-2 border-orange-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between bg-orange-50 px-4 py-2">
                  <div className="font-bold text-orange-800 text-sm">📞 {g.phone} <span className="ml-2 text-xs font-semibold bg-orange-200 text-orange-900 px-2 py-0.5 rounded-full">{g.count} leads</span></div>
                  {g.leads.some(l => l.id !== oldest.id && l.can_delete) && (
                    <button disabled={busy}
                      onClick={() => remove(g.leads.filter(l => l.id !== oldest.id && l.can_delete).map(l => l.id),
                        `Keep the oldest lead (${oldest.contact_name || oldest.school_name || oldest.phone}) and delete the other ${g.leads.filter(l => l.id !== oldest.id && l.can_delete).length}?\n\nDeleted leads move to the Deleted Leads register.`)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">
                      Keep oldest, delete rest
                    </button>
                  )}
                </div>
                <table className="min-w-full text-xs">
                  <thead><tr className="text-left text-slate-400 uppercase tracking-wide">
                    {['Name','School','Agent','Product','Status','Calls','Created',''].map(h => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {g.leads.map(l => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-800">
                          {l.contact_name || '—'}
                          {l.id === oldest.id && <span className="ml-2 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">OLDEST</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{l.school_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{l.agent_name || 'Unassigned'}</td>
                        <td className="px-3 py-2 text-slate-500">{l.product_name || '—'}</td>
                        <td className="px-3 py-2 capitalize text-slate-600">{(l.status || '').replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-slate-600">{l.activity_count}</td>
                        <td className="px-3 py-2 text-slate-400">{fmt(l.created_at)}</td>
                        <td className="px-3 py-2 text-right">
                          {l.can_delete && (
                            <button disabled={busy}
                              onClick={() => remove([l.id], `Delete this lead (${l.contact_name || l.phone})?\n\nIt will move to the Deleted Leads register.`)}
                              className="px-2.5 py-1 rounded-lg text-red-600 font-bold hover:bg-red-50 disabled:opacity-50">🗑 Delete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────
export function DeletedLeadsModal({ isAdmin, onClose, onChanged }) {
  const [rows, setRows]       = useState([])
  const [total, setTotal]     = useState(0)
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/leads/deleted', { params: { per_page: 200, ...(search && { search }) } })
      setRows(r.data || []); setTotal(r.total || 0)
    } catch (e) { toast.error(e?.message || 'Failed to load deleted leads') }
    finally { setLoading(false) }
  }, [search])
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const restore = async (row) => {
    if (!window.confirm(`Restore "${row.contact_name || row.phone}"? It will reappear in Leads, Dashboard and Reports with its call history.`)) return
    setBusyId(row.id)
    try {
      const r = await api.post(`/leads/deleted/${row.id}/restore`)
      toast.success(r.duplicates_found ? `Restored — note: ${r.duplicates_found} other lead(s) share this phone number` : 'Lead restored ✓')
      if (r.warnings?.length) toast(r.warnings.join('\n'), { icon: '⚠️' })
      await load(); onChanged && onChanged()
    } catch (e) { toast.error(e?.message || 'Restore failed') }
    finally { setBusyId(null) }
  }

  return (
    <Shell title="🗑 Deleted Leads" subtitle={`${total} deleted lead(s) — kept separately, excluded from Dashboard & Reports`}
      gradient="linear-gradient(135deg,#334155,#64748b)" onClose={onClose}>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search deleted leads…"
        className="border-2 rounded-xl px-3 py-2 text-sm w-full mb-4 focus:outline-none focus:ring-2 focus:ring-slate-300" />
      {loading ? <p className="text-center text-slate-400 py-10">Loading…</p>
        : rows.length === 0 ? <p className="text-center text-slate-400 py-10">No deleted leads</p>
        : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full text-xs">
              <thead><tr className="bg-slate-50 text-left text-slate-400 uppercase tracking-wide">
                {['Name / School','Phone','Status','Product','Was assigned to','Deleted by','Deleted on','Reason','Logs',''].map(h => <th key={h} className="px-3 py-2.5 font-bold whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2"><div className="font-semibold text-slate-800">{r.contact_name || '—'}</div><div className="text-slate-400">{r.school_name || ''}</div></td>
                    <td className="px-3 py-2 font-mono text-slate-600">{r.phone}</td>
                    <td className="px-3 py-2 capitalize text-slate-600">{(r.status || '').replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-slate-500">{r.product_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.agent_name || 'Unassigned'}</td>
                    <td className="px-3 py-2 text-slate-600">{r.deleted_by_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmt(r.deleted_at, 'dd MMM yy HH:mm')}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[160px] truncate" title={r.delete_reason || ''}>{r.delete_reason || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.logs_count}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin && <button disabled={busyId === r.id} onClick={() => restore(r)}
                        className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 disabled:opacity-50">↩ Restore</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Shell>
  )
}
