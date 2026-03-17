import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  new: { bg: '#dbeafe', text: '#1e40af' },
  hot: { bg: '#fee2e2', text: '#991b1b' },
  warm: { bg: '#fef3c7', text: '#92400e' },
  cold: { bg: '#e2e8f0', text: '#475569' },
  converted: { bg: '#dcfce7', text: '#14532d' },
  not_interested: { bg: '#f1f5f9', text: '#64748b' },
  call_back: { bg: '#ede9fe', text: '#5b21b6' },
}
const STATUS_LIST = ['new', 'hot', 'warm', 'cold', 'converted', 'call_back', 'not_interested']

function formatINR(v) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0)
}

function DrillModal({ title, leads, onClose }) {
  if (!leads) return null
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-400">{leads.length} leads</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Name / School</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Phone</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Product</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-slate-400">No leads found</td></tr>
              ) : leads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{lead.school_name || lead.contact_name || '—'}</td>
                  <td className="px-4 py-3 text-blue-600">{lead.phone}</td>
                  <td className="px-4 py-3 text-slate-500">{lead.agent_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: STATUS_COLORS[lead.status]?.bg || '#f1f5f9', color: STATUS_COLORS[lead.status]?.text || '#64748b' }}>
                      {lead.status?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{lead.product_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value, sub, color, icon, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white border rounded-2xl p-4 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        {onClick && <span className="text-xs text-blue-400 font-medium">drill ↗</span>}
      </div>
      <p className="text-2xl font-black" style={{ color }}>{value ?? 0}</p>
      <p className="text-sm text-slate-500 mt-0.5 font-medium">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ProductDashboardPage() {
  const { user, isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedProduct, setExpandedProduct] = useState(null)
  const [expandedAgent, setExpandedAgent] = useState(null)
  const [activeView, setActiveView] = useState('products')
  const [drill, setDrill] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/products/dashboard')
      setData(res.data)
    } catch { toast.error('Failed to load product dashboard') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openDrill = async (title, params) => {
    try {
      const res = await api.get('/leads', { params: { ...params, limit: 500 } })
      setDrill({ title, leads: res.data || [] })
    } catch { setDrill({ title, leads: [] }) }
  }

  const products = data?.product_stats || []
  const agentBreakdown = data?.agent_breakdown || []

  const totalLeads = products.reduce((s, p) => s + parseInt(p.total_leads || 0), 0)
  const totalConverted = products.reduce((s, p) => s + parseInt(p.converted_leads || 0), 0)
  const totalPotential = products.reduce((s, p) => s + parseFloat(p.total_potential_earning || 0), 0)
  const totalEarned = products.reduce((s, p) => s + parseFloat(p.actual_earned || 0), 0)

  const agentSummary = agentBreakdown.reduce((acc, row) => {
    if (!acc[row.agent_id]) acc[row.agent_id] = { agent_id: row.agent_id, agent_name: row.agent_name, total_leads: 0, converted: 0, hot: 0, warm: 0, new_leads: 0, earned: 0, products: [] }
    acc[row.agent_id].total_leads += parseInt(row.total_leads || 0)
    acc[row.agent_id].converted += parseInt(row.converted || 0)
    acc[row.agent_id].hot += parseInt(row.hot || 0)
    acc[row.agent_id].warm += parseInt(row.warm || 0)
    acc[row.agent_id].new_leads += parseInt(row.new_leads || 0)
    acc[row.agent_id].earned += parseFloat(row.earned || 0)
    acc[row.agent_id].products.push(row)
    return acc
  }, {})
  const agents = Object.values(agentSummary).sort((a, b) => b.total_leads - a.total_leads)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{isAdmin ? '📦 Product Dashboard' : '📦 My Product Performance'}</h1>
          <p className="text-slate-500 text-sm mt-1">{isAdmin ? 'Product & agent wise analytics with full drill-down' : `${user?.name} · Leads & earning potential by product`}</p>
        </div>
        <button onClick={fetchData} className="btn-secondary text-sm">🔄 Refresh</button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Products" value={products.length} icon="📦" color="#2563eb" />
        <KPICard label="Total Leads" value={totalLeads} icon="👥" color="#1e293b" onClick={() => openDrill('All Leads', {})} />
        <KPICard label="💰 Total Potential" value={formatINR(totalPotential)} icon="💰" color="#d97706" sub="If all leads convert" />
        <KPICard label={isAdmin ? '✅ Total Paid Out' : '✅ You Earned'} value={formatINR(totalEarned)} icon="✅" color="#16a34a" sub={`${totalConverted} conversions`} onClick={() => openDrill('All Converted Leads', { status: 'converted' })} />
      </div>

      {/* Agent earning summary */}
      {!isAdmin && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <p className="text-xs text-amber-600 font-semibold mb-1">💰 Potential Earning</p>
            <p className="text-2xl font-black text-amber-700">{formatINR(totalPotential)}</p>
            <p className="text-xs text-amber-500 mt-1">If all your leads convert</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
            <p className="text-xs text-green-600 font-semibold mb-1">✅ Actual Earned</p>
            <p className="text-2xl font-black text-green-700">{formatINR(totalEarned)}</p>
            <p className="text-xs text-green-500 mt-1">{totalConverted} conversions so far</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
            <p className="text-xs text-blue-600 font-semibold mb-1">🎯 Still to Earn</p>
            <p className="text-2xl font-black text-blue-700">{formatINR(totalPotential - totalEarned)}</p>
            <p className="text-xs text-blue-500 mt-1">Remaining opportunity</p>
          </div>
        </div>
      )}

      {/* View toggle */}
      {isAdmin && (
        <div className="flex gap-2">
          {[{ key: 'products', label: '📦 Product Wise' }, { key: 'agents', label: '👤 Agent Wise' }].map(v => (
            <button key={v.key} onClick={() => setActiveView(v.key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeView === v.key ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Product wise view */}
      {(activeView === 'products' || !isAdmin) && (
        <div className="space-y-4">
          {products.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
              <p className="text-5xl mb-4">📦</p>
              <p className="text-lg font-bold text-slate-700 mb-2">No Products Found</p>
              <p className="text-slate-400 text-sm">Go to Settings → Products to add products</p>
            </div>
          ) : products.map(product => {
            const convRate = product.total_leads > 0 ? ((product.converted_leads / product.total_leads) * 100).toFixed(1) : 0
            const productAgents = agentBreakdown.filter(a => a.product_id === product.product_id)
            const isExpanded = expandedProduct === product.product_id
            return (
              <div key={product.product_id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-slate-800 text-lg">{product.product_name}</h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${product.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {product.product_type}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400">{formatINR(product.per_closure_earning)} per closure · {productAgents.length} agents</p>
                    </div>
                    <div className="text-right cursor-pointer" onClick={() => openDrill(`${product.product_name} — All Leads`, { product_id: product.product_id })}>
                      <p className="text-3xl font-black text-slate-800 hover:text-blue-600">{product.total_leads}</p>
                      <p className="text-xs text-blue-400">total leads ↗</p>
                    </div>
                  </div>

                  {/* Status breakdown — each clickable */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Status Breakdown — click any to drill down</p>
                    <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
                      {STATUS_LIST.map(status => {
                        const keyMap = { new: 'new_leads', hot: 'hot_leads', warm: 'warm_leads', cold: 'cold_leads', converted: 'converted_leads', not_interested: 'not_interested_leads', call_back: 'call_back_leads' }
                        const count = parseInt(product[keyMap[status]] || 0)
                        const c = STATUS_COLORS[status]
                        return (
                          <div key={status} className="text-center p-2 rounded-xl cursor-pointer hover:scale-105 transition-transform border"
                            style={{ background: c.bg, borderColor: c.text + '30' }}
                            onClick={() => openDrill(`${product.product_name} — ${status.replace(/_/g, ' ')}`, { product_id: product.product_id, status })}>
                            <p className="text-lg font-black" style={{ color: c.text }}>{count}</p>
                            <p className="text-xs font-medium capitalize" style={{ color: c.text }}>{status.replace(/_/g, ' ')}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Conversion */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Conversion rate</span>
                      <span className="font-bold text-green-600">{convRate}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, convRate)}%` }} />
                    </div>
                  </div>

                  {/* Earning */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                      <p className="text-xs text-slate-500 mb-1">Per Closure</p>
                      <p className="font-black text-slate-800 text-sm">{formatINR(product.per_closure_earning)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100 cursor-pointer hover:bg-amber-100"
                      onClick={() => openDrill(`${product.product_name} — All (Potential)`, { product_id: product.product_id })}>
                      <p className="text-xs text-amber-600 mb-1">💰 Potential</p>
                      <p className="font-black text-amber-700 text-sm">{formatINR(product.total_potential_earning)}</p>
                      <p className="text-xs text-amber-500">{product.total_leads} leads ↗</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100 cursor-pointer hover:bg-green-100"
                      onClick={() => openDrill(`${product.product_name} — Converted`, { product_id: product.product_id, status: 'converted' })}>
                      <p className="text-xs text-green-600 mb-1">✅ Earned</p>
                      <p className="font-black text-green-700 text-sm">{formatINR(product.actual_earned)}</p>
                      <p className="text-xs text-green-500">{product.converted_leads} converted ↗</p>
                    </div>
                  </div>
                </div>

                {/* Agent breakdown */}
                {isAdmin && productAgents.length > 0 && (
                  <>
                    <button onClick={() => setExpandedProduct(isExpanded ? null : product.product_id)}
                      className="w-full px-5 py-3 bg-slate-50 border-t border-slate-100 text-sm font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-between">
                      <span>👤 Agent-wise breakdown ({productAgents.length} agents)</span>
                      <span>{isExpanded ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-100 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                              <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Total</th>
                              <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">New</th>
                              <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Hot</th>
                              <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Warm</th>
                              <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Converted</th>
                              <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Earned</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {productAgents.map(agent => (
                              <tr key={agent.agent_id} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 font-medium cursor-pointer text-blue-600 hover:underline"
                                  onClick={() => openDrill(`${agent.agent_name} — ${product.product_name}`, { agent_id: agent.agent_id, product_id: product.product_id })}>
                                  {agent.agent_name} ↗
                                </td>
                                <td className="px-4 py-2.5 font-bold">{agent.total_leads}</td>
                                <td className="px-4 py-2.5"><span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{agent.new_leads || 0}</span></td>
                                <td className="px-4 py-2.5"><span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">{agent.hot}</span></td>
                                <td className="px-4 py-2.5"><span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">{agent.warm}</span></td>
                                <td className="px-4 py-2.5"><span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">{agent.converted}</span></td>
                                <td className="px-4 py-2.5 font-bold text-green-600">{formatINR(agent.earned)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 border-t">
                            <tr>
                              <td className="px-4 py-2 font-bold text-slate-700">Total</td>
                              <td className="px-4 py-2 font-bold">{productAgents.reduce((s, a) => s + parseInt(a.total_leads || 0), 0)}</td>
                              <td className="px-4 py-2 font-bold text-blue-600">{productAgents.reduce((s, a) => s + parseInt(a.new_leads || 0), 0)}</td>
                              <td className="px-4 py-2 font-bold text-red-500">{productAgents.reduce((s, a) => s + parseInt(a.hot || 0), 0)}</td>
                              <td className="px-4 py-2 font-bold text-amber-500">{productAgents.reduce((s, a) => s + parseInt(a.warm || 0), 0)}</td>
                              <td className="px-4 py-2 font-bold text-green-600">{productAgents.reduce((s, a) => s + parseInt(a.converted || 0), 0)}</td>
                              <td className="px-4 py-2 font-bold text-green-600">{formatINR(productAgents.reduce((s, a) => s + parseFloat(a.earned || 0), 0))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Agent wise view */}
      {isAdmin && activeView === 'agents' && (
        <div className="space-y-4">
          {agents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
              <p className="text-5xl mb-4">👤</p>
              <p className="text-lg font-bold text-slate-700">No agent data yet</p>
            </div>
          ) : agents.map((agent, i) => {
            const medals = ['🥇', '🥈', '🥉']
            const convRate = agent.total_leads > 0 ? ((agent.converted / agent.total_leads) * 100).toFixed(1) : 0
            const isExpanded = expandedAgent === agent.agent_id
            return (
              <div key={agent.agent_id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                        {agent.agent_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-800">{agent.agent_name}</h3>
                          <span className="text-lg">{medals[i] || `#${i + 1}`}</span>
                        </div>
                        <p className="text-xs text-slate-400">{agent.products.length} products · conv. rate: {convRate}%</p>
                      </div>
                    </div>
                    <div className="text-right cursor-pointer" onClick={() => openDrill(`${agent.agent_name} — All Leads`, { agent_id: agent.agent_id })}>
                      <p className="text-3xl font-black text-slate-800 hover:text-blue-600">{agent.total_leads}</p>
                      <p className="text-xs text-blue-400">total leads ↗</p>
                    </div>
                  </div>

                  {/* Status boxes */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { label: 'New', count: agent.new_leads, status: 'new', color: '#1e40af', bg: '#dbeafe' },
                      { label: 'Hot', count: agent.hot, status: 'hot', color: '#991b1b', bg: '#fee2e2' },
                      { label: 'Warm', count: agent.warm, status: 'warm', color: '#92400e', bg: '#fef3c7' },
                      { label: 'Converted', count: agent.converted, status: 'converted', color: '#14532d', bg: '#dcfce7' },
                    ].map(item => (
                      <div key={item.label}
                        className="text-center p-2 rounded-xl cursor-pointer hover:scale-105 transition-transform border"
                        style={{ background: item.bg, borderColor: item.color + '30' }}
                        onClick={() => openDrill(`${agent.agent_name} — ${item.label}`, { agent_id: agent.agent_id, status: item.status })}>
                        <p className="text-xl font-black" style={{ color: item.color }}>{item.count}</p>
                        <p className="text-xs font-medium" style={{ color: item.color }}>{item.label} ↗</p>
                      </div>
                    ))}
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-500">Conversion rate</span>
                      <span className="font-bold text-green-600">{convRate}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, convRate)}%` }} />
                    </div>
                  </div>

                  {/* Earning */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                      <p className="text-xs text-amber-600 mb-1">💰 Earning Potential</p>
                      <p className="font-black text-amber-700">{formatINR(agent.products.reduce((s, p) => s + (parseInt(p.total_leads || 0) * parseFloat(p.per_closure_earning || 0)), 0))}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 border border-green-100 cursor-pointer hover:bg-green-100"
                      onClick={() => openDrill(`${agent.agent_name} — Converted`, { agent_id: agent.agent_id, status: 'converted' })}>
                      <p className="text-xs text-green-600 mb-1">✅ Actual Earned</p>
                      <p className="font-black text-green-700">{formatINR(agent.earned)} ↗</p>
                    </div>
                  </div>
                </div>

                {/* Product breakdown */}
                <button onClick={() => setExpandedAgent(isExpanded ? null : agent.agent_id)}
                  className="w-full px-5 py-3 bg-slate-50 border-t border-slate-100 text-sm font-medium text-slate-600 hover:bg-slate-100 flex items-center justify-between">
                  <span>📦 Product-wise breakdown ({agent.products.length} products)</span>
                  <span>{isExpanded ? '▲ Hide' : '▼ Show'}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Product</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Type</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Leads</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Hot</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Warm</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Converted</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Potential</th>
                          <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {agent.products.map(p => (
                          <tr key={p.product_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium cursor-pointer text-blue-600 hover:underline"
                              onClick={() => openDrill(`${agent.agent_name} — ${p.product_name}`, { agent_id: agent.agent_id, product_id: p.product_id })}>
                              {p.product_name} ↗
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                {p.product_type}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-bold text-blue-600">{p.total_leads}</td>
                            <td className="px-4 py-2.5 text-red-500 font-bold">{p.hot}</td>
                            <td className="px-4 py-2.5 text-amber-500 font-bold">{p.warm}</td>
                            <td className="px-4 py-2.5 text-green-600 font-bold">{p.converted}</td>
                            <td className="px-4 py-2.5 text-amber-600 font-bold">{formatINR(parseInt(p.total_leads || 0) * parseFloat(p.per_closure_earning || 0))}</td>
                            <td className="px-4 py-2.5 text-green-600 font-bold">{formatINR(p.earned)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {drill && <DrillModal title={drill.title} leads={drill.leads} onClose={() => setDrill(null)} />}
    </div>
  )
}
