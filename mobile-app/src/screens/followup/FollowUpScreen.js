// mobile-app/src/screens/followup/FollowUpScreen.js
// Full replacement with: post-call auto-return, calendar, agent assignment
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
const ALL_STATUSES = Object.keys(STATUS_COLORS)

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) }
  catch { return String(d) }
}

function isOverdue(date) {
  if (!date) return false
  return new Date(date) < new Date()
}

export default function FollowUpScreen({ navigation }) {
  const { user } = useAuth()
  const [followups, setFollowups]   = useState([])
  const [agents, setAgents]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter]         = useState('pending') // pending | done | all
  const [statusFilter, setStatusFilter] = useState('') // lead status filter
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
      const params = filter !== 'all' ? `?status=${filter}&per_page=100${statusParam}` : `?per_page=100${statusParam}`
      const [fuRes, uRes] = await Promise.all([
        api.get(`/followups${params}`),
        api.get('/users'),
      ])
      const raw = fuRes.data?.data || fuRes.data || []
      setFollowups(Array.isArray(raw) ? raw : [])
      const allUsers = Array.isArray(uRes.data) ? uRes.data : (uRes.data?.data || [])
      setAgents(allUsers)
    } catch (e) { console.log(e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [filter])

  useEffect(() => { setLoading(true); fetchFollowups() }, [fetchFollowups, statusFilter])

  const handleCall = (fu) => {
    const phone = (fu.phone || fu.lead_phone || '').replace(/\s+/g,'')
    if (!phone) return Alert.alert('No phone number')
    calledLeadRef.current = { id: fu.lead_id, name: fu.lead_name || fu.contact_name, phone }
    Linking.openURL(`tel:${phone}`)
    api.post(`/leads/${fu.lead_id}/communications`,{type:'call',direction:'outbound',note:'Follow-up call'}).catch(()=>{})
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
    const sc = STATUS_COLORS[item.lead_status || item.status] || STATUS_COLORS.new
    return (
      <View style={[s.card, overdue && s.cardOverdue]}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.leadName}>{item.lead_name || item.contact_name || 'Lead'}</Text>
            <Text style={s.leadPhone}>{item.phone || item.lead_phone}</Text>
            <View style={s.dateRow}>
              <Ionicons name="alarm-outline" size={13} color={overdue?'#DC2626':'#D97706'} />
              <Text style={[s.dateText, overdue && {color:'#DC2626',fontWeight:'700'}]}>
                {formatDate(item.follow_up_date || item.scheduled_at)}
                {overdue ? ' • OVERDUE' : ''}
              </Text>
            </View>
            {item.notes && <Text style={s.notes} numberOfLines={2}>{item.notes}</Text>}
          </View>
          <View style={[s.sBadge, {backgroundColor: sc.bg}]}>
            <Text style={[s.sBadgeText, {color: sc.text}]}>{(item.lead_status||item.status||'new').replace(/_/g,' ')}</Text>
          </View>
        </View>
        <View style={s.actions}>
          <TouchableOpacity style={[s.aBtn,{backgroundColor:'#DCFCE7'}]} onPress={()=>handleCall(item)}>
            <Ionicons name="call" size={14} color="#16A34A" /><Text style={[s.aTxt,{color:'#16A34A'}]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.aBtn,{backgroundColor:'#DCFCE7'}]} onPress={()=>handleWhatsApp(item)}>
            <Ionicons name="logo-whatsapp" size={14} color="#15803D" /><Text style={[s.aTxt,{color:'#15803D'}]}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.aBtn,{backgroundColor:'#EDE9FE'}]} onPress={()=>openUpdate(item)}>
            <Ionicons name="create-outline" size={14} color="#5B21B6" /><Text style={[s.aTxt,{color:'#5B21B6'}]}>Update</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Follow-ups</Text>
        <Text style={s.count}>{followups.length}</Text>
      </View>

      {/* Filter tabs - Pending/Done/All */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar}>
        {[['pending','⏳ Pending'],['done','✅ Done'],['all','All']].map(([val,label])=>(
          <TouchableOpacity key={val} onPress={()=>setFilter(val)}
            style={[s.chip, filter===val && s.chipActive]}>
            <Text style={[s.chipTxt, filter===val && s.chipTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lead status filter - compact horizontal chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.filterBar, {paddingBottom:4}]}>
        {[{label:'All Status',value:''}, ...Object.keys(STATUS_COLORS).map(k=>({label:k.replace(/_/g,' '),value:k}))].map(item=>(
          <TouchableOpacity key={item.value} onPress={()=>setStatusFilter(item.value)}
            style={[s.chip, statusFilter===item.value && s.chipActive]}>
            <Text style={[s.chipTxt, statusFilter===item.value && s.chipTxtActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList data={followups} keyExtractor={item=>String(item.id)} renderItem={renderItem}
          contentContainerStyle={{padding:12,paddingBottom:80}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);fetchFollowups()}} tintColor={COLORS.primary} />}
          ListEmptyComponent={<View style={s.center}><Ionicons name="alarm-outline" size={48} color="#D1D5DB" /><Text style={{color:'#9CA3AF',marginTop:8}}>No follow-ups found</Text></View>} />
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
        await api.post(`/leads/${followup.lead_id}/communications`,{type:'call',direction:'outbound',note:discussion})
        await api.patch(`/leads/${followup.lead_id}/status`,{status})
        if (assignedTo && assignedTo !== followup.assigned_to) {
          await api.put(`/leads/${followup.lead_id}`,{assigned_to:assignedTo}).catch(()=>{})
        }
      }
      if (followUpDate) {
        await api.post('/followups',{lead_id:followup.lead_id,follow_up_date:followUpDate,notes:discussion}).catch(()=>{})
      }
      // Mark current follow-up as done
      await api.patch(`/followups/${followup.id}`,{status:'done'}).catch(()=>{})
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

        <ScrollView contentContainerStyle={{padding:16,paddingBottom:40,gap:14}}>
          <View style={{backgroundColor:'#F9FAFB',borderRadius:12,padding:12}}>
            <Text style={{fontSize:15,fontWeight:'700',color:'#111827'}}>{followup.lead_name||followup.contact_name}</Text>
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
                const c=STATUS_COLORS[st];const active=status===st
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

        <Modal visible={showCal} transparent animationType="fade">
          <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'center'}}>
            <CalendarPicker value={followUpDate} onChange={d=>{setFollowUpDate(d);setShowCal(false)}} onClose={()=>setShowCal(false)} />
          </View>
        </Modal>
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
  filterBar:   {paddingVertical:4,paddingHorizontal:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#F3F4F6'},
  chip:        {paddingHorizontal:10,paddingVertical:4,borderRadius:20,backgroundColor:'#F3F4F6',marginRight:5},
  chipActive:  {backgroundColor:'#4F46E5',shadowColor:'#4F46E5',shadowOpacity:0.3,shadowRadius:4,elevation:3},
  chipTxt:     {fontSize:11,color:'#374151',fontWeight:'500'},
  chipTxtActive:{color:'#fff',fontWeight:'700'},
  card:        {backgroundColor:'#fff',borderRadius:14,padding:14,marginBottom:10,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.06,shadowRadius:4,elevation:2},
  cardOverdue: {borderWidth:1.5,borderColor:'#FCA5A5',backgroundColor:'#FFF5F5'},
  cardTop:     {flexDirection:'row',alignItems:'flex-start',marginBottom:10},
  leadName:    {fontSize:15,fontWeight:'700',color:'#111827'},
  leadPhone:   {fontSize:13,color:'#6B7280',marginTop:2},
  dateRow:     {flexDirection:'row',alignItems:'center',gap:4,marginTop:4},
  dateText:    {fontSize:12,color:'#D97706'},
  notes:       {fontSize:12,color:'#6B7280',marginTop:4,fontStyle:'italic'},
  sBadge:      {paddingHorizontal:8,paddingVertical:3,borderRadius:20},
  sBadgeText:  {fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  actions:     {flexDirection:'row',gap:6},
  aBtn:        {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3,paddingVertical:8,borderRadius:8},
  aTxt:        {fontSize:11,fontWeight:'600'},
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
