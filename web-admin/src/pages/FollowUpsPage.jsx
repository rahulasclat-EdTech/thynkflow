// web-admin/src/pages/FollowUpsPage.jsx — SIMPLIFIED UI
// Rewrite of the previous "hero header + glowing gradient cards" layout.
// That version had heavy per-card gradients/glows/blurs on every element,
// which made the page slow to scan and cluttered — especially once a
// queue had more than a handful of leads. This version keeps the exact
// same data/behaviour (sections, filters, agent breakdown, update modal)
// but uses a flat, consistent, table-like list so agents can scan a long
// queue quickly, with clear but restrained colour coding for urgency.
import React, { useEffect, useState, useMemo } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import useLeadStatuses from '../hooks/useLeadStatuses'

const DEFAULT_STATUS_META = {
  new:            { color:'#3B82F6', label:'New'            },
  hot:            { color:'#F43F5E', label:'Hot'             },
  warm:           { color:'#F59E0B', label:'Warm'            },
  cold:           { color:'#94A3B8', label:'Cold'            },
  converted:      { color:'#22C55E', label:'Converted'       },
  not_interested: { color:'#9CA3AF', label:'Not Interested'  },
  call_back:      { color:'#8B5CF6', label:'Call Back'       },
}

let _liveStatuses = []
const _FALLBACK_COLORS = ['#3B82F6','#F43F5E','#F59E0B','#94A3B8','#22C55E','#8B5CF6','#D1D5DB','#EC4899','#0EA5E9','#D97706']
function _fallbackColor(key) {
  let h = 0; for (let i=0;i<(key||'').length;i++) h = (h*31 + key.charCodeAt(i)) >>> 0
  return _FALLBACK_COLORS[h % _FALLBACK_COLORS.length]
}
function getAllStatusKeys() {
  return _liveStatuses.length ? _liveStatuses.map(s => s.key) : Object.keys(DEFAULT_STATUS_META)
}
function metaOf(key) {
  const master = _liveStatuses.find(s => s.key === key)
  if (master) return { color: master.color || DEFAULT_STATUS_META[key]?.color || _fallbackColor(key), label: master.label || DEFAULT_STATUS_META[key]?.label || (key||'').replace(/_/g,' ') }
  if (DEFAULT_STATUS_META[key]) return DEFAULT_STATUS_META[key]
  return { color: _fallbackColor(key), label: (key||'').replace(/_/g,' ') }
}

const fmt   = d => { try { return format(new Date(d), 'dd MMM yyyy') } catch { return '—' } }
const daysO = d => d ? Math.floor((new Date() - new Date(d)) / 86400000) : 0

function SBadge({ status }) {
  const c = metaOf(status)
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:700,
      whiteSpace:'nowrap', background:c.color+'18', color:c.color,
    }}>
      <span style={{width:6,height:6,borderRadius:'50%',background:c.color,flexShrink:0}} />
      {c.label}
    </span>
  )
}

// ── Compact stat pill ────────────────────────────────────
function StatPill({ icon, label, value, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:10,
      padding:'10px 14px', borderRadius:12, cursor:'pointer',
      border: active ? `1.5px solid ${color}` : '1.5px solid #E5E7EB',
      background: active ? color+'10' : '#fff',
      fontFamily:'inherit', flex:'1 1 0', minWidth:110, textAlign:'left',
      transition:'border-color .15s, background .15s',
    }}>
      <span style={{fontSize:17}}>{icon}</span>
      <div>
        <div style={{fontSize:19,fontWeight:800,lineHeight:1,color: active ? color : '#111827'}}>{value ?? 0}</div>
        <div style={{fontSize:10.5,fontWeight:600,color:'#6B7280',marginTop:2,textTransform:'uppercase',letterSpacing:0.4}}>{label}</div>
      </div>
    </button>
  )
}

// ── Update Modal ──────────────────────────────────────────
function UpdateModal({ followup, onClose, onSave }) {
  const [newStatus, setNewStatus]   = useState(followup.lead_status || 'new')
  const [discussion, setDiscussion] = useState('')
  const [nextDate, setNextDate]     = useState('')
  const [saving, setSaving]         = useState(false)

  const handleSave = async () => {
    if (!discussion.trim()) return toast.error('Add call notes first')
    setSaving(true)
    try {
      await api.post(`/leads/${followup.lead_id}/communications`, { type:'call', direction:'outbound', note: discussion, is_followup: true })
      await api.patch(`/leads/${followup.lead_id}/status`, { status: newStatus })
      await api.post('/followups', { lead_id: followup.lead_id, follow_up_date: nextDate || null, notes: discussion }).catch(()=>{})
      toast.success('Follow-up updated')
      onSave()
    } catch (err) { toast.error(err?.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, zIndex:200, background:'rgba(15,23,42,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#fff', borderRadius:16, width:'100%', maxWidth:480,
        boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden',
      }}>
        <div style={{padding:'18px 22px',borderBottom:'1px solid #F1F5F9',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'#94A3B8',textTransform:'uppercase',letterSpacing:0.8,marginBottom:3}}>Update Follow-up</div>
            <div style={{fontSize:17,fontWeight:800,color:'#111827'}}>{followup.lead_name||followup.contact_name||'—'}</div>
            <div style={{fontSize:12,color:'#6B7280',marginTop:2}}>
              {followup.phone}{followup.school_name?` · ${followup.school_name}`:''}{followup.product_name?` · ${followup.product_name}`:''}
            </div>
          </div>
          <button onClick={onClose} style={{border:'none',background:'#F1F5F9',width:28,height:28,borderRadius:8,color:'#64748B',fontSize:14,cursor:'pointer'}}>✕</button>
        </div>

        <div style={{padding:'18px 22px',display:'flex',flexDirection:'column',gap:16}}>
          <div>
            <label style={s.label}>Call Notes *</label>
            <textarea value={discussion} onChange={e=>setDiscussion(e.target.value)} rows={3} autoFocus
              placeholder="What was discussed? Key objections, interest level, next steps…"
              style={s.textarea}/>
          </div>

          <div>
            <label style={s.label}>Update Status</label>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {getAllStatusKeys().map(st=>{
                const c=metaOf(st); const active=newStatus===st
                return (
                  <button key={st} onClick={()=>setNewStatus(st)} style={{
                    padding:'5px 12px',borderRadius:20,cursor:'pointer',fontFamily:'inherit',
                    border: active ? `1.5px solid ${c.color}` : '1.5px solid #E5E7EB',
                    background: active ? c.color : '#fff',
                    color: active ? '#fff' : '#374151',
                    fontSize:12,fontWeight:600,
                  }}>{c.label}</button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={s.label}>Next Follow-up Date</label>
            <input type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]} style={s.input}/>
          </div>
        </div>

        <div style={{padding:'0 22px 20px',display:'flex',gap:10}}>
          <button onClick={onClose} style={{...s.btnSecondary,flex:1}}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{...s.btnPrimary,flex:2,opacity:saving?0.7:1}}>
            {saving?'Saving…':'Save & Close'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead Row ──────────────────────────────────────────────
function LeadRow({ item, onUpdate, isAdmin }) {
  const overdue = item.followup_type === 'overdue'
  const today   = item.followup_type === 'today'
  const days    = overdue ? daysO(item.follow_up_date) : 0
  const name    = item.lead_name || item.contact_name || '?'
  const dateColor = overdue ? '#DC2626' : today ? '#D97706' : '#4338CA'

  return (
    <div style={{
      display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'center',
      padding:'12px 16px', borderBottom:'1px solid #F1F5F9',
      background: overdue ? '#FEF2F2' : today ? '#FFFBEB' : '#fff',
    }}>
      <div style={{minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:4}}>
          <span style={{fontSize:14,fontWeight:700,color:'#111827'}}>{name}</span>
          <SBadge status={item.lead_status}/>
          {overdue && days>0 && <span style={{fontSize:10.5,fontWeight:700,color:'#DC2626'}}>{days}d late</span>}
          {today && <span style={{fontSize:10.5,fontWeight:700,color:'#D97706'}}>Due today</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',fontSize:12,color:'#6B7280'}}>
          <a href={`tel:${item.phone}`} style={{color:'#4338CA',fontWeight:600,textDecoration:'none'}}>📞 {item.phone||'—'}</a>
          {item.school_name && item.school_name!==name && <span>🏫 {item.school_name}</span>}
          {item.product_name && <span>📦 {item.product_name}</span>}
          {isAdmin && item.agent_name && <span>👤 {item.agent_name}</span>}
        </div>
        {item.notes && (
          <div style={{marginTop:5,fontSize:12,color:'#9CA3AF',fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:520}}>
            "{item.notes}"
          </div>
        )}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:9.5,fontWeight:700,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.5}}>Follow-up</div>
          <div style={{fontSize:12,fontWeight:700,color:dateColor,fontFamily:'SF Mono,Fira Code,monospace'}}>{fmt(item.follow_up_date)}</div>
        </div>
        <a href={`tel:${item.phone}`} style={s.iconBtn} title="Call">📞</a>
        <a href={`https://wa.me/${(item.phone||'').replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer" style={s.iconBtn} title="WhatsApp">💬</a>
        <button onClick={()=>onUpdate(item)} style={s.btnPrimary}>Update</button>
      </div>
    </div>
  )
}

// ── Section ───────────────────────────────────────────────
function Section({ title, subtitle, icon, color, items, onUpdate, isAdmin, defaultOpen=true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{borderRadius:14, overflow:'hidden', border:'1px solid #E5E7EB', background:'#fff'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 16px', border:'none', cursor:'pointer', fontFamily:'inherit',
        background:'#F8FAFC', borderBottom: open ? '1px solid #E5E7EB' : 'none',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:17}}>{icon}</span>
          <div style={{textAlign:'left'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#111827'}}>{title}</div>
            <div style={{fontSize:11.5,color:'#6B7280',marginTop:1}}>{subtitle}</div>
          </div>
          <span style={{
            background: items.length===0 ? '#E5E7EB' : color, color: items.length===0 ? '#9CA3AF' : '#fff',
            borderRadius:20, fontSize:12, fontWeight:800, padding:'2px 10px', marginLeft:4,
          }}>{items.length}</span>
        </div>
        <span style={{fontSize:11,fontWeight:700,color:'#9CA3AF'}}>{open?'Hide':'Show'}</span>
      </button>

      {open && (
        items.length===0 ? (
          <div style={{textAlign:'center',color:'#9CA3AF',padding:'32px 16px',fontSize:13}}>Nothing here 🎉</div>
        ) : (
          <div>{items.map((item,i)=> <LeadRow key={item.lead_id||i} item={item} onUpdate={onUpdate} isAdmin={isAdmin}/>)}</div>
        )
      )}
    </div>
  )
}

// ══ MAIN PAGE ═════════════════════════════════════════════
export default function FollowUpsPage() {
  const { user }  = useAuth()
  const isAdmin   = user?.role_id===1 || user?.role_name==='admin'
  const { statuses } = useLeadStatuses()
  useEffect(() => { if (statuses.length) _liveStatuses = statuses }, [statuses])

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

  const agentBreakdown = useMemo(() => {
    if (!isAdmin) return []
    const rows = {}
    const bump = (name, key) => {
      const k = name || 'Unassigned'
      rows[k] = rows[k] || { agent_name: k, today: 0, next_3_days: 0, previous: 0 }
      rows[k][key]++
    }
    data.today.forEach(l => bump(l.agent_name, 'today'))
    data.next_3_days.forEach(l => bump(l.agent_name, 'next_3_days'))
    data.previous.forEach(l => bump(l.agent_name, 'previous'))
    return Object.values(rows)
      .map(r => ({ ...r, total: r.today + r.next_3_days + r.previous }))
      .sort((a, b) => b.total - a.total)
  }, [isAdmin, data])

  const CARDS = [
    {key:'all',      icon:'📋', label:'Total',    value:total,            color:'#4F46E5'},
    {key:'today',    icon:'⏰', label:'Today',     value:counts.today,     color:'#D97706'},
    {key:'overdue',  icon:'🚨', label:'Overdue',   value:counts.previous,  color:'#DC2626'},
    {key:'upcoming', icon:'📆', label:'Upcoming',  value:counts.next_3_days, color:'#7C3AED'},
  ]

  const showSection = (type) => {
    if(activeView==='all') return true
    if(activeView==='today'    && type==='today')    return true
    if(activeView==='overdue'  && type==='overdue')  return true
    if(activeView==='upcoming' && type==='upcoming') return true
    return false
  }

  return (
    <div style={{maxWidth:1000,margin:'0 auto',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif'}}>
      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:16}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:800,color:'#111827',margin:0}}>Follow-up Queue</h1>
          <p style={{fontSize:13,color:'#6B7280',margin:'2px 0 0'}}>
            {loading?'Syncing…':`${total} total · ${format(new Date(),'EEEE, dd MMMM yyyy')}`}
          </p>
        </div>
        <button onClick={()=>fetchAll(filterAgent,filterProduct,filterStatus)} style={s.btnSecondary}>↻ Refresh</button>
      </div>

      {/* ── Stat pills ── */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        {CARDS.map(card=>(
          <StatPill key={card.key} {...card} active={activeView===card.key}
            onClick={()=>setActiveView(v=>v===card.key?'all':card.key)}/>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{
        background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,
        padding:'10px 14px',display:'flex',flexWrap:'wrap',alignItems:'center',gap:8,marginBottom:16,
      }}>
        <span style={{fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:0.6}}>Filter</span>
        {isAdmin&&agents.length>0&&(
          <select style={s.select} value={filterAgent} onChange={e=>setFilterAgent(e.target.value)}>
            <option value="">All Agents</option>
            {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        {products.length>0&&(
          <select style={s.select} value={filterProduct} onChange={e=>setFilterProduct(e.target.value)}>
            <option value="">All Products</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select style={s.select} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {getAllStatusKeys().map(st=><option key={st} value={st}>{metaOf(st).label}</option>)}
        </select>
        {(filterAgent||filterProduct||filterStatus)&&(
          <button onClick={()=>{setFilterAgent('');setFilterProduct('');setFilterStatus('')}} style={s.btnGhostDanger}>✕ Reset</button>
        )}
        <span style={{marginLeft:'auto',fontSize:11,color:'#9CA3AF'}}>Auto-refreshes every 60s</span>
      </div>

      {/* ── Agent-wise breakdown ── */}
      {isAdmin && agentBreakdown.length > 0 && (
        <div style={{background:'#fff',border:'1px solid #E5E7EB',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:'#111827',marginBottom:10}}>👥 Agent-wise Follow-up Counts</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:'1.5px solid #F1F5F9'}}>
                  <th style={s.th}>Agent</th>
                  <th style={{...s.th,textAlign:'center',color:'#D97706'}}>Today</th>
                  <th style={{...s.th,textAlign:'center',color:'#7C3AED'}}>Next 3 Days</th>
                  <th style={{...s.th,textAlign:'center',color:'#DC2626'}}>Missed</th>
                  <th style={{...s.th,textAlign:'center'}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {agentBreakdown.map(a => (
                  <tr key={a.agent_name} style={{borderBottom:'1px solid #F9FAFB'}}>
                    <td style={{padding:'7px 10px',fontWeight:600,color:'#111827'}}>{a.agent_name}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:a.today?'#D97706':'#D1D5DB'}}>{a.today}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:a.next_3_days?'#7C3AED':'#D1D5DB'}}>{a.next_3_days}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',fontWeight:700,color:a.previous?'#DC2626':'#D1D5DB'}}>{a.previous}</td>
                    <td style={{padding:'7px 10px',textAlign:'center',fontWeight:800,color:'#111827'}}>{a.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error&&(
        <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:12,padding:'12px 16px',display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
          <span>⚠️</span>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:'#DC2626'}}>Failed to load</div>
            <div style={{fontSize:12,color:'#EF4444'}}>{error}</div>
          </div>
          <button onClick={()=>fetchAll(filterAgent,filterProduct,filterStatus)} style={s.btnGhostDanger}>Retry</button>
        </div>
      )}

      {/* ── Content ── */}
      {loading?(
        <div style={{background:'#fff',borderRadius:14,padding:'60px 24px',textAlign:'center',border:'1px solid #E5E7EB'}}>
          <div style={{width:36,height:36,border:'4px solid #EEF2FF',borderTopColor:'#4F46E5',borderRadius:'50%',
            animation:'spin 0.8s linear infinite',margin:'0 auto 14px'}}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{fontSize:14,fontWeight:700,color:'#111827'}}>Loading follow-ups…</div>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {showSection('today')&&(
            <Section title="Today's Follow-ups"
              subtitle={`${data.today.length} lead${data.today.length!==1?'s':''} due today`}
              icon="⏰" color="#D97706" items={data.today} onUpdate={setSelected} isAdmin={isAdmin}/>
          )}
          {showSection('overdue')&&(
            <Section title="Overdue"
              subtitle={`${data.previous.length} lead${data.previous.length!==1?'s':''} past their follow-up date`}
              icon="🚨" color="#DC2626" items={data.previous} onUpdate={setSelected} isAdmin={isAdmin}/>
          )}
          {showSection('upcoming')&&(
            <Section title="Next 3 Days"
              subtitle={`${data.next_3_days.length} upcoming follow-up${data.next_3_days.length!==1?'s':''}`}
              icon="📆" color="#4F46E5" items={data.next_3_days} onUpdate={setSelected} isAdmin={isAdmin}/>
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

const s = {
  label:    {display:'block',fontSize:11,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:0.6,marginBottom:6},
  textarea: {width:'100%',border:'1.5px solid #E5E7EB',borderRadius:10,padding:'10px 12px',fontSize:14,color:'#111827',resize:'none',fontFamily:'inherit',background:'#F9FAFB'},
  input:    {width:'100%',border:'1.5px solid #E5E7EB',borderRadius:10,padding:'9px 12px',fontSize:14,color:'#111827',fontFamily:'inherit',background:'#F9FAFB'},
  select:   {border:'1.5px solid #E5E7EB',borderRadius:10,padding:'7px 10px',fontSize:12.5,color:'#111827',background:'#fff',fontFamily:'inherit',fontWeight:600},
  th:       {textAlign:'left',padding:'6px 10px',fontSize:10.5,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:0.5},
  btnPrimary:{padding:'7px 14px',borderRadius:9,border:'none',background:'#4F46E5',color:'#fff',fontSize:12.5,fontWeight:700,fontFamily:'inherit',cursor:'pointer'},
  btnSecondary:{padding:'8px 14px',borderRadius:9,border:'1.5px solid #E5E7EB',background:'#fff',color:'#374151',fontSize:12.5,fontWeight:700,fontFamily:'inherit',cursor:'pointer'},
  btnGhostDanger:{padding:'6px 12px',borderRadius:9,border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#DC2626',fontSize:11.5,fontWeight:700,fontFamily:'inherit',cursor:'pointer'},
  iconBtn:  {width:30,height:30,display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:8,background:'#F1F5F9',textDecoration:'none',fontSize:13},
}
