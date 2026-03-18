// mobile-app/src/screens/leads/PostCallScreen.js
// Full replacement with: voice-to-text, calendar, agent assignment, auto-return after call
import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import COLORS from '../../utils/colors'
import CalendarPicker from '../../components/CalendarPicker'

const ALL_STATUSES = ['new','hot','warm','cold','converted','not_interested','call_back']
const STATUS_COLORS = {
  new:            { bg: '#DBEAFE', text: '#1E40AF' },
  hot:            { bg: '#FEE2E2', text: '#991B1B' },
  warm:           { bg: '#FFEDD5', text: '#9A3412' },
  cold:           { bg: '#F3F4F6', text: '#374151' },
  converted:      { bg: '#DCFCE7', text: '#166534' },
  not_interested: { bg: '#F3F4F6', text: '#6B7280' },
  call_back:      { bg: '#EDE9FE', text: '#5B21B6' },
}

// ── Voice to Text Button ──────────────────────────────────
function VoiceToTextBtn({ onResult }) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')

  // Uses Web Speech API via expo-speech-recognition if available
  // Falls back gracefully with an info message
  const handlePress = async () => {
    if (listening) {
      setListening(false)
      if (transcript) onResult(transcript)
      setTranscript('')
      return
    }

    // Try to use expo-speech-recognition
    try {
      const ExpoSR = require('expo-speech-recognition')
      const { ExpoSpeechRecognitionModule } = ExpoSR

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Microphone permission is required for voice input')
        return
      }

      setListening(true)
      setTranscript('')

      ExpoSpeechRecognitionModule.start({
        lang: 'en-IN',
        interimResults: true,
        continuous: false,
      })

      // Listen for results
      const resultSub = ExpoSR.useSpeechRecognitionEvent('result', (event) => {
        const text = event.results?.[0]?.transcript || ''
        setTranscript(text)
        if (event.isFinal) {
          onResult(text)
          setListening(false)
          setTranscript('')
          resultSub?.remove()
        }
      })

      const errorSub = ExpoSR.useSpeechRecognitionEvent('error', () => {
        setListening(false)
        errorSub?.remove()
      })
    } catch (e) {
      // expo-speech-recognition not installed — show helpful message
      Alert.alert(
        'Voice Input',
        'To enable voice-to-text, add "expo-speech-recognition" to your package.json.\n\nFor now, please type your notes manually.',
        [{ text: 'OK' }]
      )
    }
  }

  return (
    <TouchableOpacity onPress={handlePress}
      style={[s.voiceBtn, listening && s.voiceBtnActive]}>
      <Ionicons name={listening ? 'stop-circle' : 'mic'} size={18} color={listening ? '#fff' : '#4F46E5'} />
      <Text style={[s.voiceBtnText, listening && { color: '#fff' }]}>
        {listening ? `Listening… "${transcript.slice(0, 20)}${transcript.length > 20 ? '…' : ''}"` : '🎤 Voice Input'}
      </Text>
    </TouchableOpacity>
  )
}

// ══════════════════════════════════════════════════════════
export default function PostCallScreen({ route, navigation }) {
  const { lead } = route.params || {}
  const { user } = useAuth()

  const [status, setStatus]             = useState(lead?.status || 'new')
  const [discussion, setDiscussion]     = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [productId, setProductId]       = useState(String(lead?.product_id || ''))
  const [productDetail, setProductDetail] = useState(lead?.product_detail || '')
  const [assignedTo, setAssignedTo]     = useState(lead?.assigned_to || '')
  const [products, setProducts]         = useState([])
  const [agents, setAgents]             = useState([])
  const [saving, setSaving]             = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)

  useEffect(() => {
    Promise.all([api.get('/products/active'), api.get('/users')]).then(([p, u]) => {
      setProducts(p.data?.data || p.data || [])
      const all = Array.isArray(u.data) ? u.data : (u.data?.data || [])
      setAgents(all)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!discussion.trim()) return Alert.alert('Required', 'Please add call discussion notes')
    setSaving(true)
    try {
      // 1. Log the call with discussion
      await api.post(`/leads/${lead.id}/communications`, {
        type: 'call', direction: 'outbound', note: discussion
      })

      // 2. Update lead status
      await api.patch(`/leads/${lead.id}/status`, { status })

      // 3. Update product if changed
      if (productId !== String(lead?.product_id || '') || productDetail !== (lead?.product_detail || '')) {
        await api.patch(`/leads/${lead.id}/product`, {
          product_id: productId || null, product_detail: productDetail || null
        })
      }

      // 4. Update assignment if changed
      if (assignedTo && assignedTo !== lead?.assigned_to) {
        await api.put(`/leads/${lead.id}`, { assigned_to: assignedTo }).catch(() => {})
      }

      // 5. Schedule follow-up if date provided
      if (followUpDate.trim()) {
        await api.post('/followups', {
          lead_id: lead.id, follow_up_date: followUpDate, notes: discussion,
        }).catch(() => {})
      }

      Alert.alert('✅ Saved', 'Call logged and lead updated', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  if (!lead) return (
    <View style={s.center}><Text>No lead data</Text></View>
  )

  const currentProduct = products.find(p => String(p.id) === productId)
  const assignedAgent  = agents.find(a => a.id === assignedTo)

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Post-Call Update</Text>
          <Text style={s.headerSub}>{lead.name || lead.contact_name} · {lead.phone}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>

        {/* ── Call Discussion ───────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📝 Call Discussion *</Text>
          <TextInput value={discussion} onChangeText={setDiscussion}
            placeholder="What was discussed on the call? Key points, objections, next steps…"
            multiline numberOfLines={5} style={[s.input, s.textarea]}
            placeholderTextColor="#9CA3AF" textAlignVertical="top" />
          {/* Voice to text */}
          <VoiceToTextBtn onResult={text => setDiscussion(prev => prev ? prev + ' ' + text : text)} />
        </View>

        {/* ── Status ───────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📊 Update Status</Text>
          <View style={s.statusGrid}>
            {ALL_STATUSES.map(st => {
              const c = STATUS_COLORS[st]; const active = status === st
              return (
                <TouchableOpacity key={st} onPress={() => setStatus(st)}
                  style={[s.statusChip, { backgroundColor: active ? c.text : c.bg }]}>
                  <Text style={[s.statusChipText, { color: active ? '#fff' : c.text }]}>
                    {st.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* ── Product ───────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📦 Product Interest</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {[{id:'', name:'No product'}, ...products].map(p => (
              <TouchableOpacity key={String(p.id)} onPress={() => setProductId(String(p.id))}
                style={[s.chip, productId === String(p.id) && s.chipActive, { marginRight: 6 }]}>
                <Text style={[s.chipText, productId === String(p.id) && s.chipTextActive]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {productId && (
            <TextInput value={productDetail} onChangeText={setProductDetail}
              placeholder="Product notes, plan, pricing discussed…"
              style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]}
              multiline placeholderTextColor="#9CA3AF" />
          )}
        </View>

        {/* ── Assign To ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>👤 Assign To</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[{id: lead.assigned_to || '', name: 'Keep current'}, ...agents].map(a => (
              <TouchableOpacity key={String(a.id)} onPress={() => setAssignedTo(a.id)}
                style={[s.chip, assignedTo === a.id && s.chipActive, { marginRight: 6 }]}>
                <Text style={[s.chipText, assignedTo === a.id && s.chipTextActive]}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Follow-up Date with Calendar ──────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📅 Schedule Follow-up</Text>
          <TouchableOpacity onPress={() => setShowCalendar(true)} style={s.dateBtn}>
            <Ionicons name="calendar" size={20} color="#4F46E5" />
            <Text style={[s.dateBtnText, followUpDate && { color: '#111827', fontWeight: '600' }]}>
              {followUpDate || 'Tap to select date'}
            </Text>
            {followUpDate && (
              <TouchableOpacity onPress={() => setFollowUpDate('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {followUpDate && (
            <Text style={{ fontSize: 12, color: '#4F46E5', marginTop: 4 }}>
              ✅ Follow-up scheduled for {followUpDate}
            </Text>
          )}
        </View>

        {/* ── Summary ───────────────────────────────── */}
        {discussion.trim() && (
          <View style={s.summary}>
            <Text style={s.summaryTitle}>Summary</Text>
            <Text style={s.summaryRow}>Status: <Text style={s.summaryVal}>{status.replace(/_/g,' ')}</Text></Text>
            {currentProduct && <Text style={s.summaryRow}>Product: <Text style={s.summaryVal}>{currentProduct.name}</Text></Text>}
            {assignedAgent && <Text style={s.summaryRow}>Assigned to: <Text style={s.summaryVal}>{assignedAgent.name}</Text></Text>}
            {followUpDate && <Text style={s.summaryRow}>Follow-up: <Text style={s.summaryVal}>{followUpDate}</Text></Text>}
          </View>
        )}

        {/* ── Save Button ───────────────────────────── */}
        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={s.saveBtnText}>Save Post-Call Update</Text></>
          }
        </TouchableOpacity>
      </ScrollView>

      {/* Calendar Modal */}
      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={s.calOverlay}>
          <CalendarPicker
            value={followUpDate}
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
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub:    { fontSize: 12, color: '#6B7280' },
  section:      { backgroundColor: '#fff', borderRadius: 14, padding: 14,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  input:        { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 14, color: '#111827' },
  textarea:     { minHeight: 120 },
  voiceBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                  borderWidth: 1.5, borderColor: '#4F46E5', alignSelf: 'flex-start' },
  voiceBtnActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  voiceBtnText: { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  statusGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  statusChipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  chip:         { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F4F6' },
  chipActive:   { backgroundColor: '#4F46E5' },
  chipText:     { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  dateBtn:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
                  backgroundColor: '#EEF2FF', borderRadius: 12, borderWidth: 1, borderColor: '#C7D2FE' },
  dateBtnText:  { flex: 1, fontSize: 15, color: '#9CA3AF' },
  summary:      { backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: '#4338CA', marginBottom: 6 },
  summaryRow:   { fontSize: 13, color: '#374151', marginBottom: 3 },
  summaryVal:   { fontWeight: '700', color: '#111827' },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, backgroundColor: '#4F46E5', padding: 16, borderRadius: 14 },
  saveBtnText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  calOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
})
