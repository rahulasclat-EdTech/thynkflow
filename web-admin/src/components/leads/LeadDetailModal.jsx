import React, { useEffect, useState } from 'react'
import api from '../../utils/api'
import { format } from 'date-fns'
import useLeadStatuses from '../../hooks/useLeadStatuses'

const _FALLBACK_COLORS = ['#1e40af','#991b1b','#92400e','#475569','#14532d','#64748b','#5b21b6','#9d174d','#065f46','#9a3412']
function fallbackColor(key) {
  let h = 0; for (let i=0;i<(key||'').length;i++) h = (h*31 + key.charCodeAt(i)) >>> 0
  return _FALLBACK_COLORS[h % _FALLBACK_COLORS.length]
}
function StatusPill({ status, statuses }) {
  const meta = statuses.find(s => s.key === status)
  const color = meta?.color || fallbackColor(status)
  const label = meta?.label || (status || '').replace(/_/g,' ')
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: color + '22', color }}>
      {label}
    </span>
  )
}

export default function LeadDetailModal({ leadId, onClose }) {
  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)
  const { statuses } = useLeadStatuses()

  useEffect(() => {
    if (!leadId) return
    api.get(`/leads/${leadId}`).then(res => setLead(res.data)).finally(() => setLoading(false))
  }, [leadId])

  if (!leadId) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{lead?.school_name || lead?.contact_name || lead?.phone}</h2>
            <p className="text-sm text-slate-500">{lead?.contact_name} · {lead?.phone}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 py-12">Loading...</div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {/* Lead Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <InfoRow label="Phone" value={lead?.phone} />
              <InfoRow label="Email" value={lead?.email || '—'} />
              <InfoRow label="City" value={lead?.city || '—'} />
              <InfoRow label="Source" value={lead?.source} />
              <InfoRow label="Assigned To" value={lead?.agent_name || 'Unassigned'} />
              <InfoRow label="Assigned By" value={lead?.assigned_by_name || '—'} />
              <InfoRow label="Current Status" value={
                <StatusPill status={lead?.status} statuses={statuses} />
              } />
              <InfoRow label="Assigned On" value={lead?.assigned_at ? format(new Date(lead.assigned_at), 'dd MMM yyyy') : '—'} />
            </div>

            {/* History */}
            <div>
              <h3 className="font-semibold text-slate-700 mb-3">Full History ({lead?.history?.length || 0} interactions)</h3>
              {lead?.history?.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">No calls logged yet</p>
              ) : (
                <div className="space-y-3">
                  {lead?.history?.map((log, i) => (
                    <div key={log.id} className="border border-slate-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <StatusPill status={log.status} statuses={statuses} />
                          <span className="text-xs text-slate-400">by {log.agent_name}</span>
                        </div>
                        <span className="text-xs text-slate-400">{format(new Date(log.called_at), 'dd MMM yyyy, hh:mm a')}</span>
                      </div>
                      {log.discussion && <p className="text-sm text-slate-600 bg-slate-50 rounded p-2 mt-2">"{log.discussion}"</p>}
                      {log.next_followup_date && (
                        <p className="text-xs text-blue-600 mt-2">📅 Next follow-up: {format(new Date(log.next_followup_date), 'dd MMM yyyy')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-medium">{value}</p>
    </div>
  )
}
