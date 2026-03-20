// web-admin/src/pages/ChatPage.jsx — PREMIUM REDESIGN
import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const BASE = import.meta.env.VITE_API_URL?.replace('/api','') || 'https://thynkflow.onrender.com'

const TYPE_ICONS  = { direct:'💬', group:'👥', broadcast:'📢' }
const TYPE_LABELS = { direct:'Direct Message', group:'Group Chat', broadcast:'Broadcast' }
const TYPE_COLORS = { direct:'#3B82F6', group:'#8B5CF6', broadcast:'#F59E0B' }
const FILE_ICONS  = { pdf:'📄', xlsx:'📊', xls:'📊', docx:'📝', doc:'📝', csv:'📊', txt:'📃', jpg:'🖼', jpeg:'🖼', png:'🖼', gif:'🖼', webp:'🖼' }

function fileIcon(name) { const ext=(name||'').split('.').pop()?.toLowerCase(); return FILE_ICONS[ext]||'📎' }
function isImage(type) { return type?.startsWith('image/') }
function fmtSize(b) { if(!b)return ''; if(b<1024)return b+' B'; if(b<1048576)return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB' }

function formatTime(d) {
  if (!d) return ''
  const date=new Date(d), now=new Date(), diff=now-date
  if (diff<60000) return 'just now'
  if (diff<3600000) return Math.floor(diff/60000)+'m'
  if (diff<86400000) return date.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})
  return date.toLocaleDateString('en-IN',{day:'numeric',month:'short'})
}
function formatMsgTime(d) { if(!d)return ''; return new Date(d).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) }

function formatDateDivider(d) {
  if (!d) return ''
  const date=new Date(d), now=new Date()
  const diff=Math.floor((now-date)/86400000)
  if (diff===0) return 'Today'
  if (diff===1) return 'Yesterday'
  return date.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})
}

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

  .chat-root * { box-sizing: border-box; }
  .chat-root {
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .chat-conv-item { transition: all 0.15s ease; }
  .chat-conv-item:hover { background: rgba(255,255,255,0.06) !important; }
  .chat-conv-item.active { background: rgba(99,102,241,0.18) !important; }

  .chat-send-btn { transition: all 0.15s ease; }
  .chat-send-btn:hover:not(:disabled) { transform: scale(1.06); filter: brightness(1.1); }
  .chat-send-btn:active:not(:disabled) { transform: scale(0.94); }

  .chat-bubble { animation: bubble-in 0.22s ease both; }
  @keyframes bubble-in { from{opacity:0;transform:translateY(8px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }

  .chat-action-btn { transition: all 0.15s ease; }
  .chat-action-btn:hover { transform: scale(1.05); filter: brightness(1.08); }
  .chat-action-btn:active { transform: scale(0.94); }

  .chat-input:focus { outline: none; }

  .chat-modal-backdrop { animation: fade-in 0.2s ease both; }
  @keyframes fade-in { from{opacity:0} to{opacity:1} }
  .chat-modal-panel { animation: slide-up 0.25s cubic-bezier(0.34,1.4,0.64,1) both; }
  @keyframes slide-up { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }

  .chat-scrollbar::-webkit-scrollbar { width: 4px; }
  .chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .chat-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
  .chat-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.22); }

  .chat-msg-scrollbar::-webkit-scrollbar { width: 4px; }
  .chat-msg-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .chat-msg-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.08); border-radius: 4px; }
`

// ── Avatar ────────────────────────────────────────────────
function Avatar({ name, size=36, color='#6366F1' }) {
  const initials = (name||'?').substring(0,2).toUpperCase()
  const colors = ['#6366F1','#8B5CF6','#EC4899','#14B8A6','#F59E0B','#10B981','#3B82F6','#EF4444']
  const c = colors[name?.charCodeAt(0)%colors.length] || color
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%', flexShrink:0,
      background:`linear-gradient(135deg,${c},${c}99)`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.36, fontWeight:700, color:'#fff',
      letterSpacing:-0.5,
      boxShadow:`0 2px 8px ${c}44`,
    }}>{initials}</div>
  )
}

// ── New Chat Modal ────────────────────────────────────────
function NewChatModal({ onClose, onCreated, isAdmin }) {
  const [mode, setMode]         = useState('direct')
  const [users, setUsers]       = useState([])
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState([])
  const [groupName, setGroupName] = useState('')
  const [bcastName, setBcastName] = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(()=>{
    api.get('/chat/users').then(r=>{
      const list=r?.data||r||[]
      setUsers(Array.isArray(list)?list:[])
    }).catch(()=>setUsers([]))
  },[])

  const filtered = users.filter(u=>
    u.name.toLowerCase().includes(search.toLowerCase())||
    (u.email||'').toLowerCase().includes(search.toLowerCase())
  )
  const toggle = (id) => setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])

  const handleCreate = async () => {
    setLoading(true)
    try {
      if (mode==='direct') {
        if (!selected.length) return toast.error('Select a user')
        const r = await api.post('/chat/conversations/direct',{target_user_id:selected[0]})
        const id = r?.data?.id??r?.id
        if (!id) throw new Error('No conversation ID')
        onCreated(id)
      } else if (mode==='group') {
        if (!groupName.trim()) return toast.error('Enter group name')
        if (!selected.length) return toast.error('Add at least 1 member')
        const r = await api.post('/chat/conversations/group',{name:groupName,member_ids:selected})
        const id = r?.data?.id??r?.id
        if (!id) throw new Error('No conversation ID')
        onCreated(id)
      } else {
        const r = await api.post('/chat/conversations/broadcast',{name:bcastName})
        const id = r?.data?.id??r?.id
        if (!id) throw new Error('No conversation ID')
        onCreated(id)
      }
      onClose()
    } catch(err){ toast.error(err.message||'Failed') }
    finally{ setLoading(false) }
  }

  const MODES = [['direct','💬 Direct'],['group','👥 Group'],isAdmin&&['broadcast','📢 Broadcast']].filter(Boolean)

  return (
    <div className="chat-root chat-modal-backdrop" style={{
      position:'fixed',inset:0,zIndex:200,
      background:'rgba(10,15,30,0.75)',backdropFilter:'blur(12px)',
      display:'flex',alignItems:'center',justifyContent:'center',padding:20,
    }} onClick={onClose}>
      <div className="chat-modal-panel" onClick={e=>e.stopPropagation()} style={{
        background:'#fff',borderRadius:24,width:'100%',maxWidth:440,
        overflow:'hidden',boxShadow:'0 40px 100px rgba(0,0,0,0.35)',
        display:'flex',flexDirection:'column',maxHeight:'85vh',
      }}>
        {/* Header */}
        <div style={{
          background:'linear-gradient(135deg,#1E1B4B,#312E81)',
          padding:'22px 24px 18px',
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div>
              <div style={{color:'rgba(165,180,252,0.7)',fontSize:10,fontWeight:700,letterSpacing:2,textTransform:'uppercase',marginBottom:4}}>
                ThynkFlow Chat
              </div>
              <h3 style={{color:'#fff',fontSize:18,fontWeight:800,margin:0,letterSpacing:-0.3}}>
                New Conversation
              </h3>
            </div>
            <button onClick={onClose} style={{
              width:32,height:32,borderRadius:10,border:'none',
              background:'rgba(255,255,255,0.15)',color:'#fff',
              display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',fontSize:14,fontFamily:'inherit',
            }}>✕</button>
          </div>

          {/* Mode tabs */}
          <div style={{display:'flex',gap:6}}>
            {MODES.map(([key,label])=>(
              <button key={key} onClick={()=>{setMode(key);setSelected([])}} style={{
                padding:'7px 14px',borderRadius:20,border:'none',cursor:'pointer',
                fontSize:12,fontWeight:700,fontFamily:'inherit',
                background: mode===key ? '#fff' : 'rgba(255,255,255,0.15)',
                color: mode===key ? '#4338CA' : 'rgba(255,255,255,0.85)',
                boxShadow: mode===key ? '0 4px 14px rgba(0,0,0,0.2)' : 'none',
                transition:'all 0.18s ease',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:'auto',padding:'18px 22px'}}>
          {mode==='broadcast' ? (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <p style={{fontSize:13,color:'#6B7280',lineHeight:1.6,margin:0}}>
                📢 Creates a channel visible to <strong>all active users</strong>.
              </p>
              <input value={bcastName} onChange={e=>setBcastName(e.target.value)}
                placeholder={`Broadcast — ${new Date().toLocaleDateString('en-IN')}`}
                className="chat-input" style={{
                  width:'100%',border:'2px solid #E5E7EB',borderRadius:12,
                  padding:'11px 14px',fontSize:14,color:'#111827',
                  fontFamily:'inherit',background:'#FAFAFA',
                  transition:'border-color 0.2s',
                }} onFocus={e=>e.target.style.borderColor='#6366F1'}
                  onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {mode==='group'&&(
                <input value={groupName} onChange={e=>setGroupName(e.target.value)}
                  placeholder="Group name e.g. Sales Team"
                  className="chat-input" style={{
                    width:'100%',border:'2px solid #E5E7EB',borderRadius:12,
                    padding:'11px 14px',fontSize:14,color:'#111827',fontFamily:'inherit',
                    background:'#FAFAFA',transition:'border-color 0.2s',
                  }} onFocus={e=>e.target.style.borderColor='#6366F1'}
                    onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
              )}
              <div style={{position:'relative'}}>
                <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:14,color:'#9CA3AF'}}>🔍</span>
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search people…"
                  className="chat-input" style={{
                    width:'100%',border:'2px solid #E5E7EB',borderRadius:12,
                    padding:'11px 14px 11px 36px',fontSize:14,color:'#111827',
                    fontFamily:'inherit',background:'#FAFAFA',transition:'border-color 0.2s',
                  }} onFocus={e=>e.target.style.borderColor='#6366F1'}
                    onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
              </div>

              <div style={{maxHeight:220,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
                {users.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'#9CA3AF',fontSize:13}}>Loading users…</div>}
                {filtered.map(u=>{
                  const sel = mode==='direct'?selected[0]===u.id:selected.includes(u.id)
                  return (
                    <button key={u.id} onClick={()=>mode==='direct'?setSelected([u.id]):toggle(u.id)}
                      style={{
                        display:'flex',alignItems:'center',gap:11,padding:'9px 12px',
                        borderRadius:14,border: sel?'1.5px solid #C7D2FE':'1.5px solid transparent',
                        background: sel?'#EEF2FF':'transparent',cursor:'pointer',
                        textAlign:'left',transition:'all 0.15s ease',fontFamily:'inherit',
                      }}
                      onMouseEnter={e=>{ if(!sel) e.currentTarget.style.background='#F9FAFB' }}
                      onMouseLeave={e=>{ if(!sel) e.currentTarget.style.background='transparent' }}>
                      <Avatar name={u.name} size={34}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.name}</div>
                        <div style={{fontSize:11,color:'#9CA3AF',textTransform:'capitalize',marginTop:1}}>{u.role_name||u.role}</div>
                      </div>
                      {sel&&<div style={{width:20,height:20,borderRadius:'50%',background:'#6366F1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff',fontWeight:800,flexShrink:0}}>✓</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'14px 22px 20px',borderTop:'1.5px solid #F3F4F6',display:'flex',gap:10}}>
          <button onClick={onClose} style={{
            flex:1,padding:'13px',border:'2px solid #E5E7EB',borderRadius:14,
            color:'#6B7280',fontSize:14,fontWeight:700,background:'#F9FAFB',
            cursor:'pointer',fontFamily:'inherit',transition:'all 0.15s ease',
          }}>Cancel</button>
          <button onClick={handleCreate} disabled={loading} style={{
            flex:1.8,padding:'13px',border:'none',borderRadius:14,
            background:'linear-gradient(135deg,#6366F1,#4F46E5)',
            color:'#fff',fontSize:14,fontWeight:800,cursor:'pointer',
            fontFamily:'inherit',opacity:loading?0.7:1,
            boxShadow:'0 8px 20px rgba(99,102,241,0.38)',
            transition:'all 0.15s ease',
          }}>{loading?'Creating…':'✓ Start Chat'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Message Bubble ────────────────────────────────────────
function MessageBubble({ msg, isMine, showName, onDelete }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div className="chat-bubble" style={{
      display:'flex',gap:9,marginBottom:4,
      flexDirection: isMine?'row-reverse':'row',
      alignItems:'flex-end',
    }}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}>

      {!isMine&&(
        <div style={{flexShrink:0,marginBottom:2}}>
          <Avatar name={msg.sender_name} size={28}/>
        </div>
      )}

      <div style={{
        maxWidth:'68%',
        display:'flex',flexDirection:'column',
        alignItems: isMine?'flex-end':'flex-start',
      }}>
        {showName&&!isMine&&(
          <span style={{fontSize:11,fontWeight:700,color:'#6B7280',marginBottom:3,marginLeft:2}}>
            {msg.sender_name}
          </span>
        )}

        <div style={{
          borderRadius: isMine?'18px 18px 4px 18px':'18px 18px 18px 4px',
          padding: msg.file_url&&!msg.message ? '6px' : '10px 14px',
          background: isMine
            ? 'linear-gradient(135deg,#6366F1,#4F46E5)'
            : '#fff',
          color: isMine?'#fff':'#111827',
          boxShadow: isMine
            ? '0 4px 14px rgba(99,102,241,0.35)'
            : '0 2px 8px rgba(0,0,0,0.07)',
          border: isMine?'none':'1.5px solid #F0F0F5',
        }}>
          {msg.file_url&&(
            <div style={{marginBottom:msg.message?10:0}}>
              {isImage(msg.file_type)?(
                <a href={`${BASE}${msg.file_url}`} target="_blank" rel="noreferrer">
                  <img src={`${BASE}${msg.file_url}`} alt={msg.file_name} style={{
                    maxWidth:'100%',borderRadius:12,maxHeight:200,
                    objectFit:'cover',display:'block',cursor:'pointer',
                  }}/>
                </a>
              ):(
                <a href={`${BASE}${msg.file_url}`} target="_blank" rel="noreferrer" style={{
                  display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
                  borderRadius:12,textDecoration:'none',
                  background: isMine?'rgba(255,255,255,0.15)':'#F8FAFC',
                  border: isMine?'1px solid rgba(255,255,255,0.2)':'1px solid #E8ECF4',
                }}>
                  <span style={{fontSize:22,flexShrink:0}}>{fileIcon(msg.file_name)}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:isMine?'#fff':'#374151',
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{msg.file_name}</div>
                    <div style={{fontSize:11,color:isMine?'rgba(255,255,255,0.65)':'#9CA3AF',marginTop:2}}>{fmtSize(msg.file_size)}</div>
                  </div>
                  <span style={{fontSize:12,color:isMine?'rgba(255,255,255,0.7)':'#9CA3AF'}}>↓</span>
                </a>
              )}
            </div>
          )}
          {msg.message&&(
            <p style={{margin:0,fontSize:14,lineHeight:1.55,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
              {msg.message}
            </p>
          )}
        </div>

        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3,
          flexDirection:isMine?'row-reverse':'row'}}>
          <span style={{fontSize:10,color:'#9CA3AF',fontWeight:500}}>{formatMsgTime(msg.created_at)}</span>
          {isMine&&hovered&&(
            <button onClick={()=>onDelete(msg.id)} style={{
              fontSize:10,color:'#EF4444',border:'none',background:'none',
              cursor:'pointer',fontFamily:'inherit',padding:0,fontWeight:600,
              opacity:0.8,
            }}>Delete</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────
export default function ChatPage() {
  const { user } = useAuth()
  const isAdmin  = user?.role_id===1||user?.role_name==='admin'

  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId]   = useState(null)
  const [messages, setMessages]           = useState([])
  const [text, setText]                   = useState('')
  const [file, setFile]                   = useState(null)
  const [sending, setSending]             = useState(false)
  const [showNew, setShowNew]             = useState(false)
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(true)

  const messagesEndRef = useRef(null)
  const fileInputRef   = useRef(null)
  const lastMsgTime    = useRef(null)
  const pollRef        = useRef(null)

  const loadConversations = useCallback(async () => {
    try {
      const r = await api.get('/chat/conversations')
      setConversations(r?.data||[])
    } catch {}
    finally { setLoading(false) }
  },[])

  useEffect(()=>{ loadConversations() },[loadConversations])

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return
    try {
      const r = await api.get(`/chat/conversations/${convId}/messages`)
      const msgs = r?.data||[]
      setMessages(msgs)
      lastMsgTime.current = msgs.length?msgs[msgs.length-1].created_at:null
    } catch {}
  },[])

  useEffect(()=>{ if(activeConvId) loadMessages(activeConvId) },[activeConvId,loadMessages])

  useEffect(()=>{
    if (!activeConvId) return
    pollRef.current=setInterval(async()=>{
      try {
        const params=lastMsgTime.current?`?since=${encodeURIComponent(lastMsgTime.current)}`:''
        const r=await api.get(`/chat/conversations/${activeConvId}/messages${params}`)
        const newMsgs=r?.data||[]
        if (newMsgs.length) {
          setMessages(prev=>[...prev,...newMsgs])
          lastMsgTime.current=newMsgs[newMsgs.length-1].created_at
        }
        loadConversations()
      } catch {}
    },10000)
    return()=>clearInterval(pollRef.current)
  },[activeConvId,loadConversations])

  useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:'smooth'}) },[messages])

  const handleSend = async () => {
    if (!text.trim()&&!file) return
    if (!activeConvId) return
    setSending(true)
    try {
      const formData=new FormData()
      if (text.trim()) formData.append('message',text.trim())
      if (file) formData.append('file',file)
      const r=await api.post(`/chat/conversations/${activeConvId}/messages`,formData,{
        headers:{'Content-Type':'multipart/form-data'}
      })
      const newMsg=r?.data
      if (newMsg) {
        setMessages(prev=>[...prev,newMsg])
        lastMsgTime.current=newMsg.created_at
      }
      setText(''); setFile(null)
      if (fileInputRef.current) fileInputRef.current.value=''
      loadConversations()
    } catch(err){ toast.error(err.message||'Failed to send') }
    finally{ setSending(false) }
  }

  const handleDelete = async (msgId) => {
    try {
      await api.delete(`/chat/messages/${msgId}`)
      setMessages(prev=>prev.filter(m=>m.id!==msgId))
    } catch { toast.error('Could not delete') }
  }

  const handleKeyDown = (e) => {
    if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const activeConv = conversations.find(c=>c.id===activeConvId)

  const getConvTitle = (conv) => {
    if (conv.type==='broadcast') return conv.name||'📢 Broadcast'
    if (conv.type==='group')     return conv.name||'Group Chat'
    const other=(conv.members||[]).find(m=>m.id!==user?.id)
    return other?.name||conv.name||'Chat'
  }

  const filteredConvs = conversations.filter(c=>
    getConvTitle(c).toLowerCase().includes(search.toLowerCase())
  )

  // Group messages by date for dividers
  const groupedMessages = []
  let lastDate = null
  messages.forEach(msg => {
    const msgDate = msg.created_at ? new Date(msg.created_at).toDateString() : null
    if (msgDate && msgDate !== lastDate) {
      groupedMessages.push({ type:'divider', date:msg.created_at })
      lastDate = msgDate
    }
    groupedMessages.push({ type:'msg', msg })
  })

  return (
    <div className="chat-root" style={{
      display:'flex',
      height:'calc(100vh - 88px)',
      borderRadius:20,
      overflow:'hidden',
      boxShadow:'0 8px 40px rgba(0,0,0,0.12)',
      border:'1px solid #E2E4EA',
    }}>
      <style>{STYLES}</style>

      {/* ── SIDEBAR ── */}
      <div style={{
        width:300,flexShrink:0,display:'flex',flexDirection:'column',
        background:'linear-gradient(180deg,#1E1B4B 0%,#0F172A 100%)',
        borderRight:'1px solid rgba(255,255,255,0.07)',
      }}>
        {/* Sidebar header */}
        <div style={{padding:'20px 18px 14px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <div style={{color:'rgba(165,180,252,0.5)',fontSize:9,fontWeight:800,letterSpacing:2.5,textTransform:'uppercase',marginBottom:4}}>
                ThynkFlow
              </div>
              <h2 style={{color:'#fff',fontSize:18,fontWeight:800,margin:0,letterSpacing:-0.4}}>
                Messages
              </h2>
            </div>
            <button onClick={()=>setShowNew(true)} className="chat-action-btn" style={{
              width:36,height:36,borderRadius:12,border:'none',cursor:'pointer',
              background:'linear-gradient(135deg,#6366F1,#4F46E5)',
              color:'#fff',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',
              boxShadow:'0 4px 14px rgba(99,102,241,0.45)',fontFamily:'inherit',
            }}>✎</button>
          </div>

          {/* Search */}
          <div style={{position:'relative'}}>
            <span style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'rgba(255,255,255,0.3)'}}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="chat-input" style={{
                width:'100%',background:'rgba(255,255,255,0.07)',
                border:'1.5px solid rgba(255,255,255,0.1)',borderRadius:12,
                padding:'9px 12px 9px 32px',fontSize:13,color:'#fff',fontFamily:'inherit',
                transition:'border-color 0.2s',
              }}
              onFocus={e=>e.target.style.borderColor='rgba(99,102,241,0.6)'}
              onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}/>
          </div>
        </div>

        {/* Conversation list */}
        <div className="chat-scrollbar" style={{flex:1,overflowY:'auto',padding:'4px 8px'}}>
          {loading?(
            <div style={{textAlign:'center',padding:'32px 16px',color:'rgba(255,255,255,0.3)',fontSize:13}}>
              Loading…
            </div>
          ):filteredConvs.length===0?(
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'40px 16px',color:'rgba(255,255,255,0.3)'}}>
              <div style={{fontSize:40,marginBottom:10}}>💬</div>
              <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>No conversations</div>
              <button onClick={()=>setShowNew(true)} style={{
                marginTop:10,padding:'8px 18px',borderRadius:20,border:'none',
                background:'rgba(99,102,241,0.25)',color:'rgba(165,180,252,0.9)',
                fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',
              }}>Start one →</button>
            </div>
          ):filteredConvs.map(conv=>{
            const title=getConvTitle(conv)
            const isActive=conv.id===activeConvId
            const unread=parseInt(conv.unread_count||0)
            const typeColor=TYPE_COLORS[conv.type]||'#6366F1'

            return (
              <button key={conv.id} onClick={()=>setActiveConvId(conv.id)}
                className={`chat-conv-item${isActive?' active':''}`}
                style={{
                  width:'100%',display:'flex',alignItems:'center',gap:11,
                  padding:'10px 10px',borderRadius:14,
                  border:'none',cursor:'pointer',textAlign:'left',
                  background: isActive?'rgba(99,102,241,0.18)':'transparent',
                  marginBottom:2,fontFamily:'inherit',
                  borderLeft: isActive?`3px solid #6366F1`:'3px solid transparent',
                  transition:'all 0.15s ease',
                }}>
                {/* Conv avatar */}
                <div style={{
                  width:42,height:42,borderRadius:14,flexShrink:0,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,
                  background: isActive?`rgba(${typeColor==='#3B82F6'?'59,130,246':typeColor==='#8B5CF6'?'139,92,246':'245,158,11'},0.25)`:'rgba(255,255,255,0.07)',
                  border:`1.5px solid ${isActive?typeColor+'44':'rgba(255,255,255,0.08)'}`,
                }}>
                  {conv.type==='group'||conv.type==='broadcast'
                    ? TYPE_ICONS[conv.type]
                    : <Avatar name={title} size={38}/>
                  }
                </div>

                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                    <span style={{
                      fontSize:14,fontWeight:isActive?700:600,
                      color:isActive?'#C7D2FE':'rgba(255,255,255,0.85)',
                      overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:130,
                    }}>{title}</span>
                    <span style={{fontSize:10,color:'rgba(255,255,255,0.3)',fontWeight:500,flexShrink:0,marginLeft:4}}>
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div style={{
                    fontSize:12,color:'rgba(255,255,255,0.35)',
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                    fontWeight: unread>0?600:400,
                    color: unread>0?'rgba(165,180,252,0.7)':'rgba(255,255,255,0.3)',
                  }}>
                    {conv.last_file_name?`📎 ${conv.last_file_name}`:conv.last_message||'No messages yet'}
                  </div>
                </div>

                {unread>0&&(
                  <div style={{
                    width:20,height:20,borderRadius:'50%',flexShrink:0,
                    background:'linear-gradient(135deg,#6366F1,#4F46E5)',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:10,color:'#fff',fontWeight:800,
                    boxShadow:'0 2px 8px rgba(99,102,241,0.5)',
                  }}>{unread>9?'9+':unread}</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Sidebar footer — user info */}
        <div style={{
          padding:'12px 16px',borderTop:'1px solid rgba(255,255,255,0.07)',
          display:'flex',alignItems:'center',gap:10,
        }}>
          <Avatar name={user?.name} size={34}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name}</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',textTransform:'capitalize',fontWeight:500,marginTop:1}}>
              {user?.role_name||'Agent'} · Online
            </div>
          </div>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#22C55E',
            boxShadow:'0 0 8px rgba(34,197,94,0.6)'}}/>
        </div>
      </div>

      {/* ── CHAT AREA ── */}
      {activeConvId ? (
        <div style={{flex:1,display:'flex',flexDirection:'column',background:'#F6F7FB'}}>

          {/* Chat header */}
          <div style={{
            display:'flex',alignItems:'center',gap:14,
            padding:'14px 24px',
            background:'#fff',
            borderBottom:'1.5px solid #F0F0F5',
            boxShadow:'0 2px 8px rgba(0,0,0,0.04)',
          }}>
            {activeConv?.type==='group'||activeConv?.type==='broadcast' ? (
              <div style={{
                width:42,height:42,borderRadius:14,flexShrink:0,
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,
                background: activeConv.type==='broadcast'?'#FEF3C7':'#EDE9FE',
              }}>{TYPE_ICONS[activeConv?.type]}</div>
            ) : (
              <Avatar name={activeConv?getConvTitle(activeConv):''} size={42}/>
            )}

            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:800,color:'#111827',letterSpacing:-0.3}}>
                {activeConv?getConvTitle(activeConv):'Chat'}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'#22C55E'}}/>
                <span style={{fontSize:12,color:'#6B7280',fontWeight:500}}>
                  {TYPE_LABELS[activeConv?.type]} · {(activeConv?.members||[]).length} members
                </span>
              </div>
            </div>

            {/* Header actions */}
            <div style={{display:'flex',gap:8}}>
              {[{icon:'📞',tip:'Call'},{icon:'🔍',tip:'Search'}].map(({icon,tip})=>(
                <button key={tip} title={tip} style={{
                  width:36,height:36,borderRadius:10,border:'1.5px solid #E5E7EB',
                  background:'#F9FAFB',cursor:'pointer',fontSize:16,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  transition:'all 0.15s ease',fontFamily:'inherit',
                }}
                onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'}
                onMouseLeave={e=>e.currentTarget.style.background='#F9FAFB'}>{icon}</button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="chat-msg-scrollbar" style={{
            flex:1,overflowY:'auto',padding:'20px 24px',
            display:'flex',flexDirection:'column',
          }}>
            {messages.length===0?(
              <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'#9CA3AF'}}>
                <div style={{fontSize:56,marginBottom:12}}>👋</div>
                <div style={{fontSize:15,fontWeight:700,color:'#374151',marginBottom:4}}>Say hello!</div>
                <div style={{fontSize:13}}>No messages in this conversation yet.</div>
              </div>
            ):(
              groupedMessages.map((item,i)=>{
                if (item.type==='divider') return (
                  <div key={`div-${i}`} style={{
                    display:'flex',alignItems:'center',gap:12,margin:'14px 0',
                  }}>
                    <div style={{flex:1,height:1,background:'#E8ECF4'}}/>
                    <span style={{
                      fontSize:11,fontWeight:700,color:'#9CA3AF',
                      background:'#EEF0F6',padding:'3px 12px',borderRadius:20,
                      whiteSpace:'nowrap',
                    }}>{formatDateDivider(item.date)}</span>
                    <div style={{flex:1,height:1,background:'#E8ECF4'}}/>
                  </div>
                )
                const msg=item.msg
                const isMine=msg.sender_id===user?.id
                const showName=!isMine&&(i===0||groupedMessages[i-1]?.msg?.sender_id!==msg.sender_id)
                return (
                  <MessageBubble key={msg.id} msg={msg} isMine={isMine}
                    showName={showName&&activeConv?.type!=='direct'} onDelete={handleDelete}/>
                )
              })
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* File preview bar */}
          {file&&(
            <div style={{
              padding:'10px 24px',borderTop:'1.5px solid #E8ECF4',
              display:'flex',alignItems:'center',gap:12,background:'#EEF2FF',
            }}>
              <span style={{fontSize:22}}>{fileIcon(file.name)}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</div>
                <div style={{fontSize:11,color:'#6B7280',marginTop:1}}>{fmtSize(file.size)}</div>
              </div>
              <button onClick={()=>{setFile(null);if(fileInputRef.current)fileInputRef.current.value=''}}
                style={{width:24,height:24,borderRadius:'50%',border:'none',background:'#C7D2FE',
                  color:'#4338CA',cursor:'pointer',fontSize:12,fontFamily:'inherit',
                  display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800}}>✕</button>
            </div>
          )}

          {/* Input area */}
          <div style={{
            padding:'14px 20px',borderTop:'1.5px solid #E8ECF4',background:'#fff',
          }}>
            <div style={{
              display:'flex',alignItems:'flex-end',gap:10,
              background:'#F6F7FB',borderRadius:18,padding:'8px 8px 8px 14px',
              border:'2px solid #E8ECF4',transition:'border-color 0.2s',
            }}
            onFocusCapture={e=>e.currentTarget.style.borderColor='#6366F1'}
            onBlurCapture={e=>e.currentTarget.style.borderColor='#E8ECF4'}>

              {/* Attach */}
              <label style={{
                width:34,height:34,borderRadius:10,background:'transparent',
                display:'flex',alignItems:'center',justifyContent:'center',
                cursor:'pointer',fontSize:18,flexShrink:0,marginBottom:1,
                transition:'background 0.15s',
              }}
              onMouseEnter={e=>e.currentTarget.style.background='#EEF2FF'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                📎
                <input ref={fileInputRef} type="file"
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv"
                  style={{display:'none'}} onChange={e=>setFile(e.target.files?.[0]||null)}/>
              </label>

              {/* Text input */}
              <textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                rows={1} style={{
                  flex:1,resize:'none',border:'none',background:'transparent',
                  fontSize:14,color:'#111827',fontFamily:'inherit',lineHeight:1.5,
                  minHeight:34,maxHeight:120,padding:'6px 0',outline:'none',
                }}/>

              {/* Send */}
              <button onClick={handleSend}
                disabled={sending||(!text.trim()&&!file)}
                className="chat-send-btn"
                style={{
                  width:38,height:38,borderRadius:12,border:'none',
                  flexShrink:0,cursor:'pointer',fontSize:16,marginBottom:1,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  background: (text.trim()||file)&&!sending
                    ? 'linear-gradient(135deg,#6366F1,#4F46E5)'
                    : '#E5E7EB',
                  color: (text.trim()||file)&&!sending ? '#fff' : '#9CA3AF',
                  boxShadow: (text.trim()||file)&&!sending ? '0 4px 14px rgba(99,102,241,0.38)' : 'none',
                  transition:'all 0.2s ease',
                }}>
                {sending?'…':'➤'}
              </button>
            </div>
          </div>
        </div>
      ):(
        /* Empty state */
        <div style={{
          flex:1,display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',
          background:'linear-gradient(135deg,#F8FAFF,#F0F0FF)',
        }}>
          <div style={{
            width:96,height:96,borderRadius:28,
            background:'linear-gradient(135deg,#6366F1,#4F46E5)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:44,marginBottom:20,
            boxShadow:'0 16px 48px rgba(99,102,241,0.35)',
          }}>💬</div>
          <div style={{fontSize:22,fontWeight:800,color:'#111827',letterSpacing:-0.5,marginBottom:8}}>
            Your Messages
          </div>
          <div style={{fontSize:14,color:'#6B7280',marginBottom:24,textAlign:'center',maxWidth:260,lineHeight:1.6}}>
            Select a conversation from the sidebar or start a new one
          </div>
          <button onClick={()=>setShowNew(true)} className="chat-action-btn" style={{
            padding:'12px 28px',borderRadius:16,border:'none',cursor:'pointer',
            background:'linear-gradient(135deg,#6366F1,#4F46E5)',
            color:'#fff',fontSize:14,fontWeight:800,fontFamily:'inherit',
            boxShadow:'0 8px 24px rgba(99,102,241,0.38)',
          }}>+ New Message</button>
        </div>
      )}

      {showNew&&(
        <NewChatModal isAdmin={isAdmin} onClose={()=>setShowNew(false)}
          onCreated={(id)=>{ setActiveConvId(id); loadConversations() }}/>
      )}
    </div>
  )
}
