// web-admin/src/pages/ProductAnalyticsPage.jsx
// Full product-wise analytics: trends, status breakdown, agent comparison, conversion, earnings
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'

/* ─── helpers ─────────────────────────────────────────────── */
function fmtMoney(n) {
  const v = parseFloat(n) || 0
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(2) + ' Cr'
  if (v >= 100000)   return '₹' + (v / 100000).toFixed(2) + ' L'
  if (v >= 1000)     return '₹' + (v / 1000).toFixed(1) + 'K'
  return '₹' + v.toFixed(0)
}
function pct(a, b) { return b > 0 ? Math.min((a / b) * 100, 100).toFixed(1) : '0.0' }
function num(v) { return parseInt(v) || 0 }
function money(v) { return parseFloat(v) || 0 }

const STATUS_META = {
  new:            { label: 'New',           color: '#3b82f6', bg: '#dbeafe' },
  hot:            { label: 'Hot',           color: '#ef4444', bg: '#fee2e2' },
  warm:           { label: 'Warm',          color: '#f59e0b', bg: '#fef3c7' },
  cold:           { label: 'Cold',          color: '#94a3b8', bg: '#e2e8f0' },
  call_back:      { label: 'Call Back',     color: '#8b5cf6', bg: '#ede9fe' },
  not_interested: { label: 'Not Int.',      color: '#64748b', bg: '#f1f5f9' },
  converted:      { label: 'Converted',     color: '#16a34a', bg: '#dcfce7' },
}
const ALL_STATUSES = Object.keys(STATUS_META)

const PRODUCT_COLORS = ['#4f46e5','#0891b2','#16a34a','#d97706','#dc2626','#7c3aed','#0f766e','#be185d']

/* ─── sub-components ──────────────────────────────────────── */
function Badge({ status }) {
  const m = STATUS_META[status] || { label: status, color: '#64748b', bg: '#f1f5f9' }
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
      style={{ background: m.bg, color: m.color }}>
      {m.label}
    </span>
  )
}

function KpiCard({ icon, label, value, color, sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function BarH({ value, max, color, label, sub, onClick }) {
  const p = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className={`group ${onClick ? 'cursor-pointer' : ''}`} onClick={onClick}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700 truncate max-w-[140px]" title={label}>{label}</span>
        <span className="text-sm font-bold" style={{ color }}>{sub ?? value}</span>
      </div>
      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p}%`, background: color }} />
      </div>
    </div>
  )
}

function StackedBar({ segments, total }) {
  return (
    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
      {segments.map(({ color, value }) => {
        const p = total > 0 ? Math.min((value / total) * 100, 100) : 0
        return p > 0 ? (
          <div key={color} className="h-full transition-all" style={{ width: `${p}%`, background: color }} title={`${value}`} />
        ) : null
      })}
    </div>
  )
}

function SectionHeader({ title, count, onExport }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
      <h2 className="font-bold text-slate-800">{title}</h2>
      <div className="flex items-center gap-3">
        {count != null && <span className="text-xs text-slate-400">{count} items</span>}
        {onExport && (
          <button onClick={onExport}
            className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium">
            📥 Export
          </button>
        )}
      </div>
    </div>
  )
}

function DrillModal({ title, rows, onClose }) {
  if (!rows) return null
  const exportXls = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Data')
    XLSX.writeFile(wb, `${title.replace(/\s/g,'_')}.xlsx`)
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-400">{rows.length} records</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-600">✕</button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>{['Name / School','Phone','Agent','Status','Notes','Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0
                ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">No records</td></tr>
                : rows.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{r.school_name || r.contact_name || r.name || '—'}</td>
                    <td className="px-4 py-3 text-blue-600">{r.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{r.agent_name || '—'}</td>
                    <td className="px-4 py-3"><Badge status={r.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-[140px] truncate">{r.notes || r.discussion || r.admin_remark || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {(() => { try { const d = r.created_at || r.updated_at; return d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—' } catch { return '—' } })()}
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={exportXls} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">📥 Export XLSX</button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm">Close</button>
        </div>
      </div>
    </div>
  )
}

/* ─── main page ──────────────────────────────────────────── */
const TABS = [
  { key: 'overview',   label: '📊 Overview' },
  { key: 'status',     label: '🏷️ Status Breakdown' },
  { key: 'earnings',   label: '💰 Earnings' },
  { key: 'agents',     label: '👤 Agent vs Product' },
  { key: 'trends',     label: '📈 Trends' },
  { key: 'conversion', label: '✅ Conversion' },
]

export default function ProductAnalyticsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1 || user?.role_name === 'admin'

  const [tab, setTab]                 = useState('overview')
  const [products, setProducts]       = useState([])
  const [agents, setAgents]           = useState([])
  const [filterProduct, setFilterProduct] = useState('')
  const [filterAgent, setFilterAgent]   = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')

  const [dashData, setDashData]         = useState(null)
  const [trendsData, setTrendsData]     = useState([])
  const [convData, setConvData]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [drill, setDrill]               = useState(null)

  // Load agents + products
  useEffect(() => {
    api.get('/products/active').then(r => {
      const list = r?.data || r || []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => {})
    if (isAdmin) {
      api.get('/users').then(r => {
        const list = r?.data || r || []
        setAgents(Array.isArray(list) ? list.filter(u => ['agent','admin'].includes(u.role_name)) : [])
      }).catch(() => {})
    }
  }, [isAdmin])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (isAdmin && filterAgent) p.set('agent_id', filterAgent)
      if (filterProduct)          p.set('product_id', filterProduct)

      const tp = new URLSearchParams(p)
      if (dateFrom) tp.set('from', dateFrom)
      if (dateTo)   tp.set('to', dateTo)

      const [dash, trends, conv] = await Promise.all([
        api.get(`/products/dashboard?${p}`).catch(() => ({})),
        api.get(`/products/trends?${tp}`).catch(() => ({ data: [] })),
        api.get(`/products/conversion?${tp}`).catch(() => ({ data: [] })),
      ])

      setDashData(dash?.data || dash || {})
      setTrendsData(Array.isArray(trends?.data) ? trends.data : [])
      setConvData(Array.isArray(conv?.data) ? conv.data : [])
    } finally { setLoading(false) }
  }, [filterProduct, filterAgent, dateFrom, dateTo, isAdmin])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openDrill = async (title, params) => {
    try {
      const q = new URLSearchParams(params)
      const r = await api.get(`/leads?${q}`)
      const list = r?.data || r || []
      setDrill({ title, rows: Array.isArray(list) ? list : [] })
    } catch { setDrill({ title, rows: [] }) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const productStats   = dashData?.product_stats   || []
  const agentBreakdown = dashData?.agent_breakdown  || []

  const totPotential = money(dashData?.total_potential)
  const totEarned    = money(dashData?.total_actual_earned)
  const totLost      = money(dashData?.total_earning_lost)
  const totStill     = money(dashData?.total_still_to_earn)
  const totLeads     = num(dashData?.total_leads)
  const totConverted = num(dashData?.total_converted)
  const totNI        = num(dashData?.total_not_interested)

  // aggregate by status across products
  const statusTotals = ALL_STATUSES.reduce((acc, s) => {
    acc[s] = productStats.reduce((sum, p) => sum + num(p[`${s}_leads`] || p[`${s}`]), 0)
    return acc
  }, {})

  const exportProductTable = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productStats), 'Product Analytics')
    XLSX.writeFile(wb, 'product_analytics.xlsx')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📊 Product Analytics</h1>
          <p className="text-slate-500 text-sm">Deep-dive performance analysis by product</p>
        </div>
        <button onClick={fetchAll}
          className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-medium">
          🔄 Refresh
        </button>
      </div>

      {/* Filters */}
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
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">From:</label>
          <input type="date" className="input text-sm w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-600 whitespace-nowrap">To:</label>
          <input type="date" className="input text-sm w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {(filterAgent || filterProduct || dateFrom || dateTo) && (
          <button onClick={() => { setFilterAgent(''); setFilterProduct(''); setDateFrom(''); setDateTo('') }}
            className="text-xs text-slate-400 hover:text-slate-600 underline">Reset</button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon="📦" label="Total Leads"      value={totLeads.toLocaleString()}    color="#2563eb" sub={`${products.length} products`} />
        <KpiCard icon="✅" label="Converted"         value={totConverted.toLocaleString()} color="#16a34a" sub={`${pct(totConverted, totLeads)}% rate`} />
        <KpiCard icon="❌" label="Not Interested"    value={totNI.toLocaleString()}        color="#dc2626" sub={`${pct(totNI, totLeads)}% of leads`} />
        <KpiCard icon="💰" label="Actual Earned"     value={fmtMoney(totEarned)}           color="#7c3aed" sub={`of ${fmtMoney(totPotential)} potential`} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-white border border-slate-200 rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={tab === t.key ? { background: '#4f46e5', color: '#fff' } : { color: '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ──────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          {/* Product cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {productStats.map((p, i) => {
              const color = PRODUCT_COLORS[i % PRODUCT_COLORS.length]
              const convRate = parseFloat(pct(p.converted_leads, p.total_leads))
              const achPct   = parseFloat(pct(p.actual_earned, p.total_potential_earning))
              return (
                <div key={p.product_id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setFilterProduct(String(p.product_id))}>
                  <div className="p-4 flex items-start justify-between" style={{ borderTop: `4px solid ${color}` }}>
                    <div>
                      <h3 className="font-bold text-slate-800">{p.product_name}</h3>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                        {p.product_type || 'B2C'}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black" style={{ color }}>{num(p.total_leads)}</p>
                      <p className="text-xs text-slate-400">leads</p>
                    </div>
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div><p className="font-bold text-green-600">{num(p.converted_leads)}</p><p className="text-slate-400">Converted</p></div>
                      <div><p className="font-bold text-red-400">{num(p.hot_leads)}</p><p className="text-slate-400">Hot</p></div>
                      <div><p className="font-bold text-amber-500">{num(p.warm_leads)}</p><p className="text-slate-400">Warm</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-500">Conv. Rate</span>
                        <span className="font-bold" style={{ color: convRate >= 20 ? '#16a34a' : convRate >= 10 ? '#d97706' : '#dc2626' }}>{convRate}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${convRate}%`, background: convRate >= 20 ? '#16a34a' : convRate >= 10 ? '#d97706' : '#dc2626' }} />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs">
                      <div><p className="text-slate-400">Potential</p><p className="font-semibold text-purple-600">{fmtMoney(p.total_potential_earning)}</p></div>
                      <div className="text-right"><p className="text-slate-400">Earned</p><p className="font-bold text-green-600">{fmtMoney(p.actual_earned)}</p></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">Achievement</span><span className="font-bold text-indigo-600">{achPct}%</span></div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${achPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Comparison bars */}
          {productStats.length > 1 && (
            <div className="card p-5">
              <h3 className="font-bold text-slate-800 mb-4">📊 Lead Volume Comparison</h3>
              <div className="space-y-3">
                {[...productStats].sort((a,b) => num(b.total_leads) - num(a.total_leads)).map((p, i) => (
                  <BarH key={p.product_id}
                    label={p.product_name}
                    value={num(p.total_leads)}
                    max={num(productStats[0]?.total_leads) || 1}
                    color={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
                    sub={`${num(p.total_leads)} leads`}
                    onClick={() => openDrill(`${p.product_name} — All Leads`, { product_id: p.product_id })}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Status Breakdown Tab ──────────────────────────── */}
      {tab === 'status' && (
        <>
          {/* Overall status donut-style legend */}
          <div className="card p-5">
            <h3 className="font-bold text-slate-800 mb-4">🏷️ Overall Status Distribution</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {ALL_STATUSES.map(s => {
                const m = STATUS_META[s]
                const cnt = statusTotals[s] || 0
                return (
                  <div key={s} className="rounded-xl border p-3 text-center"
                    style={{ borderColor: m.color + '40', background: m.bg }}>
                    <p className="text-2xl font-black" style={{ color: m.color }}>{cnt}</p>
                    <p className="text-xs font-semibold" style={{ color: m.color }}>{m.label}</p>
                    <p className="text-xs text-slate-400">{pct(cnt, totLeads)}%</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Per-product status stacked table */}
          <div className="card overflow-hidden">
            <SectionHeader title="Status Breakdown by Product" count={productStats.length} onExport={exportProductTable} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">Product</th>
                    {ALL_STATUSES.map(s => (
                      <th key={s} className="text-left px-3 py-3 text-xs font-semibold uppercase whitespace-nowrap"
                        style={{ color: STATUS_META[s].color }}>{STATUS_META[s].label}</th>
                    ))}
                    <th className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase">Total</th>
                    <th className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase min-w-[120px]">Distribution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productStats.map((p, i) => {
                    const total = num(p.total_leads)
                    const segments = ALL_STATUSES.map(s => ({
                      color: STATUS_META[s].color,
                      value: num(p[`${s}_leads`] || p[s] || 0),
                    }))
                    return (
                      <tr key={p.product_id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold text-slate-800 whitespace-nowrap">
                          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                          {p.product_name}
                        </td>
                        {ALL_STATUSES.map(s => {
                          const cnt = num(p[`${s}_leads`] || p[s] || 0)
                          return (
                            <td key={s} className="px-3 py-3 font-medium cursor-pointer hover:underline"
                              style={{ color: STATUS_META[s].color }}
                              onClick={() => openDrill(`${p.product_name} — ${STATUS_META[s].label}`, { product_id: p.product_id, status: s })}>
                              {cnt}
                            </td>
                          )
                        })}
                        <td className="px-3 py-3 font-bold text-slate-700">{total}</td>
                        <td className="px-3 py-3 min-w-[120px]"><StackedBar segments={segments} total={total} /></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t font-bold">
                  <tr>
                    <td className="px-3 py-3 font-bold text-slate-800">Total</td>
                    {ALL_STATUSES.map(s => (
                      <td key={s} className="px-3 py-3 font-bold" style={{ color: STATUS_META[s].color }}>
                        {productStats.reduce((sum, p) => sum + num(p[`${s}_leads`] || p[s] || 0), 0)}
                      </td>
                    ))}
                    <td className="px-3 py-3 font-bold text-slate-700">{totLeads}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Earnings Tab ──────────────────────────────────── */}
      {tab === 'earnings' && (
        <>
          {/* Earnings summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon="💰" label="Earning Potential" value={fmtMoney(totPotential)} color="#7c3aed" />
            <KpiCard icon="✅" label="Actual Earned"     value={fmtMoney(totEarned)}    color="#16a34a" sub={`${pct(totEarned, totPotential)}% of potential`} />
            <KpiCard icon="❌" label="Earning Lost"      value={fmtMoney(totLost)}      color="#dc2626" />
            <KpiCard icon="⏳" label="Still To Earn"     value={fmtMoney(totStill)}     color="#d97706" />
          </div>

          {/* Achievement bar */}
          {totPotential > 0 && (
            <div className="card p-5">
              <div className="flex justify-between mb-2">
                <p className="font-semibold text-slate-700">Overall Achievement Rate</p>
                <p className="font-black text-green-600">{pct(totEarned, totPotential)}%</p>
              </div>
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-green-500" style={{ width: `${pct(totEarned, totPotential)}%` }} />
                <div className="h-full bg-red-400" style={{ width: `${pct(totLost, totPotential)}%` }} />
              </div>
              <div className="flex gap-5 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Earned {pct(totEarned,totPotential)}%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />Lost {pct(totLost,totPotential)}%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Remaining {pct(totStill,totPotential)}%</span>
              </div>
            </div>
          )}

          {/* Per-product earnings bars */}
          <div className="card p-5">
            <h3 className="font-bold text-slate-800 mb-4">💰 Earnings by Product</h3>
            <div className="space-y-4">
              {[...productStats].sort((a,b) => money(b.actual_earned) - money(a.actual_earned)).map((p, i) => {
                const color = PRODUCT_COLORS[i % PRODUCT_COLORS.length]
                const achPct = parseFloat(pct(p.actual_earned, p.total_potential_earning))
                return (
                  <div key={p.product_id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 text-sm">{p.product_name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-purple-600">{fmtMoney(p.total_potential_earning)}</span>
                        <span className="text-green-600 font-bold">{fmtMoney(p.actual_earned)}</span>
                        <span className="font-bold" style={{ color }}>{achPct}%</span>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${achPct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>₹{money(p.per_closure_earning).toLocaleString()} / closure</span>
                      <span>Lost: {fmtMoney(p.earning_lost)} · Remaining: {fmtMoney(p.still_to_earn)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Earnings table */}
          <div className="card overflow-hidden">
            <SectionHeader title="Detailed Earnings Table" onExport={exportProductTable} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>{['Product','Type','₹/Closure','Total Leads','Converted','Potential','Earned','Lost','Remaining','Achievement'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productStats.map(p => {
                    const ach = parseFloat(pct(p.actual_earned, p.total_potential_earning))
                    return (
                      <tr key={p.product_id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-semibold text-slate-800">{p.product_name}</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {p.product_type || 'B2C'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{fmtMoney(p.per_closure_earning)}</td>
                        <td className="px-3 py-3 font-bold text-blue-600">{num(p.total_leads)}</td>
                        <td className="px-3 py-3 font-bold text-green-600">{num(p.converted_leads)}</td>
                        <td className="px-3 py-3 text-purple-600 font-semibold">{fmtMoney(p.total_potential_earning)}</td>
                        <td className="px-3 py-3 font-bold text-green-600">{fmtMoney(p.actual_earned)}</td>
                        <td className="px-3 py-3 text-red-500">{fmtMoney(p.earning_lost)}</td>
                        <td className="px-3 py-3 text-amber-600">{fmtMoney(p.still_to_earn)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${ach}%`, background: ach >= 70 ? '#16a34a' : ach >= 40 ? '#d97706' : '#dc2626' }} />
                            </div>
                            <span className="text-xs font-bold" style={{ color: ach >= 70 ? '#16a34a' : ach >= 40 ? '#d97706' : '#dc2626' }}>{ach}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-slate-50 border-t font-bold">
                  <tr>
                    <td className="px-3 py-3 font-bold" colSpan={3}>Total</td>
                    <td className="px-3 py-3 text-blue-600">{totLeads}</td>
                    <td className="px-3 py-3 text-green-600">{totConverted}</td>
                    <td className="px-3 py-3 text-purple-600">{fmtMoney(totPotential)}</td>
                    <td className="px-3 py-3 text-green-600">{fmtMoney(totEarned)}</td>
                    <td className="px-3 py-3 text-red-500">{fmtMoney(totLost)}</td>
                    <td className="px-3 py-3 text-amber-600">{fmtMoney(totStill)}</td>
                    <td className="px-3 py-3 text-indigo-600">{pct(totEarned, totPotential)}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Agent vs Product Tab ───────────────────────────── */}
      {tab === 'agents' && (
        <>
          {/* Pivot: product × agent heatmap-style */}
          {agentBreakdown.length > 0 && (() => {
            const agentNames = [...new Set(agentBreakdown.map(r => r.agent_name))]
            const prodNames  = [...new Set(agentBreakdown.map(r => r.product_name))]
            const cellMap = {}
            agentBreakdown.forEach(r => { cellMap[`${r.agent_name}__${r.product_name}`] = r })
            const maxLeads = Math.max(...agentBreakdown.map(r => num(r.total_leads)), 1)

            return (
              <div className="card overflow-hidden">
                <SectionHeader title="Agent × Product Lead Matrix" />
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-3 text-slate-500 font-semibold uppercase whitespace-nowrap min-w-[120px]">Agent</th>
                        {prodNames.map(pn => (
                          <th key={pn} className="px-3 py-3 text-slate-500 font-semibold text-center whitespace-nowrap">{pn}</th>
                        ))}
                        <th className="px-3 py-3 text-slate-500 font-semibold text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {agentNames.map(an => {
                        const agentTotal = agentBreakdown.filter(r => r.agent_name === an).reduce((s, r) => s + num(r.total_leads), 0)
                        return (
                          <tr key={an} className="hover:bg-slate-50">
                            <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">{an}</td>
                            {prodNames.map(pn => {
                              const cell = cellMap[`${an}__${pn}`]
                              const leads = cell ? num(cell.total_leads) : 0
                              const intensity = maxLeads > 0 ? leads / maxLeads : 0
                              return (
                                <td key={pn} className="px-3 py-2 text-center">
                                  {leads > 0 ? (
                                    <div className="inline-flex flex-col items-center">
                                      <span className="font-bold" style={{ color: `rgba(79,70,229,${0.4 + intensity * 0.6})` }}>{leads}</span>
                                      {cell && <span className="text-green-600">{num(cell.converted)}✓</span>}
                                    </div>
                                  ) : <span className="text-slate-300">—</span>}
                                </td>
                              )
                            })}
                            <td className="px-3 py-3 text-center font-bold text-indigo-600">{agentTotal}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* Agent performance per product — bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              const agentMap = {}
              agentBreakdown.forEach(r => {
                if (!agentMap[r.agent_id]) agentMap[r.agent_id] = { name: r.agent_name, leads: 0, converted: 0, earned: 0 }
                agentMap[r.agent_id].leads     += num(r.total_leads)
                agentMap[r.agent_id].converted += num(r.converted)
                agentMap[r.agent_id].earned    += money(r.earned)
              })
              const agentList = Object.values(agentMap).sort((a,b) => b.leads - a.leads)
              const maxLeads = Math.max(...agentList.map(a => a.leads), 1)
              const maxEarned = Math.max(...agentList.map(a => a.earned), 1)

              return (
                <>
                  <div className="card p-5">
                    <h3 className="font-bold text-slate-800 mb-4">👤 Agent — Lead Volume</h3>
                    <div className="space-y-3">
                      {agentList.map((a, i) => (
                        <BarH key={a.name} label={a.name} value={a.leads} max={maxLeads}
                          color={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} sub={`${a.leads} leads (${a.converted} conv.)`} />
                      ))}
                    </div>
                  </div>
                  <div className="card p-5">
                    <h3 className="font-bold text-slate-800 mb-4">👤 Agent — Earned Revenue</h3>
                    <div className="space-y-3">
                      {agentList.sort((a,b)=>b.earned-a.earned).map((a, i) => (
                        <BarH key={a.name} label={a.name} value={a.earned} max={maxEarned}
                          color={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} sub={fmtMoney(a.earned)} />
                      ))}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

          {/* Full breakdown table */}
          <div className="card overflow-hidden">
            <SectionHeader title="Agent × Product Full Breakdown" count={agentBreakdown.length} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>{['Agent','Product','Leads','Converted','Not Int.','Conv %','Potential','Earned','Lost','Remaining'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agentBreakdown.map((r, i) => {
                    const convRate = parseFloat(pct(r.converted, r.total_leads))
                    return (
                      <tr key={`${r.agent_id}-${r.product_id}-${i}`} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-medium text-slate-700">{r.agent_name}</td>
                        <td className="px-3 py-3 text-slate-600">{r.product_name}</td>
                        <td className="px-3 py-3 font-bold text-blue-600">{num(r.total_leads)}</td>
                        <td className="px-3 py-3 font-bold text-green-600">{num(r.converted)}</td>
                        <td className="px-3 py-3 text-red-500">{num(r.not_interested)}</td>
                        <td className="px-3 py-3">
                          <span className="font-bold text-sm" style={{ color: convRate >= 20 ? '#16a34a' : convRate >= 10 ? '#d97706' : '#dc2626' }}>
                            {convRate}%
                          </span>
                        </td>
                        <td className="px-3 py-3 text-purple-600">{fmtMoney(r.potential)}</td>
                        <td className="px-3 py-3 font-bold text-green-600">{fmtMoney(r.earned)}</td>
                        <td className="px-3 py-3 text-red-500">{fmtMoney(r.lost)}</td>
                        <td className="px-3 py-3 text-amber-600">{fmtMoney(r.still_to_earn)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Trends Tab ────────────────────────────────────── */}
      {tab === 'trends' && (
        <div className="card p-5">
          {trendsData.length === 0 ? (
            <div className="text-center text-slate-400 py-16">
              <p className="text-4xl mb-3">📈</p>
              <p className="font-medium">No trend data available</p>
              <p className="text-sm mt-1">Add date filters or ensure the backend /products/trends endpoint is active</p>
            </div>
          ) : (
            <>
              <h3 className="font-bold text-slate-800 mb-4">📈 Lead Trends Over Time</h3>
              {(() => {
                const maxVal = Math.max(...trendsData.map(d => num(d.total_leads)), 1)
                const W = 680, H = 240, PAD = { l: 40, r: 20, t: 20, b: 40 }
                const chartW = W - PAD.l - PAD.r
                const chartH = H - PAD.t - PAD.b
                const pts = trendsData.map((d, i) => ({
                  x: PAD.l + (i / Math.max(trendsData.length - 1, 1)) * chartW,
                  y: PAD.t + (1 - num(d.total_leads) / maxVal) * chartH,
                  ...d
                }))
                const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }}>
                    <defs>
                      <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {/* grid */}
                    {[0,0.25,0.5,0.75,1].map(t => {
                      const y = PAD.t + t * chartH
                      return <line key={t} x1={PAD.l} x2={W-PAD.r} y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                    })}
                    {/* area */}
                    <path d={`${path} L${pts[pts.length-1].x},${PAD.t+chartH} L${pts[0].x},${PAD.t+chartH} Z`}
                      fill="url(#aGrad)" />
                    {/* line */}
                    <path d={path} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" />
                    {/* dots */}
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x} cy={p.y} r="4" fill="#4f46e5" stroke="white" strokeWidth="2" />
                        <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#4f46e5" fontWeight="600">{num(p.total_leads)}</text>
                        <text x={p.x} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">
                          {p.period_label || p.week_label || p.month_label || `P${i+1}`}
                        </text>
                      </g>
                    ))}
                    {/* y-axis */}
                    {[0,0.5,1].map(t => (
                      <text key={t} x={PAD.l - 5} y={PAD.t + t * chartH + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
                        {Math.round(maxVal * (1 - t))}
                      </text>
                    ))}
                  </svg>
                )
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Conversion Tab ─────────────────────────────────── */}
      {tab === 'conversion' && (
        <>
          {/* Product conversion comparison */}
          <div className="card p-5">
            <h3 className="font-bold text-slate-800 mb-4">✅ Conversion Rate by Product</h3>
            <div className="space-y-4">
              {[...productStats].sort((a,b) => {
                const ra = parseFloat(pct(a.converted_leads, a.total_leads))
                const rb = parseFloat(pct(b.converted_leads, b.total_leads))
                return rb - ra
              }).map((p, i) => {
                const convRate = parseFloat(pct(p.converted_leads, p.total_leads))
                const color = convRate >= 20 ? '#16a34a' : convRate >= 10 ? '#d97706' : '#dc2626'
                return (
                  <div key={p.product_id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{['🥇','🥈','🥉'][i] || '🏷️'}</span>
                        <span className="font-semibold text-slate-700 text-sm">{p.product_name}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.product_type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {p.product_type || 'B2C'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">{num(p.converted_leads)} / {num(p.total_leads)} leads</span>
                        <span className="font-black text-base" style={{ color }}>{convRate}%</span>
                      </div>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${convRate}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Agent conversion per product from convData (if endpoint available) */}
          {convData.length > 0 && (
            <div className="card overflow-hidden">
              <SectionHeader title="Agent Conversion by Product" count={convData.length} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>{['Agent','Product','Total Leads','Converted','Conv Rate','Calls'].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-xs text-slate-500 font-semibold uppercase whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {convData.map((r, i) => {
                      const rate = parseFloat(pct(r.converted, r.total_leads))
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-3 font-medium text-slate-700">{r.agent_name}</td>
                          <td className="px-3 py-3 text-slate-600">{r.product_name}</td>
                          <td className="px-3 py-3 font-bold text-blue-600">{num(r.total_leads)}</td>
                          <td className="px-3 py-3 font-bold text-green-600">{num(r.converted)}</td>
                          <td className="px-3 py-3">
                            <span className="font-bold" style={{ color: rate >= 20 ? '#16a34a' : rate >= 10 ? '#d97706' : '#dc2626' }}>{rate}%</span>
                          </td>
                          <td className="px-3 py-3 text-slate-500">{num(r.total_calls)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Drill-down modal */}
      {drill && <DrillModal title={drill.title} rows={drill.rows} onClose={() => setDrill(null)} />}
    </div>
  )
}
