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

function StatusPill({ status, count }) {
  if (!count || parseInt(count) === 0) return null
  const c = STATUS_COLORS[status] || STATUS_COLORS.new
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full mr-1 mb-1"
      style={{ background: c.bg, color: c.text }}>
      {status?.replace(/_/g, ' ')} · {count}
    </span>
  )
}

function formatINR(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
}

// Agent Earning Card
function EarningCard({ label, amount, icon, color, sublabel }) {
  return (
    <div className="rounded-2xl p-5 border border-slate-200 bg-white">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-medium text-slate-400">{sublabel}</span>
      </div>
      <p className="text-2xl font-black" style={{ color }}>{formatINR(amount)}</p>
      <p className="text-sm text-slate-500 mt-1 font-medium">{label}</p>
    </div>
  )
}

// Product Card for Agent
function AgentProductCard({ product }) {
  const convRate = product.total_leads > 0
    ? ((product.converted_leads / product.total_leads) * 100).toFixed(1)
    : 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-slate-800 text-base">{product.product_name}</h3>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${product.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {product.product_type}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            ₹{Number(product.per_closure_earning).toLocaleString('en-IN')} per closure
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-slate-800">{product.total_leads}</p>
          <p className="text-xs text-slate-400">total leads</p>
        </div>
      </div>

      {/* Status pills */}
      <div className="mb-4 min-h-[32px]">
        <StatusPill status="new" count={product.new_leads} />
        <StatusPill status="hot" count={product.hot_leads} />
        <StatusPill status="warm" count={product.warm_leads} />
        <StatusPill status="cold" count={product.cold_leads} />
        <StatusPill status="converted" count={product.converted_leads} />
        <StatusPill status="call_back" count={product.call_back_leads} />
        <StatusPill status="not_interested" count={product.not_interested_leads} />
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Conversion progress</span>
          <span className="font-bold text-green-600">{convRate}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, convRate)}%` }} />
        </div>
      </div>

      {/* Earning section */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
          <p className="text-xs text-amber-600 font-medium mb-1">💰 Potential Earning</p>
          <p className="text-base font-black text-amber-700">
            {formatINR(product.total_potential_earning)}
          </p>
          <p className="text-xs text-amber-500 mt-0.5">
            {product.total_leads} leads × {formatINR(product.per_closure_earning)}
          </p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
          <p className="text-xs text-green-600 font-medium mb-1">✅ Actual Earned</p>
          <p className="text-base font-black text-green-700">
            {formatINR(product.actual_earned)}
          </p>
          <p className="text-xs text-green-500 mt-0.5">
            {product.converted_leads} converted × {formatINR(product.per_closure_earning)}
          </p>
        </div>
      </div>
    </div>
  )
}

// Admin Product Card
function AdminProductCard({ product, agentBreakdown, onExpand, expanded }) {
  const agents = agentBreakdown.filter(a => a.product_id === product.product_id)
  const convRate = product.total_leads > 0
    ? ((product.converted_leads / product.total_leads) * 100).toFixed(1)
    : 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all">
      {/* Card Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-slate-800 text-lg">{product.product_name}</h3>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${product.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {product.product_type}
              </span>
            </div>
            <p className="text-sm text-slate-500">
              ₹{Number(product.per_closure_earning).toLocaleString('en-IN')} per closure · {agents.length} agents working
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-slate-800">{product.total_leads}</p>
            <p className="text-xs text-slate-400">total leads</p>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Lead Status Breakdown</p>
          <div>
            <StatusPill status="new" count={product.new_leads} />
            <StatusPill status="hot" count={product.hot_leads} />
            <StatusPill status="warm" count={product.warm_leads} />
            <StatusPill status="cold" count={product.cold_leads} />
            <StatusPill status="converted" count={product.converted_leads} />
            <StatusPill status="call_back" count={product.call_back_leads} />
            <StatusPill status="not_interested" count={product.not_interested_leads} />
          </div>
        </div>

        {/* Conversion bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Overall conversion</span>
            <span className="font-bold text-green-600">{convRate}%</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, convRate)}%` }} />
          </div>
        </div>

        {/* Earning summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">Per Closure</p>
            <p className="font-black text-slate-800">{formatINR(product.per_closure_earning)}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
            <p className="text-xs text-amber-600 mb-1">💰 Total Potential</p>
            <p className="font-black text-amber-700">{formatINR(product.total_potential_earning)}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
            <p className="text-xs text-green-600 mb-1">✅ Actual Earned</p>
            <p className="font-black text-green-700">{formatINR(product.actual_earned)}</p>
          </div>
        </div>
      </div>

      {/* Agent Breakdown toggle */}
      {agents.length > 0 && (
        <>
          <button
            onClick={() => onExpand(product.product_id)}
            className="w-full px-5 py-3 bg-slate-50 border-t border-slate-100 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-between"
          >
            <span>👤 Agent-wise breakdown ({agents.length} agents)</span>
            <span>{expanded ? '▲ Hide' : '▼ Show'}</span>
          </button>

          {expanded && (
            <div className="border-t border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Agent</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Leads</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Hot</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Warm</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Converted</th>
                    <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map(agent => (
                    <tr key={agent.agent_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{agent.agent_name}</td>
                      <td className="px-4 py-2.5 font-bold text-blue-600">{agent.total_leads}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">{agent.hot}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{agent.warm}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600">{agent.converted}</span>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-green-600">{formatINR(agent.earned)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200">
                  <tr>
                    <td className="px-4 py-2 font-bold text-slate-700">Total</td>
                    <td className="px-4 py-2 font-bold">{agents.reduce((s, a) => s + parseInt(a.total_leads || 0), 0)}</td>
                    <td className="px-4 py-2 font-bold text-red-600">{agents.reduce((s, a) => s + parseInt(a.hot || 0), 0)}</td>
                    <td className="px-4 py-2 font-bold text-amber-600">{agents.reduce((s, a) => s + parseInt(a.warm || 0), 0)}</td>
                    <td className="px-4 py-2 font-bold text-green-600">{agents.reduce((s, a) => s + parseInt(a.converted || 0), 0)}</td>
                    <td className="px-4 py-2 font-bold text-green-600">
                      {formatINR(agents.reduce((s, a) => s + parseFloat(a.earned || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ProductDashboardPage() {
  const { user, isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedProduct, setExpandedProduct] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/products/dashboard')
      setData(res.data)
    } catch (err) {
      toast.error('Failed to load product dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleExpand = (productId) => {
    setExpandedProduct(prev => prev === productId ? null : productId)
  }

  const products = data?.product_stats || []
  const agentBreakdown = data?.agent_breakdown || []

  // Summary totals
  const totalLeads = products.reduce((s, p) => s + parseInt(p.total_leads || 0), 0)
  const totalConverted = products.reduce((s, p) => s + parseInt(p.converted_leads || 0), 0)
  const totalPotential = products.reduce((s, p) => s + parseFloat(p.total_potential_earning || 0), 0)
  const totalEarned = products.reduce((s, p) => s + parseFloat(p.actual_earned || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isAdmin ? '📦 Product Dashboard' : '📦 My Product Performance'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin
              ? 'Product-wise lead analytics with agent breakdown'
              : `Welcome ${user?.name} · Your leads and earning potential by product`}
          </p>
        </div>
        <button onClick={fetchData} className="btn-secondary">🔄 Refresh</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Loading product data...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <p className="text-3xl font-black text-blue-600">{products.length}</p>
              <p className="text-sm text-slate-500 mt-1">Active Products</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
              <p className="text-3xl font-black text-slate-800">{totalLeads}</p>
              <p className="text-sm text-slate-500 mt-1">Total Leads</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-amber-700">{formatINR(totalPotential)}</p>
              <p className="text-sm text-amber-600 mt-1">💰 Total Potential</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-green-700">{formatINR(totalEarned)}</p>
              <p className="text-sm text-green-600 mt-1">✅ {isAdmin ? 'Total Paid Out' : 'You Earned'}</p>
            </div>
          </div>

          {/* Agent view: additional earning summary */}
          {!isAdmin && (
            <div className="grid grid-cols-3 gap-4">
              <EarningCard
                label="Potential Earning"
                amount={totalPotential}
                icon="💰"
                color="#d97706"
                sublabel="If all leads convert"
              />
              <EarningCard
                label="Actual Earned"
                amount={totalEarned}
                icon="✅"
                color="#16a34a"
                sublabel="From conversions so far"
              />
              <EarningCard
                label="Remaining Opportunity"
                amount={totalPotential - totalEarned}
                icon="🎯"
                color="#2563eb"
                sublabel="Still to be earned"
              />
            </div>
          )}

          {/* No products state */}
          {products.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
              <p className="text-5xl mb-4">📦</p>
              <p className="text-lg font-bold text-slate-700 mb-2">No Products Found</p>
              <p className="text-slate-400 text-sm">
                {isAdmin
                  ? 'Go to Settings → Products tab to add your first product'
                  : 'No products have been assigned to your leads yet'}
              </p>
            </div>
          ) : (
            <>
              {/* Product cards */}
              <div className={isAdmin ? 'space-y-6' : 'grid grid-cols-1 lg:grid-cols-2 gap-5'}>
                {products.map(product => (
                  isAdmin ? (
                    <AdminProductCard
                      key={product.product_id}
                      product={product}
                      agentBreakdown={agentBreakdown}
                      onExpand={toggleExpand}
                      expanded={expandedProduct === product.product_id}
                    />
                  ) : (
                    <AgentProductCard
                      key={product.product_id}
                      product={product}
                    />
                  )
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
