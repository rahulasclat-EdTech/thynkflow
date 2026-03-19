// web-admin/src/pages/ProductDashboardPage.jsx
import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'

function fmtMoney(n) {
  const num = parseFloat(n) || 0
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr'
  if (num >= 100000)   return '₹' + (num / 100000).toFixed(2) + ' L'
  if (num >= 1000)     return '₹' + (num / 1000).toFixed(1) + 'K'
  return '₹' + num.toFixed(0)
}

function pct(a, b) {
  return b > 0 ? Math.min((a / b) * 100, 100).toFixed(1) : '0'
}

function ProgressBar({ value, max, color = '#16a34a' }) {
  const p = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: color }} />
    </div>
  )
}

const VIEW_OPTIONS = [
  { value: 'all',      label: '📦 + 👤 All (Product + Agent)' },
  { value: 'products', label: '📦 By Product' },
  { value: 'agents',   label: '👤 By Agent' },
]

export default function ProductDashboardPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [viewMode, setViewMode]     = useState('all')
  const [agents, setAgents]         = useState([])
  const [products, setProducts]     = useState([])
  const [filterAgent, setFilterAgent]     = useState('')
  const [filterProduct, setFilterProduct] = useState('')

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(r => {
        // interceptor returns body directly, so r = {success, data}
        const list = r.data?.data || r.data || []
        setAgents(Array.isArray(list) ? list.filter(u => ['agent','admin'].includes(u.role_name)) : [])
      }).catch(() => {})
    }
    api.get('/products/active').then(r => {
      const list = r.data?.data || r.data || []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => {})
  }, [isAdmin])

  const fetchData = async (agentF, productF) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (isAdmin && agentF)  params.set('agent_id',   agentF)
      if (productF)           params.set('product_id', productF)
      // interceptor returns body directly: {success, data: {product_stats, agent_breakdown, ...}}
      const body = await api.get(`/products/dashboard?${params}`)
      setData(body.data?.data || body.data || {})
    } catch (err) {
      console.error('Products dashboard error:', err)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    fetchData(filterAgent, filterProduct)
  }, [filterAgent, filterProduct])

  useEffect(() => {
    const t = setInterval(() => fetchData(filterAgent, filterProduct), 60000)
    return () => clearInterval(t)
  }, [filterAgent, filterProduct])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const productStats   = data?.product_stats   || []
  const agentBreakdown = data?.agent_breakdown  || []

  const agentMap = {}
  agentBreakdown.forEach(row => {
    if (!agentMap[row.agent_id]) {
      agentMap[row.agent_id] = {
        agent_id: row.agent_id, agent_name: row.agent_name,
        total_leads: 0, converted: 0, not_interested: 0,
        potential: 0, earned: 0, lost: 0, still_to_earn: 0, products: []
      }
    }
    const a = agentMap[row.agent_id]
    a.total_leads    += parseInt(row.total_leads || 0)
    a.converted      += parseInt(row.converted || 0)
    a.not_interested += parseInt(row.not_interested || 0)
    a.potential      += parseFloat(row.potential || 0)
    a.earned         += parseFloat(row.earned || 0)
    a.lost           += parseFloat(row.lost || 0)
    a.still_to_earn  += parseFloat(row.still_to_earn || 0)
    a.products.push(row)
  })
  const agentList = Object.values(agentMap).sort((a, b) => b.earned - a.earned)

  const totalPotential = parseFloat(data?.total_potential     || 0)
  const totalEarned    = parseFloat(data?.total_actual_earned || 0)
  const totalLost      = parseFloat(data?.total_earning_lost  || 0)
  const totalStill     = parseFloat(data?.total_still_to_earn || 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📦 Products Dashboard</h1>
          <p className="text-slate-500 text-sm">{isAdmin ? 'All products & agent performance' : 'Your product performance'}</p>
        </div>
        <button onClick={() => fetchData(filterAgent, filterProduct)}
          className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium">
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
      {(isAdmin || products.length > 0) && (
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
          {isAdmin && agents.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Agent:</label>
              <select className="input w-44 text-sm" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
                <option value="">All Agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Product:</label>
            <select className="input w-44 text-sm" value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
              <option value="">All Products</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600 whitespace-nowrap">View:</label>
              <select className="input w-56 text-sm" value={viewMode} onChange={e => setViewMode(e.target.value)}>
                {VIEW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {(filterAgent || filterProduct) && (
            <button onClick={() => { setFilterAgent(''); setFilterProduct('') }}
              className="text-xs text-slate-400 hover:text-slate-600 underline">Reset</button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Earning Potential', val: totalPotential, color: '#7c3aed', bg: '#f5f3ff', icon: '💰' },
          { label: 'Actual Earned',     val: totalEarned,    color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
          { label: 'Earning Lost',      val: totalLost,      color: '#dc2626', bg: '#fef2f2', icon: '❌' },
          { label: 'Still To Earn',     val: totalStill,     color: '#d97706', bg: '#fffbeb', icon: '⏳' },
        ].map(({ label, val, color, bg, icon }) => (
          <div key={label} className="card p-4" style={{ borderLeft: `4px solid ${color}` }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{icon}</span>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
            </div>
            <p className="text-2xl font-black" style={{ color }}>{fmtMoney(val)}</p>
          </div>
        ))}
      </div>

      {/* Achievement bar */}
      {totalPotential > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Overall Achievement Rate</p>
            <p className="text-sm font-black text-green-600">{pct(totalEarned, totalPotential)}%</p>
          </div>
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${pct(totalEarned, totalPotential)}%` }} title="Earned" />
            <div className="h-full bg-red-400 transition-all" style={{ width: `${pct(totalLost, totalPotential)}%` }} title="Lost" />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"/>Earned {pct(totalEarned,totalPotential)}%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"/>Lost {pct(totalLost,totalPotential)}%</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/>Remaining {pct(totalStill,totalPotential)}%</span>
          </div>
        </div>
      )}

      {/* By Product */}
      {(viewMode === 'products' || viewMode === 'all') && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">📦 By Product</h2>
            <span className="text-xs text-slate-400">{productStats.length} products</span>
          </div>
          {productStats.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No product data</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Product','Type','₹/Closure','Total Leads','Converted','Not Int.','Hot','Warm',
                      'Potential','Earned','Lost','Still To Earn','Achievement'].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productStats.map(p => {
                    const achPct = parseFloat(pct(p.actual_earned, p.total_potential_earning))
                    return (
                      <tr key={p.product_id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">{p.product_name}</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {p.product_type || 'B2C'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{fmtMoney(p.per_closure_earning)}</td>
                        <td className="px-3 py-3 font-bold text-blue-600">{p.total_leads}</td>
                        <td className="px-3 py-3 font-bold text-green-600">{p.converted_leads}</td>
                        <td className="px-3 py-3 text-red-500">{p.not_interested_leads}</td>
                        <td className="px-3 py-3 text-red-400">{p.hot_leads}</td>
                        <td className="px-3 py-3 text-amber-500">{p.warm_leads}</td>
                        <td className="px-3 py-3 font-semibold text-purple-600 whitespace-nowrap">{fmtMoney(p.total_potential_earning)}</td>
                        <td className="px-3 py-3 font-bold text-green-600 whitespace-nowrap">{fmtMoney(p.actual_earned)}</td>
                        <td className="px-3 py-3 font-semibold text-red-500 whitespace-nowrap">{fmtMoney(p.earning_lost)}</td>
                        <td className="px-3 py-3 font-semibold text-amber-600 whitespace-nowrap">{fmtMoney(p.still_to_earn)}</td>
                        <td className="px-3 py-3 min-w-[100px]">
                          <div className="flex items-center gap-2">
                            <ProgressBar value={p.actual_earned} max={p.total_potential_earning}
                              color={achPct >= 70 ? '#16a34a' : achPct >= 40 ? '#d97706' : '#dc2626'} />
                            <span className="text-xs font-bold whitespace-nowrap"
                              style={{ color: achPct >= 70 ? '#16a34a' : achPct >= 40 ? '#d97706' : '#dc2626' }}>
                              {achPct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t font-bold">
                  <tr>
                    <td className="px-3 py-3 font-bold" colSpan={3}>Total</td>
                    <td className="px-3 py-3 text-blue-600">{data?.total_leads || 0}</td>
                    <td className="px-3 py-3 text-green-600">{data?.total_converted || 0}</td>
                    <td className="px-3 py-3 text-red-500">{data?.total_not_interested || 0}</td>
                    <td className="px-3 py-3" colSpan={2}/>
                    <td className="px-3 py-3 text-purple-600 whitespace-nowrap">{fmtMoney(totalPotential)}</td>
                    <td className="px-3 py-3 text-green-600 whitespace-nowrap">{fmtMoney(totalEarned)}</td>
                    <td className="px-3 py-3 text-red-500 whitespace-nowrap">{fmtMoney(totalLost)}</td>
                    <td className="px-3 py-3 text-amber-600 whitespace-nowrap">{fmtMoney(totalStill)}</td>
                    <td className="px-3 py-3">{pct(totalEarned, totalPotential)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* By Agent */}
      {(viewMode === 'agents' || viewMode === 'all') && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">👤 By Agent</h2>
            <span className="text-xs text-slate-400">{agentList.length} agents</span>
          </div>
          {agentList.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No agent data</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Agent','Leads','Converted','Not Int.','Conv %','Potential','Earned','Lost','Still To Earn','Achievement'].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agentList.map((a, i) => {
                    const convRate = parseFloat(pct(a.converted, a.total_leads))
                    const achPct   = parseFloat(pct(a.earned, a.potential))
                    return (
                      <tr key={a.agent_id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ background: i < 3 ? '#4f46e5' : '#9ca3af' }}>
                              {a.agent_name?.charAt(0)?.toUpperCase()}
                            </div>
                            {['🥇','🥈','🥉'][i] || ''} {a.agent_name}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-bold text-blue-600">{a.total_leads}</td>
                        <td className="px-3 py-3 font-bold text-green-600">{a.converted}</td>
                        <td className="px-3 py-3 text-red-500">{a.not_interested}</td>
                        <td className="px-3 py-3">
                          <span className={`font-bold text-sm ${convRate >= 20 ? 'text-green-600' : convRate >= 10 ? 'text-amber-500' : 'text-red-400'}`}>
                            {convRate}%
                          </span>
                        </td>
                        <td className="px-3 py-3 text-purple-600 whitespace-nowrap">{fmtMoney(a.potential)}</td>
                        <td className="px-3 py-3 font-bold text-green-600 whitespace-nowrap">{fmtMoney(a.earned)}</td>
                        <td className="px-3 py-3 font-semibold text-red-500 whitespace-nowrap">{fmtMoney(a.lost)}</td>
                        <td className="px-3 py-3 text-amber-600 whitespace-nowrap">{fmtMoney(a.still_to_earn)}</td>
                        <td className="px-3 py-3 min-w-[100px]">
                          <div className="flex items-center gap-2">
                            <ProgressBar value={a.earned} max={a.potential}
                              color={achPct >= 70 ? '#16a34a' : achPct >= 40 ? '#d97706' : '#dc2626'} />
                            <span className="text-xs font-bold whitespace-nowrap"
                              style={{ color: achPct >= 70 ? '#16a34a' : achPct >= 40 ? '#d97706' : '#dc2626' }}>
                              {achPct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t">
                  <tr>
                    <td className="px-3 py-3 font-bold">Total</td>
                    <td className="px-3 py-3 font-bold text-blue-600">{agentList.reduce((s,a)=>s+a.total_leads,0)}</td>
                    <td className="px-3 py-3 font-bold text-green-600">{agentList.reduce((s,a)=>s+a.converted,0)}</td>
                    <td className="px-3 py-3 font-bold text-red-500">{agentList.reduce((s,a)=>s+a.not_interested,0)}</td>
                    <td className="px-3 py-3"/>
                    <td className="px-3 py-3 font-bold text-purple-600 whitespace-nowrap">{fmtMoney(agentList.reduce((s,a)=>s+a.potential,0))}</td>
                    <td className="px-3 py-3 font-bold text-green-600 whitespace-nowrap">{fmtMoney(agentList.reduce((s,a)=>s+a.earned,0))}</td>
                    <td className="px-3 py-3 font-bold text-red-500 whitespace-nowrap">{fmtMoney(agentList.reduce((s,a)=>s+a.lost,0))}</td>
                    <td className="px-3 py-3 font-bold text-amber-600 whitespace-nowrap">{fmtMoney(agentList.reduce((s,a)=>s+a.still_to_earn,0))}</td>
                    <td className="px-3 py-3"/>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Product x Agent breakdown */}
      {viewMode === 'all' && agentBreakdown.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-bold text-slate-800">📦 + 👤 Product × Agent Breakdown</h2>
            <p className="text-xs text-slate-400 mt-0.5">Each agent's performance per product</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Agent','Product','Leads','Converted','Not Int.','Potential','Earned','Lost','Still To Earn'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agentBreakdown.map((row, i) => (
                  <tr key={`${row.agent_id}-${row.product_id}-${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium whitespace-nowrap">{row.agent_name}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{row.product_name}</td>
                    <td className="px-3 py-3 text-blue-600 font-bold">{row.total_leads}</td>
                    <td className="px-3 py-3 text-green-600 font-bold">{row.converted}</td>
                    <td className="px-3 py-3 text-red-500">{row.not_interested}</td>
                    <td className="px-3 py-3 text-purple-600 whitespace-nowrap">{fmtMoney(row.potential)}</td>
                    <td className="px-3 py-3 text-green-600 font-bold whitespace-nowrap">{fmtMoney(row.earned)}</td>
                    <td className="px-3 py-3 text-red-500 whitespace-nowrap">{fmtMoney(row.lost)}</td>
                    <td className="px-3 py-3 text-amber-600 whitespace-nowrap">{fmtMoney(row.still_to_earn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
