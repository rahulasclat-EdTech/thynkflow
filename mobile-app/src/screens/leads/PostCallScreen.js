// mobile-app/src/screens/leads/PostCallScreen.js
import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, AppState
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import COLORS from '../../utils/colors'
import CalendarPicker from '../../components/CalendarPicker'
import VoiceInput from '../../components/VoiceInput'

const ALL_STATUSES = ['new','hot','warm','cold','converted','not_interested','call_back']
const STATUS_COLORS = {
  new:            { bg:'#DBEAFE', text:'#1E40AF' },
  hot:            { bg:'#FEE2E2', text:'#991B1B' },
  warm:           { bg:'#FFEDD5', text:'#9A3412' },
  cold:           { bg:'#F3F4F6', text:'#374151' },
  converted:      { bg:'#DCFCE7', text:'#166534' },
  not_interested: { bg:'#F3F4F6', text:'#6B7280' },
  call_back:      { bg:'#EDE9FE', text:'#5B21B6' },
}

export default function PostCallScreen({ route, navigation }) {
  const { lead } = route.params || {}
  const [status, setStatus]             = useState(lead?.status || 'new')
  const [discussion, setDiscussion]     = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [productId, setProductId]       = useState(String(lead?.product_id || ''))
  const [productDetail, setProductDetail] = useState(lead?.product_detail || '')
  const [assignedTo, setAssignedTo]     = useState(lead?.assigned_to || '')
  const [products, setProducts]         = useState([])
  const [agents, setAgents]             = useState([])
  const [saving, setSaving]             = useState(false)
  const [showCal, setShowCal]           = useState(false)

  useEffect(() => {
    Promise.all([api.get('/products/active'), api.get('/users')]).then(([p, u]) => {
      setProducts(p.data?.data || p.data || [])
      setAgents(Array.isArray(u.data) ? u.data : (u.data?.data || []))
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!discussion.trim()) return Alert.alert('Required', 'Please add call discussion notes')
    setSaving(true)
    try {
      await api.post(`/leads/${lead.id}/communications`, { type:'call', direction:'outbound', note:discussion })
      await api.patch(`/leads/${lead.id}/status`, { status })
      if (productId !== String(lead?.product_id||'') || productDetail !== (lead?.product_detail||'')) {
        await api.patch(`/leads/${lead.id}/product`, { product_id:productId||null, product_detail:productDetail||null })
      }
      if (assignedTo && assignedTo !== lead?.assigned_to) {
        await api.put(`/leads/${lead.id}`, { assigned_to:assignedTo }).catch(()=>{})
      }
      if (followUpDate.trim()) {
        await api.post('/followups', { lead_id:lead.id, follow_up_date:followUpDate, notes:discussion }).catch(()=>{})
      }
      Alert.alert('✅ Saved', 'Call logged and lead updated', [{ text:'OK', onPress:()=>navigation.goBack() }])
    } catch (e) { Alert.alert('Error', e.message||'Failed to save') }
    finally { setSaving(false) }
  }

  if (!lead) return <View style={s.center}><Text>No lead data</Text></View>

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={{padding:4}}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{flex:1}}>
          <Text style={s.headerTitle}>Post-Call Update</Text>
          <Text style={s.headerSub}>{lead.name||lead.contact_name} · {lead.phone}</Text>
        </View>
      </View>

      <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:40,gap:14}}>

        {/* Discussion */}
        <View style={s.section}>
          <Text style={s.secTitle}>📝 Call Discussion *</Text>
          <TextInput value={discussion} onChangeText={setDiscussion}
            placeholder="What was discussed? Key points, objections, next steps…"
            multiline numberOfLines={5} style={[s.input,s.textarea]}
            placeholderTextColor="#9CA3AF" textAlignVertical="top" />
        </View>

        {/* Status - compact horizontal tabs */}
        <View style={s.section}>
          <Text style={s.secTitle}>📊 Update Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ALL_STATUSES.map(st => {
              const c=STATUS_COLORS[st]; const active=status===st
              return <TouchableOpacity key={st} onPress={()=>setStatus(st)}
                style={[s.stChip,{backgroundColor:active?c.text:c.bg},active&&{shadowColor:c.text,shadowOpacity:0.4,elevation:3}]}>
                <Text style={[s.stChipText,{color:active?'#fff':c.text}]}>{st.replace(/_/g,' ')}</Text>
              </TouchableOpacity>
            })}
          </ScrollView>
        </View>

        {/* Product */}
        <View style={s.section}>
          <Text style={s.secTitle}>📦 Product Interest</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:8}}>
            {[{id:'',name:'None'}, ...products].map(p => {
              const sel=productId===String(p.id)
              return <TouchableOpacity key={String(p.id)} onPress={()=>setProductId(String(p.id))}
                style={[s.chip,sel&&s.chipActive,{marginRight:6}]}>
                <Text style={[s.chipTxt,sel&&s.chipTxtActive]}>{p.name}</Text>
              </TouchableOpacity>
            })}
          </ScrollView>
          {productId && <TextInput value={productDetail} onChangeText={setProductDetail}
            placeholder="Product notes…" style={[s.input,{minHeight:60,textAlignVertical:'top'}]}
            multiline placeholderTextColor="#9CA3AF" />}
        </View>

        {/* Assign To - shows all agents */}
        {agents.length>0 && <View style={s.section}>
          <Text style={s.secTitle}>👤 Assign To</Text>
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

        {/* Follow-up with full calendar */}
        <View style={s.section}>
          <Text style={s.secTitle}>📅 Schedule Follow-up</Text>
          <TouchableOpacity onPress={()=>setShowCal(true)} style={s.dateBtn}>
            <Ionicons name="calendar" size={20} color="#4F46E5" />
            <Text style={[{flex:1,fontSize:15,color:'#9CA3AF'},followUpDate&&{color:'#111827',fontWeight:'600'}]}>
              {followUpDate||'Tap to select date'}
            </Text>
            {followUpDate && <TouchableOpacity onPress={()=>setFollowUpDate('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>}
          </TouchableOpacity>
          {followUpDate && <Text style={{fontSize:12,color:'#4F46E5',marginTop:4}}>✅ Follow-up: {followUpDate}</Text>}
        </View>

        {/* Summary */}
        {discussion.trim() && (
          <View style={s.summary}>
            <Text style={s.summaryTitle}>Summary</Text>
            <Text style={s.summaryRow}>Status: <Text style={s.summaryVal}>{status.replace(/_/g,' ')}</Text></Text>
            {productId && products.find(p=>String(p.id)===productId) && (
              <Text style={s.summaryRow}>Product: <Text style={s.summaryVal}>{products.find(p=>String(p.id)===productId)?.name}</Text></Text>
            )}
            {assignedTo && agents.find(a=>a.id===assignedTo) && (
              <Text style={s.summaryRow}>Assigned to: <Text style={s.summaryVal}>{agents.find(a=>a.id===assignedTo)?.name}</Text></Text>
            )}
            {followUpDate && <Text style={s.summaryRow}>Follow-up: <Text style={s.summaryVal}>{followUpDate}</Text></Text>}
          </View>
        )}

        <TouchableOpacity style={[s.saveBtn,saving&&{opacity:0.6}]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> :
            <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={s.saveBtnText}>Save Post-Call Update</Text></>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showCal} transparent animationType="fade">
        <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'center'}}>
          <CalendarPicker value={followUpDate} onChange={d=>{setFollowUpDate(d);setShowCal(false)}} onClose={()=>setShowCal(false)} />
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container:   {flex:1,backgroundColor:'#F9FAFB'},
  center:      {flex:1,alignItems:'center',justifyContent:'center'},
  header:      {flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingTop:52,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  headerTitle: {fontSize:16,fontWeight:'700',color:'#111827'},
  headerSub:   {fontSize:12,color:'#6B7280'},
  section:     {backgroundColor:'#fff',borderRadius:14,padding:14,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.05,shadowRadius:3,elevation:1},
  secTitle:    {fontSize:14,fontWeight:'700',color:'#111827',marginBottom:10},
  input:       {backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,padding:12,fontSize:14,color:'#111827'},
  textarea:    {minHeight:120},
  stChip:      {paddingHorizontal:10,paddingVertical:4,borderRadius:20,marginRight:5},
  stChipText:  {fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  chip:        {paddingHorizontal:10,paddingVertical:4,borderRadius:20,backgroundColor:'#F3F4F6'},
  chipActive:  {backgroundColor:'#4F46E5'},
  chipTxt:     {fontSize:13,fontWeight:'600',color:'#374151'},
  chipTxtActive:{color:'#fff'},
  dateBtn:     {flexDirection:'row',alignItems:'center',gap:10,padding:14,backgroundColor:'#EEF2FF',borderRadius:12,borderWidth:1,borderColor:'#C7D2FE'},
  summary:     {backgroundColor:'#EEF2FF',borderRadius:14,padding:14,borderWidth:1,borderColor:'#C7D2FE'},
  summaryTitle:{fontSize:13,fontWeight:'700',color:'#4338CA',marginBottom:6},
  summaryRow:  {fontSize:13,color:'#374151',marginBottom:3},
  summaryVal:  {fontWeight:'700',color:'#111827'},
  saveBtn:     {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#4F46E5',padding:16,borderRadius:14},
  saveBtnText: {fontSize:16,fontWeight:'700',color:'#fff'},
})
