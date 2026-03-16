import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { format } from 'date-fns'
import LeadDetailModal from '../components/leads/LeadDetailModal'

const GROUP_CONFIG = {
  missed: { label: 'Missed Follow-ups', color: 'text-red-600', dot: 'bg-red-500', border: 'border-l-red-500' },
  today: { label: "Today's Follow-ups", color: 'text-green-600', dot: 'bg-green-500', border: 'border-l-green-500' },
  tomorrow: { label: "Tomorrow's Follow-ups", color: 'text-blue-600', dot: 'bg-blue-500', border: 'border-l-blue-500' },
  upcoming: { label: 'Upcoming', color: 'text-slate-600', dot: 'bg-slate-400', border: 'border-l-slate-400' },
}

export default function FollowUpsPage() {
  const [data, setData] = useState({ missed: [], today: [], tomorrow: [], upcoming: [] })
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState(null)

  useEffect(() => {
    api.get('/followups').then(res => setData(res.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading follow-ups...</div>

  const total = Object.values(data).reduce((s, a) => s + a.length, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Follow Ups</h1>
        <p className="text-slate-500 text-sm">{total} pending follow-ups</p>
      </div>

      {total === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium">All caught up! No pending follow-ups.</p>
        </div>
      ) : (
        Object.entries(GROUP_CONFIG).map(([key, config]) => {
          const items = data[key] || []
          if (!items.length) return null
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-3 h-3 rounded-full ${config.dot}`} />
                <h2 className={`font-semibold ${config.color}`}>{config.label}</h2>
                <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className={`card p-4 border-l-4 ${config.border}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800">{item.school_name || item.contact_name || item.phone}</p>
                        {item.contact_name && item.school_name && <p className="text-sm text-slate-500">{item.contact_name}</p>}
                        {item.discussion && (
                          <p className="text-sm text-slate-500 mt-1 bg-slate-50 rounded px-2 py-1 italic">"{item.discussion}"</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          <span>📞 {item.phone}</span>
                          <span>👤 {item.agent_name}</span>
                          <span>📅 {item.next_followup_date ? format(new Date(item.next_followup_date), 'dd MMM yyyy') : '—'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <span className={`badge-${item.lead_status}`}>{item.lead_status?.replace('_', ' ')}</span>
                        <button onClick={() => setSelectedLead(item.lead_id)} className="btn-secondary py-1 px-3 text-xs">History</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      <LeadDetailModal leadId={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  )
}
