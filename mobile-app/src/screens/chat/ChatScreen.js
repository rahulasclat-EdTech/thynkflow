// mobile-app/src/screens/chat/ChatScreen.js
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
  ActivityIndicator, Modal, ScrollView, Linking
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import COLORS from '../../utils/colors'

const BASE = 'https://thynkflow.onrender.com'

const TYPE_ICON  = { direct: '💬', group: '👥', broadcast: '📢' }
const FILE_ICONS = { pdf:'📄', xlsx:'📊', xls:'📊', docx:'📝', doc:'📝', csv:'📊', txt:'📃' }

function fileIcon(name) {
  const ext = (name||'').split('.').pop()?.toLowerCase()
  return FILE_ICONS[ext] || '📎'
}
function isImage(type) { return type?.startsWith('image/') }
function fmtSize(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB'
  return (b/1048576).toFixed(1) + ' MB'
}
function fmtTime(d) {
  if (!d) return ''
  const date = new Date(d), now = new Date(), diff = now - date
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return Math.floor(diff/60000) + 'm ago'
  if (diff < 86400000) return date.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
  return date.toLocaleDateString('en-IN', { day:'numeric', month:'short' })
}
function fmtMsgTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
}

// ── New Chat Modal ────────────────────────────────────────
function NewChatModal({ visible, onClose, onCreated, isAdmin }) {
  const [mode, setMode]       = useState('direct')
  const [users, setUsers]     = useState([])
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState([])
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible) {
      setUsers([]) // clear previous
      api.get('/chat/users')
        .then(r => {
          const list = r.data?.data || r.data || []
          setUsers(Array.isArray(list) ? list : [])
        })
        .catch(err => {
          console.log('Chat users error:', err.message)
          setUsers([])
        })
    }
  }, [visible])

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()))

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])

  const handleCreate = async () => {
    setLoading(true)
    try {
      if (mode === 'direct') {
        if (!selected.length) return Alert.alert('Select a user')
        const r = await api.post('/chat/conversations/direct', { target_user_id: selected[0] })
        onCreated(r.data.data.id); onClose()
      } else if (mode === 'group') {
        if (!groupName.trim()) return Alert.alert('Enter group name')
        if (!selected.length)  return Alert.alert('Add at least 1 member')
        const r = await api.post('/chat/conversations/group', { name: groupName, member_ids: selected })
        onCreated(r.data.data.id); onClose()
      } else {
        const r = await api.post('/chat/conversations/broadcast', {})
        onCreated(r.data.data.id); onClose()
      }
    } catch (e) { Alert.alert('Error', e.message||'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'#fff' }}>
        <View style={nc.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#374151" /></TouchableOpacity>
          <Text style={nc.title}>New Conversation</Text>
          <TouchableOpacity onPress={handleCreate} disabled={loading} style={nc.createBtn}>
            <Text style={{ color:'#fff', fontWeight:'700' }}>{loading ? '…' : 'Create'}</Text>
          </TouchableOpacity>
        </View>

        {/* Mode selector */}
        <View style={nc.modeRow}>
          {[['direct','💬 Direct'],['group','👥 Group'],isAdmin&&['broadcast','📢 Broadcast']].filter(Boolean).map(([k,l]) => (
            <TouchableOpacity key={k} onPress={() => { setMode(k); setSelected([]) }}
              style={[nc.modeBtn, mode===k && nc.modeBtnActive]}>
              <Text style={[nc.modeTxt, mode===k && { color:'#fff' }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding:16, gap:12 }}>
          {mode === 'broadcast' ? (
            <View style={nc.infoBox}>
              <Text style={nc.infoTxt}>📢 This will create a broadcast visible to ALL active users.</Text>
            </View>
          ) : (
            <>
              {mode === 'group' && (
                <TextInput value={groupName} onChangeText={setGroupName}
                  placeholder="Group name e.g. Sales Team"
                  style={nc.inp} placeholderTextColor="#9CA3AF" />
              )}
              <TextInput value={search} onChangeText={setSearch}
                placeholder="Search users…" style={nc.inp} placeholderTextColor="#9CA3AF" />
              {filtered.length === 0 ? (
                <View style={{ padding:20, alignItems:'center' }}>
                  <Text style={{ color:'#9CA3AF', fontSize:14 }}>
                    {users.length === 0 ? 'Loading users…' : 'No users found'}
                  </Text>
                </View>
              ) : filtered.map(u => {
                const sel = mode === 'direct' ? selected[0] === u.id : selected.includes(u.id)
                return (
                  <TouchableOpacity key={u.id} onPress={() => mode==='direct'?setSelected([u.id]):toggle(u.id)}
                    style={[nc.userRow, sel && nc.userRowSel]}>
                    <View style={nc.avatar}><Text style={{ color:'#fff', fontWeight:'700' }}>{u.name?.[0]?.toUpperCase()}</Text></View>
                    <View style={{ flex:1 }}>
                      <Text style={{ fontSize:14, fontWeight:'600', color:'#111827' }}>{u.name}</Text>
                      <Text style={{ fontSize:12, color:'#6B7280', textTransform:'capitalize' }}>{u.role_name}</Text>
                    </View>
                    {sel && <Ionicons name="checkmark-circle" size={20} color="#4F46E5" />}
                  </TouchableOpacity>
                )
              })}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

// ── Message bubble ────────────────────────────────────────
function Bubble({ msg, isMine, showName, onDelete }) {
  return (
    <View style={[b.wrap, isMine && b.wrapMine]}>
      {!isMine && (
        <View style={b.avatar}>
          <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }}>{msg.sender_name?.[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={{ maxWidth:'75%' }}>
        {showName && !isMine && <Text style={b.senderName}>{msg.sender_name}</Text>}
        <View style={[b.bubble, isMine ? b.bubbleMine : b.bubbleTheirs]}>
          {/* File */}
          {msg.file_url && (
            <TouchableOpacity style={[b.filePill, isMine && b.filePillMine]}
              onPress={() => Linking.openURL(`${BASE}${msg.file_url}`)}>
              <Text style={{ fontSize:22 }}>{fileIcon(msg.file_name)}</Text>
              <View style={{ flex:1 }}>
                <Text style={[b.fileName, isMine && { color:'#fff' }]} numberOfLines={1}>{msg.file_name}</Text>
                <Text style={[b.fileSize, isMine && { color:'rgba(255,255,255,0.7)' }]}>{fmtSize(msg.file_size)} · tap to open</Text>
              </View>
            </TouchableOpacity>
          )}
          {msg.message && <Text style={[b.text, isMine && b.textMine]}>{msg.message}</Text>}
        </View>
        <View style={[b.meta, isMine && b.metaMine]}>
          <Text style={b.time}>{fmtMsgTime(msg.created_at)}</Text>
          {isMine && (
            <TouchableOpacity onPress={() => Alert.alert('Delete?','Remove this message?',[
              { text:'Cancel' }, { text:'Delete', style:'destructive', onPress:()=>onDelete(msg.id) }
            ])}>
              <Text style={[b.time, { color:'#EF4444', marginLeft:8 }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

// ══════════════════════════════════════════════════════════
//  CHAT LIST SCREEN
// ══════════════════════════════════════════════════════════
function ChatListScreen({ navigation }) {
  const { user } = useAuth()
  const isAdmin  = user?.role_name === 'admin'
  const [convs, setConvs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const pollRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/chat/conversations')
      setConvs(r.data?.data || [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    pollRef.current = setInterval(load, 10000)
    return () => clearInterval(pollRef.current)
  }, [load])

  const getTitle = (conv) => {
    if (conv.type !== 'direct') return conv.name || TYPE_ICON[conv.type] + ' Chat'
    const other = (conv.members||[]).find(m => m.id !== user?.id)
    return other?.name || 'Chat'
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>💬 Messages</Text>
        <TouchableOpacity style={s.newBtn} onPress={() => setShowNew(true)}>
          <Ionicons name="create-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : convs.length === 0 ? (
        <View style={s.center}>
          <Text style={{ fontSize:48 }}>💬</Text>
          <Text style={{ color:'#6B7280', marginTop:8 }}>No conversations yet</Text>
          <TouchableOpacity style={s.startBtn} onPress={() => setShowNew(true)}>
            <Text style={{ color:'#fff', fontWeight:'700' }}>Start a conversation</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList data={convs} keyExtractor={item => String(item.id)}
          renderItem={({ item }) => {
            const title  = getTitle(item)
            const unread = parseInt(item.unread_count || 0)
            return (
              <TouchableOpacity style={s.convRow}
                onPress={() => navigation.navigate('ChatRoom', { conv: item, title })}>
                <View style={[s.convIcon, {
                  backgroundColor: item.type==='broadcast' ? '#FEF3C7' : item.type==='group' ? '#EDE9FE' : '#DBEAFE'
                }]}>
                  <Text style={{ fontSize:20 }}>{TYPE_ICON[item.type]}</Text>
                </View>
                <View style={{ flex:1 }}>
                  <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                    <Text style={[s.convTitle, unread > 0 && { fontWeight:'800' }]} numberOfLines={1}>{title}</Text>
                    <Text style={s.convTime}>{fmtTime(item.last_message_at)}</Text>
                  </View>
                  <Text style={[s.convLast, unread > 0 && { color:'#374151', fontWeight:'600' }]} numberOfLines={1}>
                    {item.last_sender_name ? `${item.last_sender_name}: ` : ''}
                    {item.last_file_name ? `📎 ${item.last_file_name}` : item.last_message || 'No messages yet'}
                  </Text>
                </View>
                {unread > 0 && (
                  <View style={s.unreadBadge}>
                    <Text style={s.unreadText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          }}
          contentContainerStyle={{ paddingBottom: 80 }} />
      )}

      <NewChatModal visible={showNew} isAdmin={isAdmin}
        onClose={() => setShowNew(false)}
        onCreated={(id) => { setShowNew(false); load(); navigation.navigate('ChatRoom', { conv: { id }, title: 'Chat' }) }} />
    </View>
  )
}

// ══════════════════════════════════════════════════════════
//  CHAT ROOM SCREEN
// ══════════════════════════════════════════════════════════
function ChatRoomScreen({ route, navigation }) {
  const { conv, title } = route.params || {}
  const { user } = useAuth()
  const [messages, setMessages]   = useState([])
  const [text, setText]           = useState('')
  const [sending, setSending]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const flatListRef = useRef(null)
  const pollRef     = useRef(null)
  const lastTime    = useRef(null)

  const loadMessages = useCallback(async () => {
    try {
      const r = await api.get(`/chat/conversations/${conv.id}/messages`)
      const msgs = r.data?.data || []
      setMessages(msgs)
      if (msgs.length) lastTime.current = msgs[msgs.length-1].created_at
    } catch {}
    finally { setLoading(false) }
  }, [conv.id])

  useEffect(() => {
    navigation.setOptions({ title })
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const params = lastTime.current ? `?since=${encodeURIComponent(lastTime.current)}` : ''
        const r = await api.get(`/chat/conversations/${conv.id}/messages${params}`)
        const newMsgs = r.data?.data || []
        if (newMsgs.length) {
          setMessages(prev => [...prev, ...newMsgs])
          lastTime.current = newMsgs[newMsgs.length-1].created_at
        }
      } catch {}
    }, 10000)
    return () => clearInterval(pollRef.current)
  }, [conv.id])

  const handleSend = async (fileObj = null) => {
    if (!text.trim() && !fileObj) return
    setSending(true)
    try {
      const formData = new FormData()
      if (text.trim()) formData.append('message', text.trim())
      if (fileObj) {
        formData.append('file', {
          uri:  fileObj.uri,
          name: fileObj.name || 'file',
          type: fileObj.mimeType || 'application/octet-stream',
        })
      }
      const r = await api.post(`/chat/conversations/${conv.id}/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const msg = r.data?.data
      if (msg) {
        setMessages(prev => [...prev, msg])
        lastTime.current = msg.created_at
      }
      setText('')
    } catch (e) { Alert.alert('Error', e.message || 'Failed to send') }
    finally { setSending(false) }
  }

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf','application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'text/plain','text/csv'],
        copyToCacheDirectory: true,
      })
      if (!result.canceled && result.assets?.[0]) handleSend(result.assets[0])
    } catch (e) { Alert.alert('Error', 'Could not pick file') }
  }

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo library access')
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      })
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0]
        handleSend({ uri: asset.uri, name: asset.fileName || 'image.jpg', mimeType: asset.type || 'image/jpeg' })
      }
    } catch { Alert.alert('Error', 'Could not pick image') }
  }

  const handleDelete = async (msgId) => {
    try {
      await api.delete(`/chat/messages/${msgId}`)
      setMessages(prev => prev.filter(m => m.id !== msgId))
    } catch { Alert.alert('Error', 'Could not delete') }
  }

  useEffect(() => {
    if (messages.length) setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }, [messages.length])

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={{ flex:1, backgroundColor:'#F9FAFB' }}>
        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        ) : (
          <FlatList ref={flatListRef} data={messages} keyExtractor={item => String(item.id)}
            contentContainerStyle={{ padding:14, paddingBottom:16 }}
            ListEmptyComponent={
              <View style={[s.center, { paddingTop:60 }]}>
                <Text style={{ fontSize:40 }}>👋</Text>
                <Text style={{ color:'#9CA3AF', marginTop:8 }}>No messages yet. Say hello!</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const isMine   = item.sender_id === user?.id
              const showName = !isMine && (index === 0 || messages[index-1]?.sender_id !== item.sender_id)
              return <Bubble msg={item} isMine={isMine} showName={showName} onDelete={handleDelete} />
            }} />
        )}

        {/* Input bar */}
        <View style={inp.bar}>
          <TouchableOpacity style={inp.iconBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={inp.iconBtn} onPress={pickDocument}>
            <Ionicons name="attach-outline" size={22} color="#6B7280" />
          </TouchableOpacity>
          <TextInput value={text} onChangeText={setText}
            placeholder="Type a message…" placeholderTextColor="#9CA3AF"
            multiline style={inp.input}
            onSubmitEditing={() => handleSend()} blurOnSubmit={false} />
          <TouchableOpacity style={[inp.sendBtn, (!text.trim() || sending) && { opacity:0.4 }]}
            onPress={() => handleSend()} disabled={!text.trim() || sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

// ── Navigator export ──────────────────────────────────────
import { createNativeStackNavigator } from '@react-navigation/native-stack'
const Stack = createNativeStackNavigator()

export default function ChatNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true, headerTintColor: '#4F46E5',
      headerStyle: { backgroundColor: '#fff' }, headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="ChatList" component={ChatListScreen} options={{ title: '💬 Messages', headerShown: false }} />
      <Stack.Screen name="ChatRoom" component={ChatRoomScreen} />
    </Stack.Navigator>
  )
}

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {flex:1,backgroundColor:'#F9FAFB'},
  center:    {flex:1,alignItems:'center',justifyContent:'center',padding:32},
  header:    {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  title:     {fontSize:22,fontWeight:'800',color:'#111827'},
  newBtn:    {width:38,height:38,borderRadius:19,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center'},
  startBtn:  {marginTop:16,backgroundColor:'#4F46E5',paddingHorizontal:20,paddingVertical:10,borderRadius:12},
  convRow:   {flexDirection:'row',alignItems:'center',gap:12,padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#F3F4F6'},
  convIcon:  {width:46,height:46,borderRadius:23,alignItems:'center',justifyContent:'center'},
  convTitle: {fontSize:15,fontWeight:'700',color:'#111827'},
  convLast:  {fontSize:13,color:'#9CA3AF',marginTop:2},
  convTime:  {fontSize:11,color:'#9CA3AF'},
  unreadBadge:{width:22,height:22,borderRadius:11,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center',marginLeft:8},
  unreadText:{color:'#fff',fontSize:11,fontWeight:'700'},
})
const nc = StyleSheet.create({
  header:   {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  title:    {fontSize:17,fontWeight:'700',color:'#111827'},
  createBtn:{backgroundColor:'#4F46E5',paddingHorizontal:16,paddingVertical:7,borderRadius:10},
  modeRow:  {flexDirection:'row',gap:8,padding:12,flexWrap:'wrap'},
  modeBtn:  {paddingHorizontal:14,paddingVertical:7,borderRadius:20,backgroundColor:'#F3F4F6'},
  modeBtnActive:{backgroundColor:'#4F46E5'},
  modeTxt:  {fontSize:13,fontWeight:'600',color:'#374151'},
  inp:      {backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:'#111827',marginBottom:4},
  userRow:  {flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:'#F9FAFB',borderRadius:12},
  userRowSel:{backgroundColor:'#EEF2FF',borderWidth:1,borderColor:'#C7D2FE'},
  avatar:   {width:36,height:36,borderRadius:18,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center'},
  infoBox:  {backgroundColor:'#FEF3C7',borderRadius:12,padding:12},
  infoTxt:  {fontSize:13,color:'#92400E'},
})
const b = StyleSheet.create({
  wrap:       {flexDirection:'row',alignItems:'flex-end',gap:8,marginBottom:8},
  wrapMine:   {flexDirection:'row-reverse'},
  avatar:     {width:28,height:28,borderRadius:14,backgroundColor:'#9CA3AF',alignItems:'center',justifyContent:'center',marginBottom:16},
  senderName: {fontSize:11,fontWeight:'600',color:'#6B7280',marginBottom:2,marginLeft:2},
  bubble:     {borderRadius:18,paddingHorizontal:14,paddingVertical:10,maxWidth:'100%'},
  bubbleMine: {backgroundColor:'#4F46E5',borderBottomRightRadius:4},
  bubbleTheirs:{backgroundColor:'#fff',borderBottomLeftRadius:4,borderWidth:1,borderColor:'#E5E7EB'},
  text:       {fontSize:14,color:'#111827',lineHeight:20},
  textMine:   {color:'#fff'},
  filePill:   {flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'rgba(0,0,0,0.06)',borderRadius:10,padding:10,marginBottom:4},
  filePillMine:{backgroundColor:'rgba(255,255,255,0.15)'},
  fileName:   {fontSize:13,fontWeight:'600',color:'#111827'},
  fileSize:   {fontSize:11,color:'#6B7280',marginTop:1},
  meta:       {flexDirection:'row',alignItems:'center',marginTop:2,marginLeft:2},
  metaMine:   {justifyContent:'flex-end',marginRight:2},
  time:       {fontSize:10,color:'#9CA3AF'},
})
const inp = StyleSheet.create({
  bar:     {flexDirection:'row',alignItems:'flex-end',gap:8,paddingHorizontal:12,paddingVertical:10,backgroundColor:'#fff',borderTopWidth:1,borderTopColor:'#E5E7EB'},
  iconBtn: {width:38,height:38,borderRadius:19,backgroundColor:'#F3F4F6',alignItems:'center',justifyContent:'center'},
  input:   {flex:1,backgroundColor:'#F3F4F6',borderRadius:20,paddingHorizontal:14,paddingVertical:10,fontSize:14,color:'#111827',maxHeight:100},
  sendBtn: {width:38,height:38,borderRadius:19,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center'},
})
