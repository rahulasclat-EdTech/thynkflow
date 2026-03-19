// web-admin/src/pages/FollowUpsPage.jsx
import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  new:            { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  hot:            { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' },
  warm:           { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' },
  cold:           { bg: '#e2e8f0', text: '#475569', dot: '#94a3b8' },
  converted:      { bg: '#dcfce7', text: '#14532d', dot: '#22c55e' },
  not_interested: { bg: '#f1f5f9', text: '#64748b', dot: '#cbd5e1' },
  call_back:      { bg: '#ede9fe', text: '#5b21b6', dot: '#8b5cf6' },
}
const ALL_STATUSES = Object.keys(STATUS_COLORS)

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#f1f5f9', text: '#64748b', dot: '#cbd5e1' }
  return (
    <span style={{ background: c.bg, color: c.text, display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, textTransform:'capitalize', whiteSpace:'nowrap' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background: c.dot, display:'inline-block' }} />
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

function formatDate(d) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd MMM yyyy') } catch { return String(d) }
}

function daysOverdue(d) {
  if (!d) return 0
  return Math.floor((new Date() - new Date(d)) / 86400000)
}

function UpdateModal({ followup, onClose, onSave }) {
  const [newStatus, setNewStatus]   = useState(followup.lead_status || 'new')
  const [discussion, setDiscussion] = useState('')
  const [nextDate, setNextDate]     = useState('')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    if (!discussion.trim()) return toast.error('Add call notes')
    setSaving(true)
    try {
      await api.post(`/leads/${followup.lead_id}/communications`, { type:'call', direction:'outbound', note:discussion })
      await api.patch(`/leads/${followup.lead_id}/status`, { status: newStatus })
      if (nextDate) {
        await api.post('/followups', { lead_id:followup.lead_id, follow_up_date:nextDate, notes:discussion })
          .catch(() => {})
      }
      toast.success('Follow-up updated')
      onSave()
    } catch (err) {
      toast.error(err?.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.6)', backdropFilter:'blur(4px)',
      zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:520,
        boxShadow:'0 25px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#4f46e5,#7c3aed)', padding:'20px 24px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ color:'#fff', fontSize:17, fontWeight:700 }}>Update Follow-up</div>
              <div style={{ color:'rgba(255,255,255,0.75)', fontSize:13, marginTop:2 }}>
                {followup.lead_name} · {followup.phone}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none',
              color:'#fff', borderRadius:10, width:32, height:32, cursor:'pointer', fontSize:16,
              display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
          </div>
        </div>
        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:18 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase',
              letterSpacing:0.8, display:'block', marginBottom:8 }}>📝 Call Notes *</label>
            <textarea value={discussion} onChange={e => setDiscussion(e.target.value)}
              rows={3} placeholder="What was discussed on the call?"
              style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:12, padding:'10px 14px',
                fontSize:14, color:'#1e293b', resize:'none', outline:'none', fontFamily:'inherit',
                boxSizing:'border-box', transition:'border-color 0.2s' }}
              onFocus={e => e.target.style.borderColor='#6366f1'}
              onBlur={e => e.target.style.borderColor='#e2e8f0'} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase',
              letterSpacing:0.8, display:'block', marginBottom:8 }}>📊 Update Status</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {ALL_STATUSES.map(s => {
                const c = STATUS_COLORS[s]; const active = newStatus === s
                return (
                  <button key={s} onClick={() => setNewStatus(s)}
                    style={{ padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer',
                      fontSize:12, fontWeight:600, textTransform:'capitalize', transition:'all 0.15s',
                      background: active ? c.text : c.bg, color: active ? '#fff' : c.text }}>
                    {s.replace(/_/g, ' ')}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase',
              letterSpacing:0.8, display:'block', marginBottom:8 }}>📅 Next Follow-up Date</label>
            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{ border:'1.5px solid #e2e8f0', borderRadius:12, padding:'10px 14px',
                fontSize:14, color:'#1e293b', outline:'none', width:'100%', boxSizing:'border-box' }} />
          </div>
        </div>
        <div style={{ padding:'16px 24px', borderTop:'1px solid #f1f5f9', display:'flex', gap:10 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:'11px 0', border:'1.5px solid #e2e8f0', borderRadius:12,
              color:'#64748b', fontSize:14, fontWeight:600, cursor:'pointer', background:'#fff' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex:2, padding:'11px 0', border:'none', borderRadius:12,
              background:'linear-gradient(135deg,#4f46e5,#7c3aed)', color:'#fff',
              fontSize:14, fontWeight:700, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : '✓ Save Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LeadCard({ item, onUpdate, isAdmin }) {
  const overdue  = item.followup_type === 'overdue'
  const today    = item.followup_type === 'today'
  const days     = overdue ? daysOverdue(item.follow_up_date) : 0

  return (
    <div style={{
      background: overdue ? '#fff5f5' : '#fff',
      border: overdue ? '1.5px solid #fecaca' : today ? '1.5px solid #fde68a' : '1.5px solid #f1f5f9',
      borderRadius: 14, padding: '16px 18px',
      display: 'flex', alignItems: 'center', gap: 16,
      transition: 'box-shadow 0.2s, transform 0.2s',
      cursor: 'default',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform='translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)' }}>

      {/* Avatar */}
      <div style={{ width:42, height:42, borderRadius:12, flexShrink:0, display:'flex',
        alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800,
        background: overdue ? '#fee2e2' : today ? '#fef3c7' : '#ede9fe',
        color: overdue ? '#ef4444' : today ? '#f59e0b' : '#6d28d9' }}>
        {(item.lead_name || item.contact_name || '?')[0].toUpperCase()}
      </div>

      {/* Main info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>
            {item.lead_name || item.contact_name || '—'}
          </span>
          <StatusBadge status={item.lead_status} />
          {overdue && days > 0 && (
            <span style={{ fontSize:11, fontWeight:700, color:'#dc2626',
              background:'#fee2e2', padding:'2px 8px', borderRadius:20 }}>
              {days}d overdue
            </span>
          )}
        </div>
        {item.school_name && item.school_name !== item.lead_name && (
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{item.school_name}</div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:6, flexWrap:'wrap' }}>
          <a href={`tel:${item.phone}`} style={{ fontSize:13, color:'#3b82f6', fontWeight:500,
            textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
            📞 {item.phone || '—'}
          </a>
          {item.product_name && (
            <span style={{ fontSize:12, color:'#6d28d9', background:'#ede9fe',
              padding:'2px 8px', borderRadius:8, fontWeight:600 }}>
              {item.product_name}
            </span>
          )}
          {isAdmin && item.agent_name && (
            <span style={{ fontSize:12, color:'#64748b' }}>👤 {item.agent_name}</span>
          )}
        </div>
        {item.notes && (
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:4, fontStyle:'italic',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:400 }}>
            "{item.notes}"
          </div>
        )}
      </div>

      {/* Date */}
      <div style={{ textAlign:'center', flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#94a3b8', textTransform:'uppercase',
          letterSpacing:0.5, marginBottom:2 }}>Follow-up</div>
        <div style={{ fontSize:13, fontWeight:700,
          color: overdue ? '#dc2626' : today ? '#d97706' : '#4f46e5' }}>
          {formatDate(item.follow_up_date)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <a href={`tel:${item.phone}`}
          style={{ padding:'7px 12px', background:'#f0fdf4', color:'#16a34a', borderRadius:10,
            fontSize:12, fontWeight:700, textDecoration:'none', border:'1px solid #bbf7d0',
            display:'flex', alignItems:'center', gap:4 }}>
          📞 Call
        </a>
        <a href={`https://wa.me/${(item.phone||'').replace(/[^0-9]/g,'')}`}
          target="_blank" rel="noreferrer"
          style={{ padding:'7px 12px', background:'#f0fdf4', color:'#15803d', borderRadius:10,
            fontSize:12, fontWeight:700, textDecoration:'none', border:'1px solid #bbf7d0',
            display:'flex', alignItems:'center', gap:4 }}>
          💬 WA
        </a>
        <button onClick={() => onUpdate(item)}
          style={{ padding:'7px 14px', background:'#eef2ff', color:'#4f46e5', borderRadius:10,
            fontSize:12, fontWeight:700, border:'1px solid #c7d2fe', cursor:'pointer' }}>
          ✏️ Update
        </button>
      </div>
    </div>
  )
}

function Section({ title, icon, color, bgColor, items, onUpdate, isAdmin, defaultOpen = true }) {
  const [expanded, setExpanded] = useState(defaultOpen)
  if (!items) return null

  return (
    <div style={{ borderRadius:16, overflow:'hidden', border:'1px solid #f1f5f9',
      boxShadow:'0 1px 8px rgba(0,0,0,0.04)' }}>
      <button onClick={() => setExpanded(e => !e)}
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 20px', background: bgColor, border:'none', cursor:'pointer' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>{icon}</span>
          <span style={{ fontSize:15, fontWeight:800, color:'#0f172a' }}>{title}</span>
          <span style={{ background: color, color:'#fff', borderRadius:20, fontSize:12,
            fontWeight:800, padding:'2px 10px', minWidth:28, textAlign:'center' }}>
            {items.length}
          </span>
        </div>
        <span style={{ color:'#94a3b8', fontSize:12, fontWeight:600 }}>
          {expanded ? '▲ Collapse' : '▼ Expand'}
        </span>
      </button>

      {expanded && (
        <div style={{ background:'#fff', padding: items.length === 0 ? '32px 20px' : '12px 16px',
          display:'flex', flexDirection:'column', gap:8 }}>
          {items.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94a3b8' }}>
              <div style={{ fontSize:36, marginBottom:8 }}>🎉</div>
              <div style={{ fontSize:14, fontWeight:500 }}>No follow-ups in this section</div>
            </div>
          ) : (
            items.map((item, i) => (
              <LeadCard key={item.lead_id || i} item={item} onUpdate={onUpdate} isAdmin={isAdmin} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function FollowUpsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [data, setData]       = useState({ today: [], previous: [], next_3_days: [] })
  const [counts, setCounts]   = useState({ today: 0, previous: 0, next_3_days: 0, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [agents, setAgents]   = useState([])
  const [products, setProducts] = useState([])
  const [filterAgent, setFilterAgent]     = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(r => {
        const list = r?.data || r || []
        setAgents(Array.isArray(list) ? list.filter(u => ['agent','admin'].includes(u.role_name)) : [])
      }).catch(() => {
        api.get('/chat/users').then(r => {
          const list = r?.data || r || []
          setAgents(Array.isArray(list) ? list : [])
        }).catch(() => {})
      })
    }
    api.get('/products/active').then(r => {
      const list = r?.data || r || []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => {})
  }, [isAdmin])

  const fetchAll = async (agentF, productF, statusF) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ section: 'all' })
      if (isAdmin && agentF) params.set('agent_id',    agentF)
      if (productF)          params.set('product_id',  productF)
      if (statusF)           params.set('lead_status', statusF)

      const body = await api.get(`/followups?${params.toString()}`)
      const d    = body?.data || {}

      let todayItems = [], prevItems = [], nextItems = []
      if (Array.isArray(d)) {
        todayItems = d.filter(x => x.followup_type === 'today')
        prevItems  = d.filter(x => x.followup_type === 'overdue')
        nextItems  = d.filter(x => x.followup_type === 'upcoming')
      } else {
        todayItems = Array.isArray(d.today)       ? d.today       : []
        prevItems  = Array.isArray(d.previous)    ? d.previous    : []
        nextItems  = Array.isArray(d.next_3_days) ? d.next_3_days : []
      }

      setData({ today: todayItems, previous: prevItems, next_3_days: nextItems })
      setCounts(body?.counts || {
        today: todayItems.length, previous: prevItems.length,
        next_3_days: nextItems.length, total: todayItems.length + prevItems.length + nextItems.length,
      })
    } catch (err) {
      const msg = err?.message || 'Failed to load follow-ups'
      setError(msg)
      toast.error(msg)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchAll(filterAgent, filterProduct, filterStatus) }, [filterAgent, filterProduct, filterStatus])
  useEffect(() => {
    const t = setInterval(() => fetchAll(filterAgent, filterProduct, filterStatus), 60000)
    return () => clearInterval(t)
  }, [filterAgent, filterProduct, filterStatus])

  const handleSaved = () => { setSelected(null); fetchAll(filterAgent, filterProduct, filterStatus) }

  const inputStyle = { border:'1.5px solid #e2e8f0', borderRadius:10, padding:'7px 12px',
    fontSize:13, color:'#1e293b', outline:'none', background:'#fff', cursor:'pointer' }

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 4px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
        marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:'#0f172a', margin:0, letterSpacing:-0.5 }}>
            📅 Follow-ups
          </h1>
          <p style={{ color:'#64748b', fontSize:14, margin:'4px 0 0' }}>
            {loading ? 'Loading…' : `${counts.total} total — ${counts.today} today, ${counts.previous} overdue, ${counts.next_3_days} upcoming`}
          </p>
        </div>
        <button onClick={() => fetchAll(filterAgent, filterProduct, filterStatus)}
          style={{ padding:'9px 18px', background:'#fff', border:'1.5px solid #e2e8f0',
            borderRadius:12, fontSize:13, fontWeight:700, color:'#475569', cursor:'pointer',
            display:'flex', alignItems:'center', gap:6 }}>
          🔄 Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
        {[
          { label:'Today', value: counts.today,       color:'#f59e0b', bg:'linear-gradient(135deg,#fffbeb,#fef3c7)', border:'#fde68a', icon:'⏰' },
          { label:'Overdue', value: counts.previous,  color:'#ef4444', bg:'linear-gradient(135deg,#fff5f5,#fee2e2)', border:'#fecaca', icon:'🔴' },
          { label:'Next 3 Days', value: counts.next_3_days, color:'#4f46e5', bg:'linear-gradient(135deg,#f5f3ff,#ede9fe)', border:'#c4b5fd', icon:'📆' },
        ].map(({ label, value, color, bg, border, icon }) => (
          <div key={label} style={{ background: bg, border:`1.5px solid ${border}`,
            borderRadius:16, padding:'18px 20px', textAlign:'center' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase',
              letterSpacing:1, marginBottom:6 }}>{icon} {label}</div>
            <div style={{ fontSize:40, fontWeight:900, color, lineHeight:1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:'#fff', border:'1.5px solid #f1f5f9', borderRadius:14,
        padding:'12px 16px', display:'flex', flexWrap:'wrap', alignItems:'center',
        gap:12, marginBottom:20 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#64748b' }}>Filter:</span>
        {isAdmin && agents.length > 0 && (
          <select style={inputStyle} value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
            <option value="">All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {products.length > 0 && (
          <select style={inputStyle} value={filterProduct} onChange={e => setFilterProduct(e.target.value)}>
            <option value="">All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select style={inputStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {(filterAgent || filterProduct || filterStatus) && (
          <button onClick={() => { setFilterAgent(''); setFilterProduct(''); setFilterStatus('') }}
            style={{ fontSize:12, color:'#ef4444', background:'none', border:'none',
              cursor:'pointer', fontWeight:600, textDecoration:'underline' }}>
            ✕ Reset
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:12,
          padding:'12px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#dc2626' }}>Failed to load</div>
            <div style={{ fontSize:12, color:'#ef4444' }}>{error}</div>
          </div>
          <button onClick={() => fetchAll(filterAgent, filterProduct, filterStatus)}
            style={{ fontSize:12, color:'#dc2626', background:'none', border:'none',
              cursor:'pointer', fontWeight:700, textDecoration:'underline' }}>Retry</button>
        </div>
      )}

      {/* Sections */}
      {loading ? (
        <div style={{ background:'#fff', borderRadius:16, padding:64, textAlign:'center', color:'#94a3b8' }}>
          <div style={{ width:36, height:36, border:'3px solid #e2e8f0', borderTopColor:'#6366f1',
            borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          Loading follow-ups…
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Section
            title={`Today — ${format(new Date(), 'dd MMM yyyy')}`}
            icon="⏰" color="#f59e0b" bgColor="#fffbeb"
            items={data.today} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true}
          />
          <Section
            title="Overdue" icon="🔴" color="#ef4444" bgColor="#fff5f5"
            items={data.previous} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true}
          />
          <Section
            title="Next 3 Days" icon="📆" color="#4f46e5" bgColor="#f5f3ff"
            items={data.next_3_days} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true}
          />
        </div>
      )}

      {selected && (
        <UpdateModal followup={selected} onClose={() => setSelected(null)} onSave={handleSaved} />
      )}
    </div>
  )
}
