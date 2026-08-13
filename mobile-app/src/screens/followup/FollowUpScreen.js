// mobile-app/src/screens/followup/FollowUpScreen.js
// Full replacement: fixes two bugs —
//  1. Screen was calling GET /followups?status=... but the backend only
//     understands ?section=today|previous|next_3_days|all. Because of
//     that mismatch, the default response (an object grouped by bucket)
//     was never recognized as an array, so the list always rendered
//     empty regardless of what data existed.
//  2. "Save" on the update modal was calling PATCH /followups/:id with
//     {status:'done'} — but that id is actually the lead's id, and that
//     route updates the LEAD's status column, not a "followup done" flag
//     (no such flag exists). This silently overwrote the lead's real
//     status back to the literal string "done" right after it had just
//     been set correctly two lines above. Removed.
//
// Also adds the requested Today / Next 3 Days / Missed (overdue) summary
// with counts and drill-down, matching what the backend already groups
// follow-ups into.
import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  RefreshControl, ActivityIndicator, StyleSheet,
  Linking, Modal, ScrollView, Alert, AppState
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'
import COLORS from '../../utils/colors'
import CalendarPicker from '../../components/CalendarPicker'
import VoiceInput from '../../components/VoiceInput'

const STATUS_COLORS = {
  new:            { bg:'#DBEAFE', text:'#1E40AF' },
  hot:            { bg:'#FEE2E2', text:'#991B1B' },
  warm:           { bg:'#FFEDD5', text:'#9A3412' },
  cold:           { bg:'#F3F4F6', text:'#374151' },
  converted:      { bg:'#DCFCE7', text:'#166534' },
  not_interested: { bg:'#F3F4F6', text:'#6B7280' },
  call_back:      { bg:'#EDE9FE', text:'#5B21B6' },
}
const _MOB_FB = [
  { bg:'#FCE7F3', text:'#9D174D' },{ bg:'#ECFDF5', text:'#065F46' },
  { bg:'#FFF7ED', text:'#9A3412' },{ bg:'#F0F9FF', text:'#0369A1' },
  { bg:'#FAF5FF', text:'#6B21A8' },{ bg:'#FEFCE8', text:'#854D0E' },
]
let _mFbIdx = 0
function getMobStatusColor(key) {
  if (STATUS_COLORS[key]) return STATUS_COLORS[key]
  const c = _MOB_FB[_mFbIdx % _MOB_FB.length]; _mFbIdx++
  STATUS_COLORS[key] = c; return c
}
function applyMobStatusColors(items) {
  items.forEach(s => {
    const k = typeof s === 'string' ? s : s.key
    if (k && !STATUS_COLORS[k] && s.color)
      STATUS_COLORS[k] = { bg: s.color + '28', text: s.color }
  })
}
let ALL_STATUSES = Object.keys(STATUS_COLORS)

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) }
  catch { return String(d) }
}

function isOverdue(date) {
  if (!date) return false
  return new Date(date) < new Date()
}

const SECTIONS = [
  { key: 'today',       label: 'Today',        icon: 'today-outline',    color: '#2563EB' },
  { key: 'next_3_days', label: 'Next 3 Days',  icon: 'calendar-outline', color: '#D97706' },
  { key: 'previous',    label: 'Missed',       icon: 'alert-circle-outline', color: '#DC2626' },
]

export default function FollowUpScreen({ navigation }) {
  const { user } = useAuth()
  const [section, setSection]       = useState('all') // 'all' shows the 3 summary cards; otherwise a drilled-down list
  const [followups, setFollowups]   = useState([])
  const [counts, setCounts]         = useState({ today: 0, previous: 0, next_3_days: 0, total: 0 })
  const [agents, setAgents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [statusFilter, setStatusFilter] = useState('') // lead status filter, only used inside a drilled-down list
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
      const statusParam = statusFilter ? `&lead_status=${statusFilter}` : ''
      const params = `?section=${section}${statusParam}`
      const [fuRes, uRes, settRes] = await Promise.all([
        api.get(`/followups${params}`),
        api.get('/chat/users'),
        api.get('/settings').catch(() => ({ data: {} })),
      ])
      const sD = settRes.data?.data || settRes.data || {}
      const sts = sD.lead_status || sD.statuses || []
      if (sts.length) { applyMobStatusColors(sts); ALL_STATUSES = sts.map(s2 => typeof s2==='string'?s2:s2.key) }

      if (section === 'all') {
        // Backend groups into { today, previous, next_3_days } + counts when
        // no specific section is requested — this powers the summary cards.
        // NOTE: the api client's response interceptor already unwraps
        // res.data, so `fuRes` here IS the {success,data,counts} body —
        // `counts` sits at the top level, not nested under `.data`.
        setCounts(fuRes.counts || { today: 0, previous: 0, next_3_days: 0, total: 0 })
        setFollowups([])
      } else {
        // Same reasoning: fuRes.data IS already the array for a specific section.
        const raw = fuRes.data || []
        const rows = Array.isArray(raw) ? raw : []
        setFollowups(rows)
        setCounts(c => ({ ...c, [section]: rows.length }))
      }

      const allUsers = Array.isArray(uRes.data?.data) ? uRes.data.data : (Array.isArray(uRes.data) ? uRes.data : [])
      setAgents(allUsers)
    } catch (e) { console.log(e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [section, statusFilter])

  useEffect(() => { setLoading(true); fetchFollowups() }, [fetchFollowups])

  const handleCall = (fu) => {
    const phone = (fu.phone || fu.lead_phone || '').replace(/\s+/g,'')
    if (!phone) return Alert.alert('No phone number')
    calledLeadRef.current = { id: fu.lead_id, name: fu.lead_name || fu.contact_name, phone }
    Linking.openURL(`tel:${phone}`)
    api.post(`/leads/${fu.lead_id}/communications`,{type:'call',direction:'outbound',note:'Follow-up call',is_followup:true}).catch(()=>{})
  }

  const handleWhatsApp = (fu) => {
    const p = (fu.phone||fu.lead_phone||'').replace(/[^0-9]/g,'')
    if (!p) return Alert.alert('No phone')
    Linking.openURL(`https://wa.me/${p.startsWith('91')?p:'91'+p}`)
  }

  const openUpdate = (fu) => {
    setSelectedFU({
      ...fu,
      newStatus: fu.lead_status || 'new',
      discussion: '',
      newFollowUpDate: '',
      assignedTo: fu.assigned_to || '',
    })
    setShowUpdate(true)
  }

  const renderItem = ({ item }) => {
    const overdue = isOverdue(item.follow_up_date || item.scheduled_at)
    const sc = getMobStatusColor(item.lead_status || item.status)
    return (
      <View style={[s.card, overdue && s.cardOverdue]}>
        {/* Colored accent strip so the eye can scan urgency at a glance */}
        <View style={[s.cardAccent, { backgroundColor: overdue ? '#DC2626' : sc.text }]} />
        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <Text style={s.leadName} numberOfLines={1}>{item.lead_name || item.contact_name || 'Lead'}</Text>
            <View style={[s.sBadge, { backgroundColor: sc.bg }]}>
              <Text style={[s.sBadgeText, { color: sc.text }]} numberOfLines={1}>
                {(item.lead_status || item.status || 'new').replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          {(item.school_name || item.product_name) ? (
            <View style={s.metaRow}>
              {item.school_name ? <Text style={s.leadSchool} numberOfLines={1}>{item.school_name}</Text> : null}
              {item.product_name ? <Text style={s.leadProduct} numberOfLines={1}>📦 {item.product_name}</Text> : null}
            </View>
          ) : null}

          <Text style={s.leadPhone}>{item.phone || item.lead_phone}</Text>

          <View style={s.dateRow}>
            <Ionicons name="alarm-outline" size={13} color={overdue ? '#DC2626' : '#D97706'} />
            <Text style={[s.dateText, overdue && { color: '#DC2626', fontWeight: '700' }]}>
              {formatDate(item.follow_up_date || item.scheduled_at)}
              {overdue ? ' • OVERDUE' : ''}
            </Text>
          </View>
          {item.notes && <Text style={s.notes} numberOfLines={2}>{item.notes}</Text>}

          <View style={s.actions}>
            <TouchableOpacity style={[s.aBtn, { backgroundColor: '#DBEAFE' }]} onPress={() => handleCall(item)}>
              <Ionicons name="call" size={14} color="#1D4ED8" /><Text style={[s.aTxt, { color: '#1D4ED8' }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.aBtn, { backgroundColor: '#DCFCE7' }]} onPress={() => handleWhatsApp(item)}>
              <Ionicons name="logo-whatsapp" size={14} color="#15803D" /><Text style={[s.aTxt, { color: '#15803D' }]}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.aBtn, { backgroundColor: '#EDE9FE' }]} onPress={() => openUpdate(item)}>
              <Ionicons name="create-outline" size={14} color="#5B21B6" /><Text style={[s.aTxt, { color: '#5B21B6' }]}>Update</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  const activeSectionMeta = SECTIONS.find(x => x.key === section)

  return (
    <View style={s.container}>
      <View style={s.header}>
        {section !== 'all'
          ? <TouchableOpacity onPress={() => setSection('all')} style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <Ionicons name="chevron-back" size={22} color="#111827" />
              <Text style={s.title}>{activeSectionMeta?.label || 'Follow-ups'}</Text>
            </TouchableOpacity>
          : <Text style={s.title}>Follow-ups</Text>}
        {section !== 'all' && <Text style={s.count}>{followups.length}</Text>}
      </View>

      {section === 'all' ? (
        // ── Summary view: Today / Next 3 Days / Missed, each drills down ──
        loading ? <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
          <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,gap:12}} refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetchFollowups()}} tintColor={COLORS.primary} />
          }>
            <Text style={s.summaryTotal}>{counts.total} total pending follow-up{counts.total===1?'':'s'}</Text>
            {SECTIONS.map(sec => (
              <TouchableOpacity key={sec.key} style={[s.summaryCard,{borderColor:sec.color+'40'}]} onPress={()=>setSection(sec.key)}>
                <View style={[s.summaryIcon,{backgroundColor:sec.color+'20'}]}>
                  <Ionicons name={sec.icon} size={22} color={sec.color} />
                </View>
                <View style={{flex:1}}>
                  <Text style={s.summaryLabel}>{sec.label}</Text>
                  <Text style={s.summarySub}>
                    {sec.key === 'today' ? "Follow-ups due today" :
                     sec.key === 'next_3_days' ? 'Coming up in the next 3 days' :
                     'Overdue — missed follow-ups'}
                  </Text>
                </View>
                <Text style={[s.summaryCount,{color:sec.color}]}>{counts[sec.key] ?? 0}</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )
      ) : (
        // ── Drilled-down list for the selected section ──
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.filterBar, {paddingBottom:4}]}>
            {[{label:'All Status',value:''}, ...ALL_STATUSES.map(k=>({label:k.replace(/_/g,' '),value:k}))].map(item=>(
              <TouchableOpacity key={item.value} onPress={()=>setStatusFilter(item.value)}
                style={[s.chip, statusFilter===item.value && s.chipActive]}>
                <Text style={[s.chipTxt, statusFilter===item.value && s.chipTxtActive]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
            <FlatList data={followups} keyExtractor={item=>String(item.id)} renderItem={renderItem}
              style={{flex:1}}
              contentContainerStyle={{padding:12,paddingBottom:80}}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetchFollowups()}} tintColor={COLORS.primary} />}
              ListEmptyComponent={<View style={s.center}><Ionicons name="alarm-outline" size={48} color="#D1D5DB" /><Text style={{color:'#9CA3AF',marginTop:8}}>No follow-ups found</Text></View>} />
          )}
        </>
      )}

      {/* Update modal */}
      {selectedFU && <UpdateFollowUpModal
        visible={showUpdate}
        followup={selectedFU}
        agents={agents}
        onClose={()=>{setShowUpdate(false);setSelectedFU(null)}}
        onSave={()=>{setShowUpdate(false);setSelectedFU(null);fetchFollowups()}} />}

      {/* Post-call popup */}
      <Modal visible={showPostCall} transparent animationType="slide">
        <View style={s.popupOverlay}>
          <View style={s.popupCard}>
            <Text style={s.popupTitle}>📞 Call Ended</Text>
            <Text style={s.popupSub}>{callLead?.name} · {callLead?.phone}</Text>
            <Text style={{fontSize:14,color:'#374151',textAlign:'center',marginTop:10,marginBottom:18}}>Update call notes?</Text>
            <View style={{flexDirection:'row',gap:12}}>
              <TouchableOpacity style={s.popupSkip} onPress={()=>setShowPostCall(false)}>
                <Text style={{fontSize:14,fontWeight:'600',color:'#6B7280'}}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.popupUpdate} onPress={()=>{
                setShowPostCall(false)
                if (callLead) navigation.navigate('Leads',{screen:'PostCall',params:{lead:callLead}})
              }}>
                <Text style={{fontSize:14,fontWeight:'700',color:'#fff'}}>Update Call →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ── Update Follow-up Modal ────────────────────────────────
function UpdateFollowUpModal({ visible, followup, agents, onClose, onSave }) {
  const [status, setStatus]         = useState(followup.newStatus || followup.lead_status || 'new')
  const [discussion, setDiscussion] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(followup.assigned_to || '')
  const [saving, setSaving]         = useState(false)
  const [showCal, setShowCal]       = useState(false)

  const handleSave = async () => {
    if (!discussion.trim()) return Alert.alert('Required','Add call discussion notes')
    setSaving(true)
    try {
      if (followup.lead_id) {
        await api.post(`/leads/${followup.lead_id}/communications`,{type:'call',direction:'outbound',note:discussion,is_followup:true})
        await api.patch(`/leads/${followup.lead_id}/status`,{status})
        if (assignedTo && assignedTo !== followup.assigned_to) {
          await api.put(`/leads/${followup.lead_id}`,{assigned_to:assignedTo}).catch(()=>{})
        }
      }
      if (followUpDate) {
        await api.post('/followups',{lead_id:followup.lead_id,follow_up_date:followUpDate,notes:discussion}).catch(()=>{})
      } else {
        // Marking this follow-up done with no next date — record it
        // explicitly (null date) so it's cleared from Today/Missed/
        // Next-3-Days instead of the stale overdue entry sticking around.
        await api.post('/followups',{lead_id:followup.lead_id,follow_up_date:null,notes:discussion}).catch(()=>{})
      }
      // NOTE: previously also called PATCH /followups/:id with {status:'done'}
      // here — but followup.id IS the lead's id, and that route updates the
      // LEAD's status column (not a "followup done" flag, which doesn't
      // exist). That was silently overwriting the status just set above
      // back to the literal string "done". Removed — logging a fresh call
      // (above) and/or setting a new follow-up date is what actually moves
      // a lead out of the "pending" follow-up buckets.
      Alert.alert('✅ Saved','Follow-up updated',[{text:'OK',onPress:onSave}])
    } catch(e) { Alert.alert('Error',e.message||'Failed') }
    finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{flex:1,backgroundColor:'#fff'}}>
        <View style={s.mHeader}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#374151" /></TouchableOpacity>
          <Text style={s.mTitle}>Update Follow-up</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={s.mSave}>
            <Text style={{color:'#fff',fontWeight:'700',fontSize:14}}>{saving?'…':'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:40,gap:14}} keyboardShouldPersistTaps="handled">
          <View style={{backgroundColor:'#F9FAFB',borderRadius:12,padding:12}}>
            <Text style={{fontSize:15,fontWeight:'700',color:'#111827'}}>{followup.lead_name||followup.contact_name}</Text>
            {followup.school_name ? <Text style={{fontSize:12,color:'#9CA3AF',marginTop:1}}>{followup.school_name}</Text> : null}
            <Text style={{fontSize:13,color:'#6B7280',marginTop:2}}>{followup.phone||followup.lead_phone}</Text>
          </View>

          {/* Discussion */}
          <View style={s.section}>
            <Text style={s.secTitle}>📝 Call Discussion *</Text>
            <TextInput value={discussion} onChangeText={setDiscussion}
              placeholder="What was discussed on the call?"
              multiline numberOfLines={4} style={[s.input,{minHeight:100,textAlignVertical:'top'}]}
              placeholderTextColor="#9CA3AF" />
          <VoiceInput
            onResult={text => setDiscussion(prev => prev ? prev + ' ' + text : text)}
            style={{ marginTop: 8 }} />
          </View>

          {/* Status - horizontal tabs */}
          <View style={s.section}>
            <Text style={s.secTitle}>📊 Update Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ALL_STATUSES.map(st => {
                const c=getMobStatusColor(st);const active=status===st
                return <TouchableOpacity key={st} onPress={()=>setStatus(st)}
                  style={[s.stChip,{backgroundColor:active?c.text:c.bg,marginRight:6}]}>
                  <Text style={[s.stChipText,{color:active?'#fff':c.text}]}>{st.replace(/_/g,' ')}</Text>
                </TouchableOpacity>
              })}
            </ScrollView>
          </View>

          {/* Assign To - all agents */}
          {agents.length>0 && <View style={s.section}>
            <Text style={s.secTitle}>👤 Reassign To</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {agents.map(a => {
                const sel=assignedTo===a.id
                return <TouchableOpacity key={String(a.id)} onPress={()=>setAssignedTo(a.id)}
                  style={[s.chip,sel&&s.chipActive,{marginRight:6}]}>
                  <Text style={[s.chipTxt,sel&&s.chipTxtActive]}>{a.name}</Text>
                </TouchableOpacity>
              })}
            </ScrollView>
          </View>}

          {/* Next follow-up with calendar */}
          <View style={s.section}>
            <Text style={s.secTitle}>📅 Next Follow-up</Text>
            <TouchableOpacity onPress={()=>setShowCal(true)} style={s.dateBtn}>
              <Ionicons name="calendar" size={20} color="#4F46E5" />
              <Text style={[{flex:1,fontSize:15,color:'#9CA3AF'},followUpDate&&{color:'#111827',fontWeight:'600'}]}>
                {followUpDate||'Select next follow-up date'}
              </Text>
              {followUpDate && <TouchableOpacity onPress={()=>setFollowUpDate('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>}
            </TouchableOpacity>
            {followUpDate && <Text style={{fontSize:12,color:'#4F46E5',marginTop:4}}>✅ Next follow-up: {followUpDate}</Text>}
          </View>
        </ScrollView>

        {/* In-place overlay instead of a nested <Modal> — see LeadsScreen's
            CreateLeadModal for why: two stacked RN Modals is a well-known
            cause of the screen freezing (going unresponsive to touch)
            after the inner one is dismissed. */}
        {showCal && (
          <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'center',zIndex:999,elevation:999}}>
            <CalendarPicker value={followUpDate} onChange={d=>{setFollowUpDate(d);setShowCal(false)}} onClose={()=>setShowCal(false)} />
          </View>
        )}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container:   {flex:1,backgroundColor:'#F9FAFB'},
  center:      {flex:1,alignItems:'center',justifyContent:'center',padding:32},
  header:      {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  title:       {fontSize:22,fontWeight:'800',color:'#111827'},
  count:       {fontSize:16,fontWeight:'700',color:'#6B7280'},
  summaryTotal:{fontSize:13,fontWeight:'600',color:'#6B7280',marginBottom:2},
  summaryCard: {flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#fff',borderRadius:16,padding:16,borderWidth:1.5,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.05,shadowRadius:4,elevation:2},
  summaryIcon: {width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center'},
  summaryLabel:{fontSize:15,fontWeight:'700',color:'#111827'},
  summarySub:  {fontSize:12,color:'#9CA3AF',marginTop:1},
  summaryCount:{fontSize:24,fontWeight:'800',marginRight:2},
  filterBar:   {paddingVertical:4,paddingHorizontal:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#F3F4F6',maxHeight:42},
  chip:        {paddingHorizontal:12,paddingVertical:0,borderRadius:20,backgroundColor:'#F3F4F6',marginRight:6,height:30,alignItems:'center',justifyContent:'center'},
  chipActive:  {backgroundColor:'#4F46E5',shadowColor:'#4F46E5',shadowOpacity:0.3,shadowRadius:4,elevation:3},
  chipTxt:     {fontSize:11,color:'#374151',fontWeight:'500'},
  chipTxtActive:{color:'#fff',fontWeight:'700'},
  card:        {flexDirection:'row',backgroundColor:'#fff',borderRadius:16,marginBottom:12,shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.06,shadowRadius:6,elevation:2,overflow:'hidden'},
  cardAccent:  {width:5},
  cardBody:    {flex:1,padding:14},
  cardOverdue: {borderWidth:1.5,borderColor:'#FCA5A5',backgroundColor:'#FFF5F5'},
  cardTop:     {flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:4},
  leadName:    {flex:1,fontSize:16,fontWeight:'700',color:'#111827'},
  metaRow:     {flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,marginBottom:2},
  leadSchool:  {fontSize:12,color:'#6B7280'},
  leadPhone:   {fontSize:13,color:'#374151',fontWeight:'500',marginTop:2},
  leadProduct: {fontSize:11,color:'#7C3AED',fontWeight:'600'},
  dateRow:     {flexDirection:'row',alignItems:'center',gap:4,marginTop:6},
  dateText:    {fontSize:12,color:'#D97706'},
  notes:       {fontSize:12,color:'#6B7280',marginTop:4,fontStyle:'italic'},
  sBadge:      {paddingHorizontal:8,paddingVertical:3,borderRadius:20,flexShrink:0,maxWidth:130},
  sBadgeText:  {fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  actions:     {flexDirection:'row',gap:6,marginTop:12},
  aBtn:        {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3,paddingVertical:9,borderRadius:9},
  aTxt:        {fontSize:11,fontWeight:'700'},
  mHeader:     {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  mTitle:      {fontSize:17,fontWeight:'700',color:'#111827'},
  mSave:       {backgroundColor:'#4F46E5',paddingHorizontal:16,paddingVertical:7,borderRadius:10},
  section:     {backgroundColor:'#F9FAFB',borderRadius:12,padding:14,borderWidth:1,borderColor:'#E5E7EB'},
  secTitle:    {fontSize:14,fontWeight:'700',color:'#111827',marginBottom:10},
  input:       {backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,padding:12,fontSize:14,color:'#111827'},
  stChip:      {paddingHorizontal:10,paddingVertical:4,borderRadius:20},
  stChipText:  {fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  dateBtn:     {flexDirection:'row',alignItems:'center',gap:10,padding:14,backgroundColor:'#EEF2FF',borderRadius:12,borderWidth:1,borderColor:'#C7D2FE'},
  popupOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'flex-end'},
  popupCard:   {backgroundColor:'#fff',borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,width:'100%',paddingBottom:40},
  popupTitle:  {fontSize:20,fontWeight:'800',color:'#111827',textAlign:'center'},
  popupSub:    {fontSize:14,color:'#6B7280',textAlign:'center',marginTop:4},
  popupSkip:   {flex:1,padding:14,borderRadius:14,borderWidth:1,borderColor:'#E5E7EB',alignItems:'center'},
  popupUpdate: {flex:2,padding:14,borderRadius:14,backgroundColor:'#4F46E5',alignItems:'center'},
})
