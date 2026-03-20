// web-admin/src/pages/FollowUpsPage.jsx
import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_META = {
  new:            { bg:'#EFF6FF', text:'#1D4ED8', dot:'#3B82F6', glow:'rgba(59,130,246,0.3)'  },
  hot:            { bg:'#FEF2F2', text:'#DC2626', dot:'#EF4444', glow:'rgba(239,68,68,0.3)'   },
  warm:           { bg:'#FFFBEB', text:'#D97706', dot:'#F59E0B', glow:'rgba(245,158,11,0.3)'  },
  cold:           { bg:'#F8FAFC', text:'#475569', dot:'#94A3B8', glow:'rgba(148,163,184,0.2)' },
  converted:      { bg:'#F0FDF4', text:'#15803D', dot:'#22C55E', glow:'rgba(34,197,94,0.3)'   },
  not_interested: { bg:'#F9FAFB', text:'#6B7280', dot:'#D1D5DB', glow:'rgba(209,213,219,0.2)' },
  call_back:      { bg:'#F5F3FF', text:'#6D28D9', dot:'#8B5CF6', glow:'rgba(139,92,246,0.3)'  },
}
const ALL_STATUSES = Object.keys(STATUS_META)

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500&display=swap');
  .fu-page * { font-family: 'Outfit', sans-serif; box-sizing: border-box; }
  .fu-card { transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1); }
  .fu-card:hover { transform: translateY(-2px) scale(1.005); }
  .fu-btn { transition: all 0.15s ease; }
  .fu-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .fu-btn:active { transform: scale(0.97); }
  .fu-input:focus { outline: none; border-color: #6366F1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
  .fu-section-header:hover { filter: brightness(0.97); }
  @keyframes fu-spin { to { transform: rotate(360deg); } }
  @keyframes fu-pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.3)} }
  @keyframes fu-slide-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  .fu-animate { animation: fu-slide-in 0.3s ease forwards; }
  .fu-tag { transition: all 0.15s; }
  .fu-tag:hover { transform: translateY(-1px); filter: brightness(0.95); }
`

function StatusBadge({ status }) {
  const c = STATUS_META[status] || STATUS_META.cold
  return (
    <span style={{ background:c.bg, color:c.text, display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, textTransform:'capitalize',
      whiteSpace:'nowrap', boxShadow:`0 0 8px ${c.glow}`, letterSpacing:0.3 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:c.dot, display:'inline-block',
        animation: status==='hot'||status==='new' ? 'fu-pulse-dot 1.5s ease infinite' : 'none' }} />
      {status?.replace(/_/g,' ')}
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

// ── Update Modal ─────────────────────────────────────────
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
      if (nextDate) await api.post('/followups', { lead_id:followup.lead_id, follow_up_date:nextDate, notes:discussion }).catch(()=>{})
      toast.success('Follow-up updated ✓')
      onSave()
    } catch (err) { toast.error(err?.message||'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,0.75)', backdropFilter:'blur(8px)',
      zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:24, width:'100%', maxWidth:520, overflow:'hidden',
        boxShadow:'0 32px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.1)' }}
        onClick={e=>e.stopPropagation()} className="fu-animate">

        {/* Gradient header */}
        <div style={{ background:'linear-gradient(135deg,#4F46E5 0%,#7C3AED 50%,#EC4899 100%)', padding:'22px 24px', position:'relative', overflow:'hidden' }}>
          {/* Decorative circles */}
          <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
          <div style={{ position:'absolute', bottom:-20, left:60, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }} />
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', position:'relative' }}>
            <div>
              <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12, fontWeight:600, letterSpacing:1, textTransform:'uppercase', marginBottom:4 }}>Update Follow-up</div>
              <div style={{ color:'#fff', fontSize:18, fontWeight:800, letterSpacing:-0.3 }}>{followup.lead_name || followup.contact_name}</div>
              <div style={{ color:'rgba(255,255,255,0.75)', fontSize:13, marginTop:3, display:'flex', alignItems:'center', gap:8 }}>
                <span>📞 {followup.phone}</span>
                {followup.product_name && <span>· 📦 {followup.product_name}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
              borderRadius:10, width:32, height:32, cursor:'pointer', fontSize:16, display:'flex',
              alignItems:'center', justifyContent:'center', flexShrink:0, backdropFilter:'blur(4px)' }}>✕</button>
          </div>
        </div>

        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:20 }}>
          {/* Notes */}
          <div>
            <label style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:8 }}>
              📝 Call Notes *
            </label>
            <textarea value={discussion} onChange={e=>setDiscussion(e.target.value)} rows={3}
              placeholder="What was discussed on the call? Key points, objections, next steps…"
              className="fu-input"
              style={{ width:'100%', border:'2px solid #E2E8F0', borderRadius:14, padding:'12px 14px',
                fontSize:14, color:'#0F172A', resize:'none', fontFamily:'Outfit,sans-serif',
                lineHeight:1.6, transition:'all 0.2s' }} />
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:10 }}>
              📊 Update Status
            </label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {ALL_STATUSES.map(s => {
                const c = STATUS_META[s]; const active = newStatus === s
                return (
                  <button key={s} onClick={()=>setNewStatus(s)} className="fu-tag"
                    style={{ padding:'6px 14px', borderRadius:20, border: active?'none':'1.5px solid #E2E8F0',
                      cursor:'pointer', fontSize:12, fontWeight:700, textTransform:'capitalize',
                      background: active ? c.dot : c.bg, color: active ? '#fff' : c.text,
                      boxShadow: active ? `0 4px 12px ${c.glow}` : 'none',
                      fontFamily:'Outfit,sans-serif' }}>
                    {s.replace(/_/g,' ')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Next date */}
          <div>
            <label style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', letterSpacing:1, display:'block', marginBottom:8 }}>
              📅 Schedule Next Follow-up
            </label>
            <input type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]} className="fu-input"
              style={{ border:'2px solid #E2E8F0', borderRadius:14, padding:'11px 14px',
                fontSize:14, color:'#0F172A', width:'100%', fontFamily:'Outfit,sans-serif', transition:'all 0.2s' }} />
          </div>
        </div>

        <div style={{ padding:'0 24px 24px', display:'flex', gap:10 }}>
          <button onClick={onClose} className="fu-btn"
            style={{ flex:1, padding:'13px 0', border:'2px solid #E2E8F0', borderRadius:14,
              color:'#64748B', fontSize:14, fontWeight:700, cursor:'pointer', background:'#F8FAFC',
              fontFamily:'Outfit,sans-serif' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="fu-btn"
            style={{ flex:2, padding:'13px 0', border:'none', borderRadius:14,
              background:'linear-gradient(135deg,#4F46E5,#7C3AED)', color:'#fff',
              fontSize:14, fontWeight:800, cursor:'pointer', opacity:saving?0.7:1,
              fontFamily:'Outfit,sans-serif', letterSpacing:0.3,
              boxShadow:'0 8px 20px rgba(99,102,241,0.35)' }}>
            {saving ? '⏳ Saving…' : '✓ Save Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────
function LeadCard({ item, onUpdate, isAdmin, index }) {
  const overdue = item.followup_type === 'overdue'
  const today   = item.followup_type === 'today'
  const days    = overdue ? daysOverdue(item.follow_up_date) : 0
  const c       = STATUS_META[item.lead_status] || STATUS_META.cold

  return (
    <div className="fu-card fu-animate"
      style={{
        background: overdue ? 'linear-gradient(135deg,#FFF5F5,#FFF1F1)' : today ? 'linear-gradient(135deg,#FFFDF0,#FFFBEB)' : '#FAFAFA',
        border: overdue ? '1.5px solid #FECACA' : today ? '1.5px solid #FDE68A' : '1.5px solid #F1F5F9',
        borderRadius: 16, padding: '16px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        position: 'relative', overflow: 'hidden',
        animationDelay: `${index * 40}ms`,
        boxShadow: overdue ? '0 2px 12px rgba(239,68,68,0.08)' : today ? '0 2px 12px rgba(245,158,11,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}>

      {/* Left accent bar */}
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:4, borderRadius:'0 4px 4px 0',
        background: overdue ? '#EF4444' : today ? '#F59E0B' : c.dot }} />

      {/* Avatar */}
      <div style={{ width:44, height:44, borderRadius:14, flexShrink:0, display:'flex',
        alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:800,
        background: overdue ? '#FEE2E2' : today ? '#FEF3C7' : c.bg,
        color: overdue ? '#EF4444' : today ? '#D97706' : c.text,
        letterSpacing:-0.5, boxShadow:`inset 0 1px 2px rgba(0,0,0,0.06)` }}>
        {(item.lead_name||item.contact_name||'?')[0].toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
          <span style={{ fontSize:14, fontWeight:800, color:'#0F172A', letterSpacing:-0.2 }}>
            {item.lead_name || item.contact_name || '—'}
          </span>
          <StatusBadge status={item.lead_status} />
          {overdue && days > 0 && (
            <span style={{ fontSize:11, fontWeight:800, color:'#DC2626', background:'#FEE2E2',
              padding:'2px 9px', borderRadius:20, border:'1px solid #FECACA' }}>
              🕐 {days}d overdue
            </span>
          )}
        </div>
        {item.school_name && item.school_name !== item.lead_name && (
          <div style={{ fontSize:12, color:'#94A3B8', marginBottom:4, fontWeight:500 }}>🏫 {item.school_name}</div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
          <a href={`tel:${item.phone}`} style={{ fontSize:13, color:'#4F46E5', fontWeight:700,
            textDecoration:'none', display:'flex', alignItems:'center', gap:4,
            background:'#EEF2FF', padding:'3px 10px', borderRadius:8, border:'1px solid #C7D2FE' }}>
            📞 {item.phone||'—'}
          </a>
          {item.product_name && (
            <span style={{ fontSize:12, color:'#6D28D9', background:'#F5F3FF',
              padding:'3px 10px', borderRadius:8, fontWeight:700, border:'1px solid #DDD6FE' }}>
              📦 {item.product_name}
            </span>
          )}
          {isAdmin && item.agent_name && (
            <span style={{ fontSize:12, color:'#64748B', background:'#F1F5F9',
              padding:'3px 10px', borderRadius:8, fontWeight:600, border:'1px solid #E2E8F0' }}>
              👤 {item.agent_name}
            </span>
          )}
        </div>
        {item.notes && (
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:5, fontStyle:'italic',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:400,
            background:'rgba(0,0,0,0.02)', padding:'3px 8px', borderRadius:6, borderLeft:'2px solid #E2E8F0' }}>
            "{item.notes}"
          </div>
        )}
      </div>

      {/* Date */}
      <div style={{ textAlign:'center', flexShrink:0, minWidth:80 }}>
        <div style={{ fontSize:10, fontWeight:800, color:'#94A3B8', textTransform:'uppercase',
          letterSpacing:1, marginBottom:3 }}>Follow-up</div>
        <div style={{ fontSize:13, fontWeight:800, fontFamily:'JetBrains Mono, monospace',
          color: overdue ? '#DC2626' : today ? '#D97706' : '#4F46E5',
          background: overdue ? '#FEF2F2' : today ? '#FFFBEB' : '#EEF2FF',
          padding:'4px 10px', borderRadius:8, border: overdue?'1px solid #FECACA':today?'1px solid #FDE68A':'1px solid #C7D2FE' }}>
          {formatDate(item.follow_up_date)}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <a href={`tel:${item.phone}`} className="fu-btn"
          style={{ padding:'8px 12px', background:'#F0FDF4', color:'#16A34A', borderRadius:10,
            fontSize:12, fontWeight:700, textDecoration:'none', border:'1.5px solid #BBF7D0',
            display:'flex', alignItems:'center', gap:4 }}>
          📞
        </a>
        <a href={`https://wa.me/${(item.phone||'').replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="fu-btn"
          style={{ padding:'8px 12px', background:'#DCFCE7', color:'#15803D', borderRadius:10,
            fontSize:12, fontWeight:700, textDecoration:'none', border:'1.5px solid #BBF7D0',
            display:'flex', alignItems:'center', gap:4 }}>
          💬
        </a>
        <button onClick={()=>onUpdate(item)} className="fu-btn"
          style={{ padding:'8px 14px', background:'linear-gradient(135deg,#EEF2FF,#E0E7FF)',
            color:'#4F46E5', borderRadius:10, fontSize:12, fontWeight:800,
            border:'1.5px solid #C7D2FE', cursor:'pointer', fontFamily:'Outfit,sans-serif',
            boxShadow:'0 2px 8px rgba(99,102,241,0.15)' }}>
          ✏️ Update
        </button>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────
function Section({ title, icon, accent, items, onUpdate, isAdmin, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ borderRadius:20, overflow:'hidden', boxShadow:'0 2px 16px rgba(0,0,0,0.06)',
      border:'1.5px solid rgba(255,255,255,0.8)', background:'#fff' }}>
      <button onClick={()=>setOpen(o=>!o)}
        className="fu-section-header"
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 20px', background:`linear-gradient(135deg,${accent}15,${accent}08)`,
          border:'none', cursor:'pointer', borderBottom: open ? `2px solid ${accent}20` : 'none' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:`${accent}18`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
            boxShadow:`0 4px 12px ${accent}25` }}>
            {icon}
          </div>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:15, fontWeight:800, color:'#0F172A', letterSpacing:-0.3 }}>{title}</div>
            <div style={{ fontSize:12, color:'#64748B', fontWeight:500, marginTop:1 }}>
              {items.length} {items.length===1?'lead':'leads'}
            </div>
          </div>
          <div style={{ background:accent, color:'#fff', borderRadius:20, fontSize:13,
            fontWeight:900, padding:'3px 12px', marginLeft:4,
            boxShadow:`0 4px 10px ${accent}40` }}>
            {items.length}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {items.length > 0 && (
            <div style={{ fontSize:11, color:accent, fontWeight:700, background:`${accent}15`,
              padding:'4px 12px', borderRadius:20, border:`1px solid ${accent}30` }}>
              {open ? 'Collapse ▲' : 'Expand ▼'}
            </div>
          )}
        </div>
      </button>

      {open && (
        <div style={{ padding: items.length===0 ? '40px 20px' : '12px 16px',
          display:'flex', flexDirection:'column', gap:8, background:'#FAFBFC' }}>
          {items.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94A3B8' }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🎉</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#64748B' }}>All clear!</div>
              <div style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>No follow-ups in this section</div>
            </div>
          ) : items.map((item, i) => (
            <LeadCard key={item.lead_id||i} item={item} onUpdate={onUpdate} isAdmin={isAdmin} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
export default function FollowUpsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [data, setData]         = useState({ today:[], previous:[], next_3_days:[] })
  const [counts, setCounts]     = useState({ today:0, previous:0, next_3_days:0, total:0 })
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [agents, setAgents]     = useState([])
  const [products, setProducts] = useState([])
  const [filterAgent, setFilterAgent]     = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(r => {
        const list = r?.data || r || []
        setAgents(Array.isArray(list) ? list.filter(u=>['agent','admin'].includes(u.role_name)) : [])
      }).catch(()=>{})
    }
    api.get('/products/active').then(r => {
      const list = r?.data || r || []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(()=>{})
  }, [isAdmin])

  const fetchAll = async (agentF, productF, statusF) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ section:'all' })
      if (isAdmin && agentF) params.set('agent_id',   agentF)
      if (productF)          params.set('product_id', productF)
      if (statusF)           params.set('lead_status',statusF)
      const body = await api.get(`/followups?${params}`)
      const d    = body?.data || {}
      let todayItems=[], prevItems=[], nextItems=[]
      if (Array.isArray(d)) {
        todayItems = d.filter(x=>x.followup_type==='today')
        prevItems  = d.filter(x=>x.followup_type==='overdue')
        nextItems  = d.filter(x=>x.followup_type==='upcoming')
      } else {
        todayItems = Array.isArray(d.today)       ? d.today       : []
        prevItems  = Array.isArray(d.previous)    ? d.previous    : []
        nextItems  = Array.isArray(d.next_3_days) ? d.next_3_days : []
      }
      setData({ today:todayItems, previous:prevItems, next_3_days:nextItems })
      setCounts(body?.counts || { today:todayItems.length, previous:prevItems.length, next_3_days:nextItems.length, total:todayItems.length+prevItems.length+nextItems.length })
    } catch (err) { setError(err?.message||'Failed to load'); toast.error(err?.message||'Failed') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchAll(filterAgent, filterProduct, filterStatus) }, [filterAgent, filterProduct, filterStatus])
  useEffect(() => {
    const t = setInterval(()=>fetchAll(filterAgent, filterProduct, filterStatus), 60000)
    return ()=>clearInterval(t)
  }, [filterAgent, filterProduct, filterStatus])

  const handleSaved = () => { setSelected(null); fetchAll(filterAgent, filterProduct, filterStatus) }

  const selStyle = { border:'2px solid #E2E8F0', borderRadius:12, padding:'8px 12px',
    fontSize:13, color:'#1E293B', outline:'none', background:'#fff', cursor:'pointer',
    fontFamily:'Outfit,sans-serif', fontWeight:600, transition:'all 0.2s' }

  const totalFollowups = counts.today + counts.previous + counts.next_3_days

  return (
    <div className="fu-page" style={{ maxWidth:1100, margin:'0 auto' }}>
      <style>{STYLES}</style>

      {/* ── Hero Header ── */}
      <div style={{ background:'linear-gradient(135deg,#4F46E5 0%,#7C3AED 60%,#EC4899 100%)',
        borderRadius:24, padding:'28px 32px', marginBottom:24, position:'relative', overflow:'hidden' }}>
        {/* Decorative orbs */}
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
        <div style={{ position:'absolute', bottom:-60, left:100, width:160, height:160, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
        <div style={{ position:'absolute', top:20, right:200, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }} />

        <div style={{ position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12, fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>
              CRM — Follow-ups
            </div>
            <h1 style={{ color:'#fff', fontSize:28, fontWeight:900, margin:0, letterSpacing:-0.8 }}>
              📅 Follow-up Queue
            </h1>
            <p style={{ color:'rgba(255,255,255,0.75)', fontSize:14, margin:'6px 0 0', fontWeight:500 }}>
              {loading ? 'Fetching your follow-ups…' : `${totalFollowups} follow-ups · ${counts.today} today · ${counts.previous} overdue`}
            </p>
          </div>

          {/* KPI pills in header */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {[
              { label:'Today',     val:counts.today,       color:'#FCD34D', bg:'rgba(252,211,77,0.15)',  border:'rgba(252,211,77,0.3)' },
              { label:'Overdue',   val:counts.previous,    color:'#F87171', bg:'rgba(248,113,113,0.15)', border:'rgba(248,113,113,0.3)' },
              { label:'Upcoming',  val:counts.next_3_days, color:'#A5B4FC', bg:'rgba(165,180,252,0.15)', border:'rgba(165,180,252,0.3)' },
            ].map(({ label, val, color, bg, border }) => (
              <div key={label} style={{ background:bg, border:`1px solid ${border}`, borderRadius:14,
                padding:'10px 18px', textAlign:'center', backdropFilter:'blur(8px)' }}>
                <div style={{ color, fontSize:26, fontWeight:900, lineHeight:1 }}>{val}</div>
                <div style={{ color:'rgba(255,255,255,0.7)', fontSize:11, fontWeight:700, letterSpacing:0.5, marginTop:2 }}>{label}</div>
              </div>
            ))}
            <button onClick={()=>fetchAll(filterAgent, filterProduct, filterStatus)} className="fu-btn"
              style={{ padding:'10px 18px', background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.25)',
                borderRadius:14, color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
                backdropFilter:'blur(8px)', fontFamily:'Outfit,sans-serif', alignSelf:'stretch' }}>
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ background:'#fff', border:'1.5px solid #F1F5F9', borderRadius:16,
        padding:'14px 20px', display:'flex', flexWrap:'wrap', alignItems:'center',
        gap:10, marginBottom:20, boxShadow:'0 2px 12px rgba(0,0,0,0.04)' }}>
        <span style={{ fontSize:12, fontWeight:800, color:'#64748B', textTransform:'uppercase', letterSpacing:1 }}>🔍 Filter</span>
        {isAdmin && agents.length > 0 && (
          <select style={selStyle} value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} className="fu-input">
            <option value="">👥 All Agents</option>
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {products.length > 0 && (
          <select style={selStyle} value={filterProduct} onChange={e=>setFilterProduct(e.target.value)} className="fu-input">
            <option value="">📦 All Products</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select style={selStyle} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="fu-input">
          <option value="">🏷️ All Statuses</option>
          {ALL_STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        {(filterAgent||filterProduct||filterStatus) && (
          <button onClick={()=>{setFilterAgent('');setFilterProduct('');setFilterStatus('')}} className="fu-btn"
            style={{ fontSize:12, color:'#EF4444', background:'#FEF2F2', border:'1.5px solid #FECACA',
              cursor:'pointer', fontWeight:700, padding:'8px 14px', borderRadius:10, fontFamily:'Outfit,sans-serif' }}>
            ✕ Reset
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:14,
          padding:'14px 18px', display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <span style={{ fontSize:20 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#DC2626' }}>Failed to load follow-ups</div>
            <div style={{ fontSize:12, color:'#EF4444', marginTop:2 }}>{error}</div>
          </div>
          <button onClick={()=>fetchAll(filterAgent,filterProduct,filterStatus)} className="fu-btn"
            style={{ fontSize:12, color:'#DC2626', background:'#FEE2E2', border:'1.5px solid #FECACA',
              cursor:'pointer', fontWeight:700, padding:'7px 14px', borderRadius:10, fontFamily:'Outfit,sans-serif' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Sections ── */}
      {loading ? (
        <div style={{ background:'#fff', borderRadius:20, padding:80, textAlign:'center',
          boxShadow:'0 2px 16px rgba(0,0,0,0.06)' }}>
          <div style={{ width:44, height:44, border:'4px solid #E0E7FF', borderTopColor:'#4F46E5',
            borderRadius:'50%', animation:'fu-spin 0.8s linear infinite', margin:'0 auto 16px' }} />
          <div style={{ fontSize:15, color:'#64748B', fontWeight:600 }}>Loading follow-ups…</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Section title={`Today — ${format(new Date(),'dd MMM yyyy')}`} icon="⏰"
            accent="#F59E0B" items={data.today} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />
          <Section title="Overdue" icon="🔴"
            accent="#EF4444" items={data.previous} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />
          <Section title="Next 3 Days" icon="📆"
            accent="#4F46E5" items={data.next_3_days} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />
        </div>
      )}

      {selected && <UpdateModal followup={selected} onClose={()=>setSelected(null)} onSave={handleSaved} />}
    </div>
  )
}
