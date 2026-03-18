// mobile-app/src/screens/leads/LeadDetailScreen.js
// Updated with: calendar, voice to text, agent assignment, post-call detection
import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, Linking, Alert, Modal, AppState
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import COLORS from '../../utils/colors'
import CalendarPicker from '../../components/CalendarPicker'

const STATUS_COLORS = {
  new:            { bg: '#DBEAFE', text: '#1E40AF' },
  hot:            { bg: '#FEE2E2', text: '#991B1B' },
  warm:           { bg: '#FFEDD5', text: '#9A3412' },
  cold:           { bg: '#F3F4F6', text: '#374151' },
  converted:      { bg: '#DCFCE7', text: '#166534' },
  not_interested: { bg: '#F3F4F6', text: '#6B7280' },
  call_back:      { bg: '#EDE9FE', text: '#5B21B6' },
}
const ALL_STATUSES = Object.keys(STATUS_COLORS)
const COMM_ICONS   = { call: 'call', whatsapp: 'logo-whatsapp', email: 'mail' }
const COMM_COLORS  = { call: '#16A34A', whatsapp: '#15803D', email: '#1D4ED8' }

function VoiceToTextBtn({ onResult }) {
  const [listening, setListening] = useState(false)

  const handlePress = async () => {
    if (listening) { setListening(false); return }
    try {
      const ExpoSR = require('expo-speech-recognition')
      const { ExpoSpeechRecognitionModule } = ExpoSR
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!perm.granted) { Alert.alert('Permission needed', 'Microphone permission required'); return }
      setListening(true)
      ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: false })
      ExpoSR.useSpeechRecognitionEvent('result', (event) => {
        const text = event.results?.[0]?.transcript || ''
        if (event.isFinal) { onResult(text); setListening(false) }
      })
      ExpoSR.useSpeechRecognitionEvent('error', () => setListening(false))
    } catch {
      Alert.alert('Voice Input', 'Add expo-speech-recognition to enable voice input.\nType manually for now.')
    }
  }

  return (
    <TouchableOpacity onPress={handlePress} style={[s.voiceBtn, listening && s.voiceBtnActive]}>
      <Ionicons name={listening ? 'stop-circle' : 'mic'} size={16} color={listening ? '#fff' : '#4F46E5'} />
      <Text style={[s.voiceBtnText, listening && { color: '#fff' }]}>
        {listening ? 'Listening…' : 'Voice'}
      </Text>
    </TouchableOpacity>
  )
}

export default function LeadDetailScreen({ route, navigation }) {
  const { lead: initialLead } = route.params || {}
  const { user } = useAuth()

  const [lead, setLead]               = useState(initialLead)
  const [products, setProducts]       = useState([])
  const [agents, setAgents]           = useState([])
  const [tab, setTab]                 = useState('info')
  const [editingProduct, setEditingProduct] = useState(false)
  const [productForm, setProductForm] = useState({ product_id: '', product_detail: '' })
  const [savingProduct, setSavingProduct] = useState(false)
  const [commLogs, setCommLogs]       = useState([])
  const [commLoading, setCommLoading] = useState(false)
  const [commNote, setCommNote]       = useState('')
  const [commType, setCommType]       = useState('call')
  const [savingComm, setSavingComm]   = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Post-call detection
  const appState = useRef(AppState.currentState)
  const didCall  = useRef(false)

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (appState.current.match(/inactive|background/) && nextState === 'active' && didCall.current) {
        didCall.current = false
        setTab('comms')
      }
      appState.current = nextState
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    Promise.all([api.get('/products/active'), api.get('/users')]).then(([p, u]) => {
      setProducts(p.data?.data || p.data || [])
      setAgents(Array.isArray(u.data) ? u.data : (u.data?.data || []))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (lead) {
      setProductForm({ product_id: String(lead.product_id || ''), product_detail: lead.product_detail || '' })
      fetchCommLogs()
    }
  }, [lead?.id])

  const fetchCommLogs = async () => {
    if (!lead?.id) return
    setCommLoading(true)
    try {
      const res = await api.get(`/leads/${lead.id}/communications`)
      setCommLogs(res.data?.data || res.data || [])
    } catch {} finally { setCommLoading(false) }
  }

  const updateStatus = async (newStatus) => {
    setUpdatingStatus(true)
    try {
      await api.patch(`/leads/${lead.id}/status`, { status: newStatus })
      setLead(prev => ({ ...prev, status: newStatus }))
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setUpdatingStatus(false) }
  }

  const saveProduct = async () => {
    setSavingProduct(true)
    try {
      await api.patch(`/leads/${lead.id}/product`, productForm)
      setLead(prev => ({ ...prev, ...productForm }))
      setEditingProduct(false)
      Alert.alert('✅', 'Product updated')
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setSavingProduct(false) }
  }

  const logComm = async (type, note = '') => {
    if (!lead?.id) return
    setSavingComm(true)
    try {
      await api.post(`/leads/${lead.id}/communications`, {
        type, direction: 'outbound', note: note || commNote || ''
      })
      setCommNote('')
      if (followUpDate && type === 'call') {
        await api.post('/followups', { lead_id: lead.id, follow_up_date: followUpDate, notes: commNote || '' }).catch(() => {})
        setFollowUpDate('')
      }
      fetchCommLogs()
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setSavingComm(false) }
  }

  const handleCall = async () => {
    const phone = (lead?.phone || '').replace(/\s+/g, '')
    if (!phone) return Alert.alert('No phone number')
    didCall.current = true
    Linking.openURL(`tel:${phone}`)
    await logComm('call', commNote || 'Call from lead detail')
  }

  const handleWhatsApp = async () => {
    const p = (lead?.phone || '').replace(/[^0-9]/g, '')
    if (!p) return Alert.alert('No phone number')
    Linking.openURL(`https://wa.me/${p.startsWith('91') ? p : '91' + p}`)
    await logComm('whatsapp', commNote || 'WhatsApp from lead detail')
  }

  const handleEmail = async () => {
    if (!lead?.email) return Alert.alert('No email')
    Linking.openURL(`mailto:${lead.email}`)
    await logComm('email', commNote || 'Email from lead detail')
  }

  const assignToAgent = async (agentId) => {
    try {
      await api.put(`/leads/${lead.id}`, { ...lead, assigned_to: agentId })
      setLead(prev => ({ ...prev, assigned_to: agentId }))
      const agent = agents.find(a => a.id === agentId)
      Alert.alert('✅', `Lead assigned to ${agent?.name || 'agent'}`)
    } catch (e) { Alert.alert('Error', e.message) }
  }

  if (!lead) return <View style={s.center}><Text>No lead data</Text></View>

  const sc = STATUS_COLORS[lead.status] || STATUS_COLORS.new
  const productName = products.find(p => p.id === parseInt(lead.product_id))?.name

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName} numberOfLines={1}>{lead.name || lead.contact_name}</Text>
          <Text style={s.headerPhone}>{lead.phone}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[s.statusText, { color: sc.text }]}>{lead.status?.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {/* Quick actions */}
      <View style={s.quickBar}>
        <TouchableOpacity style={s.quickBtn} onPress={handleCall}>
          <Ionicons name="call" size={20} color="#16A34A" /><Text style={[s.quickText, { color: '#16A34A' }]}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={handleWhatsApp}>
          <Ionicons name="logo-whatsapp" size={20} color="#15803D" /><Text style={[s.quickText, { color: '#15803D' }]}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={handleEmail}>
          <Ionicons name="mail" size={20} color="#1D4ED8" /><Text style={[s.quickText, { color: '#1D4ED8' }]}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={() => navigation.navigate('PostCall', { lead })}>
          <Ionicons name="create-outline" size={20} color="#7C3AED" /><Text style={[s.quickText, { color: '#7C3AED' }]}>Post-call</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {[['info','Info'],['product','Product'],['comms','Comms'],['assign','Assign']].map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.tab, tab === key && s.tabActive]} onPress={() => setTab(key)}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>

        {/* INFO TAB */}
        {tab === 'info' && (
          <View style={{ gap: 8 }}>
            {[['Email', lead.email||'—'], ['City', lead.city||'—'], ['Source', lead.source||'—'],
              ['Agent', lead.agent_name||'—'], ['Remark', lead.admin_remark||'—']].map(([label, val]) => (
              <View key={label} style={s.infoCard}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{val}</Text>
              </View>
            ))}
            <View style={s.sectionBox}>
              <Text style={s.sectionLabel}>Update Status</Text>
              <View style={s.statusGrid}>
                {ALL_STATUSES.map(st => {
                  const c = STATUS_COLORS[st]; const active = lead.status === st
                  return (
                    <TouchableOpacity key={st} onPress={() => updateStatus(st)}
                      style={[s.statusOption, { backgroundColor: active ? c.text : c.bg }]}>
                      <Text style={[s.statusOptionText, { color: active ? '#fff' : c.text }]}>
                        {st.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </View>
        )}

        {/* PRODUCT TAB */}
        {tab === 'product' && (
          <View>
            {!editingProduct ? (
              <View style={s.productDisplay}>
                <View style={{ flex: 1 }}>
                  <Text style={s.productDisplayLabel}>Assigned Product</Text>
                  {productName
                    ? <><Text style={s.productDisplayName}>{productName}</Text>
                        {lead.product_detail ? <Text style={s.productDisplayDetail}>{lead.product_detail}</Text> : null}</>
                    : <Text style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No product assigned</Text>
                  }
                </View>
                <TouchableOpacity style={s.editProductBtn} onPress={() => setEditingProduct(true)}>
                  <Ionicons name="create-outline" size={16} color="#4F46E5" />
                  <Text style={{ fontSize: 13, color: '#4F46E5', fontWeight: '600' }}>
                    {productName ? 'Update' : 'Assign'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.productForm}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 }}>
                  {productName ? 'Update Product' : 'Assign Product'}
                </Text>
                <View style={{ gap: 6, marginBottom: 10 }}>
                  {products.map(p => (
                    <TouchableOpacity key={p.id}
                      style={[s.productOption, String(productForm.product_id) === String(p.id) && s.productOptionActive]}
                      onPress={() => setProductForm(f => ({...f, product_id: String(p.id)}))}>
                      <Text style={[{ fontSize: 14, fontWeight: '600', color: '#374151' },
                        String(productForm.product_id) === String(p.id) && { color: '#fff' }]}>{p.name}</Text>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{p.type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={productForm.product_detail}
                  onChangeText={t => setProductForm(f => ({...f, product_detail: t}))}
                  placeholder="Product notes…" style={s.input} multiline placeholderTextColor="#9CA3AF" />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity style={[s.saveBtn, { flex: 1 }]} onPress={saveProduct} disabled={savingProduct}>
                    <Text style={s.saveBtnText}>{savingProduct ? 'Saving…' : 'Save'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingProduct(false)}>
                    <Text style={{ fontSize: 14, color: '#374151', fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* COMMS TAB */}
        {tab === 'comms' && (
          <View style={{ gap: 12 }}>
            {/* Note input with voice */}
            <View style={s.sectionBox}>
              <Text style={s.sectionLabel}>Add Note</Text>
              <TextInput value={commNote} onChangeText={setCommNote}
                placeholder="Discussion notes before calling…"
                style={[s.input, { minHeight: 80, textAlignVertical: 'top', marginBottom: 8 }]}
                multiline placeholderTextColor="#9CA3AF" />
              <VoiceToTextBtn onResult={text => setCommNote(prev => prev ? prev + ' ' + text : text)} />
            </View>

            {/* Follow-up date */}
            <View style={s.sectionBox}>
              <Text style={s.sectionLabel}>Schedule Follow-up (optional)</Text>
              <TouchableOpacity onPress={() => setShowCalendar(true)} style={s.dateBtn}>
                <Ionicons name="calendar" size={18} color="#4F46E5" />
                <Text style={[{ flex: 1, fontSize: 14, color: '#9CA3AF' }, followUpDate && { color: '#111827', fontWeight: '600' }]}>
                  {followUpDate || 'Select date'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Action buttons */}
            <View style={s.commBtns}>
              <TouchableOpacity style={[s.commBtn, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]} onPress={handleCall}>
                <Ionicons name="call" size={24} color="#16A34A" />
                <Text style={[s.commBtnText, { color: '#16A34A' }]}>Call Now</Text>
                <Text style={s.commBtnSub}>Opens dialer + logs</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.commBtn, { backgroundColor: '#DCFCE7', borderColor: '#6EE7B7' }]} onPress={handleWhatsApp}>
                <Ionicons name="logo-whatsapp" size={24} color="#15803D" />
                <Text style={[s.commBtnText, { color: '#15803D' }]}>WhatsApp</Text>
                <Text style={s.commBtnSub}>Opens wa.me + logs</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.commBtn, { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' }]} onPress={handleEmail}>
                <Ionicons name="mail" size={24} color="#1D4ED8" />
                <Text style={[s.commBtnText, { color: '#1D4ED8' }]}>Email</Text>
                <Text style={s.commBtnSub}>Opens mail + logs</Text>
              </TouchableOpacity>
            </View>

            {/* Manual log */}
            <View style={s.sectionBox}>
              <Text style={s.sectionLabel}>Manual Log</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {['call','whatsapp','email'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setCommType(t)}
                    style={[s.typeChip, commType === t && { backgroundColor: '#4F46E5' }]}>
                    <Ionicons name={COMM_ICONS[t]} size={14} color={commType === t ? '#fff' : '#374151'} />
                    <Text style={[{ fontSize: 12, fontWeight: '600', textTransform: 'capitalize', color: '#374151' },
                      commType === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[s.saveBtn, (!commNote.trim() || savingComm) && { opacity: 0.4 }]}
                onPress={() => logComm(commType)} disabled={!commNote.trim() || savingComm}>
                <Text style={s.saveBtnText}>{savingComm ? 'Logging…' : 'Log This'}</Text>
              </TouchableOpacity>
            </View>

            {/* Activity log */}
            <Text style={[s.sectionLabel, { marginTop: 4 }]}>Activity Log</Text>
            {commLoading ? <ActivityIndicator color={COLORS.primary} style={{ padding: 20 }} />
              : commLogs.length === 0
                ? <View style={{ alignItems: 'center', padding: 32 }}><Text style={{ color: '#9CA3AF' }}>No logs yet</Text></View>
                : commLogs.map(log => {
                    const color = COMM_COLORS[log.type] || '#374151'
                    return (
                      <View key={log.id} style={[s.logItem, { borderLeftColor: color }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Ionicons name={COMM_ICONS[log.type] || 'chatbubble'} size={14} color={color} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color, flex: 1, textTransform: 'capitalize' }}>
                            {log.type} · {log.direction}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {log.created_at ? new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </Text>
                        </View>
                        {log.note ? <Text style={{ fontSize: 13, color: '#374151' }}>{log.note}</Text> : null}
                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>by {log.agent_name}</Text>
                      </View>
                    )
                  })}
          </View>
        )}

        {/* ASSIGN TAB */}
        {tab === 'assign' && (
          <View style={{ gap: 10 }}>
            <Text style={s.sectionLabel}>Reassign this lead to another agent or admin</Text>
            {agents.map(agent => {
              const isCurrent = lead.assigned_to === agent.id
              return (
                <TouchableOpacity key={agent.id}
                  style={[s.agentRow, isCurrent && { borderColor: '#4F46E5', borderWidth: 2, backgroundColor: '#EEF2FF' }]}
                  onPress={() => !isCurrent && assignToAgent(agent.id)}>
                  <View style={[s.agentAvatar, isCurrent && { backgroundColor: '#4F46E5' }]}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                      {agent.name?.charAt(0)?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{agent.name}</Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>{agent.email} · {agent.role_name}</Text>
                  </View>
                  {isCurrent
                    ? <Ionicons name="checkmark-circle" size={22} color="#4F46E5" />
                    : <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  }
                </TouchableOpacity>
              )
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <CalendarPicker value={followUpDate}
            onChange={d => { setFollowUpDate(d); setShowCalendar(false) }}
            onClose={() => setShowCalendar(false)} />
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F9FAFB' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingTop: 52, paddingBottom: 12,
                  backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerName:   { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerPhone:  { fontSize: 13, color: '#6B7280' },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText:   { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  quickBar:     { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  quickBtn:     { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  quickText:    { fontSize: 11, fontWeight: '600' },
  tabs:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:    { borderBottomColor: '#4F46E5' },
  tabText:      { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  tabTextActive:{ color: '#4F46E5', fontWeight: '700' },
  infoCard:     { backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  infoLabel:    { fontSize: 11, color: '#9CA3AF' },
  infoValue:    { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 1 },
  sectionBox:   { backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  statusGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusOptionText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  productDisplay: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  productDisplayLabel: { fontSize: 11, color: '#6366F1', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  productDisplayName: { fontSize: 18, fontWeight: '800', color: '#312E81' },
  productDisplayDetail: { fontSize: 13, color: '#4338CA', marginTop: 4 },
  editProductBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' },
  productForm:  { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  productOption:{ padding: 12, borderRadius: 10, backgroundColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productOptionActive: { backgroundColor: '#4F46E5' },
  input:        { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 14, color: '#111827' },
  saveBtn:      { backgroundColor: '#4F46E5', padding: 12, borderRadius: 10, alignItems: 'center' },
  saveBtnText:  { fontSize: 14, color: '#fff', fontWeight: '700' },
  cancelBtn:    { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', paddingHorizontal: 20 },
  voiceBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#4F46E5', alignSelf: 'flex-start' },
  voiceBtnActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  voiceBtnText: { fontSize: 12, fontWeight: '600', color: '#4F46E5' },
  dateBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#EEF2FF', borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE' },
  commBtns:     { flexDirection: 'row', gap: 8 },
  commBtn:      { flex: 1, alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1.5, gap: 4 },
  commBtnText:  { fontSize: 12, fontWeight: '700' },
  commBtnSub:   { fontSize: 9, color: '#9CA3AF', textAlign: 'center' },
  typeChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' },
  logItem:      { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 4 },
  agentRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  agentAvatar:  { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6B7280', alignItems: 'center', justifyContent: 'center' },
})
