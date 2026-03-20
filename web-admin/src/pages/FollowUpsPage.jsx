// web-admin/src/pages/FollowUpsPage.jsx — PREMIUM REDESIGN
import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

// ── Status config ─────────────────────────────────────────
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

// ── Styles ────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --ink:       #0A0F1E;
    --ink2:      #1E2640;
    --surface:   #F4F6FB;
    --card:      #FFFFFF;
    --border:    #E8ECF4;
    --muted:     #8892A4;
    --accent:    #4F46E5;
    --accent2:   #7C3AED;
    --danger:    #EF4444;
    --warn:      #F59E0B;
    --success:   #10B981;
  }

  .fp  { font-family: 'DM Sans', sans-serif; color: var(--ink); }
  .fp-display { font-family: 'Syne', sans-serif; }
  .fp-mono    { font-family: 'JetBrains Mono', monospace !important; }

  .fp-card-hover {
    transition: transform 0.22s cubic-bezier(.34,1.4,.64,1), box-shadow 0.22s ease, border-color 0.18s;
  }
  .fp-card-hover:hover {
    transform: translateY(-3px) scale(1.005);
    box-shadow: 0 16px 48px rgba(10,15,30,0.12) !important;
  }

  .fp-btn {
    transition: all 0.18s cubic-bezier(.34,1.4,.64,1);
    cursor: pointer;
  }
  .fp-btn:hover  { transform: translateY(-2px) scale(1.04); filter: brightness(1.07); }
  .fp-btn:active { transform: scale(0.95); }

  .fp-input { transition: all 0.2s; }
  .fp-input:focus {
    outline: none;
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 4px rgba(79,70,229,0.12);
  }

  .fp-tag { transition: all 0.14s ease; cursor: pointer; }
  .fp-tag:hover { transform: scale(1.06); filter: brightness(0.95); }

  .fp-stat-card {
    transition: all 0.25s cubic-bezier(.34,1.4,.64,1);
    cursor: pointer;
    position: relative;
    overflow: hidden;
  }
  .fp-stat-card:hover {
    transform: translateY(-5px) scale(1.02);
  }
  .fp-stat-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .fp-stat-card:hover::before { opacity: 1; }

  .fp-section-toggle { transition: all 0.2s ease; }
  .fp-section-toggle:hover { filter: brightness(0.97); }

  @keyframes fp-spin    { to { transform: rotate(360deg); } }
  @keyframes fp-pulse   { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.5);opacity:0.5} }
  @keyframes fp-float   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes fp-in      { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes fp-glow    { 0%,100%{opacity:0.6} 50%{opacity:1} }
  @keyframes fp-bar-grow{ from{width:0} to{width:var(--w)} }

  .fp-animate { animation: fp-in 0.38s cubic-bezier(.34,1.2,.64,1) both; }
  .fp-float   { animation: fp-float 3.5s ease-in-out infinite; }
  .fp-glow    { animation: fp-glow 2s ease-in-out infinite; }
`

// ── Helpers ───────────────────────────────────────────────
const fmt   = d => { try { return format(new Date(d), 'dd MMM yyyy') } catch { return '—' } }
const daysO = d => d ? Math.floor((new Date() - new Date(d)) / 86400000) : 0

// ── Status Badge ──────────────────────────────────────────
function SBadge({ status }) {
  const c = STATUS_META[status] || STATUS_META.cold
  const pulse = status === 'hot' || status === 'new'
  return (
    <span style={{
      background: c.bg, color: c.text,
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 11px 3px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
      boxShadow: `0 2px 10px rgba(${c.glow},0.22)`,
      border: `1px solid rgba(${c.glow},0.18)`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0,
        animation: pulse ? 'fp-pulse 1.6s ease infinite' : 'none',
        boxShadow: pulse ? `0 0 8px rgba(${c.glow},0.7)` : 'none',
      }} />
      {c.label}
    </span>
  )
}

// ── Summary Stat Card ─────────────────────────────────────
function StatCard({ icon, label, value, sublabel, color, glow, active, onClick }) {
  return (
    <button onClick={onClick} className="fp-stat-card"
      style={{
        flex: '1 1 130px', minWidth: 120,
        background: active
          ? `linear-gradient(135deg, rgba(${glow},0.92) 0%, rgba(${glow},0.72) 100%)`
          : '#fff',
        border: active ? `2px solid rgba(${glow},0.5)` : '2px solid #EEF0F6',
        borderRadius: 20,
        padding: '18px 18px 16px',
        textAlign: 'left',
        boxShadow: active
          ? `0 12px 40px rgba(${glow},0.35), 0 2px 8px rgba(${glow},0.2)`
          : '0 2px 12px rgba(10,15,30,0.06)',
        fontFamily: 'DM Sans, sans-serif',
      }}>
      {/* Shine effect */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'50%', borderRadius:'20px 20px 0 0',
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.18), transparent)', pointerEvents:'none' }} />

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: active ? 'rgba(255,255,255,0.22)' : `rgba(${glow},0.1)`,
          border: active ? '1.5px solid rgba(255,255,255,0.3)' : `1.5px solid rgba(${glow},0.2)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>{icon}</div>
        {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff',
          boxShadow: '0 0 12px rgba(255,255,255,0.8)', animation: 'fp-pulse 1.5s ease infinite' }} />}
      </div>

      <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 34, fontWeight: 800, lineHeight: 1,
        color: active ? '#fff' : color,
        textShadow: active ? `0 0 30px rgba(255,255,255,0.3)` : 'none',
        marginBottom: 6 }}>
        {value ?? 0}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: active ? 'rgba(255,255,255,0.8)' : '#64748B',
        textTransform: 'uppercase', letterSpacing: 0.8, lineHeight: 1.2 }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.6)' : '#94A3B8',
          marginTop: 3, fontWeight: 500 }}>
          {sublabel}
        </div>
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
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(10,15,30,0.82)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="fp fp-animate" style={{
        background: '#fff', borderRadius: 28, width: '100%', maxWidth: 560,
        overflow: 'hidden',
        boxShadow: '0 60px 120px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(255,255,255,0.08)',
      }}>

        {/* Dynamic header */}
        <div style={{
          background: `linear-gradient(135deg, rgba(${sc.glow},1) 0%, rgba(${sc.glow},0.65) 100%)`,
          padding: '28px 28px 24px', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position:'absolute', top:-60, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.1)' }}/>
          <div style={{ position:'absolute', bottom:-40, left:60, width:140, height:140, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }}/>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative' }}>
            <div>
              <div style={{ color:'rgba(255,255,255,0.65)', fontSize:10, fontWeight:800, letterSpacing:2.5, textTransform:'uppercase', marginBottom:6, fontFamily:'Syne,sans-serif' }}>
                Update Follow-up
              </div>
              <div style={{ color:'#fff', fontSize:22, fontWeight:800, letterSpacing:-0.5, marginBottom:8, fontFamily:'Syne,sans-serif' }}>
                {followup.lead_name || followup.contact_name || '—'}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {followup.phone && (
                  <span style={{ background:'rgba(255,255,255,0.18)', color:'#fff', fontSize:12, fontWeight:600,
                    padding:'4px 12px', borderRadius:8, backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.2)' }}>
                    📞 {followup.phone}
                  </span>
                )}
                {followup.school_name && (
                  <span style={{ background:'rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.9)', fontSize:12,
                    fontWeight:600, padding:'4px 12px', borderRadius:8 }}>
                    🏫 {followup.school_name}
                  </span>
                )}
                {followup.product_name && (
                  <span style={{ background:'rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.9)', fontSize:12,
                    fontWeight:600, padding:'4px 12px', borderRadius:8 }}>
                    📦 {followup.product_name}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="fp-btn" style={{
              width:36, height:36, borderRadius:12, border:'none', background:'rgba(255,255,255,0.2)',
              color:'#fff', fontSize:16, backdropFilter:'blur(8px)', display:'flex',
              alignItems:'center', justifyContent:'center', flexShrink:0,
              fontFamily:'DM Sans,sans-serif',
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:22 }}>

          {/* Notes */}
          <div>
            <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10,
              fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:1.2 }}>
              <span style={{ width:22, height:22, borderRadius:7, background:'#EEF2FF',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>📝</span>
              Call Notes <span style={{ color:'#EF4444' }}>*</span>
            </label>
            <textarea value={discussion} onChange={e => setDiscussion(e.target.value)} rows={3}
              autoFocus placeholder="What was discussed? Key objections, interest level, next steps…"
              className="fp-input" style={{
                width:'100%', border:'2px solid #E8ECF4', borderRadius:16, padding:'14px 16px',
                fontSize:14, color:'#0A0F1E', resize:'none', fontFamily:'DM Sans,sans-serif',
                lineHeight:1.7, background:'#FAFBFD',
              }} />
          </div>

          {/* Status picker */}
          <div>
            <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10,
              fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:1.2 }}>
              <span style={{ width:22, height:22, borderRadius:7, background:'#F0FDF4',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>📊</span>
              Update Lead Status
            </label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {ALL_STATUSES.map(s => {
                const c = STATUS_META[s]; const active = newStatus === s
                return (
                  <button key={s} onClick={() => setNewStatus(s)} className="fp-tag" style={{
                    padding:'7px 15px', borderRadius:22,
                    border: active ? 'none' : `1.5px solid rgba(${c.glow},0.2)`,
                    background: active ? c.dot : c.bg, color: active ? '#fff' : c.text,
                    fontSize:12, fontWeight:700, fontFamily:'DM Sans,sans-serif',
                    boxShadow: active ? `0 6px 20px rgba(${c.glow},0.45)` : 'none',
                  }}>{c.label}</button>
                )
              })}
            </div>
          </div>

          {/* Next followup */}
          <div>
            <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10,
              fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:1.2 }}>
              <span style={{ width:22, height:22, borderRadius:7, background:'#FFF7ED',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>📅</span>
              Schedule Next Follow-up
            </label>
            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]} className="fp-input"
              style={{ width:'100%', border:'2px solid #E8ECF4', borderRadius:16, padding:'13px 16px',
                fontSize:14, color:'#0A0F1E', fontFamily:'DM Sans,sans-serif', background:'#FAFBFD' }} />
          </div>
        </div>

        <div style={{ padding:'0 28px 28px', display:'flex', gap:10 }}>
          <button onClick={onClose} className="fp-btn" style={{
            flex:1, padding:'14px 0', border:'2px solid #E8ECF4', borderRadius:16,
            color:'#64748B', fontSize:14, fontWeight:700, background:'#F8FAFC', fontFamily:'DM Sans,sans-serif',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="fp-btn" style={{
            flex:2.5, padding:'14px 0', border:'none', borderRadius:16,
            background:`linear-gradient(135deg,rgba(${sc.glow},1),rgba(${sc.glow},0.7))`,
            color:'#fff', fontSize:14, fontWeight:800, fontFamily:'DM Sans,sans-serif',
            boxShadow:`0 12px 32px rgba(${sc.glow},0.45)`, opacity: saving ? 0.7 : 1,
          }}>{saving ? '⏳ Saving…' : '✓ Save & Close'}</button>
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
  const initials = name.substring(0, 2).toUpperCase()

  const accentColor = overdue ? '239,68,68' : today ? '245,158,11' : c.glow
  const accentHex   = overdue ? '#EF4444'   : today ? '#F59E0B'    : c.dot

  return (
    <div className="fp fp-card-hover" style={{
      background: '#fff',
      border: overdue
        ? '1.5px solid #FECACA'
        : today
        ? '1.5px solid #FDE68A'
        : '1.5px solid #EEF0F6',
      borderRadius: 20,
      padding: '18px 20px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 16,
      alignItems: 'center',
      position: 'relative',
      overflow: 'hidden',
      animationDelay: `${index * 55}ms`,
      boxShadow: overdue
        ? '0 4px 24px rgba(239,68,68,0.08), 0 1px 4px rgba(0,0,0,0.03)'
        : today
        ? '0 4px 24px rgba(245,158,11,0.08), 0 1px 4px rgba(0,0,0,0.03)'
        : '0 2px 8px rgba(10,15,30,0.05)',
    }}>

      {/* Left glow bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        background: `linear-gradient(to bottom, ${accentHex}, ${accentHex}88)`,
        boxShadow: `3px 0 12px rgba(${accentColor},0.5)`,
      }} />

      {/* Avatar */}
      <div style={{
        width: 50, height: 50, borderRadius: 16, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 800, letterSpacing: -0.5,
        background: `linear-gradient(135deg, rgba(${accentColor},0.15), rgba(${accentColor},0.05))`,
        color: accentHex,
        border: `2px solid rgba(${accentColor},0.2)`,
        boxShadow: `0 4px 16px rgba(${accentColor},0.15), inset 0 1px 0 rgba(255,255,255,0.8)`,
      }}>
        {initials}
      </div>

      {/* Main content */}
      <div style={{ minWidth: 0 }}>
        {/* Row 1: Name + badges */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:7 }}>
          <span style={{ fontFamily:'Syne,sans-serif', fontSize:15, fontWeight:800, color:'#0A0F1E', letterSpacing:-0.4 }}>
            {name}
          </span>
          <SBadge status={item.lead_status} />
          {overdue && days > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: '#DC2626',
              background: '#FEE2E2', padding: '2px 9px', borderRadius: 20,
              border: '1px solid #FECACA', letterSpacing: 0.4,
              boxShadow: '0 2px 8px rgba(239,68,68,0.2)',
            }}>
              🕐 {days}d overdue
            </span>
          )}
          {today && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: '#D97706',
              background: '#FEF3C7', padding: '2px 9px', borderRadius: 20,
              border: '1px solid #FDE68A', letterSpacing: 0.4,
            }}>
              ⏰ Due Today
            </span>
          )}
        </div>

        {/* Row 2: Info chips */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <a href={`tel:${item.phone}`} style={{
            fontSize: 12, fontWeight: 700, color: '#4F46E5', textDecoration: 'none',
            background: '#EEF2FF', padding: '4px 11px', borderRadius: 9,
            border: '1px solid #C7D2FE', display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'JetBrains Mono, monospace',
            boxShadow: '0 2px 8px rgba(79,70,229,0.1)',
          }}>
            📞 {item.phone || '—'}
          </a>

          {item.school_name && item.school_name !== name && (
            <span style={{ fontSize:12, fontWeight:600, color:'#64748B', background:'#F8FAFC',
              padding:'4px 11px', borderRadius:9, border:'1px solid #E8ECF4',
              display:'inline-flex', alignItems:'center', gap:4 }}>
              🏫 {item.school_name}
            </span>
          )}

          {item.product_name && (
            <span style={{ fontSize:12, fontWeight:700, color:'#7C3AED', background:'#F5F3FF',
              padding:'4px 11px', borderRadius:9, border:'1px solid #DDD6FE',
              display:'inline-flex', alignItems:'center', gap:4 }}>
              📦 {item.product_name}
            </span>
          )}

          {isAdmin && item.agent_name && (
            <span style={{ fontSize:12, fontWeight:600, color:'#64748B', background:'#F1F5F9',
              padding:'4px 11px', borderRadius:9, border:'1px solid #E2E8F0',
              display:'inline-flex', alignItems:'center', gap:4 }}>
              👤 {item.agent_name}
            </span>
          )}
        </div>

        {/* Row 3: Notes */}
        {item.notes && (
          <div style={{
            marginTop: 8, fontSize: 12, color: '#94A3B8', fontStyle: 'italic',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 460,
            borderLeft: `3px solid rgba(${accentColor},0.25)`, paddingLeft: 10,
            lineHeight: 1.5,
          }}>
            "{item.notes}"
          </div>
        )}
      </div>

      {/* Right side: date + actions */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:10, flexShrink:0 }}>
        {/* Date chip */}
        <div style={{
          background: overdue ? '#FEF2F2' : today ? '#FFFBEB' : '#EEF2FF',
          border: overdue ? '1.5px solid #FECACA' : today ? '1.5px solid #FDE68A' : '1.5px solid #C7D2FE',
          borderRadius: 12, padding: '6px 12px', textAlign: 'center',
          boxShadow: overdue ? '0 4px 16px rgba(239,68,68,0.12)' : today ? '0 4px 16px rgba(245,158,11,0.12)' : '0 4px 16px rgba(79,70,229,0.08)',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
            FOLLOW-UP
          </div>
          <div className="fp-mono" style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
            color: overdue ? '#DC2626' : today ? '#D97706' : '#4F46E5',
          }}>
            {fmt(item.follow_up_date)}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex', gap:6 }}>
          <a href={`tel:${item.phone}`} className="fp-btn" style={{
            width: 34, height: 34, background: '#F0FDF4', color: '#16A34A',
            borderRadius: 10, fontSize: 15, textDecoration: 'none',
            border: '1.5px solid #BBF7D0', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(34,197,94,0.18)',
          }}>📞</a>
          <a href={`https://wa.me/${(item.phone||'').replace(/[^0-9]/g,'')}`}
            target="_blank" rel="noreferrer" className="fp-btn"
            style={{
              width: 34, height: 34, background: '#DCFCE7', color: '#15803D',
              borderRadius: 10, fontSize: 15, textDecoration: 'none',
              border: '1.5px solid #86EFAC', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(21,128,61,0.18)',
            }}>💬</a>
          <button onClick={() => onUpdate(item)} className="fp-btn" style={{
            padding: '0 16px', height: 34, borderRadius: 10, border: 'none',
            background: `linear-gradient(135deg, rgba(${accentColor},1), rgba(${accentColor},0.75))`,
            color: '#fff', fontSize: 12, fontWeight: 800, fontFamily: 'DM Sans,sans-serif',
            letterSpacing: 0.2, boxShadow: `0 4px 14px rgba(${accentColor},0.4)`,
          }}>Update →</button>
        </div>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────
function Section({ title, subtitle, icon, glowColor, accentHex, items, onUpdate, isAdmin, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)

  // Status distribution for mini bar chart
  const statusDist = ALL_STATUSES.map(s => ({
    s, count: items.filter(i => i.lead_status === s).length,
  })).filter(x => x.count > 0)

  return (
    <div className="fp" style={{
      borderRadius: 24, overflow: 'hidden',
      border: `1.5px solid rgba(${glowColor},0.18)`,
      boxShadow: `0 4px 32px rgba(${glowColor},0.07), 0 1px 4px rgba(0,0,0,0.03)`,
      background: '#fff',
    }}>

      {/* Section header */}
      <button onClick={() => setOpen(o => !o)} className="fp fp-section-toggle" style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px', border: 'none', cursor: 'pointer',
        background: `linear-gradient(135deg, rgba(${glowColor},0.07) 0%, rgba(${glowColor},0.02) 100%)`,
        borderBottom: open ? `1.5px solid rgba(${glowColor},0.12)` : 'none',
        fontFamily: 'DM Sans, sans-serif',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          {/* Icon */}
          <div style={{
            width: 50, height: 50, borderRadius: 16, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 24,
            background: `linear-gradient(135deg, rgba(${glowColor},0.15), rgba(${glowColor},0.05))`,
            border: `1.5px solid rgba(${glowColor},0.2)`,
            boxShadow: `0 8px 20px rgba(${glowColor},0.18), inset 0 1px 0 rgba(255,255,255,0.6)`,
          }}>{icon}</div>

          <div style={{ textAlign:'left' }}>
            <div style={{ fontFamily:'Syne,sans-serif', fontSize:17, fontWeight:800, color:'#0A0F1E', letterSpacing:-0.5 }}>
              {title}
            </div>
            <div style={{ fontSize:12, color:'#64748B', fontWeight:500, marginTop:2 }}>{subtitle}</div>
          </div>

          {/* Count badge */}
          <div style={{
            background: items.length === 0
              ? '#F1F5F9'
              : `linear-gradient(135deg, rgba(${glowColor},0.9), rgba(${glowColor},0.7))`,
            color: items.length === 0 ? '#94A3B8' : '#fff',
            borderRadius: 14, fontSize: 18, fontWeight: 900, padding: '5px 18px',
            fontFamily: 'Syne,sans-serif', letterSpacing: -0.5,
            boxShadow: items.length > 0 ? `0 6px 20px rgba(${glowColor},0.4)` : 'none',
          }}>{items.length}</div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          {/* Status mini distribution */}
          {statusDist.length > 0 && (
            <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:28 }}>
              {statusDist.map(({ s, count }) => {
                const c = STATUS_META[s]
                const h = Math.max(6, Math.round((count / Math.max(...statusDist.map(x => x.count))) * 28))
                return (
                  <div key={s} title={`${c.label}: ${count}`} style={{
                    width: 6, height: h, borderRadius: 3,
                    background: c.dot, opacity: 0.8,
                    boxShadow: `0 2px 6px rgba(${c.glow},0.4)`,
                  }} />
                )
              })}
            </div>
          )}

          <div style={{
            fontSize: 11, fontWeight: 700, color: accentHex,
            background: `rgba(${glowColor},0.08)`, padding: '6px 14px', borderRadius: 10,
            border: `1px solid rgba(${glowColor},0.18)`,
          }}>
            {open ? '▲ Collapse' : '▼ Expand'}
          </div>
        </div>
      </button>

      {open && (
        <div style={{
          background: `linear-gradient(to bottom, rgba(${glowColor},0.02), #F8FAFC)`,
          padding: items.length === 0 ? '56px 24px' : '16px 20px 20px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {items.length === 0 ? (
            <div style={{ textAlign:'center', color:'#94A3B8' }}>
              <div className="fp-float" style={{ fontSize: 52, marginBottom: 14 }}>🎉</div>
              <div style={{ fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:800, color:'#64748B', marginBottom:4 }}>All clear!</div>
              <div style={{ fontSize:13, color:'#94A3B8' }}>No follow-ups in this section</div>
            </div>
          ) : items.map((item, i) => (
            <div key={item.lead_id || i} className="fp-animate" style={{ animationDelay:`${i * 50}ms` }}>
              <LeadCard item={item} onUpdate={onUpdate} isAdmin={isAdmin} index={i} />
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
  const { user }  = useAuth()
  const isAdmin   = user?.role_id === 1 || user?.role_name === 'admin'

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
  const [activeView, setActiveView] = useState('all') // all | today | overdue | upcoming

  useEffect(() => {
    if (isAdmin) {
      api.get('/users').then(r => {
        const list = r?.data || r || []
        setAgents(Array.isArray(list) ? list.filter(u => ['agent','admin'].includes(u.role_name || u.role)) : [])
      }).catch(() => {})
    }
    api.get('/products/active').then(r => {
      const list = r?.data || r || []
      setProducts(Array.isArray(list) ? list : [])
    }).catch(() => {})
  }, [isAdmin])

  const fetchAll = async (agentF, productF, statusF) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ section:'all' })
      if (isAdmin && agentF) params.set('agent_id', agentF)
      if (productF)          params.set('product_id', productF)
      if (statusF)           params.set('lead_status', statusF)
      const body = await api.get(`/followups?${params}`)
      const d    = body?.data || {}
      let t=[], p=[], n=[]
      if (Array.isArray(d)) {
        t = d.filter(x => x.followup_type==='today')
        p = d.filter(x => x.followup_type==='overdue')
        n = d.filter(x => x.followup_type==='upcoming')
      } else {
        t = Array.isArray(d.today)      ? d.today      : []
        p = Array.isArray(d.previous)   ? d.previous   : []
        n = Array.isArray(d.next_3_days)? d.next_3_days: []
      }
      setData({ today:t, previous:p, next_3_days:n })
      setCounts(body?.counts || { today:t.length, previous:p.length, next_3_days:n.length })
    } catch (err) { setError(err?.message || 'Failed'); toast.error(err?.message || 'Failed') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchAll(filterAgent, filterProduct, filterStatus) }, [filterAgent, filterProduct, filterStatus])
  useEffect(() => {
    const t = setInterval(() => fetchAll(filterAgent, filterProduct, filterStatus), 60000)
    return () => clearInterval(t)
  }, [filterAgent, filterProduct, filterStatus])

  const total     = (counts.today||0) + (counts.previous||0) + (counts.next_3_days||0)
  const allLeads  = [...data.today, ...data.previous, ...data.next_3_days]

  // Derived stats
  const stats = {
    total,
    today:    counts.today    || 0,
    overdue:  counts.previous || 0,
    upcoming: counts.next_3_days || 0,
    hot:      allLeads.filter(l => l.lead_status === 'hot').length,
    converted:allLeads.filter(l => l.lead_status === 'converted').length,
    call_back:allLeads.filter(l => l.lead_status === 'call_back').length,
    warm:     allLeads.filter(l => l.lead_status === 'warm').length,
  }

  const STAT_CARDS = [
    { key:'all',      icon:'📋', label:'Total Queue',  value:stats.total,     sublabel:'all sections',    color:'#4F46E5', glow:'79,70,229' },
    { key:'today',    icon:'⏰', label:'Today',         value:stats.today,     sublabel:'due today',       color:'#D97706', glow:'245,158,11' },
    { key:'overdue',  icon:'🚨', label:'Overdue',       value:stats.overdue,   sublabel:'past due date',   color:'#DC2626', glow:'239,68,68' },
    { key:'upcoming', icon:'📆', label:'Next 3 Days',   value:stats.upcoming,  sublabel:'coming up',       color:'#7C3AED', glow:'124,58,237' },
    { key:'hot',      icon:'🔥', label:'Hot Leads',     value:stats.hot,       sublabel:'in queue',        color:'#E11D48', glow:'225,29,72' },
    { key:'call_back',icon:'📞', label:'Call Back',     value:stats.call_back, sublabel:'need callback',   color:'#6D28D9', glow:'109,40,217' },
    { key:'warm',     icon:'🌡️', label:'Warm Leads',   value:stats.warm,      sublabel:'in queue',        color:'#B45309', glow:'180,83,9' },
    { key:'converted',icon:'✅', label:'Converted',     value:stats.converted, sublabel:'in queue',        color:'#15803D', glow:'21,128,61' },
  ]

  // Filter sections based on activeView
  const showSection = (type) => {
    if (activeView === 'all') return true
    if (activeView === 'today'    && type === 'today')    return true
    if (activeView === 'overdue'  && type === 'overdue')  return true
    if (activeView === 'upcoming' && type === 'upcoming') return true
    return false
  }

  const selStyle = {
    border: '2px solid #EEF0F6', borderRadius: 14, padding: '10px 14px',
    fontSize: 13, color: '#1E2640', background: '#fff',
    fontFamily: 'DM Sans, sans-serif', fontWeight: 600,
  }

  return (
    <div className="fp" style={{ maxWidth: 1100, margin: '0 auto', fontFamily:'DM Sans,sans-serif' }}>
      <style>{STYLES}</style>

      {/* ══ HERO HEADER ══════════════════════════════════ */}
      <div style={{
        position: 'relative', borderRadius: 28, overflow: 'hidden', marginBottom: 24,
        background: 'linear-gradient(135deg, #060B18 0%, #0F172A 35%, #1E1B4B 65%, #2D1B69 100%)',
        padding: '34px 36px 30px',
        boxShadow: '0 24px 80px rgba(10,15,30,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
      }}>
        {/* Dot grid texture */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        {/* Glow orbs */}
        <div style={{ position:'absolute', top:-80, right:80, width:320, height:320, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(139,92,246,0.25), transparent 65%)' }} />
        <div style={{ position:'absolute', bottom:-100, left:150, width:260, height:260, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(99,102,241,0.18), transparent 65%)' }} />
        <div style={{ position:'absolute', top:30, left:380, width:180, height:180, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(244,63,94,0.12), transparent 65%)' }} />

        <div style={{ position:'relative', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:20 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{
                width:38, height:38, borderRadius:12,
                background:'linear-gradient(135deg,rgba(99,102,241,0.4),rgba(139,92,246,0.2))',
                border:'1px solid rgba(165,180,252,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
              }}>📅</div>
              <span style={{ color:'rgba(165,180,252,0.65)', fontSize:10, fontWeight:800, letterSpacing:3, textTransform:'uppercase', fontFamily:'Syne,sans-serif' }}>
                ThynkFlow · Follow-ups
              </span>
            </div>
            <h1 style={{ fontFamily:'Syne,sans-serif', color:'#fff', fontSize:34, fontWeight:900,
              margin:'0 0 10px', letterSpacing:-1, lineHeight:1.05 }}>
              Follow-up Queue
            </h1>
            <p style={{ color:'rgba(196,181,253,0.6)', fontSize:14, margin:0, fontWeight:500 }}>
              {loading ? 'Syncing…' : `${total} total · ${format(new Date(), 'EEEE, dd MMMM yyyy')}`}
            </p>
          </div>

          {/* Live KPI cluster */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {[
              { label:'TODAY',    val:counts.today||0,         glow:'rgba(253,186,116,0.18)', border:'rgba(253,186,116,0.3)', valC:'#FCD34D', icon:'⏰', pulse:counts.today>0 },
              { label:'OVERDUE',  val:counts.previous||0,      glow:'rgba(248,113,113,0.18)', border:'rgba(248,113,113,0.3)', valC:'#FCA5A5', icon:'🔴', pulse:counts.previous>0 },
              { label:'UPCOMING', val:counts.next_3_days||0,   glow:'rgba(167,139,250,0.15)', border:'rgba(167,139,250,0.3)', valC:'#A5B4FC', icon:'📆', pulse:false },
              { label:'TOTAL',    val:total,                   glow:'rgba(255,255,255,0.06)', border:'rgba(255,255,255,0.12)', valC:'#fff',    icon:'📋', pulse:false },
            ].map(({ label, val, glow, border, valC, icon, pulse }) => (
              <div key={label} style={{
                background: glow, border: `1px solid ${border}`, borderRadius: 18,
                padding: '14px 18px', textAlign: 'center', backdropFilter:'blur(12px)', minWidth: 86,
              }}>
                <div style={{ fontSize:18, marginBottom:5 }}>{icon}</div>
                <div style={{
                  fontFamily:'Syne,sans-serif', color: valC, fontSize: 30, fontWeight: 900,
                  lineHeight: 1, letterSpacing: -1,
                  textShadow: `0 0 24px ${valC}88`,
                  animation: pulse ? 'fp-glow 2s ease-in-out infinite' : 'none',
                }}>{val}</div>
                <div style={{ color:'rgba(255,255,255,0.45)', fontSize:9, fontWeight:800,
                  letterSpacing:1.5, textTransform:'uppercase', marginTop:5 }}>{label}</div>
              </div>
            ))}
            <button onClick={() => fetchAll(filterAgent, filterProduct, filterStatus)} className="fp-btn" style={{
              padding:'14px 16px', background:'rgba(255,255,255,0.07)',
              border:'1px solid rgba(255,255,255,0.14)', borderRadius:18,
              color:'rgba(255,255,255,0.8)', fontSize:13, fontWeight:700,
              fontFamily:'DM Sans,sans-serif', display:'flex', alignItems:'center',
              gap:6, backdropFilter:'blur(8px)', alignSelf:'stretch',
            }}>
              <span style={{ fontSize:16 }}>↻</span> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ══ SUMMARY STAT CARDS ═══════════════════════════ */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:20 }}>
        {STAT_CARDS.map(card => (
          <StatCard key={card.key} {...card} active={activeView === card.key}
            onClick={() => setActiveView(v => v === card.key ? 'all' : card.key)} />
        ))}
      </div>

      {/* ══ FILTERS ══════════════════════════════════════ */}
      <div style={{
        background:'#fff', border:'1.5px solid #EEF0F6', borderRadius:20,
        padding:'14px 20px', display:'flex', flexWrap:'wrap', alignItems:'center',
        gap:10, marginBottom:22,
        boxShadow:'0 2px 16px rgba(10,15,30,0.05)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginRight:4 }}>
          <div style={{ width:28, height:28, borderRadius:9, background:'#EEF2FF',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🔍</div>
          <span style={{ fontSize:10, fontWeight:800, color:'#64748B', textTransform:'uppercase', letterSpacing:1.5 }}>
            Filter
          </span>
        </div>

        {isAdmin && agents.length > 0 && (
          <select style={selStyle} value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="fp-input">
            <option value="">👥 All Agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {products.length > 0 && (
          <select style={selStyle} value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="fp-input">
            <option value="">📦 All Products</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select style={selStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="fp-input">
          <option value="">🏷️ All Statuses</option>
          {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s]?.label}</option>)}
        </select>

        {(filterAgent || filterProduct || filterStatus) && (
          <button onClick={() => { setFilterAgent(''); setFilterProduct(''); setFilterStatus('') }} className="fp-btn" style={{
            padding:'9px 16px', background:'#FEF2F2', border:'1.5px solid #FECACA',
            borderRadius:12, color:'#DC2626', fontSize:12, fontWeight:800,
            fontFamily:'DM Sans,sans-serif',
          }}>✕ Reset</button>
        )}

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#22C55E',
            animation:'fp-pulse 2s ease infinite' }} />
          <span style={{ fontSize:11, color:'#94A3B8', fontWeight:600 }}>Auto-refreshes every 60s</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background:'#FEF2F2', border:'1.5px solid #FECACA', borderRadius:18,
          padding:'16px 22px', display:'flex', alignItems:'center', gap:14, marginBottom:20,
          boxShadow:'0 4px 20px rgba(239,68,68,0.1)',
        }}>
          <span style={{ fontSize:24 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#DC2626' }}>Failed to load follow-ups</div>
            <div style={{ fontSize:12, color:'#EF4444', marginTop:2 }}>{error}</div>
          </div>
          <button onClick={() => fetchAll(filterAgent,filterProduct,filterStatus)} className="fp-btn" style={{
            padding:'9px 18px', background:'#FEE2E2', border:'1.5px solid #FECACA',
            borderRadius:12, color:'#DC2626', fontSize:12, fontWeight:800, fontFamily:'DM Sans,sans-serif',
          }}>Retry</button>
        </div>
      )}

      {/* ══ CONTENT ══════════════════════════════════════ */}
      {loading ? (
        <div style={{
          background:'#fff', borderRadius:24, padding:'80px 24px', textAlign:'center',
          border:'1.5px solid #EEF0F6', boxShadow:'0 4px 32px rgba(10,15,30,0.05)',
        }}>
          <div style={{
            width:50, height:50, border:'4px solid #EEF2FF', borderTopColor:'#4F46E5',
            borderRadius:'50%', animation:'fp-spin 0.75s linear infinite', margin:'0 auto 20px',
          }} />
          <div style={{ fontFamily:'Syne,sans-serif', fontSize:17, color:'#1E2640', fontWeight:800, marginBottom:6 }}>
            Loading follow-ups…
          </div>
          <div style={{ fontSize:13, color:'#94A3B8' }}>Fetching your queue</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {showSection('today') && (
            <Section
              title="Today's Follow-ups"
              subtitle={`${data.today.length} lead${data.today.length !== 1 ? 's' : ''} due today · ${format(new Date(),'EEEE, dd MMMM')}`}
              icon="⏰" glowColor="245,158,11" accentHex="#F59E0B"
              items={data.today} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />
          )}

          {showSection('overdue') && (
            <Section
              title="Overdue"
              subtitle={`${data.previous.length} lead${data.previous.length !== 1 ? 's' : ''} past their scheduled follow-up date`}
              icon="🚨" glowColor="239,68,68" accentHex="#EF4444"
              items={data.previous} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />
          )}

          {showSection('upcoming') && (
            <Section
              title="Next 3 Days"
              subtitle={`${data.next_3_days.length} upcoming follow-up${data.next_3_days.length !== 1 ? 's' : ''} to prepare for`}
              icon="📆" glowColor="99,102,241" accentHex="#4F46E5"
              items={data.next_3_days} onUpdate={setSelected} isAdmin={isAdmin} defaultOpen={true} />
          )}

        </div>
      )}

      {/* Update modal */}
      {selected && (
        <UpdateModal followup={selected} onClose={() => setSelected(null)}
          onSave={() => { setSelected(null); fetchAll(filterAgent, filterProduct, filterStatus) }} />
      )}
    </div>
  )
}
