// web-admin/src/pages/StatusChangeReportPage.jsx
// Add to App.jsx routes: <Route path="status-change" element={<StatusChangeReportPage />} />
// Add to sidebar nav: { to: '/status-change', label: 'Status Changes', icon: '🔄', adminOnly: false }

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import MultiSelect from '../components/common/MultiSelect'

export default function StatusChangeReportPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin' || user?.role_id === 1

  const [changes, setChanges]     = useState([])
  const [byAgent, setByAgent]     = useState([])
  const [byProduct, setByProduct] = useState([])
  const [byStatus, setByStatus]   = useState([])
  const [byTransition, setByTransition]           = useState([])
  const [byAgentTransition, setByAgentTransition]  = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)

  const [agents, setAgents]     = useState([])
  const [products, setProducts] = useState([])

  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo]     = useState(today)
  const [filterAgent, setFilterAgent]     = useState([])
  const [filterProduct, setFilterProduct] = useState([])
  const [filterStatus, setFilterStatus]   = useState([])

  const fetchMeta = useCallback(async () => {
    try {
      const [userRes, prodRes] = await Promise.all([
        isAdmin ? api.get('/users') : Promise.resolve({ data: [] }),
        api.get('/products/active'),
      ])
      const userBody = userRes || {}
      setAgents(Array.isArray(userBody) ? userBody : (Array.isArray(userBody.data) ? userBody.data : []))
      const prodBody = prodRes || {}
      setProducts(Array.isArray(prodBody) ? prodBody : (prodBody.data || []))
    } catch {
      // non-fatal — filters just won't populate
    }
  }, [isAdmin])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        ...(from && { from }),
        ...(to && { to }),
        ...(filterAgent.length && { agent_id: filterAgent[0] }),
        ...(filterProduct.length && { product_id: filterProduct[0] }),
        ...(filterStatus.length && { to_status: filterStatus[0] }),
      }
      const r = await api.get('/reports/status-change', { params })
      setChanges(r.changes || [])
      setByAgent(r.by_agent || [])
      setByProduct(r.by_product || [])
      setByStatus(r.by_status || [])
      setByTransition(r.by_transition || [])
      setByAgentTransition(r.by_agent_transition || [])
      setTotal(r.total || 0)
    } catch {
      toast.error('Failed to load status change report')
    } finally {
      setLoading(false)
    }
  }, [from, to, filterAgent, filterProduct, filterStatus])

  useEffect(() => { fetchMeta() }, [fetchMeta])
  useEffect(() => { fetchData() }, [fetchData])

  // Group the flat agent-transition rows into one block per agent for display.
  const agentTransitionGroups = useMemo(() => {
    const groups = {}
    byAgentTransition.forEach(t => {
      const key = t.agent_name || 'Unknown'
      groups[key] = groups[key] || { agent_name: key, total: 0, transitions: [] }
      groups[key].transitions.push(t)
      groups[key].total += t.count
    })
    return Object.values(groups).sort((a, b) => b.total - a.total)
  }, [byAgentTransition])

  const exportCsv = () => {
    const header = ['Lead', 'Previous Status', 'New Status', 'Agent', 'Product', 'Changed At']
    const lines = changes.map(c => [
      c.lead_name || '', c.from_status || '(new)', c.to_status, c.agent_name || '', c.product_name || '',
      c.changed_at ? format(parseISO(c.changed_at), 'dd MMM yyyy, h:mm a') : ''
    ])
    const csv = [header, ...lines].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `status-change-report-${from}-to-${to}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-black text-slate-800">🔄 Status Change Report</h1>
          <p className="text-sm text-slate-500">Every status transition, with counts product-wise and agent-wise.</p>
        </div>
        <button onClick={exportCsv} disabled={!changes.length}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40">
          ⬇ Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">From:</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600">To:</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        {isAdmin && (
          <MultiSelect placeholder="All Agents" value={filterAgent} onChange={setFilterAgent}
            options={agents.map(a => ({ value: a.id, label: a.name }))} />
        )}
        <MultiSelect placeholder="All Products" value={filterProduct} onChange={setFilterProduct}
          options={products.map(p => ({ value: p.id, label: p.name }))} />
        <MultiSelect placeholder="Any New Status" value={filterStatus} onChange={setFilterStatus}
          options={byStatus.map(s => ({ value: s.to_status, label: s.to_status.replace(/_/g,' ') }))} />
        <button onClick={() => { setFrom(today); setTo(today); setFilterAgent([]); setFilterProduct([]); setFilterStatus([]) }}
          className="text-xs font-bold text-indigo-600 hover:underline ml-auto">Reset to today</button>
      </div>

      <div className="text-sm text-slate-500 font-semibold">{total} status change{total !== 1 ? 's' : ''} in this range</div>

      {/* Breakdown cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <h3 className="font-bold text-slate-700 mb-3">By Agent</h3>
          <div className="space-y-2">
            {byAgent.length === 0 && <p className="text-xs text-slate-400">No data</p>}
            {byAgent.map(a => (
              <div key={a.agent_name} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{a.agent_name}</span>
                <span className="font-black text-indigo-600">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <h3 className="font-bold text-slate-700 mb-3">By Product</h3>
          <div className="space-y-2">
            {byProduct.length === 0 && <p className="text-xs text-slate-400">No data</p>}
            {byProduct.map(p => (
              <div key={p.product_name} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{p.product_name}</span>
                <span className="font-black text-purple-600">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
          <h3 className="font-bold text-slate-700 mb-3">By New Status</h3>
          <div className="space-y-2">
            {byStatus.length === 0 && <p className="text-xs text-slate-400">No data</p>}
            {byStatus.map(st => (
              <div key={st.to_status} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 capitalize">{st.to_status.replace(/_/g,' ')}</span>
                <span className="font-black text-green-600">{st.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transition summary — "Old status → New status = count" */}
      <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
        <h3 className="font-bold text-slate-700 mb-3">Status Transitions — Old → New</h3>
        <div className="space-y-1.5">
          {byTransition.length === 0 && <p className="text-xs text-slate-400">No data</p>}
          {byTransition.map(t => (
            <div key={`${t.from_status}→${t.to_status}`} className="flex items-center justify-between text-sm py-1">
              <span className="flex items-center gap-2 capitalize text-slate-600">
                {t.from_status ? t.from_status.replace(/_/g,' ') : <span className="italic text-slate-400">new lead</span>}
                <span className="text-slate-300">→</span>
                <span className="font-semibold text-indigo-700">{t.to_status.replace(/_/g,' ')}</span>
              </span>
              <span className="font-black text-slate-800">{t.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Agent-wise transition summary — "Old status → New status = count" per agent */}
      <div className="bg-white rounded-2xl border-2 border-slate-100 p-4">
        <h3 className="font-bold text-slate-700 mb-3">Agent-wise — Old → New</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agentTransitionGroups.length === 0 && <p className="text-xs text-slate-400">No data</p>}
          {agentTransitionGroups.map(g => (
            <div key={g.agent_name} className="border border-slate-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-700 text-sm">{g.agent_name}</span>
                <span className="text-xs font-bold text-slate-400">{g.total} total</span>
              </div>
              <div className="space-y-1">
                {g.transitions.map(t => (
                  <div key={`${g.agent_name}-${t.from_status}→${t.to_status}`} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 capitalize text-slate-500">
                      {t.from_status ? t.from_status.replace(/_/g,' ') : <span className="italic text-slate-400">new lead</span>}
                      <span className="text-slate-300">→</span>
                      <span className="font-semibold text-indigo-600">{t.to_status.replace(/_/g,' ')}</span>
                    </span>
                    <span className="font-black text-slate-700">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail table — includes previous status alongside the new one */}
      <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Lead','Previous Status','New Status','Agent','Product','Changed At'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            )}
            {!loading && changes.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No status changes in this range</td></tr>
            )}
            {!loading && changes.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-semibold text-slate-700">{c.lead_name || '—'}</td>
                <td className="px-4 py-2.5 text-slate-400 capitalize">{c.from_status ? c.from_status.replace(/_/g,' ') : <span className="italic">new lead</span>}</td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 capitalize">
                    {c.to_status.replace(/_/g,' ')}
                  </span>
                </td>
                <td className="px-4 py-2.5">{c.agent_name || '—'}</td>
                <td className="px-4 py-2.5">{c.product_name || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{c.changed_at ? format(parseISO(c.changed_at), 'dd MMM yyyy, h:mm a') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
