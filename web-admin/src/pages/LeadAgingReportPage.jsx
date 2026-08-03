// web-admin/src/pages/LeadAgingReportPage.jsx
// Add to App.jsx routes: <Route path="lead-aging" element={<LeadAgingReportPage />} />
// Add to sidebar nav: { to: '/lead-aging', label: 'Lead Aging', icon: '⏳', adminOnly: false }

import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import MultiSelect from '../components/common/MultiSelect'

const BUCKET_COLORS = {
  '0_3':     '#22c55e',
  '4_7':     '#3b82f6',
  '8_14':    '#f59e0b',
  '15_30':   '#f97316',
  '30_plus': '#ef4444',
}

function BucketCard({ bucket, active, onClick }) {
  const color = BUCKET_COLORS[bucket.key] || '#94a3b8'
  return (
    <button onClick={onClick}
      className="flex-1 min-w-[120px] rounded-2xl p-4 text-left transition-all border-2"
      style={{
        background: active ? color : '#fff',
        borderColor: color,
        boxShadow: active ? `0 8px 24px ${color}44` : '0 1px 4px #0001',
      }}>
      <p className="text-3xl font-black" style={{ color: active ? '#fff' : color }}>{bucket.count ?? 0}</p>
      <p className="text-xs font-bold uppercase tracking-wide mt-1" style={{ color: active ? 'rgba(255,255,255,0.9)' : '#64748b' }}>
        {bucket.label}
      </p>
    </button>
  )
}

export default function LeadAgingReportPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin' || user?.role_id === 1

  const [rows, setRows]         = useState([])
  const [summary, setSummary]   = useState([])
  const [agentSummary, setAgentSummary] = useState([])
  const [loading, setLoading]   = useState(true)
  const [agents, setAgents]     = useState([])
  const [products, setProducts] = useState([])

  const [filterAgent, setFilterAgent]     = useState([])
  const [filterProduct, setFilterProduct] = useState([])
  const [filterStatus, setFilterStatus]   = useState([])
  const [activeBucket, setActiveBucket]   = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        ...(filterAgent.length   && { agent_id: filterAgent[0] }),   // backend takes single agent_id for admin scoping
        ...(filterProduct.length && { product_id: filterProduct[0] }),
        ...(filterStatus.length  && { status: filterStatus[0] }),
        ...(activeBucket && { bucket: activeBucket }),
      }
      const [r, agentRes, prodRes] = await Promise.all([
        api.get('/reports/lead-aging', { params }),
        isAdmin ? api.get('/users') : Promise.resolve({ data: [] }),
        api.get('/products/active'),
      ])
      setRows(r.data || [])
      setSummary(r.summary || [])
      setAgentSummary(r.agent_summary || [])

      const agentBody = agentRes || {}
      setAgents(Array.isArray(agentBody) ? agentBody : (Array.isArray(agentBody.data) ? agentBody.data : []))
      const prodBody = prodRes || {}
      setProducts(Array.isArray(prodBody) ? prodBody : (prodBody.data || []))
    } catch {
      toast.error('Failed to load lead aging report')
    } finally {
      setLoading(false)
    }
  }, [filterAgent, filterProduct, filterStatus, activeBucket, isAdmin])

  useEffect(() => { fetchData() }, [fetchData])

  const exportCsv = () => {
    const header = ['School/Contact','Phone','Email','Status','Agent','Product','Age (days)','Days Since Last Activity','Created']
    const lines = rows.map(r => [
      r.contact_name || r.school_name || '', r.phone || '', r.email || '', r.status,
      r.agent_name || 'Unassigned', r.product_name || '', r.age_days, r.days_since_last_activity,
      r.created_at ? format(parseISO(r.created_at), 'dd MMM yyyy') : ''
    ])
    const csv = [header, ...lines].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `lead-aging-report-${format(new Date(),'yyyy-MM-dd')}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-800">⏳ Lead Aging Report</h1>
          <p className="text-sm text-slate-500">How long leads have been sitting without conversion, grouped by age.</p>
        </div>
        <button onClick={exportCsv} disabled={!rows.length}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">
          ⬇ Export CSV
        </button>
      </div>

      {/* Bucket cards */}
      <div className="flex flex-wrap gap-3">
        {summary.map(b => (
          <BucketCard key={b.key} bucket={b} active={activeBucket === b.key}
            onClick={() => setActiveBucket(activeBucket === b.key ? '' : b.key)} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <MultiSelect placeholder="All Agents" value={filterAgent} onChange={setFilterAgent}
            options={agents.map(a => ({ value: a.id, label: a.name }))} />
        )}
        <MultiSelect placeholder="All Products" value={filterProduct} onChange={setFilterProduct}
          options={products.map(p => ({ value: p.id, label: p.name }))} />
        <MultiSelect placeholder="All Statuses" value={filterStatus} onChange={setFilterStatus}
          options={['new','hot','warm','cold','call_back'].map(s => ({ value: s, label: s.replace(/_/g,' ') }))} />
        {(filterAgent.length || filterProduct.length || filterStatus.length || activeBucket) ? (
          <button onClick={() => { setFilterAgent([]); setFilterProduct([]); setFilterStatus([]); setActiveBucket('') }}
            className="border-2 rounded-xl px-3 py-2 text-xs font-bold text-red-500 border-red-200 hover:bg-red-50">
            ✕ Clear
          </button>
        ) : null}
      </div>

      {/* Agent-wise average age (admin only, useful for accountability) */}
      {isAdmin && agentSummary.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <h2 className="text-sm font-black text-slate-700 mb-3">Average Age by Agent</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agentSummary.map(a => (
              <div key={a.agent_name} className="border rounded-xl p-3 bg-slate-50">
                <p className="text-xs font-bold text-slate-500">{a.agent_name}</p>
                <p className="text-xl font-black text-slate-800">{a.avg_age_days}d <span className="text-xs font-medium text-slate-400">avg</span></p>
                <p className="text-xs text-slate-400">{a.count} lead{a.count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail table */}
      <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Lead','Phone','Status','Agent','Product','Age','Last Activity','Created'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No aging leads found for this filter 🎉</td></tr>
            )}
            {!loading && rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-semibold text-slate-700">{r.contact_name || r.school_name || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.phone || '—'}</td>
                <td className="px-4 py-2.5 capitalize">{r.status?.replace(/_/g,' ')}</td>
                <td className="px-4 py-2.5">{r.agent_name || <span className="text-orange-500 font-semibold">Unassigned</span>}</td>
                <td className="px-4 py-2.5">{r.product_name || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: `${BUCKET_COLORS[bucketKeyFor(r.age_days)]}22`, color: BUCKET_COLORS[bucketKeyFor(r.age_days)] }}>
                    {r.age_days}d
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{r.days_since_last_activity}d ago</td>
                <td className="px-4 py-2.5 text-slate-500">{r.created_at ? format(parseISO(r.created_at), 'dd MMM yyyy') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function bucketKeyFor(days) {
  if (days <= 3) return '0_3'
  if (days <= 7) return '4_7'
  if (days <= 14) return '8_14'
  if (days <= 30) return '15_30'
  return '30_plus'
}
