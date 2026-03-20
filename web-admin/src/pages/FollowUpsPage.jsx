// web-admin/src/pages/FollowUpsPage.jsx
import React, { useEffect, useState, useRef } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_META = {
  new:            { bg:'#EFF6FF', text:'#1D4ED8', dot:'#3B82F6', glow:'59,130,246',  label:'New'           },
  hot:            { bg:'#FFF1F2', text:'#BE123C', dot:'#F43F5E', glow:'244,63,94',   label:'Hot'           },
  warm:           { bg:'#FFFBEB', text:'#B45309', dot:'#F59E0B', glow:'245,158,11',  label:'Warm'          },
  cold:           { bg:'#F8FAFC', text:'#475569', dot:'#94A3B8', glow:'148,163,184', label:'Cold'          },
  converted:      { bg:'#F0FDF4', text:'#15803D', dot:'#22C55E', glow:'34,197,94',   label:'Converted'     },
  not_interested: { bg:'#F9FAFB', text:'#6B7280', dot:'#D1D5DB', glow:'209,213,219', label:'Not Interested'},
  call_back:      { bg:'#F5F3FF', text:'#6D28D9', dot:'#8B5CF6', glow:'139,92,246',  label:'Call Back'     },
}
const ALL_STATUSES = Object.keys(STATUS_META)

// ── Global Styles ─────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@500;600&display=swap');
  .fp * { font-family: 'Plus Jakarta Sans', sans-serif; box-sizing: border-box; }
  .fp-mono { font-family: 'IBM Plex Mono', monospace !important; }
  .fp-card {
    transition: transform 0.25s cubic-bezier(0.34,1.4,0.64,1), box-shadow 0.25s ease, border-color 0.2s;
  }
  .fp-card:hover { transform: translateY(-3px) scale(1.008); }
  .fp-ripple { position:relative; overflow:hidden; }
  .fp-ripple::after { content:''; position:absolute; inset:0; background:linear-gradient(135deg,rgba(255,255,255,0.06),transparent); opacity:0; transition:opacity 0.2s; }
  .fp-ripple:hover::after { opacity:1; }
  .fp-btn { transition: all 0.18s cubic-bezier(0.34,1.4,0.64,1); cursor:pointer; }
  .fp-btn:hover { transform: translateY(-2px) scale(1.04); filter:brightness(1.06); }
  .fp-btn:active { transform: scale(0.96); }
  .fp-input { transition: all 0.2s; }
  .fp-input:focus { outline:none; border-color:#6366F1 !important; box-shadow: 0 0 0 4px rgba(99,102,241,0.1); }
  .fp-tag { transition: all 0.15s; }
  .fp-tag:hover { transform:scale(1.05); filter:brightness(0.95); }
  .fp-section-btn { transition: all 0.2s; }
  .fp-section-btn:hover { filter:brightness(0.97); }
  @keyframes fp-spin   { to { transform: rotate(360deg); } }
  @keyframes fp-pulse  { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.6} }
  @keyframes fp-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  @keyframes fp-in     { from{opacity:0;transform:translateY(16px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes fp-shimmer{ 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  .fp-animate { animation: fp-in 0.35s cubic-bezier(0.34,1.2,0.64,1) both; }
  .fp-float   { animation: fp-float 3s ease-in-out infinite; }
`

// ── Helpers ───────────────────────────────────────────────
const fmt   = d => { try { return format(new Date(d),'dd MMM yyyy') } catch { return '—' } }
const daysO = d => d ? Math.floor((new Date()-new Date(d))/86400000) : 0

// ── Status Badge ──────────────────────────────────────────
function SBadge({ status }) {
  const c = STATUS_META[status] || STATUS_META.cold
  return (
    <span style={{ background:c.bg, color:c.text, display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 11px', borderRadius:20, fontSize:11, fontWeight:800, whiteSpace:'nowrap',
      boxShadow:`0 2px 10px rgba(${c.glow},0.25)`, letterSpacing:0.2 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:c.dot, flexShrink:0,
        animation: (status==='hot'||status==='new') ? 'fp-pulse 1.4s ease infinite' : 'none' }} />
      {c.label}
    </span>
  )
}

// ── Update Modal ──────────────────────────────────────────
function UpdateModal({ followup, onClose, onSave }) {
  const [newStatus, setNewStatus]   = useState(followup.lead_status || 'new')
  const [discussion, setDiscussion] = useState('')
  const [nextDate, setNextDate]     = useState('')
  const [saving, setSaving]         = useState(false)
  const textRef = useRef(null)

  useEffect(() => { setTimeout(()=>textRef.current?.focus(), 100) }, [])

  const handleSave = async () => {
    if (!discussion.trim()) return toast.error('Add call notes first')
    setSaving(true)
    try {
      await api.post(`/leads/${followup.lead_id}/communications`, { type:'call', direction:'outbound', note:discussion })
      await api.patch(`/leads/${followup.lead_id}/status`, { status: newStatus })
      if (nextDate) await api.post('/followups',{ lead_id:followup.lead_id, follow_up_date:nextDate, notes:discussion }).catch(()=>{})
      toast.success('Follow-up updated ✓')
      onSave()
    } catch (err) { toast.error(err?.message||'Failed') }
    finally { setSaving(false) }
  }

  const sc = STATUS_META[newStatus] || STATUS_META.cold

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,23,0.8)', backdropFilter:'blur(12px)',
      zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}>
      <div className="fp fp-animate" onClick={e=>e.stopPropagation()}
        style={{ background:'#fff', borderRadius:28, width:'100%', maxWidth:540, overflow:'hidden',
          boxShadow:'0 40px 100px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.12)' }}>

        {/* Dynamic header — color shifts with selected status */}
        <div style={{ background:`linear-gradient(135deg, rgba(${sc.glow},0.9) 0%, rgba(${sc.glow},0.6) 100%)`,
          padding:'24px 26px 20px', position:'relative', overflow:'hidden',
          borderBottom:`3px solid rgba(${sc.glow},0.3)` }}>
          <div style={{ position:'absolute', top:-50, right:-50, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }}/>
          <div style={{ position:'absolute', bottom:-30, left:40, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }}/>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
            <div>
              <div style={{ color:'rgba(255,255,255,0.75)', fontSize:11, fontWeight:800, letterSpacing:2, textTransform:'uppercase', marginBottom:5 }}>
                ✏️ Update Follow-up
              </div>
              <div style={{ color:'#fff', fontSize:20, fontWeight:900, letterSpacing:-0.4, marginBottom:4 }}>
                {followup.lead_name || followup.contact_name || '—'}
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ color:'rgba(255,255,255,0.85)', fontSize:13, display:'flex', alignItems:'center', gap:4 }}>
                  📞 {followup.phone}
                </span>
                {followup.school_name && <span style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>🏫 {followup.school_name}</span>}
                {followup.product_name && <span style={{ color:'rgba(255,255,255,0.7)', fontSize:12 }}>📦 {followup.product_name}</span>}
              </div>
            </div>
            <button onClick={onClose} className="fp-btn"
              style={{ background:'rgba(255,255,255,0.18)', border:'none', color:'#fff',
                borderRadius:12, width:34, height:34, fontSize:16, display:'flex',
                alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', flexShrink:0 }}>✕</button>
          </div>
        </div>

        <div style={{ padding:'22px 26px', display:'flex', flexDirection:'column', gap:20 }}>

          {/* Notes */}
          <div>
            <label style={{ fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase',
              letterSpacing:1.2, display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
              <span style={{ width:20, height:20, borderRadius:6, background:'#EEF2FF',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>📝</span>
              Call Notes *
            </label>
            <textarea ref={textRef} value={discussion} onChange={e=>setDiscussion(e.target.value)} rows={3}
              placeholder="What was discussed? Key objections, interest level, next steps…"
              className="fp-input"
              style={{ width:'100%', border:'2px solid #E2E8F0', borderRadius:16, padding:'13px 16px',
                fontSize:14, color:'#0F172A', resize:'none', fontFamily:'Plus Jakarta Sans,sans-serif',
                lineHeight:1.65, background:'#FAFBFC' }} />
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase',
              letterSpacing:1.2, display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
              <span style={{ width:20, height:20, borderRadius:6, background:'#F0FDF4',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>📊</span>
              Update Lead Status
            </label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {ALL_STATUSES.map(s => {
                const c=STATUS_META[s]; const active=newStatus===s
                return (
                  <button key={s} onClick={()=>setNewStatus(s)} className="fp-tag"
                    style={{ padding:'6px 14px', borderRadius:20, border: active?'none':`1.5px solid ${c.bg}`,
                      cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:'Plus Jakarta Sans,sans-serif',
                      background: active ? c.dot : c.bg, color: active ? '#fff' : c.text,
                      boxShadow: active ? `0 6px 16px rgba(${c.glow},0.4)` : 'none' }}>
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Next date */}
          <div>
            <label style={{ fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase',
              letterSpacing:1.2, display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
              <span style={{ width:20, height:20, borderRadius:6, background:'#FFF7ED',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>📅</span>
              Schedule Next Follow-up
            </label>
            <input type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]} className="fp-input"
              style={{ border:'2px solid #E2E8F0', borderRadius:16, padding:'12px 16px',
                fontSize:14, color:'#0F172A', width:'100%', fontFamily:'Plus Jakarta Sans,sans-serif',
                background:'#FAFBFC' }} />
          </div>
        </div>

        <div style={{ padding:'0 26px 26px', display:'flex', gap:10 }}>
          <button onClick={onClose} className="fp-btn"
            style={{ flex:1, padding:'14px 0', border:'2px solid #E2E8F0', borderRadius:16,
              color:'#64748B', fontSize:14, fontWeight:700, background:'#F8FAFC',
              fontFamily:'Plus Jakarta Sans,sans-serif' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="fp-btn"
            style={{ flex:2.5, padding:'14px 0', border:'none', borderRadius:16,
              background:`linear-gradient(135deg, rgba(${sc.glow},1), rgba(${sc.glow},0.75))`,
              color:'#fff', fontSize:14, fontWeight:800, opacity:saving?0.7:1,
              fontFamily:'Plus Jakarta Sans,sans-serif',
              boxShadow:`0 10px 28px rgba(${sc.glow},0.45)` }}>
            {saving ? '⏳ Saving…' : '✓ Save & Close'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────
function LeadCard({ item, onUpdate, isAdmin, index, accent }) {
  const overdue = item.followup_type==='overdue'
  const today   = item.followup_type==='today'
  const days    = overdue ? daysO(item.follow_up_date) : 0
  const c       = STATUS_META[item.lead_status]||STATUS_META.cold

  return (
    <div className="fp-card fp-ripple" style={{
      background: overdue
        ? 'linear-gradient(135deg,#FFF5F5 0%,#FEFEFF 100%)'
        : today
        ? 'linear-gradient(135deg,#FFFDF5 0%,#FEFEFF 100%)'
        : 'linear-gradient(135deg,#FAFBFC 0%,#fff 100%)',
      border: overdue ? '1.5px solid #FECACA' : today ? '1.5px solid #FDE68A' : '1.5px solid #F1F5F9',
      borderRadius: 18,
      padding: '16px 18px 16px 20px',
      display: 'flex', alignItems: 'center', gap: 15,
      position: 'relative', overflow: 'hidden',
      animationDelay: `${index * 50}ms`,
      boxShadow: overdue
        ? '0 4px 20px rgba(239,68,68,0.08), 0 1px 4px rgba(0,0,0,0.04)'
        : today
        ? '0 4px 20px rgba(245,158,11,0.08), 0 1px 4px rgba(0,0,0,0.04)'
        : '0 1px 6px rgba(0,0,0,0.05)',
    }}>
      {/* Left accent stripe */}
      <div style={{ position:'absolute', left:0, top:8, bottom:8, width:4, borderRadius:'0 4px 4px 0',
        background: overdue ? 'linear-gradient(to bottom,#F87171,#EF4444)' : today ? 'linear-gradient(to bottom,#FCD34D,#F59E0B)' : `linear-gradient(to bottom,${c.dot},${c.dot}99)`,
        boxShadow: overdue ? '2px 0 8px rgba(239,68,68,0.4)' : today ? '2px 0 8px rgba(245,158,11,0.4)' : `2px 0 8px rgba(${c.glow},0.3)` }} />

      {/* Avatar */}
      <div style={{ width:46, height:46, borderRadius:14, flexShrink:0, display:'flex',
        alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:900, letterSpacing:-1,
        background: overdue ? '#FEE2E2' : today ? '#FEF3C7' : `rgba(${c.glow},0.12)`,
        color: overdue ? '#DC2626' : today ? '#D97706' : c.dot,
        border: `2px solid ${overdue?'#FECACA':today?'#FDE68A':c.bg}`,
        boxShadow: `0 4px 12px rgba(${overdue?'239,68,68':today?'245,158,11':c.glow},0.2)` }}>
        {(item.lead_name||item.contact_name||'?')[0].toUpperCase()}
      </div>

      {/* Content */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:5 }}>
          <span style={{ fontSize:15, fontWeight:800, color:'#0F172A', letterSpacing:-0.3 }}>
            {item.lead_name||item.contact_name||'—'}
          </span>
          <SBadge status={item.lead_status} />
          {overdue && days > 0 && (
            <span style={{ fontSize:10, fontWeight:800, color:'#DC2626', background:'#FEE2E2',
              padding:'2px 9px', borderRadius:20, border:'1px solid #FECACA', letterSpacing:0.3 }}>
              🕐 {days}d late
            </span>
          )}
        </div>

        {item.school_name && item.school_name !== item.lead_name && (
          <div style={{ fontSize:12, color:'#94A3B8', marginBottom:5, fontWeight:500 }}>🏫 {item.school_name}</div>
        )}

        <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
          <a href={`tel:${item.phone}`}
            style={{ fontSize:12, fontWeight:700, color:'#4F46E5', textDecoration:'none',
              background:'#EEF2FF', padding:'3px 10px', borderRadius:8, border:'1px solid #C7D2FE',
              display:'inline-flex', alignItems:'center', gap:4 }}>
            📞 {item.phone||'—'}
          </a>
          {item.product_name && (
            <span style={{ fontSize:12, fontWeight:700, color:'#7C3AED', background:'#F5F3FF',
              padding:'3px 10px', borderRadius:8, border:'1px solid #DDD6FE' }}>
              📦 {item.product_name}
            </span>
          )}
          {isAdmin && item.agent_name && (
            <span style={{ fontSize:12, fontWeight:600, color:'#64748B', background:'#F1F5F9',
              padding:'3px 10px', borderRadius:8, border:'1px solid #E2E8F0' }}>
              👤 {item.agent_name}
            </span>
          )}
        </div>

        {item.notes && (
          <div style={{ fontSize:12, color:'#94A3B8', marginTop:6, fontStyle:'italic',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:420,
            borderLeft:'3px solid #E2E8F0', paddingLeft:8, marginLeft:2 }}>
            "{item.notes}"
          </div>
        )}
      </div>

      {/* Date badge */}
      <div style={{ flexShrink:0, textAlign:'center', minWidth:90 }}>
        <div style={{ fontSize:10, fontWeight:800, color:'#94A3B8', textTransform:'uppercase',
          letterSpacing:1, marginBottom:4 }}>FOLLOW-UP</div>
        <div className="fp-mono" style={{ fontSize:12, fontWeight:600,
          color: overdue?'#DC2626':today?'#D97706':'#4F46E5',
          background: overdue?'#FEF2F2':today?'#FFFBEB':'#EEF2FF',
          padding:'5px 10px', borderRadius:10, border: overdue?'1.5px solid #FECACA':today?'1.5px solid #FDE68A':'1.5px solid #C7D2FE',
          boxShadow: overdue?'0 4px 12px rgba(239,68,68,0.15)':today?'0 4px 12px rgba(245,158,11,0.15)':'0 4px 12px rgba(99,102,241,0.1)' }}>
          {fmt(item.follow_up_date)}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <a href={`tel:${item.phone}`} className="fp-btn"
          style={{ width:36, height:36, background:'#F0FDF4', color:'#16A34A', borderRadius:10,
            fontSize:16, textDecoration:'none', border:'1.5px solid #BBF7D0',
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 2px 8px rgba(34,197,94,0.2)' }}>
          📞
        </a>
        <a href={`https://wa.me/${(item.phone||'').replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" className="fp-btn"
          style={{ width:36, height:36, background:'#DCFCE7', color:'#15803D', borderRadius:10,
            fontSize:16, textDecoration:'none', border:'1.5px solid #86EFAC',
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 2px 8px rgba(21,128,61,0.2)' }}>
          💬
        </a>
        <button onClick={()=>onUpdate(item)} className="fp-btn"
          style={{ padding:'0 14px', height:36, background:'linear-gradient(135deg,#4F46E5,#6D28D9)',
            color:'#fff', borderRadius:10, fontSize:12, fontWeight:800, border:'none',
            fontFamily:'Plus Jakarta Sans,sans-serif', letterSpacing:0.2,
            boxShadow:'0 4px 14px rgba(99,102,241,0.35)' }}>
          Update →
        </button>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────
function Section({ title, subtitle, icon, accent, glowColor, items, onUpdate, isAdmin, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ borderRadius:22, overflow:'hidden',
      border:`1.5px solid rgba(${glowColor},0.2)`,
      boxShadow:`0 4px 24px rgba(${glowColor},0.08), 0 1px 4px rgba(0,0,0,0.04)`,
      background:'#fff' }}>

      {/* Section header */}
      <button onClick={()=>setOpen(o=>!o)} className="fp-section-btn"
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'18px 22px', border:'none', cursor:'pointer',
          background:`linear-gradient(135deg,rgba(${glowColor},0.08),rgba(${glowColor},0.04))`,
          borderBottom: open ? `1.5px solid rgba(${glowColor},0.15)` : 'none' }}>

        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {/* Icon box */}
          <div style={{ width:46, height:46, borderRadius:14, display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:22,
            background:`rgba(${glowColor},0.12)`,
            border:`1.5px solid rgba(${glowColor},0.2)`,
            boxShadow:`0 6px 16px rgba(${glowColor},0.2)` }}>
            {icon}
          </div>

          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:16, fontWeight:900, color:'#0F172A', letterSpacing:-0.4 }}>{title}</div>
            <div style={{ fontSize:12, color:'#64748B', fontWeight:500, marginTop:1 }}>{subtitle}</div>
          </div>

          {/* Count pill */}
          <div style={{ background:`rgba(${glowColor},0.9)`, color:'#fff',
            borderRadius:12, fontSize:14, fontWeight:900, padding:'3px 14px',
            boxShadow:`0 6px 16px rgba(${glowColor},0.45)`, letterSpacing:-0.3 }}>
            {items.length}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Progress mini-bar */}
          {items.length > 0 && (
            <div style={{ display:'flex', gap:2 }}>
              {items.slice(0,8).map((_,i)=>(
                <div key={i} style={{ width:6, height:20, borderRadius:3,
                  background:`rgba(${glowColor},${0.3+i*0.08})`,
                  transform:`scaleY(${0.4+Math.random()*0.6})` }} />
              ))}
            </div>
          )}
          <div style={{ fontSize:11, fontWeight:700, color:`rgba(${glowColor},0.9)`,
            background:`rgba(${glowColor},0.1)`, padding:'5px 12px', borderRadius:10,
            border:`1px solid rgba(${glowColor},0.2)` }}>
            {open ? '▲ Collapse' : '▼ Expand'}
          </div>
        </div>
      </button>

      {open && (
        <div style={{ background:'#F8FAFC', padding: items.length===0 ? '48px 24px' : '14px 18px',
          display:'flex', flexDirection:'column', gap:10 }}>
          {items.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94A3B8' }}>
              <div className="fp-float" style={{ fontSize:48, marginBottom:12 }}>🎉</div>
              <div style={{ fontSize:15, fontWeight:700, color:'#64748B' }}>All clear!</div>
              <div style={{ fontSize:13, color:'#94A3B8', marginTop:4 }}>No follow-ups here</div>
            </div>
          ) : items.map((item, i) => (
            <div key={item.lead_id||i} className="fp-animate" style={{ animationDelay:`${i*45}ms` }}>
              <LeadCard item={item} onUpdate={onUpdate} isAdmin={isAdmin} index={i} accent={accent} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  MAIN PAGE
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
  const [tick, setTick]         = useState(0)

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(r => {
        const list = r?.data||r||[]
        setAgents(Array.isArray(list)?list.filter(u=>['agent','admin'].includes(u.role_name)):[])
      }).catch(()=>{})
    }
    api.get('/products/active').then(r => {
      const list = r?.data||r||[]
      setProducts(Array.isArray(list)?list:[])
    }).catch(()=>{})
  }, [isAdmin])

  const fetchAll = async (agentF, productF, statusF) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ section:'all' })
      if (isAdmin && agentF) params.set('agent_id',agentF)
      if (productF)          params.set('product_id',productF)
      if (statusF)           params.set('lead_status',statusF)
      const body = await api.get(`/followups?${params}`)
      const d    = body?.data||{}
      let t=[],p=[],n=[]
      if (Array.isArray(d)) {
        t=d.filter(x=>x.followup_type==='today')
        p=d.filter(x=>x.followup_type==='overdue')
        n=d.filter(x=>x.followup_type==='upcoming')
      } else {
        t=Array.isArray(d.today)?d.today:[]
        p=Array.isArray(d.previous)?d.previous:[]
        n=Array.isArray(d.next_3_days)?d.next_3_days:[]
      }
      setData({ today:t, previous:p, next_3_days:n })
      setCounts(body?.counts||{ today:t.length, previous:p.length, next_3_days:n.length, total:t.length+p.length+n.length })
    } catch (err) { setError(err?.message||'Failed'); toast.error(err?.message||'Failed') }
    finally { setLoading(false); setTick(x=>x+1) }
  }

  useEffect(() => { fetchAll(filterAgent,filterProduct,filterStatus) }, [filterAgent,filterProduct,filterStatus])
  useEffect(() => {
    const t = setInterval(()=>fetchAll(filterAgent,filterProduct,filterStatus), 60000)
    return ()=>clearInterval(t)
  }, [filterAgent,filterProduct,filterStatus])

  const total = (counts.today||0)+(counts.previous||0)+(counts.next_3_days||0)

  const selStyle = { border:'2px solid #E2E8F0', borderRadius:12, padding:'9px 13px',
    fontSize:13, color:'#1E293B', background:'#fff', fontFamily:'Plus Jakarta Sans,sans-serif',
    fontWeight:600 }

  return (
    <div className="fp" style={{ maxWidth:1100, margin:'0 auto' }}>
      <style>{STYLES}</style>

      {/* ══ HERO HEADER ══════════════════════════════════ */}
      <div style={{ position:'relative', borderRadius:28, overflow:'hidden', marginBottom:24,
        background:'linear-gradient(135deg,#0F172A 0%,#1E1B4B 40%,#312E81 70%,#4C1D95 100%)',
        padding:'32px 36px', boxShadow:'0 20px 60px rgba(15,23,42,0.4)' }}>

        {/* Grid texture overlay */}
        <div style={{ position:'absolute', inset:0, opacity:0.04,
          backgroundImage:'linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px)',
          backgroundSize:'32px 32px' }} />

        {/* Glow orbs */}
        <div style={{ position:'absolute', top:-60, right:60, width:250, height:250, borderRadius:'50%',
          background:'radial-gradient(circle,rgba(139,92,246,0.3),transparent 70%)' }} />
        <div style={{ position:'absolute', bottom:-80, left:120, width:200, height:200, borderRadius:'50%',
          background:'radial-gradient(circle,rgba(99,102,241,0.2),transparent 70%)' }} />
        <div style={{ position:'absolute', top:20, left:400, width:140, height:140, borderRadius:'50%',
          background:'radial-gradient(circle,rgba(236,72,153,0.15),transparent 70%)' }} />

        <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(99,102,241,0.3)',
                border:'1px solid rgba(165,180,252,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>📅</div>
              <span style={{ color:'rgba(165,180,252,0.8)', fontSize:11, fontWeight:800, letterSpacing:2.5, textTransform:'uppercase' }}>
                CRM · Follow-ups
              </span>
            </div>
            <h1 style={{ color:'#fff', fontSize:30, fontWeight:900, margin:'0 0 8px', letterSpacing:-0.8, lineHeight:1.1 }}>
              Follow-up Queue
            </h1>
            <p style={{ color:'rgba(196,181,253,0.75)', fontSize:14, margin:0, fontWeight:500 }}>
              {loading ? 'Syncing data…' : `${total} total · ${format(new Date(),'EEEE, dd MMMM yyyy')}`}
            </p>
          </div>

          {/* Stats cluster */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'stretch' }}>
            {[
              { label:'TODAY',    val:counts.today||0,       icon:'⏰', bg:'rgba(253,186,116,0.15)', border:'rgba(253,186,116,0.3)', val_color:'#FCD34D', pulse:counts.today>0 },
              { label:'OVERDUE',  val:counts.previous||0,    icon:'🔴', bg:'rgba(248,113,113,0.15)', border:'rgba(248,113,113,0.3)', val_color:'#FCA5A5', pulse:counts.previous>0 },
              { label:'UPCOMING', val:counts.next_3_days||0, icon:'📆', bg:'rgba(167,139,250,0.15)', border:'rgba(167,139,250,0.3)', val_color:'#A5B4FC', pulse:false },
            ].map(({ label, val, icon, bg, border, val_color, pulse }) => (
              <div key={label} style={{ background:bg, border:`1px solid ${border}`, borderRadius:18,
                padding:'14px 20px', textAlign:'center', backdropFilter:'blur(8px)', minWidth:90 }}>
                <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
                <div style={{ color:val_color, fontSize:32, fontWeight:900, lineHeight:1,
                  fontFamily:'IBM Plex Mono,monospace',
                  textShadow:`0 0 20px ${val_color}` }}>
                  {val}
                </div>
                <div style={{ color:'rgba(255,255,255,0.5)', fontSize:10, fontWeight:800, letterSpacing:1.5, marginTop:4 }}>
                  {label}
                </div>
              </div>
            ))}

            <button onClick={()=>fetchAll(filterAgent,filterProduct,filterStatus)} className="fp-btn"
              style={{ padding:'14px 18px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)',
                borderRadius:18, color:'rgba(255,255,255,0.85)', fontSize:13, fontWeight:700,
                backdropFilter:'blur(8px)', fontFamily:'Plus Jakarta Sans,sans-serif',
                display:'flex', alignItems:'center', gap:6, alignSelf:'stretch' }}>
              <span style={{ fontSize:16 }}>↻</span> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ══ FILTERS ══════════════════════════════════════ */}
      <div style={{ background:'#fff', border:'1.5px solid #F1F5F9', borderRadius:18,
        padding:'14px 20px', display:'flex', flexWrap:'wrap', alignItems:'center',
        gap:10, marginBottom:20,
        boxShadow:'0 2px 16px rgba(0,0,0,0.04)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:4 }}>
          <div style={{ width:26, height:26, borderRadius:8, background:'#EEF2FF',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>🔍</div>
          <span style={{ fontSize:11, fontWeight:800, color:'#64748B', textTransform:'uppercase', letterSpacing:1.2 }}>Filter</span>
        </div>

        {isAdmin && agents.length > 0 && (
          <select style={selStyle} value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} className="fp-input">
            <option value="">👥 All Agents</option>
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {products.length > 0 && (
          <select style={selStyle} value={filterProduct} onChange={e=>setFilterProduct(e.target.value)} className="fp-input">
            <option value="">📦 All Products</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select style={selStyle} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="fp-input">
          <option value="">🏷️ All Statuses</option>
          {ALL_STATUSES.map(s=><option key={s} value={s}>{STATUS_META[s]?.label}</option>)}
        </select>

        {(filterAgent||filterProduct||filterStatus) && (
          <button onClick={()=>{setFilterAgent('');setFilterProduct('');setFilterStatus('')}} className="fp-btn"
            style={{ padding:'8px 14px', background:'#FEF2F2', border:'1.5px solid #FECACA',
              borderRadius:10, color:'#DC2626', fontSize:12, fontWeight:800,
              fontFamily:'Plus Jakarta Sans,sans-serif' }}>
            ✕ Reset Filters
          </button>
        )}

        <div style={{ marginLeft:'auto', fontSize:12, color:'#94A3B8', fontWeight:500 }}>
          Auto-refreshes every 60s
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:16,
          padding:'14px 20px', display:'flex', alignItems:'center', gap:12, marginBottom:18,
          boxShadow:'0 4px 16px rgba(239,68,68,0.1)' }}>
          <span style={{ fontSize:22 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#DC2626' }}>Failed to load follow-ups</div>
            <div style={{ fontSize:12, color:'#EF4444', marginTop:2 }}>{error}</div>
          </div>
          <button onClick={()=>fetchAll(filterAgent,filterProduct,filterStatus)} className="fp-btn"
            style={{ padding:'8px 16px', background:'#FEE2E2', border:'1.5px solid #FECACA',
              borderRadius:10, color:'#DC2626', fontSize:12, fontWeight:800,
              fontFamily:'Plus Jakarta Sans,sans-serif' }}>
            Retry
          </button>
        </div>
      )}

      {/* ══ CONTENT ══════════════════════════════════════ */}
      {loading ? (
        <div style={{ background:'#fff', borderRadius:22, padding:'80px 24px', textAlign:'center',
          border:'1.5px solid #F1F5F9', boxShadow:'0 4px 24px rgba(0,0,0,0.05)' }}>
          <div style={{ width:48, height:48, border:'4px solid #EEF2FF', borderTopColor:'#4F46E5',
            borderRadius:'50%', animation:'fp-spin 0.8s linear infinite', margin:'0 auto 18px' }} />
          <div style={{ fontSize:16, color:'#64748B', fontWeight:700 }}>Loading follow-ups…</div>
          <div style={{ fontSize:13, color:'#94A3B8', marginTop:6 }}>Fetching your queue</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
          <Section
            title={`Today`}
            subtitle={`${format(new Date(),'EEEE, dd MMMM yyyy')} · ${data.today.length} leads to follow up`}
            icon="⏰" accent="#F59E0B" glowColor="245,158,11"
            items={data.today} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />

          <Section
            title="Overdue"
            subtitle={`${data.previous.length} leads past their follow-up date — needs attention`}
            icon="🔴" accent="#EF4444" glowColor="239,68,68"
            items={data.previous} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />

          <Section
            title="Next 3 Days"
            subtitle={`${data.next_3_days.length} upcoming follow-ups to prepare for`}
            icon="📆" accent="#4F46E5" glowColor="99,102,241"
            items={data.next_3_days} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />
        </div>
      )}

      {selected && (
        <UpdateModal followup={selected} onClose={()=>setSelected(null)}
          onSave={()=>{ setSelected(null); fetchAll(filterAgent,filterProduct,filterStatus) }} />
      )}
    </div>
  )
}
