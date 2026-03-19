// mobile-app/src/screens/leads/LeadsScreen.js
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
  new:            { bg: '#DBEAFE', text: '#1E40AF' },
  hot:            { bg: '#FEE2E2', text: '#991B1B' },
  warm:           { bg: '#FFEDD5', text: '#9A3412' },
  cold:           { bg: '#F3F4F6', text: '#374151' },
  converted:      { bg: '#DCFCE7', text: '#166534' },
  not_interested: { bg: '#F3F4F6', text: '#6B7280' },
  call_back:      { bg: '#EDE9FE', text: '#5B21B6' },
}
const ALL_STATUSES = Object.keys(STATUS_COLORS)

export default function LeadsScreen({ navigation }) {
  const { user } = useAuth()
  const [leads, setLeads]             = useState([])
  const [products, setProducts]       = useState([])
  const [agents, setAgents]           = useState([])
  const [leadTypes, setLeadTypes]     = useState([{label:'B2B',key:'b2b'},{label:'B2C',key:'b2c'}])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState('new')
  const [filterProduct, setFilterProduct] = useState('')
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [callLead, setCallLead]       = useState(null)
  const [showPostCallPrompt, setShowPostCallPrompt] = useState(false)
  const appStateRef  = useRef(AppState.currentState)
  const calledLeadRef = useRef(null)
  const PER_PAGE = 50

  // Detect return from phone call
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active' && calledLeadRef.current) {
        setCallLead(calledLeadRef.current)
        setShowPostCallPrompt(true)
        calledLeadRef.current = null
      }
      appStateRef.current = next
    })
    return () => sub.remove()
  }, [])

  const fetchLeads = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true); else setLoadingMore(true)
    try {
      const params = new URLSearchParams({ page: pageNum, per_page: PER_PAGE,
        ...(search && { search }), ...(filterStatus && { status: filterStatus }),
        ...(filterProduct && { product_id: filterProduct }) })
      const res = await api.get(`/leads?${params}`)
      const raw = res.data
      const rows = Array.isArray(raw) ? raw : (raw.data || [])
      const total = raw.total || rows.length
      if (append) setLeads(p => [...p, ...rows]); else setLeads(rows)
      setHasMore(pageNum * PER_PAGE < total)
    } catch (e) { console.log(e.message) }
    finally { setLoading(false); setLoadingMore(false); setRefreshing(false) }
  }, [search, filterStatus, filterProduct])

  useEffect(() => { setPage(1); fetchLeads(1) }, [fetchLeads])

  useEffect(() => {
    Promise.all([api.get('/products/active'), api.get('/chat/users'), api.get('/settings')]).then(([p, u, s]) => {
      setProducts(p.data?.data || p.data || [])
      setAgents(Array.isArray(u.data?.data) ? u.data.data : (Array.isArray(u.data) ? u.data : []))
      const sData = s.data?.data || s.data || {}
      setLeadTypes(sData.lead_type || sData.lead_types || [{label:'B2B',key:'b2b'},{label:'B2C',key:'b2c'}])
    }).catch(() => {})
  }, [])

  const handleCall = (lead) => {
    const phone = (lead.phone || '').replace(/\s+/g, '')
    if (!phone) return Alert.alert('No phone number')
    calledLeadRef.current = lead
    Linking.openURL(`tel:${phone}`)
    api.post(`/leads/${lead.id}/communications`, { type:'call', direction:'outbound', note:'Call from app' }).catch(()=>{})
  }

  const handleWhatsApp = (lead) => {
    const p = (lead.phone||'').replace(/[^0-9]/g,'')
    if (!p) return Alert.alert('No phone')
    Linking.openURL(`https://wa.me/${p.startsWith('91')?p:'91'+p}`)
  }

  const renderLead = ({ item }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.new
    const pname = products.find(p => p.id === parseInt(item.product_id))?.name
    return (
      <TouchableOpacity style={s.card} onPress={() => navigation.navigate('LeadDetail', { lead: item })}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <Text style={s.leadName}>{item.name || item.contact_name || item.school_name}</Text>
              {item.lead_type && (
                <View style={{paddingHorizontal:6,paddingVertical:1,borderRadius:8,backgroundColor:item.lead_type==='B2B'?'#DBEAFE':'#DCFCE7'}}>
                  <Text style={{fontSize:9,fontWeight:'700',color:item.lead_type==='B2B'?'#1E40AF':'#166534'}}>{item.lead_type}</Text>
                </View>
              )}
            </View>
            {item.school_name && item.school_name!==item.name && item.school_name!==item.contact_name && (
              <Text style={{fontSize:11,color:'#9CA3AF',marginTop:1}}>🏫 {item.school_name}</Text>
            )}
            <Text style={s.leadPhone}>{item.phone}</Text>
            {pname && <View style={s.pBadge}><Ionicons name="cube-outline" size={10} color="#4F46E5" /><Text style={s.pBadgeText}>{pname}</Text></View>}
          </View>
          <View style={[s.sBadge, { backgroundColor: sc.bg }]}>
            <Text style={[s.sBadgeText, { color: sc.text }]}>{item.status?.replace(/_/g,' ')}</Text>
          </View>
        </View>
        <View style={s.actions}>
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#DCFCE7' }]} onPress={() => handleCall(item)}>
            <Ionicons name="call" size={14} color="#16A34A" /><Text style={[s.aTxt,{color:'#16A34A'}]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#DCFCE7' }]} onPress={() => handleWhatsApp(item)}>
            <Ionicons name="logo-whatsapp" size={14} color="#15803D" /><Text style={[s.aTxt,{color:'#15803D'}]}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#EDE9FE' }]} onPress={() => navigation.navigate('LeadDetail', { lead: item })}>
            <Ionicons name="open-outline" size={14} color="#5B21B6" /><Text style={[s.aTxt,{color:'#5B21B6'}]}>Detail</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#DBEAFE' }]} onPress={() => navigation.navigate('PostCall', { lead: item })}>
            <Ionicons name="create-outline" size={14} color="#1E40AF" /><Text style={[s.aTxt,{color:'#1E40AF'}]}>Update</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Leads</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowCreate(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={{ backgroundColor:'#fff', paddingHorizontal:12, paddingVertical:8 }}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{marginRight:6}} />
          <TextInput value={search} onChangeText={t=>{setSearch(t);setPage(1)}}
            placeholder="Search name, phone…" placeholderTextColor="#9CA3AF" style={s.searchInput} />
        </View>
      </View>

      {/* Status chips - horizontal scrollable tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar}>
        {[{label:'All',value:''}, ...ALL_STATUSES.map(s2=>({label:s2.replace(/_/g,' '),value:s2}))].map(item=>(
          <TouchableOpacity key={item.value} onPress={()=>{setFilterStatus(item.value);setPage(1)}}
            style={[s.chip, filterStatus===item.value && s.chipActive]}>
            <Text style={[s.chipTxt, filterStatus===item.value && s.chipTxtActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {products.length>0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.filterBar,{paddingBottom:4}]}>
          {[{name:'All Products',id:''}, ...products].map(p=>(
            <TouchableOpacity key={String(p.id)} onPress={()=>{setFilterProduct(p.id?String(p.id):'');setPage(1)}}
              style={[s.chip, filterProduct===(p.id?String(p.id):'') && s.chipActive]}>
              <Text style={[s.chipTxt, filterProduct===(p.id?String(p.id):'') && s.chipTxtActive]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList data={leads} keyExtractor={item=>String(item.id)} renderItem={renderLead}
          contentContainerStyle={{padding:12, paddingBottom:80}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);setPage(1);fetchLeads(1)}} tintColor={COLORS.primary} />}
          onEndReached={()=>{if(!hasMore||loadingMore)return;const n=page+1;setPage(n);fetchLeads(n,true)}}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore?<ActivityIndicator color={COLORS.primary} style={{padding:16}}/>:null}
          ListEmptyComponent={<View style={s.center}><Text style={{color:'#9CA3AF'}}>No leads found</Text></View>} />
      )}

      <CreateLeadModal visible={showCreate} onClose={()=>setShowCreate(false)}
        onSave={()=>{setPage(1);fetchLeads(1)}} products={products} agents={agents} leadTypes={leadTypes} />

      <Modal visible={showPostCallPrompt} transparent animationType="slide">
        <View style={s.popupOverlay}>
          <View style={s.popupCard}>
            <Text style={s.popupTitle}>📞 Call Ended</Text>
            <Text style={s.popupSub}>{callLead?.name||callLead?.contact_name} · {callLead?.phone}</Text>
            <Text style={{fontSize:14,color:'#374151',textAlign:'center',marginTop:10,marginBottom:18}}>Update call notes?</Text>
            <View style={{flexDirection:'row',gap:12}}>
              <TouchableOpacity style={s.popupSkip} onPress={()=>setShowPostCallPrompt(false)}>
                <Text style={{fontSize:14,fontWeight:'600',color:'#6B7280'}}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.popupUpdate} onPress={()=>{setShowPostCallPrompt(false);if(callLead)navigation.navigate('PostCall',{lead:callLead})}}>
                <Text style={{fontSize:14,fontWeight:'700',color:'#fff'}}>Update Call →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function CreateLeadModal({ visible, onClose, onSave, products, agents, leadTypes = [{label:'B2B',key:'b2b'},{label:'B2C',key:'b2c'}] }) {
  const empty = {name:'',phone:'',email:'',city:'',source:'',school_name:'',lead_type:'',creation_comment:'',status:'new',product_id:'',notes:'',follow_up_date:'',assigned_to:''}
  const [form, setForm]       = useState(empty)
  const [saving, setSaving]   = useState(false)
  const [showCal, setShowCal] = useState(false)
  const f = (key) => (val) => setForm(p=>({...p,[key]:val}))

  const handleSave = async () => {
    if (!form.name.trim()) return Alert.alert('Required','Enter lead name')
    if (!form.phone.trim()) return Alert.alert('Required','Enter phone number')
    setSaving(true)
    try {
      const res = await api.post('/leads', {
        name:form.name.trim(), contact_name:form.name.trim(),
        school_name:form.school_name?.trim()||null,
        phone:form.phone.trim(), email:form.email||null, city:form.city||null,
        source:form.source||null, lead_type:form.lead_type||null,
        creation_comment:form.creation_comment?.trim()||null,
        status:form.status,
        product_id:form.product_id||null, admin_remark:form.notes||null,
        assigned_to:form.assigned_to||null,
      })
      if (form.follow_up_date) {
        const lead = res.data?.data || res.data
        if (lead?.id) await api.post('/followups',{lead_id:lead.id,follow_up_date:form.follow_up_date,notes:form.notes||''}).catch(()=>{})
      }
      setForm(empty); onSave(); onClose()
    } catch(err) { Alert.alert('Error',err.message||'Failed to create lead') }
    finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{flex:1,backgroundColor:'#fff'}}>
        <View style={s.mHeader}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#374151" /></TouchableOpacity>
          <Text style={s.mTitle}>Add New Lead</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={s.mSave}>
            <Text style={{color:'#fff',fontWeight:'700',fontSize:14}}>{saving?'…':'Save'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}}>
          {/* Name & Phone */}
          <View style={{flexDirection:'row',gap:10,marginBottom:14}}>
            <View style={{flex:1}}>
              <Text style={s.lbl}>Full Name *</Text>
              <TextInput value={form.name} onChangeText={f('name')} placeholder="Rahul Sharma" style={s.inp} placeholderTextColor="#9CA3AF" />
            </View>
            <View style={{flex:1}}>
              <Text style={s.lbl}>Phone *</Text>
              <TextInput value={form.phone} onChangeText={f('phone')} placeholder="9876543210" keyboardType="phone-pad" style={s.inp} placeholderTextColor="#9CA3AF" />
            </View>
          </View>
          {/* Email & City */}
          <View style={{flexDirection:'row',gap:10,marginBottom:14}}>
            <View style={{flex:1}}>
              <Text style={s.lbl}>Email</Text>
              <TextInput value={form.email} onChangeText={f('email')} placeholder="email@example.com" keyboardType="email-address" style={s.inp} placeholderTextColor="#9CA3AF" />
            </View>
            <View style={{flex:1}}>
              <Text style={s.lbl}>City</Text>
              <TextInput value={form.city} onChangeText={f('city')} placeholder="Delhi" style={s.inp} placeholderTextColor="#9CA3AF" />
            </View>
          </View>
          {/* School Name */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>School / Organisation Name</Text>
            <TextInput value={form.school_name} onChangeText={t=>setForm(f=>({...f,school_name:t}))}
              placeholder="e.g. Delhi Public School" style={s.inp} placeholderTextColor="#9CA3AF" />
          </View>

          {/* Lead Type */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Lead Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[{label:'',key:''},...leadTypes].map(t=>{
                const lbl = t?.label||t
                const sel = form.lead_type === lbl
                return <TouchableOpacity key={t?.key||lbl||'none'} onPress={()=>setForm(f=>({...f,lead_type:lbl}))}
                  style={[s.chip, sel&&s.chipActive, {marginRight:6}]}>
                  <Text style={[s.chipTxt, sel&&s.chipTxtActive]}>{lbl||'None'}</Text>
                </TouchableOpacity>
              })}
            </ScrollView>
          </View>

          {/* Status - horizontal tab chips */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ALL_STATUSES.map(st=>{
                const c=STATUS_COLORS[st];const sel=form.status===st
                return <TouchableOpacity key={st} onPress={()=>f('status')(st)} style={[s.chip,sel&&s.chipActive,{marginRight:6}]}>
                  <Text style={[s.chipTxt,sel&&s.chipTxtActive]}>{st.replace(/_/g,' ')}</Text>
                </TouchableOpacity>
              })}
            </ScrollView>
          </View>
          {/* Product */}
          {products.length>0 && <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Product Interest</Text>
            <View style={s.dropdownWrap}>
              <TouchableOpacity style={[s.dropdownItem, !form.product_id && s.dropdownItemActive]}
                onPress={()=>f('product_id')('')}>
                <Text style={[s.dropdownText, !form.product_id && s.dropdownTextActive]}>— No product —</Text>
                {!form.product_id && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
              </TouchableOpacity>
              {products.map(p=>{
                const sel=form.product_id===String(p.id)
                return <TouchableOpacity key={String(p.id)} style={[s.dropdownItem,sel&&s.dropdownItemActive]}
                  onPress={()=>f('product_id')(String(p.id))}>
                  <View style={{flex:1}}>
                    <Text style={[s.dropdownText,sel&&s.dropdownTextActive]}>{p.name}</Text>
                    <Text style={s.dropdownSub}>{p.type}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
                </TouchableOpacity>
              })}
            </View>
          </View>}
          {/* Assign To */}
          {agents.length>0 && <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Assign To</Text>
            <View style={s.dropdownWrap}>
              <TouchableOpacity style={[s.dropdownItem, !form.assigned_to && s.dropdownItemActive]}
                onPress={()=>f('assigned_to')('')}>
                <Text style={[s.dropdownText, !form.assigned_to && s.dropdownTextActive]}>— Assign to me —</Text>
                {!form.assigned_to && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
              </TouchableOpacity>
              {agents.map(a=>{
                const sel=form.assigned_to===a.id
                return <TouchableOpacity key={String(a.id)} style={[s.dropdownItem,sel&&s.dropdownItemActive]}
                  onPress={()=>f('assigned_to')(a.id)}>
                  <View style={[s.agentDot,{backgroundColor:sel?'#4F46E5':'#9CA3AF'}]}>
                    <Text style={{color:'#fff',fontSize:11,fontWeight:'700'}}>{a.name?.charAt(0)?.toUpperCase()}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={[s.dropdownText,sel&&s.dropdownTextActive]}>{a.name}</Text>
                    <Text style={s.dropdownSub}>{a.role_name||'agent'}</Text>
                  </View>
                  {sel && <Ionicons name="checkmark" size={16} color="#4F46E5" />}
                </TouchableOpacity>
              })}
            </View>
          </View>}
          {/* Creation Comment */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Creation Comment</Text>
            <TextInput value={form.creation_comment} onChangeText={t=>setForm(f=>({...f,creation_comment:t}))}
              placeholder="e.g. April batch upload, Cold calling list…"
              style={s.inp} placeholderTextColor="#9CA3AF" />
          </View>

          {/* Notes */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Notes</Text>
            <TextInput value={form.notes} onChangeText={f('notes')} placeholder="Initial notes…"
              multiline numberOfLines={3} style={[s.inp,{minHeight:80,textAlignVertical:'top'}]} placeholderTextColor="#9CA3AF" />
            <VoiceInput
              onResult={text => setForm(p => ({...p, notes: p.notes ? p.notes + ' ' + text : text}))}
              style={{marginTop:8}} />
          </View>
          {/* Follow-up with calendar */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Schedule Follow-up</Text>
            <TouchableOpacity onPress={()=>setShowCal(true)} style={s.dateBtn}>
              <Ionicons name="calendar-outline" size={18} color="#4F46E5" />
              <Text style={[{flex:1,fontSize:14,color:'#9CA3AF'},form.follow_up_date&&{color:'#111827',fontWeight:'600'}]}>
                {form.follow_up_date||'Select date'}
              </Text>
              {form.follow_up_date && <TouchableOpacity onPress={()=>f('follow_up_date')('')}><Ionicons name="close-circle" size={18} color="#9CA3AF" /></TouchableOpacity>}
            </TouchableOpacity>
          </View>
        </ScrollView>
        <Modal visible={showCal} transparent animationType="fade">
          <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'center'}}>
            <CalendarPicker value={form.follow_up_date} onChange={d=>f('follow_up_date')(d)} onClose={()=>setShowCal(false)} />
          </View>
        </Modal>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  container: {flex:1,backgroundColor:'#F9FAFB'},
  center:    {flex:1,alignItems:'center',justifyContent:'center',padding:32},
  header:    {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  title:     {fontSize:22,fontWeight:'800',color:'#111827'},
  addBtn:    {width:38,height:38,borderRadius:19,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center'},
  searchBox: {flexDirection:'row',alignItems:'center',backgroundColor:'#F3F4F6',borderRadius:10,paddingHorizontal:12,paddingVertical:8},
  searchInput:{flex:1,fontSize:14,color:'#111827'},
  filterBar: {paddingVertical:4,paddingHorizontal:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#F3F4F6',maxHeight:42},
  chip:      {paddingHorizontal:10,paddingVertical:0,borderRadius:20,backgroundColor:'#F3F4F6',marginRight:5,height:30,alignItems:'center',justifyContent:'center'},
  chipActive:{backgroundColor:'#4F46E5',shadowColor:'#4F46E5',shadowOpacity:0.3,shadowRadius:4,elevation:3},
  chipTxt:   {fontSize:11,color:'#374151',textTransform:'capitalize',fontWeight:'500'},
  chipTxtActive:{color:'#fff',fontWeight:'600'},
  card:      {backgroundColor:'#fff',borderRadius:14,padding:14,marginBottom:10,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.06,shadowRadius:4,elevation:2},
  cardTop:   {flexDirection:'row',alignItems:'flex-start',marginBottom:10},
  leadName:  {fontSize:15,fontWeight:'700',color:'#111827'},
  leadPhone: {fontSize:13,color:'#6B7280',marginTop:2},
  pBadge:    {flexDirection:'row',alignItems:'center',gap:3,marginTop:4,backgroundColor:'#EEF2FF',paddingHorizontal:6,paddingVertical:2,borderRadius:6,alignSelf:'flex-start'},
  pBadgeText:{fontSize:11,color:'#4F46E5',fontWeight:'600'},
  sBadge:    {paddingHorizontal:8,paddingVertical:3,borderRadius:20},
  sBadgeText:{fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  actions:   {flexDirection:'row',gap:6},
  aBtn:      {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3,paddingVertical:7,borderRadius:8},
  aTxt:      {fontSize:11,fontWeight:'600'},
  mHeader:   {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  mTitle:    {fontSize:17,fontWeight:'700',color:'#111827'},
  mSave:     {backgroundColor:'#4F46E5',paddingHorizontal:16,paddingVertical:7,borderRadius:10},
  lbl:       {fontSize:12,fontWeight:'600',color:'#6B7280',marginBottom:6},
  inp:       {backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:'#111827'},
  chipTxtActive:{color:'#fff',fontWeight:'600'},
  dateBtn:   {flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,paddingHorizontal:12,paddingVertical:10},
  dropdownWrap:{borderWidth:1,borderColor:'#E5E7EB',borderRadius:12,overflow:'hidden',marginTop:4},
  dropdownItem:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderBottomWidth:1,borderBottomColor:'#F3F4F6',backgroundColor:'#fff'},
  dropdownItemActive:{backgroundColor:'#EEF2FF'},
  dropdownText:{fontSize:14,color:'#374151',fontWeight:'500'},
  dropdownTextActive:{color:'#4F46E5',fontWeight:'700'},
  dropdownSub: {fontSize:11,color:'#9CA3AF',marginTop:1},
  agentDot:    {width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center'},
  popupOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'flex-end'},
  popupCard: {backgroundColor:'#fff',borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,width:'100%',paddingBottom:40},
  popupTitle:{fontSize:20,fontWeight:'800',color:'#111827',textAlign:'center'},
  popupSub:  {fontSize:14,color:'#6B7280',textAlign:'center',marginTop:4},
  popupSkip: {flex:1,padding:14,borderRadius:14,borderWidth:1,borderColor:'#E5E7EB',alignItems:'center'},
  popupUpdate:{flex:2,padding:14,borderRadius:14,backgroundColor:'#4F46E5',alignItems:'center'},
})
