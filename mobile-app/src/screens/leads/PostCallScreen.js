// mobile-app/src/screens/leads/PostCallScreen.js
import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, ActivityIndicator, Modal, Picker
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
// ALL_STATUSES kept for backward compat — will grow as settings are applied
let ALL_STATUSES = Object.keys(STATUS_COLORS)

export default function PostCallScreen({ route, navigation }) {
  const { lead } = route.params || {}
  const [status, setStatus]             = useState(lead?.status || 'new')
  const [leadType, setLeadType]         = useState(lead?.lead_type || 'B2C')
  const [schoolName, setSchoolName]     = useState(lead?.school_name || '')
  const [leadTypes, setLeadTypes]       = useState([])
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
    Promise.all([api.get('/products/active'), api.get('/chat/users'), api.get('/settings')]).then(([p, u, s]) => {
      setProducts(p.data?.data || p.data || [])
      setAgents(Array.isArray(u.data?.data) ? u.data.data : (Array.isArray(u.data) ? u.data : []))
      const sData = s.data?.data || s.data || {}
      setLeadTypes(sData.lead_type || sData.leadType || [])
      const sts = sData.lead_status || sData.statuses || []
      if (sts.length) { applyMobStatusColors(sts); ALL_STATUSES = sts.map(s2 => typeof s2==='string'?s2:s2.key) }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!discussion.trim()) return Alert.alert('Required', 'Please add call discussion notes')
    setSaving(true)
    try {
      await api.post(`/leads/${lead.id}/communications`, { type:'call', direction:'outbound', note:discussion })
      await api.patch(`/leads/${lead.id}/status`, { status })
      // Update lead_type and school_name if changed
      if (leadType !== (lead?.lead_type||'B2C') || schoolName !== (lead?.school_name||'')) {
        await api.put(`/leads/${lead.id}`, { ...lead, lead_type: leadType, school_name: schoolName }).catch(()=>{})
      }
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

  const currentProduct = products.find(p => String(p.id) === productId)
  const currentAgent   = agents.find(a => a.id === assignedTo)

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

        {/* ── Discussion + Voice ──────────────────── */}
        <View style={s.section}>
          <Text style={s.secTitle}>📝 Call Discussion *</Text>
          <TextInput value={discussion} onChangeText={setDiscussion}
            placeholder="What was discussed? Key points, objections, next steps…"
            multiline numberOfLines={5} style={[s.input,s.textarea]}
            placeholderTextColor="#9CA3AF" textAlignVertical="top" />
          <VoiceInput
            onResult={text => setDiscussion(prev => prev ? prev + ' ' + text : text)}
            style={{marginTop:10}} />
        </View>

        {/* ── Status chips ────────────────────────── */}
        <View style={s.section}>
          <Text style={s.secTitle}>📊 Update Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ALL_STATUSES.map(st => {
              const c=getMobStatusColor(st); const active=status===st
              return (
                <TouchableOpacity key={st} onPress={()=>setStatus(st)}
                  style={[s.stChip,{backgroundColor:active?c.text:c.bg}]}>
                  <Text style={[s.stChipText,{color:active?'#fff':c.text}]}>{st.replace(/_/g,' ')}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>

        {/* ── Lead Type ───────────────────────────── */}
        <View style={s.section}>
          <Text style={s.secTitle}>🏢 Lead Type</Text>
          <View style={{flexDirection:'row',gap:8}}>
            {(leadTypes.length > 0
              ? leadTypes.map(t=>typeof t==='string'?t:(t.label||t.value||t))
              : ['B2B','B2C']
            ).map(lt=>(
              <TouchableOpacity key={lt} onPress={()=>setLeadType(lt)}
                style={{flex:1,padding:10,borderRadius:10,borderWidth:2,alignItems:'center',
                  borderColor:leadType===lt?'#4F46E5':'#E5E7EB',
                  backgroundColor:leadType===lt?'#4F46E5':'#fff'}}>
                <Text style={{fontWeight:'700',fontSize:14,color:leadType===lt?'#fff':'#374151'}}>{lt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── School Name ──────────────────────────── */}
        <View style={s.section}>
          <Text style={s.secTitle}>🏫 School / Organisation</Text>
          <TextInput value={schoolName} onChangeText={setSchoolName}
            placeholder="Enter school or company name"
            placeholderTextColor="#9CA3AF"
            style={s.input} />
        </View>

        {/* ── Product Dropdown ────────────────────── */}
        <View style={s.section}>
          <Text style={s.secTitle}>📦 Product Interest</Text>
          <Text style={s.secHint}>Select the product discussed on this call</Text>
          <View style={s.dropdownWrap}>
            <TouchableOpacity style={[s.dropdownItem, !productId && s.dropdownItemActive]}
              onPress={() => setProductId('')}>
              <Text style={[s.dropdownText, !productId && s.dropdownTextActive]}>— No product —</Text>
              {!productId && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
            </TouchableOpacity>
            {products.map(p => {
              const sel = productId === String(p.id)
              return (
                <TouchableOpacity key={p.id} style={[s.dropdownItem, sel && s.dropdownItemActive]}
                  onPress={() => setProductId(String(p.id))}>
                  <View style={{flex:1}}>
                    <Text style={[s.dropdownText, sel && s.dropdownTextActive]}>{p.name}</Text>
                    <Text style={s.dropdownSub}>{p.type}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
                </TouchableOpacity>
              )
            })}
          </View>
          {productId && (
            <TextInput value={productDetail} onChangeText={setProductDetail}
              placeholder="Product notes, plan, pricing discussed…"
              style={[s.input,{marginTop:8,minHeight:60,textAlignVertical:'top'}]}
              multiline placeholderTextColor="#9CA3AF" />
          )}
        </View>

        {/* ── Assign To Dropdown ──────────────────── */}
        <View style={s.section}>
          <Text style={s.secTitle}>👤 Assign To</Text>
          <Text style={s.secHint}>Reassign this lead to another team member</Text>
          <View style={s.dropdownWrap}>
            {agents.map(a => {
              const sel = assignedTo === a.id
              const isCurrent = lead?.assigned_to === a.id
              return (
                <TouchableOpacity key={String(a.id)} style={[s.dropdownItem, sel && s.dropdownItemActive]}
                  onPress={() => setAssignedTo(a.id)}>
                  <View style={[s.agentDot, {backgroundColor: sel ? '#4F46E5' : '#9CA3AF'}]}>
                    <Text style={{color:'#fff',fontSize:11,fontWeight:'700'}}>{a.name?.charAt(0)?.toUpperCase()}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[s.dropdownText, sel && s.dropdownTextActive]}>
                      {a.name} {isCurrent ? '(current)' : ''}
                    </Text>
                    <Text style={s.dropdownSub}>{a.role_name || 'agent'}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* ── Follow-up Calendar ──────────────────── */}
        <View style={s.section}>
          <Text style={s.secTitle}>📅 Schedule Follow-up</Text>
          <TouchableOpacity onPress={()=>setShowCal(true)} style={s.dateBtn}>
            <Ionicons name="calendar" size={20} color="#4F46E5" />
            <Text style={[{flex:1,fontSize:14,color:'#9CA3AF'},followUpDate&&{color:'#111827',fontWeight:'600'}]}>
              {followUpDate||'Tap to select date'}
            </Text>
            {followUpDate && (
              <TouchableOpacity onPress={()=>setFollowUpDate('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Summary ─────────────────────────────── */}
        {discussion.trim() && (
          <View style={s.summary}>
            <Text style={s.summaryTitle}>What will be saved</Text>
            <Text style={s.summaryRow}>📊 Status: <Text style={s.summaryVal}>{status.replace(/_/g,' ')}</Text></Text>
            {currentProduct && <Text style={s.summaryRow}>📦 Product: <Text style={s.summaryVal}>{currentProduct.name}</Text></Text>}
            {currentAgent && <Text style={s.summaryRow}>👤 Assigned to: <Text style={s.summaryVal}>{currentAgent.name}</Text></Text>}
            {followUpDate && <Text style={s.summaryRow}>📅 Follow-up: <Text style={s.summaryVal}>{followUpDate}</Text></Text>}
          </View>
        )}

        {/* ── Save ────────────────────────────────── */}
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
  secTitle:    {fontSize:14,fontWeight:'700',color:'#111827',marginBottom:4},
  secHint:     {fontSize:12,color:'#9CA3AF',marginBottom:8},
  input:       {backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,padding:12,fontSize:14,color:'#111827'},
  textarea:    {minHeight:120},
  stChip:      {paddingHorizontal:14,paddingVertical:7,borderRadius:20,marginRight:6,height:34,alignItems:'center',justifyContent:'center'},
  stChipText:  {fontSize:12,fontWeight:'600',textTransform:'capitalize'},
  dropdownWrap:{borderWidth:1,borderColor:'#E5E7EB',borderRadius:12,overflow:'hidden',marginTop:4},
  dropdownItem:{flexDirection:'row',alignItems:'center',gap:10,padding:14,borderBottomWidth:1,borderBottomColor:'#F3F4F6',backgroundColor:'#fff'},
  dropdownItemActive:{backgroundColor:'#EEF2FF'},
  dropdownText:{fontSize:14,color:'#374151',fontWeight:'500'},
  dropdownTextActive:{color:'#4F46E5',fontWeight:'700'},
  dropdownSub: {fontSize:11,color:'#9CA3AF',marginTop:1},
  agentDot:    {width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center'},
  dateBtn:     {flexDirection:'row',alignItems:'center',gap:10,padding:14,backgroundColor:'#EEF2FF',borderRadius:12,borderWidth:1,borderColor:'#C7D2FE'},
  summary:     {backgroundColor:'#EEF2FF',borderRadius:14,padding:14,borderWidth:1,borderColor:'#C7D2FE'},
  summaryTitle:{fontSize:12,fontWeight:'700',color:'#4338CA',marginBottom:8,textTransform:'uppercase',letterSpacing:0.5},
  summaryRow:  {fontSize:13,color:'#374151',marginBottom:4},
  summaryVal:  {fontWeight:'700',color:'#111827'},
  saveBtn:     {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#4F46E5',padding:16,borderRadius:14},
  saveBtnText: {fontSize:16,fontWeight:'700',color:'#fff'},
})
