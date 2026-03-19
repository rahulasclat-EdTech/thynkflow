// mobile-app/src/screens/followup/FollowUpScreen.js
// 3 sections: Today / Overdue / Next 3 Days
// Uses /api/followups?section=all — scoped by role automatically
import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  RefreshControl, ActivityIndicator, StyleSheet,
  Linking, Modal, ScrollView, Alert, AppState, SectionList
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'
import COLORS from '../../utils/colors'
import CalendarPicker from '../../components/CalendarPicker'

const STATUS_COLORS = {
  new:            { bg:'#DBEAFE', text:'#1E40AF' },
  hot:            { bg:'#FEE2E2', text:'#991B1B' },
  warm:           { bg:'#FFEDD5', text:'#9A3412' },
  cold:           { bg:'#F3F4F6', text:'#374151' },
  converted:      { bg:'#DCFCE7', text:'#166534' },
  not_interested: { bg:'#F3F4F6', text:'#6B7280' },
  call_back:      { bg:'#EDE9FE', text:'#5B21B6' },
}
const ALL_STATUSES = Object.keys(STATUS_COLORS)

function formatDate(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return String(d) }
}

function daysOverdue(d) {
  if (!d) return 0
  return Math.floor((new Date() - new Date(d)) / 86400000)
}

export default function FollowUpScreen({ navigation }) {
  const { user } = useAuth()
  const [sections, setSections]     = useState([])
  const [counts, setCounts]         = useState({ today: 0, previous: 0, next_3_days: 0, total: 0 })
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedFU, setSelectedFU] = useState(null)
  const [showUpdate, setShowUpdate] = useState(false)

  // Post-call detection
  const appStateRef   = useRef(AppState.currentState)
  const calledLeadRef = useRef(null)
  const [callLead, setCallLead]     = useState(null)
  const [showPostCall, setShowPostCall] = useState(false)

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active' && calledLeadRef.current) {
        setCallLead(calledLeadRef.current)
        setShowPostCall(true)
        calledLeadRef.current = null
      }
      appStateRef.current = next
    })
    return () => sub.remove()
  }, [])

  const fetchFollowups = useCallback(async () => {
    try {
      const r = await api.get('/followups?section=all')
      console.log('FollowUp response counts:', JSON.stringify(r.data?.counts))
      const d = r.data?.data || {}

      let today = [], previous = [], next3 = []
      if (Array.isArray(r.data?.data)) {
        // Flat array — categorise client-side
        const all = r.data.data
        today    = all.filter(x => x.followup_type === 'today')
        previous = all.filter(x => x.followup_type === 'overdue')
        next3    = all.filter(x => x.followup_type === 'upcoming')
      } else {
        today    = Array.isArray(d.today)       ? d.today       : []
        previous = Array.isArray(d.previous)    ? d.previous    : []
        next3    = Array.isArray(d.next_3_days) ? d.next_3_days : []
      }

      const built = []
      if (today.length > 0)    built.push({ title: `⏰ Today (${today.length})`,                  data: today,    color: '#D97706' })
      if (previous.length > 0) built.push({ title: `🔴 Overdue (${previous.length})`,             data: previous, color: '#DC2626' })
      if (next3.length > 0)    built.push({ title: `📆 Next 3 Days (${next3.length})`,             data: next3,    color: '#2563EB' })

      if (built.length === 0)  built.push({ title: 'No follow-ups', data: [], color: '#9CA3AF' })

      setSections(built)
      setCounts(r.data?.counts || { today: today.length, previous: previous.length, next_3_days: next3.length, total: today.length + previous.length + next3.length })
    } catch (e) {
      console.log('FollowUp fetch error:', e.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { setLoading(true); fetchFollowups() }, [fetchFollowups])

  const handleCall = (fu) => {
    const phone = (fu.phone || fu.lead_phone || '').replace(/\s+/g, '')
    if (!phone) return Alert.alert('No phone number')
    calledLeadRef.current = { id: fu.lead_id, name: fu.lead_name || fu.contact_name, phone }
    Linking.openURL(`tel:${phone}`)
    api.post(`/leads/${fu.lead_id}/communications`, { type:'call', direction:'outbound', note:'Follow-up call' }).catch(() => {})
  }

  const handleWhatsApp = (fu) => {
    const p = (fu.phone || fu.lead_phone || '').replace(/[^0-9]/g, '')
    if (!p) return Alert.alert('No phone')
    Linking.openURL(`https://wa.me/${p.startsWith('91') ? p : '91'+p}`)
  }

  const openUpdate = (fu) => {
    setSelectedFU({ ...fu, newStatus: fu.lead_status || 'new', discussion: '', newFollowUpDate: '' })
    setShowUpdate(true)
  }

  const renderItem = ({ item, section }) => {
    const overdue = item.followup_type === 'overdue'
    const days = overdue ? daysOverdue(item.follow_up_date) : 0
    const sc = STATUS_COLORS[item.lead_status] || STATUS_COLORS.new
    return (
      <View style={[s.card, overdue && s.cardOverdue]}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.leadName}>{item.lead_name || item.contact_name || 'Lead'}</Text>
            <Text style={s.leadPhone}>{item.phone || item.lead_phone || ''}</Text>
            {item.agent_name && <Text style={s.agentName}>👤 {item.agent_name}</Text>}
            <View style={s.dateRow}>
              <Ionicons name="alarm-outline" size={13} color={overdue ? '#DC2626' : section.color || '#D97706'} />
              <Text style={[s.dateText, overdue && { color:'#DC2626', fontWeight:'700' }]}>
                {formatDate(item.follow_up_date)}
                {overdue && days > 0 ? ` • ${days}d OVERDUE` : ''}
              </Text>
            </View>
            {item.product_name && <Text style={s.productText}>📦 {item.product_name}</Text>}
            {item.notes ? <Text style={s.notes} numberOfLines={2}>{item.notes}</Text> : null}
          </View>
          <View style={[s.sBadge, { backgroundColor: sc.bg }]}>
            <Text style={[s.sBadgeText, { color: sc.text }]}>
              {(item.lead_status || 'new').replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
        <View style={s.actions}>
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#DCFCE7' }]} onPress={() => handleCall(item)}>
            <Ionicons name="call" size={14} color="#16A34A" />
            <Text style={[s.aTxt, { color:'#16A34A' }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#DCFCE7' }]} onPress={() => handleWhatsApp(item)}>
            <Ionicons name="logo-whatsapp" size={14} color="#15803D" />
            <Text style={[s.aTxt, { color:'#15803D' }]}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#EDE9FE' }]} onPress={() => openUpdate(item)}>
            <Ionicons name="create-outline" size={14} color="#5B21B6" />
            <Text style={[s.aTxt, { color:'#5B21B6' }]}>Update</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const renderSectionHeader = ({ section }) => (
    <View style={[s.sectionHeader, { borderLeftColor: section.color || '#6B7280' }]}>
      <Text style={[s.sectionTitle, { color: section.color || '#374151' }]}>{section.title}</Text>
    </View>
  )

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Follow-ups</Text>
        <Text style={s.count}>{counts.total} total</Text>
      </View>

      {/* Summary pills */}
      <View style={s.summaryRow}>
        <View style={[s.pill, { backgroundColor:'#FEF3C7' }]}>
          <Text style={[s.pillNum, { color:'#D97706' }]}>{counts.today}</Text>
          <Text style={[s.pillLabel, { color:'#92400E' }]}>Today</Text>
        </View>
        <View style={[s.pill, { backgroundColor:'#FEE2E2' }]}>
          <Text style={[s.pillNum, { color:'#DC2626' }]}>{counts.previous}</Text>
          <Text style={[s.pillLabel, { color:'#991B1B' }]}>Overdue</Text>
        </View>
        <View style={[s.pill, { backgroundColor:'#DBEAFE' }]}>
          <Text style={[s.pillNum, { color:'#2563EB' }]}>{counts.next_3_days}</Text>
          <Text style={[s.pillLabel, { color:'#1E40AF' }]}>Next 3 Days</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, idx) => String(item.lead_id || idx)}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchFollowups() }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Ionicons name="alarm-outline" size={48} color="#D1D5DB" />
              <Text style={{ color:'#9CA3AF', marginTop:8, textAlign:'center' }}>
                No follow-ups scheduled.{'\n'}Log a call with a follow-up date to see them here.
              </Text>
            </View>
          }
          stickySectionHeadersEnabled={false}
        />
      )}

      {/* Update modal */}
      {selectedFU && (
        <UpdateFollowUpModal
          visible={showUpdate}
          followup={selectedFU}
          onClose={() => { setShowUpdate(false); setSelectedFU(null) }}
          onSave={() => { setShowUpdate(false); setSelectedFU(null); fetchFollowups() }}
        />
      )}

      {/* Post-call popup */}
      <Modal visible={showPostCall} transparent animationType="slide">
        <View style={s.popupOverlay}>
          <View style={s.popupCard}>
            <Text style={s.popupTitle}>📞 Call Ended</Text>
            <Text style={s.popupSub}>{callLead?.name} · {callLead?.phone}</Text>
            <Text style={{ fontSize:14, color:'#374151', textAlign:'center', marginTop:10, marginBottom:18 }}>
              Update call notes?
            </Text>
            <View style={{ flexDirection:'row', gap:12 }}>
              <TouchableOpacity style={s.popupSkip} onPress={() => setShowPostCall(false)}>
                <Text style={{ fontSize:14, fontWeight:'600', color:'#6B7280' }}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.popupUpdate} onPress={() => {
                setShowPostCall(false)
                if (callLead) navigation.navigate('Leads', { screen:'PostCall', params:{ lead:callLead } })
              }}>
                <Text style={{ fontSize:14, fontWeight:'700', color:'#fff' }}>Update Call →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ── Update Modal ──────────────────────────────────────────
function UpdateFollowUpModal({ visible, followup, onClose, onSave }) {
  const [status, setStatus]         = useState(followup.lead_status || 'new')
  const [discussion, setDiscussion] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [saving, setSaving]         = useState(false)
  const [showCal, setShowCal]       = useState(false)

  const handleSave = async () => {
    if (!discussion.trim()) return Alert.alert('Required', 'Add call discussion notes')
    setSaving(true)
    try {
      if (followup.lead_id) {
        await api.post(`/leads/${followup.lead_id}/communications`, { type:'call', direction:'outbound', note:discussion })
        await api.patch(`/leads/${followup.lead_id}/status`, { status })
      }
      if (followUpDate) {
        await api.post('/followups', { lead_id: followup.lead_id, follow_up_date: followUpDate, notes: discussion }).catch(() => {})
      }
      Alert.alert('✅ Saved', 'Follow-up updated', [{ text:'OK', onPress:onSave }])
    } catch(e) { Alert.alert('Error', e.message || 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'#fff' }}>
        <View style={s.mHeader}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#374151" /></TouchableOpacity>
          <Text style={s.mTitle}>Update Follow-up</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={s.mSave}>
            <Text style={{ color:'#fff', fontWeight:'700', fontSize:14 }}>{saving ? '…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding:16, paddingBottom:40, gap:14 }}>
          <View style={{ backgroundColor:'#F9FAFB', borderRadius:12, padding:12 }}>
            <Text style={{ fontSize:15, fontWeight:'700', color:'#111827' }}>
              {followup.lead_name || followup.contact_name}
            </Text>
            <Text style={{ fontSize:13, color:'#6B7280', marginTop:2 }}>{followup.phone}</Text>
            {followup.agent_name && (
              <Text style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>👤 {followup.agent_name}</Text>
            )}
          </View>

          {/* Discussion */}
          <View style={s.section}>
            <Text style={s.secTitle}>📝 Call Discussion *</Text>
            <TextInput value={discussion} onChangeText={setDiscussion}
              placeholder="What was discussed on the call?"
              multiline numberOfLines={4}
              style={[s.input, { minHeight:100, textAlignVertical:'top' }]}
              placeholderTextColor="#9CA3AF" />
          </View>

          {/* Status */}
          <View style={s.section}>
            <Text style={s.secTitle}>📊 Update Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ALL_STATUSES.map(st => {
                const c = STATUS_COLORS[st]; const active = status === st
                return (
                  <TouchableOpacity key={st} onPress={() => setStatus(st)}
                    style={[s.stChip, { backgroundColor: active ? c.text : c.bg, marginRight:6 }]}>
                    <Text style={[s.stChipText, { color: active ? '#fff' : c.text }]}>
                      {st.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>

          {/* Next follow-up */}
          <View style={s.section}>
            <Text style={s.secTitle}>📅 Next Follow-up</Text>
            <TouchableOpacity onPress={() => setShowCal(true)} style={s.dateBtn}>
              <Ionicons name="calendar" size={20} color="#4F46E5" />
              <Text style={[{ flex:1, fontSize:15, color:'#9CA3AF' }, followUpDate && { color:'#111827', fontWeight:'600' }]}>
                {followUpDate || 'Select next follow-up date'}
              </Text>
              {followUpDate && (
                <TouchableOpacity onPress={() => setFollowUpDate('')}>
                  <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            {followUpDate && (
              <Text style={{ fontSize:12, color:'#4F46E5', marginTop:4 }}>✅ Next: {followUpDate}</Text>
            )}
          </View>
        </ScrollView>

        <Modal visible={showCal} transparent animationType="fade">
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'center' }}>
            <CalendarPicker
              value={followUpDate}
              onChange={d => { setFollowUpDate(d); setShowCal(false) }}
              onClose={() => setShowCal(false)}
            />
          </View>
        </Modal>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#F9FAFB' },
  center:       { flex:1, alignItems:'center', justifyContent:'center', padding:32 },
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingTop:52, paddingBottom:10, backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:'#E5E7EB' },
  title:        { fontSize:22, fontWeight:'800', color:'#111827' },
  count:        { fontSize:16, fontWeight:'700', color:'#6B7280' },
  summaryRow:   { flexDirection:'row', gap:8, padding:12, backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:'#F3F4F6' },
  pill:         { flex:1, borderRadius:12, padding:10, alignItems:'center' },
  pillNum:      { fontSize:22, fontWeight:'800' },
  pillLabel:    { fontSize:11, fontWeight:'600', marginTop:2 },
  sectionHeader:{ marginHorizontal:0, marginTop:12, marginBottom:4, paddingHorizontal:12, paddingVertical:8, borderLeftWidth:4, backgroundColor:'#fff' },
  sectionTitle: { fontSize:13, fontWeight:'700', textTransform:'uppercase', letterSpacing:0.5 },
  card:         { backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:8, marginHorizontal:0, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.06, shadowRadius:4, elevation:2 },
  cardOverdue:  { borderWidth:1.5, borderColor:'#FCA5A5', backgroundColor:'#FFF5F5' },
  cardTop:      { flexDirection:'row', alignItems:'flex-start', marginBottom:10 },
  leadName:     { fontSize:15, fontWeight:'700', color:'#111827' },
  leadPhone:    { fontSize:13, color:'#6B7280', marginTop:2 },
  agentName:    { fontSize:11, color:'#6B7280', marginTop:2 },
  productText:  { fontSize:11, color:'#4F46E5', marginTop:2 },
  dateRow:      { flexDirection:'row', alignItems:'center', gap:4, marginTop:4 },
  dateText:     { fontSize:12, color:'#D97706' },
  notes:        { fontSize:12, color:'#6B7280', marginTop:4, fontStyle:'italic' },
  sBadge:       { paddingHorizontal:8, paddingVertical:3, borderRadius:20 },
  sBadgeText:   { fontSize:11, fontWeight:'600', textTransform:'capitalize' },
  actions:      { flexDirection:'row', gap:6 },
  aBtn:         { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:8, borderRadius:8 },
  aTxt:         { fontSize:11, fontWeight:'600' },
  mHeader:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:16, paddingTop:52, paddingBottom:12, borderBottomWidth:1, borderBottomColor:'#E5E7EB' },
  mTitle:       { fontSize:17, fontWeight:'700', color:'#111827' },
  mSave:        { backgroundColor:'#4F46E5', paddingHorizontal:16, paddingVertical:7, borderRadius:10 },
  section:      { backgroundColor:'#F9FAFB', borderRadius:12, padding:14, borderWidth:1, borderColor:'#E5E7EB' },
  secTitle:     { fontSize:14, fontWeight:'700', color:'#111827', marginBottom:10 },
  input:        { backgroundColor:'#fff', borderWidth:1, borderColor:'#E5E7EB', borderRadius:10, padding:12, fontSize:14, color:'#111827' },
  stChip:       { paddingHorizontal:10, paddingVertical:4, borderRadius:20 },
  stChipText:   { fontSize:11, fontWeight:'600', textTransform:'capitalize' },
  dateBtn:      { flexDirection:'row', alignItems:'center', gap:10, padding:14, backgroundColor:'#EEF2FF', borderRadius:12, borderWidth:1, borderColor:'#C7D2FE' },
  popupOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', alignItems:'center', justifyContent:'flex-end' },
  popupCard:    { backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, width:'100%', paddingBottom:40 },
  popupTitle:   { fontSize:20, fontWeight:'800', color:'#111827', textAlign:'center' },
  popupSub:     { fontSize:14, color:'#6B7280', textAlign:'center', marginTop:4 },
  popupSkip:    { flex:1, padding:14, borderRadius:14, borderWidth:1, borderColor:'#E5E7EB', alignItems:'center' },
  popupUpdate:  { flex:2, padding:14, borderRadius:14, backgroundColor:'#4F46E5', alignItems:'center' },
})
