// web-admin/src/pages/ChatPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const BASE = import.meta.env.VITE_API_URL || 'https://thynkflow.onrender.com'

const TYPE_ICONS  = { direct: '💬', group: '👥', broadcast: '📢' }
const TYPE_LABELS = { direct: 'Direct', group: 'Group', broadcast: 'Broadcast' }
const FILE_ICONS  = { pdf: '📄', xlsx: '📊', xls: '📊', docx: '📝', doc: '📝',
                      csv: '📊', txt: '📃', jpg: '🖼', jpeg: '🖼', png: '🖼',
                      gif: '🖼', webp: '🖼' }

function fileIcon(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase()
  return FILE_ICONS[ext] || '📎'
}

function isImage(type) {
  return type?.startsWith('image/')
}

function formatTime(d) {
  if (!d) return ''
  const date = new Date(d)
  const now  = new Date()
  const diff = now - date
  if (diff < 60000)         return 'just now'
  if (diff < 3600000)       return Math.floor(diff/60000) + 'm ago'
  if (diff < 86400000)      return date.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
  return date.toLocaleDateString('en-IN', { day:'numeric', month:'short' })
}

function formatMsgTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/1048576).toFixed(1) + ' MB'
}

// ── New Conversation Modal ────────────────────────────────
function NewChatModal({ onClose, onCreated, isAdmin }) {
  const [mode, setMode]       = useState('direct') // direct | group | broadcast
  const [users, setUsers]     = useState([])
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState([])
  const [groupName, setGroupName] = useState('')
  const [bcastName, setBcastName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setUsers([])
    api.get('/chat/users')
      .then(r => {
        const list = r.data?.data || r.data || []
        setUsers(Array.isArray(list) ? list : [])
      })
      .catch(() => setUsers([]))
  }, [])

  const filtered = users.filter(u =>
    (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handleCreate = async () => {
    setLoading(true)
    try {
      if (mode === 'direct') {
        if (!selected.length) return toast.error('Select a user')
        const res = await api.post('/chat/conversations/direct', { target_user_id: selected[0] })
        onCreated(res.data.data.id)
      } else if (mode === 'group') {
        if (!groupName.trim()) return toast.error('Enter group name')
        if (!selected.length) return toast.error('Add at least 1 member')
        const res = await api.post('/chat/conversations/group', { name: groupName, member_ids: selected })
        onCreated(res.data.data.id)
      } else {
        const res = await api.post('/chat/conversations/broadcast', { name: bcastName })
        onCreated(res.data.data.id)
      }
      onClose()
    } catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">New Conversation</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2 p-4 border-b border-slate-100">
          {[['direct','💬 Direct'],['group','👥 Group'],isAdmin && ['broadcast','📢 Broadcast']].filter(Boolean).map(([key, label]) => (
            <button key={key} onClick={() => { setMode(key); setSelected([]) }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${mode === key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'broadcast' ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">📢 This will create a broadcast conversation visible to ALL active users.</p>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Broadcast Name (optional)</label>
                <input value={bcastName} onChange={e => setBcastName(e.target.value)}
                  placeholder={`Broadcast — ${new Date().toLocaleDateString('en-IN')}`}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {mode === 'group' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Group Name *</label>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)}
                    placeholder="e.g. Sales Team, North Zone"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search users…"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {users.length === 0 ? (
                  <div className="text-center py-6 text-slate-400">
                    <p className="text-sm">Loading users…</p>
                    <p className="text-xs mt-1">If this persists, check your connection</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">No users match your search</div>
                ) : null}
                {filtered.map(u => (
                  <button key={u.id} onClick={() => mode === 'direct' ? setSelected([u.id]) : toggle(u.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${(mode === 'direct' ? selected[0] === u.id : selected.includes(u.id)) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'}`}>
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {u.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{u.role_name}</p>
                    </div>
                    {(mode === 'direct' ? selected[0] === u.id : selected.includes(u.id)) && (
                      <span className="text-blue-600 text-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50">Cancel</button>
          <button onClick={handleCreate} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {loading ? 'Creating…' : 'Start Chat'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────
function MessageBubble({ msg, isMine, showName, onDelete }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div className={`flex gap-2 mb-3 group ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 flex-shrink-0 mt-1">
          {msg.sender_name?.[0]?.toUpperCase()}
        </div>
      )}
      <div className={`max-w-[72%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
        {showName && !isMine && (
          <span className="text-xs font-semibold text-slate-500 mb-1 ml-1">{msg.sender_name}</span>
        )}
        <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${isMine ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white text-slate-800 rounded-tl-sm border border-slate-100'}`}>
          {/* File attachment */}
          {msg.file_url && (
            <div className="mb-2">
              {isImage(msg.file_type) ? (
                <a href={`${BASE}${msg.file_url}`} target="_blank" rel="noreferrer">
                  <img src={`${BASE}${msg.file_url}`} alt={msg.file_name}
                    className="max-w-full rounded-xl max-h-48 object-cover cursor-pointer hover:opacity-90" />
                </a>
              ) : (
                <a href={`${BASE}${msg.file_url}`} target="_blank" rel="noreferrer"
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isMine ? 'bg-blue-500 hover:bg-blue-400' : 'bg-slate-50 hover:bg-slate-100'} transition-colors`}>
                  <span className="text-xl">{fileIcon(msg.file_name)}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${isMine ? 'text-white' : 'text-slate-700'}`}>{msg.file_name}</p>
                    <p className={`text-xs ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>{fmtSize(msg.file_size)}</p>
                  </div>
                  <span className={`text-xs ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>↓</span>
                </a>
              )}
            </div>
          )}
          {msg.message && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>}
        </div>
        <div className={`flex items-center gap-1.5 mt-0.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-xs text-slate-400">{formatMsgTime(msg.created_at)}</span>
          {isMine && hovered && (
            <button onClick={() => onDelete(msg.id)}
              className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
//  MAIN CHAT PAGE
// ══════════════════════════════════════════════════════════
export default function ChatPage() {
  const { user } = useAuth()
  const isAdmin  = user?.role_name === 'admin'

  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId]   = useState(null)
  const [messages, setMessages]           = useState([])
  const [text, setText]                   = useState('')
  const [file, setFile]                   = useState(null)
  const [sending, setSending]             = useState(false)
  const [showNew, setShowNew]             = useState(false)
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(true)

  const messagesEndRef  = useRef(null)
  const fileInputRef    = useRef(null)
  const lastMsgTime     = useRef(null)
  const pollRef         = useRef(null)

  // ── Load conversations ──────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get('/chat/conversations')
      setConversations(res.data?.data || [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Load messages when conversation changes ─────────────
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return
    try {
      const res = await api.get(`/chat/conversations/${convId}/messages`)
      const msgs = res.data?.data || []
      setMessages(msgs)
      if (msgs.length) lastMsgTime.current = msgs[msgs.length - 1].created_at
      else lastMsgTime.current = null
    } catch {}
  }, [])

  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId)
    }
  }, [activeConvId, loadMessages])

  // ── Poll every 10 seconds ───────────────────────────────
  useEffect(() => {
    if (!activeConvId) return
    pollRef.current = setInterval(async () => {
      try {
        const params = lastMsgTime.current ? `?since=${encodeURIComponent(lastMsgTime.current)}` : ''
        const res = await api.get(`/chat/conversations/${activeConvId}/messages${params}`)
        const newMsgs = res.data?.data || []
        if (newMsgs.length) {
          setMessages(prev => [...prev, ...newMsgs])
          lastMsgTime.current = newMsgs[newMsgs.length - 1].created_at
        }
        // Refresh conversation list for unread counts
        loadConversations()
      } catch {}
    }, 10000)
    return () => clearInterval(pollRef.current)
  }, [activeConvId, loadConversations])

  // ── Auto scroll to bottom ───────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ────────────────────────────────────────
  const handleSend = async () => {
    if (!text.trim() && !file) return
    if (!activeConvId) return
    setSending(true)
    try {
      const formData = new FormData()
      if (text.trim()) formData.append('message', text.trim())
      if (file) formData.append('file', file)

      const res = await api.post(`/chat/conversations/${activeConvId}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const newMsg = res.data?.data
      if (newMsg) {
        setMessages(prev => [...prev, newMsg])
        lastMsgTime.current = newMsg.created_at
      }
      setText('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadConversations()
    } catch (err) { toast.error(err.message || 'Failed to send') }
    finally { setSending(false) }
  }

  const handleDelete = async (msgId) => {
    try {
      await api.delete(`/chat/messages/${msgId}`)
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch { toast.error('Could not delete') }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const activeConv = conversations.find(c => c.id === activeConvId)

  const getConvTitle = (conv) => {
    if (conv.type === 'broadcast') return conv.name || '📢 Broadcast'
    if (conv.type === 'group')     return conv.name || '👥 Group'
    // Direct — show the other person's name
    const members = conv.members || []
    const other = members.find(m => m.id !== user?.id)
    return other?.name || conv.name || 'Chat'
  }

  const filteredConvs = conversations.filter(c =>
    getConvTitle(c).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-[calc(100vh-88px)] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-slate-100 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-slate-800">💬 Messages</h2>
            <button onClick={() => setShowNew(true)}
              className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 transition-colors">
              ✎
            </button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-slate-400 text-sm">Loading…</div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-slate-400">
              <span className="text-4xl mb-2">💬</span>
              <p className="text-sm">No conversations yet</p>
              <button onClick={() => setShowNew(true)} className="mt-3 text-sm text-blue-600 hover:underline">Start one →</button>
            </div>
          ) : filteredConvs.map(conv => {
            const title    = getConvTitle(conv)
            const isActive = conv.id === activeConvId
            const unread   = parseInt(conv.unread_count || 0)
            return (
              <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 ${isActive ? 'bg-blue-50' : ''}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${conv.type === 'broadcast' ? 'bg-orange-100' : conv.type === 'group' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                  {TYPE_ICONS[conv.type]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{title}</p>
                    <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                      {formatTime(conv.last_message_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {conv.last_sender_name && `${conv.last_sender_name}: `}
                    {conv.last_file_name ? `📎 ${conv.last_file_name}` : conv.last_message || 'No messages yet'}
                  </p>
                </div>
                {unread > 0 && (
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 mt-1">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────── */}
      {activeConvId && activeConv ? (
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${activeConv.type === 'broadcast' ? 'bg-orange-100' : activeConv.type === 'group' ? 'bg-purple-100' : 'bg-blue-100'}`}>
              {TYPE_ICONS[activeConv.type]}
            </div>
            <div>
              <p className="font-bold text-slate-800">{getConvTitle(activeConv)}</p>
              <p className="text-xs text-slate-400">
                {TYPE_LABELS[activeConv.type]} ·{' '}
                {(activeConv.members || []).length} members
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 bg-slate-50">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <span className="text-5xl mb-3">👋</span>
                <p className="text-sm">No messages yet. Say hello!</p>
              </div>
            ) : (() => {
              let lastSender = null
              return messages.map((msg, i) => {
                const isMine   = msg.sender_id === user?.id
                const showName = !isMine && (i === 0 || messages[i-1]?.sender_id !== msg.sender_id)
                lastSender = msg.sender_id
                return (
                  <MessageBubble key={msg.id} msg={msg} isMine={isMine}
                    showName={showName && activeConv.type !== 'direct'}
                    onDelete={handleDelete} />
                )
              })
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* File preview */}
          {file && (
            <div className="px-6 py-2 border-t border-slate-100 flex items-center gap-3 bg-blue-50">
              <span className="text-xl">{fileIcon(file.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">{fmtSize(file.size)}</p>
              </div>
              <button onClick={() => { setFile(null); if(fileInputRef.current) fileInputRef.current.value='' }}
                className="text-slate-400 hover:text-red-500">✕</button>
            </div>
          )}

          {/* Input area */}
          <div className="px-6 py-4 border-t border-slate-100 bg-white">
            <div className="flex items-end gap-3">
              {/* File button */}
              <label className="flex-shrink-0 w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors" title="Attach file">
                <span className="text-lg">📎</span>
                <input ref={fileInputRef} type="file"
                  accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.xlsx,.xls,.docx,.doc,.txt,.csv"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>

              {/* Text input */}
              <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                rows={1}
                style={{ resize: 'none', minHeight: '40px', maxHeight: '120px' }}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />

              {/* Send button */}
              <button onClick={handleSend} disabled={sending || (!text.trim() && !file)}
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {sending ? '…' : '➤'}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 ml-12">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400">
          <span className="text-7xl mb-4">💬</span>
          <p className="text-lg font-semibold text-slate-600">Select a conversation</p>
          <p className="text-sm mt-1">Or start a new one</p>
          <button onClick={() => setShowNew(true)}
            className="mt-4 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            + New Message
          </button>
        </div>
      )}

      {showNew && (
        <NewChatModal
          isAdmin={isAdmin}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setActiveConvId(id); loadConversations() }} />
      )}
    </div>
  )
}
