// web-admin/src/pages/FollowUpsPage.jsx — FIXED VISUAL
import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_META = {
  new:            { bg:'#EFF6FF', text:'#1D4ED8', dot:'#3B82F6', glow:'59,130,246',   label:'New'            },
  hot:            { bg:'#FFF1F2', text:'#BE123C', dot:'#F43F5E', glow:'244,63,94',    label:'Hot'            },
  warm:           { bg:'#FFFBEB', text:'#B45309', dot:'#F59E0B', glow:'245,158,11',   label:'Warm'           },
  cold:           { bg:'#F8FAFC', text:'#475569', dot:'#94A3B8', glow:'148,163,184',  label:'Cold'           },
  converted:      { bg:'#F0FDF4', text:'#15803D', dot:'#22C55E', glow:'34,197,94',    label:'Converted'      },
  not_interested: { bg:'#F9FAFB', text:'#6B7280', dot:'#D1D5DB', glow:'209,213,219',  label:'Not Interested' },
  call_back:      { bg:'#F5F3FF', text:'#6D28D9', dot:'#8B5CF6', glow:'139,92,246',   label:'Call Back'      },
}
const ALL_STATUSES = Object.keys(STATUS_META)

const STYLES = `
  .fup * { box-sizing: border-box; }
  .fup { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
  .fup-mono { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace !important; }

  .fup-card-hover { transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .fup-card-hover:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(0,0,0,0.12) !important; }

  .fup-btn { transition: all 0.15s ease; cursor: pointer; }
  .fup-btn:hover  { transform: translateY(-1px) scale(1.04); filter: brightness(1.06); }
  .fup-btn:active { transform: scale(0.96); }

  .fup-input:focus { outline: none; border-color: #4F46E5 !important; box-shadow: 0 0 0 3px rgba(79,70,229,0.12); }

  .fup-stat { transition: all 0.2s ease; cursor: pointer; }
  .fup-stat:hover { transform: translateY(-2px); }
  .fup-stat:active { transform: scale(0.97); }

  @keyframes fup-spin   { to { transform: rotate(360deg); } }
  @keyframes fup-pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }
  @keyframes fup-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
  @keyframes fup-in     { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }

  .fup-animate { animation: fup-in 0.3s ease both; }
  .fup-float   { animation: fup-float 3s ease-in-out infinite; }
`

const fmt   = d => { try { return format(new Date(d), 'dd MMM yyyy') } catch { return '—' } }
const daysO = d => d ? Math.floor((new Date() - new Date(d)) / 86400000) : 0

function SBadge({ status }) {
  const c = STATUS_META[status] || STATUS_META.cold
  return (
    <span style={{
      background: c.bg, color: c.text,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      border: `1px solid rgba(${c.glow},0.2)`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0,
        animation: (status==='hot'||status==='new') ? 'fup-pulse 1.5s ease infinite' : 'none',
      }} />
      {c.label}
    </span>
  )
}

// ── Compact Stat Card ─────────────────────────────────────
function StatCard({ icon, label, value, sublabel, solidColor, glowRGB, active, onClick }) {
  return (
    <button onClick={onClick} className="fup-stat" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 18px',
      borderRadius: 16,
      border: active ? `2px solid ${solidColor}` : '2px solid #E8ECF4',
      background: active
        ? `linear-gradient(135deg, ${solidColor} 0%, ${solidColor}cc 100%)`
        : '#fff',
      boxShadow: active
        ? `0 8px 28px rgba(${glowRGB},0.35)`
        : '0 1px 8px rgba(0,0,0,0.06)',
      minWidth: 0, flex: '1 1 0',
      fontFamily: 'inherit', cursor: 'pointer',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Icon box */}
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
        background: active ? 'rgba(255,255,255,0.2)' : `rgba(${glowRGB},0.1)`,
        border: active ? '1.5px solid rgba(255,255,255,0.3)' : `1.5px solid rgba(${glowRGB},0.15)`,
      }}>{icon}</div>

      {/* Text */}
      <div style={{ textAlign: 'left', minWidth: 0 }}>
        <div style={{
          fontSize: 28, fontWeight: 900, lineHeight: 1,
          color: active ? '#fff' : solidColor,
          letterSpacing: -1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {String(value ?? 0)}
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: active ? 'rgba(255,255,255,0.85)' : '#374151',
          textTransform: 'uppercase', letterSpacing: 0.5,
          marginTop: 2, lineHeight: 1.2,
        }}>{label}</div>
        {sublabel && (
          <div style={{
            fontSize: 10, color: active ? 'rgba(255,255,255,0.6)' : '#9CA3AF',
            marginTop: 1, fontWeight: 500,
          }}>{sublabel}</div>
        )}
      </div>

      {active && (
        <div style={{
          position: 'absolute', top: 8, right: 10,
          width: 7, height: 7, borderRadius: '50%',
          background: '#fff', opacity: 0.8,
          animation: 'fup-pulse 1.5s ease infinite',
        }} />
      )}
    </button>
  )
}

// ── Update Modal ──────────────────────────────────────────
function UpdateModal({ followup, onClose, onSave }) {
  const [newStatus, setNewStatus]   = useState(followup.lead_status || 'new')
  const [discussion, setDiscussion] = useState('')
  const [nextDate, setNextDate]     = useState('')
  const [saving, setSaving]         = useState(false)
  const sc = STATUS_META[newStatus] || STATUS_META.cold

  const handleSave = async () => {
    if (!discussion.trim()) return toast.error('Add call notes first')
    setSaving(true)
    try {
      await api.post(`/leads/${followup.lead_id}/communications`, { type:'call', direction:'outbound', note: discussion })
      await api.patch(`/leads/${followup.lead_id}/status`, { status: newStatus })
      if (nextDate) await api.post('/followups', { lead_id: followup.lead_id, follow_up_date: nextDate, notes: discussion }).catch(()=>{})
      toast.success('Follow-up updated ✓')
      onSave()
    } catch (err) { toast.error(err?.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, zIndex:200,
      background:'rgba(10,15,30,0.78)', backdropFilter:'blur(12px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }}>
      <div onClick={e=>e.stopPropagation()} className="fup fup-animate" style={{
        background:'#fff', borderRadius:24, width:'100%', maxWidth:520,
        overflow:'hidden',
        boxShadow:'0 40px 100px rgba(0,0,0,0.4)',
      }}>
        {/* Header — colour shifts with status */}
        <div style={{
          background:`linear-gradient(135deg, rgba(${sc.glow},1) 0%, rgba(${sc.glow},0.7) 100%)`,
          padding:'24px 26px 20px', position:'relative', overflow:'hidden',
        }}>
          <div style={{position:'absolute',top:-50,right:-40,width:180,height:180,borderRadius:'50%',background:'rgba(255,255,255,0.1)'}}/>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',position:'relative'}}>
            <div>
              <div style={{color:'rgba(255,255,255,0.65)',fontSize:10,fontWeight:800,letterSpacing:2.5,textTransform:'uppercase',marginBottom:5}}>
                ✏️ Update Follow-up
              </div>
              <div style={{color:'#fff',fontSize:20,fontWeight:800,marginBottom:6,letterSpacing:-0.3}}>
                {followup.lead_name||followup.contact_name||'—'}
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {followup.phone && <span style={{background:'rgba(255,255,255,0.18)',color:'#fff',fontSize:12,fontWeight:600,padding:'3px 11px',borderRadius:8}}>📞 {followup.phone}</span>}
                {followup.school_name && <span style={{background:'rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.9)',fontSize:12,fontWeight:600,padding:'3px 11px',borderRadius:8}}>🏫 {followup.school_name}</span>}
                {followup.product_name && <span style={{background:'rgba(255,255,255,0.14)',color:'rgba(255,255,255,0.9)',fontSize:12,fontWeight:600,padding:'3px 11px',borderRadius:8}}>📦 {followup.product_name}</span>}
              </div>
            </div>
            <button onClick={onClose} className="fup-btn" style={{
              width:34,height:34,borderRadius:10,border:'none',background:'rgba(255,255,255,0.2)',
              color:'#fff',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',
              fontFamily:'inherit',flexShrink:0,
            }}>✕</button>
          </div>
        </div>

        <div style={{padding:'20px 26px',display:'flex',flexDirection:'column',gap:18}}>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
              📝 Call Notes *
            </label>
            <textarea value={discussion} onChange={e=>setDiscussion(e.target.value)} rows={3} autoFocus
              placeholder="What was discussed? Key objections, interest level, next steps…"
              className="fup-input"
              style={{width:'100%',border:'2px solid #E5E7EB',borderRadius:12,padding:'12px 14px',
                fontSize:14,color:'#111827',resize:'none',fontFamily:'inherit',lineHeight:1.6,background:'#FAFAFA'}}/>
          </div>

          <div>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
              📊 Update Status
            </label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {ALL_STATUSES.map(s=>{
                const c=STATUS_META[s]; const active=newStatus===s
                return (
                  <button key={s} onClick={()=>setNewStatus(s)} className="fup-btn" style={{
                    padding:'6px 14px',borderRadius:20,
                    border:active?'none':`1.5px solid ${c.bg}`,
                    background:active?c.dot:c.bg,
                    color:active?'#fff':c.text,
                    fontSize:12,fontWeight:700,fontFamily:'inherit',
                    boxShadow:active?`0 4px 14px rgba(${c.glow},0.4)`:'none',
                  }}>{c.label}</button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={{display:'block',fontSize:11,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>
              📅 Next Follow-up Date
            </label>
            <input type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]} className="fup-input"
              style={{width:'100%',border:'2px solid #E5E7EB',borderRadius:12,padding:'11px 14px',
                fontSize:14,color:'#111827',fontFamily:'inherit',background:'#FAFAFA'}}/>
          </div>
        </div>

        <div style={{padding:'0 26px 24px',display:'flex',gap:10}}>
          <button onClick={onClose} className="fup-btn" style={{
            flex:1,padding:'13px 0',border:'2px solid #E5E7EB',borderRadius:14,
            color:'#6B7280',fontSize:14,fontWeight:700,background:'#F9FAFB',fontFamily:'inherit',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="fup-btn" style={{
            flex:2.5,padding:'13px 0',border:'none',borderRadius:14,
            background:`linear-gradient(135deg,rgba(${sc.glow},1),rgba(${sc.glow},0.72))`,
            color:'#fff',fontSize:14,fontWeight:800,fontFamily:'inherit',
            boxShadow:`0 8px 24px rgba(${sc.glow},0.4)`,opacity:saving?0.7:1,
          }}>{saving?'⏳ Saving…':'✓ Save & Close'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────
function LeadCard({ item, onUpdate, isAdmin, index }) {
  const overdue = item.followup_type === 'overdue'
  const today   = item.followup_type === 'today'
  const days    = overdue ? daysO(item.follow_up_date) : 0
  const c       = STATUS_META[item.lead_status] || STATUS_META.cold
  const name    = item.lead_name || item.contact_name || '?'
  const initials = name.substring(0,2).toUpperCase()
  const accentRGB = overdue ? '239,68,68' : today ? '245,158,11' : c.glow
  const accentHex = overdue ? '#EF4444'   : today ? '#F59E0B'    : c.dot

  return (
    <div className="fup fup-card-hover" style={{
      background:'#fff',
      border: overdue ? '1.5px solid #FECACA' : today ? '1.5px solid #FDE68A' : '1.5px solid #E8ECF4',
      borderRadius:18,
      padding:'16px 18px 16px 22px',
      display:'grid',
      gridTemplateColumns:'50px 1fr auto',
      gap:14,
      alignItems:'center',
      position:'relative',
      overflow:'hidden',
      boxShadow: overdue
        ? '0 2px 16px rgba(239,68,68,0.08)'
        : today
        ? '0 2px 16px rgba(245,158,11,0.08)'
        : '0 1px 6px rgba(0,0,0,0.04)',
      animationDelay:`${index*45}ms`,
    }}>
      {/* Left accent bar */}
      <div style={{
        position:'absolute', left:0, top:8, bottom:8, width:4, borderRadius:'0 3px 3px 0',
        background:`linear-gradient(to bottom, ${accentHex}, ${accentHex}77)`,
        boxShadow:`2px 0 10px rgba(${accentRGB},0.45)`,
      }}/>

      {/* Avatar */}
      <div style={{
        width:50, height:50, borderRadius:14, flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:15, fontWeight:800, letterSpacing:-0.5,
        background:`rgba(${accentRGB},0.1)`,
        color: accentHex,
        border:`2px solid rgba(${accentRGB},0.18)`,
      }}>{initials}</div>

      {/* Content */}
      <div style={{minWidth:0}}>
        {/* Name row */}
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:7}}>
          <span style={{fontSize:15,fontWeight:800,color:'#111827',letterSpacing:-0.3}}>
            {name}
          </span>
          <SBadge status={item.lead_status}/>
          {overdue && days>0 && (
            <span style={{fontSize:10,fontWeight:800,color:'#DC2626',background:'#FEE2E2',
              padding:'2px 8px',borderRadius:20,border:'1px solid #FECACA'}}>
              🕐 {days}d late
            </span>
          )}
          {today && (
            <span style={{fontSize:10,fontWeight:800,color:'#D97706',background:'#FEF3C7',
              padding:'2px 8px',borderRadius:20,border:'1px solid #FDE68A'}}>
              ⏰ Due Today
            </span>
          )}
        </div>

        {/* Info chips */}
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <a href={`tel:${item.phone}`} style={{
            fontSize:12,fontWeight:700,color:'#4338CA',textDecoration:'none',
            background:'#EEF2FF',padding:'4px 10px',borderRadius:8,border:'1px solid #C7D2FE',
            display:'inline-flex',alignItems:'center',gap:4,
            fontFamily:'SF Mono,Fira Code,monospace',
          }}>📞 {item.phone||'—'}</a>

          {item.school_name && item.school_name!==name && (
            <span style={{fontSize:12,fontWeight:600,color:'#374151',background:'#F9FAFB',
              padding:'4px 10px',borderRadius:8,border:'1px solid #E5E7EB',
              display:'inline-flex',alignItems:'center',gap:4}}>
              🏫 {item.school_name}
            </span>
          )}

          {item.product_name && (
            <span style={{fontSize:12,fontWeight:700,color:'#6D28D9',background:'#F5F3FF',
              padding:'4px 10px',borderRadius:8,border:'1px solid #DDD6FE',
              display:'inline-flex',alignItems:'center',gap:4}}>
              📦 {item.product_name}
            </span>
          )}

          {isAdmin && item.agent_name && (
            <span style={{fontSize:12,fontWeight:600,color:'#4B5563',background:'#F3F4F6',
              padding:'4px 10px',borderRadius:8,border:'1px solid #E5E7EB',
              display:'inline-flex',alignItems:'center',gap:4}}>
              👤 {item.agent_name}
            </span>
          )}
        </div>

        {item.notes && (
          <div style={{
            marginTop:7,fontSize:12,color:'#9CA3AF',fontStyle:'italic',
            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:440,
            borderLeft:`3px solid rgba(${accentRGB},0.22)`,paddingLeft:9,
          }}>
            "{item.notes}"
          </div>
        )}
      </div>

      {/* Right: date + actions */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:9,flexShrink:0}}>
        <div style={{
          background: overdue?'#FEF2F2':today?'#FFFBEB':'#EEF2FF',
          border: overdue?'1.5px solid #FECACA':today?'1.5px solid #FDE68A':'1.5px solid #C7D2FE',
          borderRadius:10,padding:'6px 12px',textAlign:'center',
        }}>
          <div style={{fontSize:9,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:1,marginBottom:2}}>
            FOLLOW-UP
          </div>
          <div className="fup-mono" style={{
            fontSize:11,fontWeight:700,letterSpacing:0.2,
            color: overdue?'#DC2626':today?'#D97706':'#4338CA',
          }}>{fmt(item.follow_up_date)}</div>
        </div>

        <div style={{display:'flex',gap:6}}>
          <a href={`tel:${item.phone}`} className="fup-btn" style={{
            width:34,height:34,background:'#F0FDF4',borderRadius:10,fontSize:15,
            textDecoration:'none',border:'1.5px solid #BBF7D0',
            display:'inline-flex',alignItems:'center',justifyContent:'center',
          }}>📞</a>
          <a href={`https://wa.me/${(item.phone||'').replace(/[^0-9]/g,'')}`}
            target="_blank" rel="noreferrer" className="fup-btn" style={{
            width:34,height:34,background:'#DCFCE7',borderRadius:10,fontSize:15,
            textDecoration:'none',border:'1.5px solid #86EFAC',
            display:'inline-flex',alignItems:'center',justifyContent:'center',
          }}>💬</a>
          <button onClick={()=>onUpdate(item)} className="fup-btn" style={{
            padding:'0 14px',height:34,borderRadius:10,border:'none',
            background:`linear-gradient(135deg,rgba(${accentRGB},1),rgba(${accentRGB},0.75))`,
            color:'#fff',fontSize:12,fontWeight:800,fontFamily:'inherit',
            boxShadow:`0 4px 14px rgba(${accentRGB},0.38)`,
          }}>Update →</button>
        </div>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────
function Section({ title, subtitle, icon, glowRGB, accentHex, items, onUpdate, isAdmin, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen)

  const statusDist = ALL_STATUSES.map(s => ({
    s, count: items.filter(i => i.lead_status === s).length,
  })).filter(x => x.count > 0)

  return (
    <div className="fup" style={{
      borderRadius:22, overflow:'hidden',
      border:`1.5px solid rgba(${glowRGB},0.18)`,
      background:'#fff',
      boxShadow:`0 2px 20px rgba(${glowRGB},0.07), 0 1px 4px rgba(0,0,0,0.03)`,
    }}>
      <button onClick={()=>setOpen(o=>!o)} className="fup-btn" style={{
        width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'18px 22px',border:'none',cursor:'pointer',fontFamily:'inherit',
        background:`linear-gradient(135deg,rgba(${glowRGB},0.07),rgba(${glowRGB},0.02))`,
        borderBottom: open ? `1.5px solid rgba(${glowRGB},0.12)` : 'none',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{
            width:46,height:46,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:22,background:`rgba(${glowRGB},0.12)`,border:`1.5px solid rgba(${glowRGB},0.2)`,
            boxShadow:`0 6px 18px rgba(${glowRGB},0.18)`,
          }}>{icon}</div>

          <div style={{textAlign:'left'}}>
            <div style={{fontSize:16,fontWeight:800,color:'#111827',letterSpacing:-0.4}}>{title}</div>
            <div style={{fontSize:12,color:'#6B7280',fontWeight:500,marginTop:2}}>{subtitle}</div>
          </div>

          <div style={{
            background: items.length===0 ? '#F3F4F6' : `linear-gradient(135deg,rgba(${glowRGB},0.9),rgba(${glowRGB},0.7))`,
            color: items.length===0 ? '#9CA3AF' : '#fff',
            borderRadius:12,fontSize:16,fontWeight:900,padding:'4px 16px',
            fontVariantNumeric:'tabular-nums',
            boxShadow: items.length>0 ? `0 4px 16px rgba(${glowRGB},0.38)` : 'none',
          }}>{items.length}</div>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {statusDist.length>0 && (
            <div style={{display:'flex',alignItems:'flex-end',gap:3,height:24}}>
              {statusDist.map(({s,count})=>{
                const c=STATUS_META[s]
                const h=Math.max(5,Math.round((count/Math.max(...statusDist.map(x=>x.count)))*24))
                return <div key={s} title={`${c.label}: ${count}`} style={{width:6,height:h,borderRadius:3,background:c.dot,opacity:0.85}}/>
              })}
            </div>
          )}
          <div style={{
            fontSize:11,fontWeight:700,color:accentHex,
            background:`rgba(${glowRGB},0.08)`,padding:'5px 12px',borderRadius:9,
            border:`1px solid rgba(${glowRGB},0.18)`,
          }}>{open?'▲ Collapse':'▼ Expand'}</div>
        </div>
      </button>

      {open && (
        <div style={{
          background:`rgba(${glowRGB},0.012)`,
          padding: items.length===0 ? '48px 24px' : '14px 18px 18px',
          display:'flex',flexDirection:'column',gap:10,
        }}>
          {items.length===0 ? (
            <div style={{textAlign:'center',color:'#9CA3AF'}}>
              <div className="fup-float" style={{fontSize:44,marginBottom:12}}>🎉</div>
              <div style={{fontSize:15,fontWeight:700,color:'#6B7280',marginBottom:4}}>All clear!</div>
              <div style={{fontSize:13}}>No follow-ups here</div>
            </div>
          ) : items.map((item,i)=>(
            <div key={item.lead_id||i} className="fup-animate" style={{animationDelay:`${i*45}ms`}}>
              <LeadCard item={item} onUpdate={onUpdate} isAdmin={isAdmin} index={i}/>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══ MAIN PAGE ═════════════════════════════════════════════
export default function FollowUpsPage() {
  const { user }  = useAuth()
  const isAdmin   = user?.role_id===1 || user?.role_name==='admin'

  const [data, setData]     = useState({ today:[], previous:[], next_3_days:[] })
  const [counts, setCounts] = useState({ today:0, previous:0, next_3_days:0 })
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [agents, setAgents]     = useState([])
  const [products, setProducts] = useState([])
  const [filterAgent, setFilterAgent]     = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [selected, setSelected] = useState(null)
  const [activeView, setActiveView] = useState('all')

  useEffect(()=>{
    if(isAdmin){
      api.get('/users').then(r=>{
        const list=r?.data||r||[]
        setAgents(Array.isArray(list)?list.filter(u=>['agent','admin'].includes(u.role_name||u.role)):[])
      }).catch(()=>{})
    }
    api.get('/products/active').then(r=>{
      const list=r?.data||r||[]
      setProducts(Array.isArray(list)?list:[])
    }).catch(()=>{})
  },[isAdmin])

  const fetchAll = async (aF,pF,sF) => {
    setLoading(true); setError(null)
    try {
      const params=new URLSearchParams({section:'all'})
      if(isAdmin&&aF) params.set('agent_id',aF)
      if(pF) params.set('product_id',pF)
      if(sF) params.set('lead_status',sF)
      const body=await api.get(`/followups?${params}`)
      const d=body?.data||{}
      let t=[],p=[],n=[]
      if(Array.isArray(d)){
        t=d.filter(x=>x.followup_type==='today')
        p=d.filter(x=>x.followup_type==='overdue')
        n=d.filter(x=>x.followup_type==='upcoming')
      } else {
        t=Array.isArray(d.today)?d.today:[]
        p=Array.isArray(d.previous)?d.previous:[]
        n=Array.isArray(d.next_3_days)?d.next_3_days:[]
      }
      setData({today:t,previous:p,next_3_days:n})
      setCounts(body?.counts||{today:t.length,previous:p.length,next_3_days:n.length})
    } catch(err){ setError(err?.message||'Failed'); toast.error(err?.message||'Failed') }
    finally{ setLoading(false) }
  }

  useEffect(()=>{ fetchAll(filterAgent,filterProduct,filterStatus) },[filterAgent,filterProduct,filterStatus])
  useEffect(()=>{
    const t=setInterval(()=>fetchAll(filterAgent,filterProduct,filterStatus),60000)
    return()=>clearInterval(t)
  },[filterAgent,filterProduct,filterStatus])

  const total    = (counts.today||0)+(counts.previous||0)+(counts.next_3_days||0)
  const allLeads = [...data.today,...data.previous,...data.next_3_days]

  const stats = {
    total, today:counts.today||0, overdue:counts.previous||0, upcoming:counts.next_3_days||0,
    hot:      allLeads.filter(l=>l.lead_status==='hot').length,
    converted:allLeads.filter(l=>l.lead_status==='converted').length,
    call_back:allLeads.filter(l=>l.lead_status==='call_back').length,
    warm:     allLeads.filter(l=>l.lead_status==='warm').length,
  }

  const CARDS = [
    {key:'all',      icon:'📋', label:'Total',      value:stats.total,     sublabel:'queue',       solidColor:'#4F46E5', glowRGB:'79,70,229'},
    {key:'today',    icon:'⏰', label:'Today',       value:stats.today,     sublabel:'due today',   solidColor:'#D97706', glowRGB:'217,119,6'},
    {key:'overdue',  icon:'🚨', label:'Overdue',     value:stats.overdue,   sublabel:'past due',    solidColor:'#DC2626', glowRGB:'220,38,38'},
    {key:'upcoming', icon:'📆', label:'Upcoming',    value:stats.upcoming,  sublabel:'next 3 days', solidColor:'#7C3AED', glowRGB:'124,58,237'},
    {key:'hot',      icon:'🔥', label:'Hot',         value:stats.hot,       sublabel:'in queue',    solidColor:'#E11D48', glowRGB:'225,29,72'},
    {key:'call_back',icon:'📞', label:'Call Back',   value:stats.call_back, sublabel:'need call',   solidColor:'#6D28D9', glowRGB:'109,40,217'},
    {key:'warm',     icon:'🌡️', label:'Warm',       value:stats.warm,      sublabel:'in queue',    solidColor:'#B45309', glowRGB:'180,83,9'},
    {key:'converted',icon:'✅', label:'Converted',   value:stats.converted, sublabel:'in queue',    solidColor:'#15803D', glowRGB:'21,128,61'},
  ]

  const showSection = (type) => {
    if(activeView==='all') return true
    if(activeView==='today'    && type==='today')    return true
    if(activeView==='overdue'  && type==='overdue')  return true
    if(activeView==='upcoming' && type==='upcoming') return true
    return false
  }

  const selStyle = {
    border:'2px solid #E5E7EB',borderRadius:12,padding:'9px 13px',
    fontSize:13,color:'#111827',background:'#fff',fontFamily:'inherit',fontWeight:600,
  }

  return (
    <div className="fup" style={{maxWidth:1100,margin:'0 auto'}}>
      <style>{STYLES}</style>

      {/* ── HERO HEADER ── */}
      <div style={{
        position:'relative',borderRadius:24,overflow:'hidden',marginBottom:20,
        background:'linear-gradient(135deg,#0C1228 0%,#1A1040 40%,#2D1B69 70%,#1E1B4B 100%)',
        padding:'28px 32px',
        boxShadow:'0 20px 60px rgba(10,15,30,0.4)',
      }}>
        {/* Dot grid */}
        <div style={{position:'absolute',inset:0,opacity:0.05,
          backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.9) 1px,transparent 1px)',
          backgroundSize:'26px 26px'}}/>
        {/* Glow orbs */}
        <div style={{position:'absolute',top:-60,right:80,width:280,height:280,borderRadius:'50%',
          background:'radial-gradient(circle,rgba(124,58,237,0.25),transparent 65%)'}}/>
        <div style={{position:'absolute',bottom:-80,left:160,width:220,height:220,borderRadius:'50%',
          background:'radial-gradient(circle,rgba(79,70,229,0.2),transparent 65%)'}}/>

        <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:20}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{color:'rgba(165,180,252,0.6)',fontSize:10,fontWeight:800,
                letterSpacing:3,textTransform:'uppercase'}}>
                ThynkFlow · Follow-ups
              </span>
            </div>
            <h1 style={{color:'#fff',fontSize:30,fontWeight:900,margin:'0 0 6px',
              letterSpacing:-0.8,lineHeight:1.1,fontFamily:'inherit'}}>
              Follow-up Queue
            </h1>
            <p style={{color:'rgba(196,181,253,0.6)',fontSize:13,margin:0,fontWeight:500}}>
              {loading?'Syncing…':`${total} total · ${format(new Date(),'EEEE, dd MMMM yyyy')}`}
            </p>
          </div>

          {/* KPI chips */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {[
              {label:'TODAY',   val:counts.today||0,       c:'rgba(252,211,77,0.95)',  bg:'rgba(252,211,77,0.12)', border:'rgba(252,211,77,0.3)'},
              {label:'OVERDUE', val:counts.previous||0,    c:'rgba(252,165,165,0.95)', bg:'rgba(252,165,165,0.12)',border:'rgba(252,165,165,0.3)'},
              {label:'UPCOMING',val:counts.next_3_days||0, c:'rgba(167,139,250,0.95)', bg:'rgba(167,139,250,0.12)',border:'rgba(167,139,250,0.3)'},
              {label:'TOTAL',   val:total,                 c:'rgba(255,255,255,0.9)',  bg:'rgba(255,255,255,0.07)',border:'rgba(255,255,255,0.15)'},
            ].map(({label,val,c,bg,border})=>(
              <div key={label} style={{
                background:bg,border:`1px solid ${border}`,borderRadius:14,
                padding:'12px 16px',textAlign:'center',backdropFilter:'blur(10px)',minWidth:76,
              }}>
                <div style={{
                  color:c, fontSize:28, fontWeight:900, lineHeight:1,
                  letterSpacing:-1, fontVariantNumeric:'tabular-nums',
                }}>{val}</div>
                <div style={{color:'rgba(255,255,255,0.4)',fontSize:9,fontWeight:800,
                  letterSpacing:1.5,textTransform:'uppercase',marginTop:4}}>{label}</div>
              </div>
            ))}
            <button onClick={()=>fetchAll(filterAgent,filterProduct,filterStatus)} className="fup-btn" style={{
              padding:'12px 16px',background:'rgba(255,255,255,0.07)',
              border:'1px solid rgba(255,255,255,0.14)',borderRadius:14,
              color:'rgba(255,255,255,0.8)',fontSize:13,fontWeight:700,
              fontFamily:'inherit',display:'flex',alignItems:'center',gap:6,
              backdropFilter:'blur(8px)',alignSelf:'stretch',
            }}>↻ Refresh</button>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS — compact horizontal row ── */}
      <div style={{
        display:'grid',
        gridTemplateColumns:'repeat(4,1fr)',
        gap:10,
        marginBottom:18,
      }}>
        {CARDS.map(card=>(
          <StatCard key={card.key} {...card}
            active={activeView===card.key}
            onClick={()=>setActiveView(v=>v===card.key?'all':card.key)}/>
        ))}
      </div>

      {/* ── FILTERS ── */}
      <div style={{
        background:'#fff',border:'1.5px solid #E8ECF4',borderRadius:16,
        padding:'12px 18px',display:'flex',flexWrap:'wrap',alignItems:'center',
        gap:10,marginBottom:18,boxShadow:'0 1px 8px rgba(0,0,0,0.04)',
      }}>
        <span style={{fontSize:10,fontWeight:800,color:'#6B7280',textTransform:'uppercase',letterSpacing:1.5}}>
          🔍 Filter
        </span>

        {isAdmin&&agents.length>0&&(
          <select style={selStyle} value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} className="fup-input">
            <option value="">👥 All Agents</option>
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {products.length>0&&(
          <select style={selStyle} value={filterProduct} onChange={e=>setFilterProduct(e.target.value)} className="fup-input">
            <option value="">📦 All Products</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select style={selStyle} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="fup-input">
          <option value="">🏷️ All Statuses</option>
          {ALL_STATUSES.map(s=><option key={s} value={s}>{STATUS_META[s]?.label}</option>)}
        </select>

        {(filterAgent||filterProduct||filterStatus)&&(
          <button onClick={()=>{setFilterAgent('');setFilterProduct('');setFilterStatus('')}} className="fup-btn" style={{
            padding:'8px 14px',background:'#FEF2F2',border:'1.5px solid #FECACA',
            borderRadius:10,color:'#DC2626',fontSize:12,fontWeight:800,fontFamily:'inherit',
          }}>✕ Reset</button>
        )}

        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5}}>
          <div style={{width:6,height:6,borderRadius:'50%',background:'#22C55E',
            animation:'fup-pulse 2s ease infinite'}}/>
          <span style={{fontSize:11,color:'#9CA3AF',fontWeight:600}}>Auto-refreshes every 60s</span>
        </div>
      </div>

      {/* Error */}
      {error&&(
        <div style={{background:'#FEF2F2',border:'1.5px solid #FECACA',borderRadius:14,
          padding:'14px 18px',display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:800,color:'#DC2626'}}>Failed to load</div>
            <div style={{fontSize:12,color:'#EF4444',marginTop:2}}>{error}</div>
          </div>
          <button onClick={()=>fetchAll(filterAgent,filterProduct,filterStatus)} className="fup-btn" style={{
            padding:'8px 16px',background:'#FEE2E2',border:'1.5px solid #FECACA',
            borderRadius:10,color:'#DC2626',fontSize:12,fontWeight:800,fontFamily:'inherit',
          }}>Retry</button>
        </div>
      )}

      {/* Content */}
      {loading?(
        <div style={{background:'#fff',borderRadius:20,padding:'70px 24px',textAlign:'center',
          border:'1.5px solid #E8ECF4',boxShadow:'0 2px 20px rgba(0,0,0,0.04)'}}>
          <div style={{width:44,height:44,border:'4px solid #EEF2FF',borderTopColor:'#4F46E5',
            borderRadius:'50%',animation:'fup-spin 0.75s linear infinite',margin:'0 auto 16px'}}/>
          <div style={{fontSize:16,fontWeight:800,color:'#111827',marginBottom:4}}>Loading follow-ups…</div>
          <div style={{fontSize:13,color:'#9CA3AF'}}>Fetching your queue</div>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {showSection('today')&&(
            <Section title="Today's Follow-ups"
              subtitle={`${data.today.length} lead${data.today.length!==1?'s':''} due today · ${format(new Date(),'EEEE, dd MMMM')}`}
              icon="⏰" glowRGB="245,158,11" accentHex="#F59E0B"
              items={data.today} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true}/>
          )}
          {showSection('overdue')&&(
            <Section title="Overdue"
              subtitle={`${data.previous.length} lead${data.previous.length!==1?'s':''} past their follow-up date`}
              icon="🚨" glowRGB="239,68,68" accentHex="#EF4444"
              items={data.previous} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true}/>
          )}
          {showSection('upcoming')&&(
            <Section title="Next 3 Days"
              subtitle={`${data.next_3_days.length} upcoming follow-up${data.next_3_days.length!==1?'s':''} to prepare for`}
              icon="📆" glowRGB="99,102,241" accentHex="#4F46E5"
              items={data.next_3_days} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true}/>
          )}
        </div>
      )}

      {selected&&(
        <UpdateModal followup={selected} onClose={()=>setSelected(null)}
          onSave={()=>{setSelected(null);fetchAll(filterAgent,filterProduct,filterStatus)}}/>
      )}
    </div>
  )
}
