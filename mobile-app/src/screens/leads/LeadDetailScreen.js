// mobile-app/src/screens/leads/LeadDetailScreen.js
import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, Linking, Alert, Modal, AppState
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
const COMM_ICONS   = { call:'call', whatsapp:'logo-whatsapp', email:'mail' }
const COMM_COLORS  = { call:'#16A34A', whatsapp:'#15803D', email:'#1D4ED8' }

export default function LeadDetailScreen({ route, navigation }) {
  const { lead: initialLead } = route.params || {}
  const [lead, setLead]               = useState(initialLead)
  const [products, setProducts]       = useState([])
  const [agents, setAgents]           = useState([])
  const [tab, setTab]                 = useState('info')
  const [editingProduct, setEditingProduct] = useState(false)
  const [productForm, setProductForm] = useState({ product_id:'', product_detail:'' })
  const [savingProduct, setSavingProduct] = useState(false)
  const [commLogs, setCommLogs]       = useState([])
  const [commLoading, setCommLoading] = useState(false)
  const [commNote, setCommNote]       = useState('')
  const [commType, setCommType]       = useState('call')
  const [savingComm, setSavingComm]   = useState(false)
  const [showCal, setShowCal]         = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')

  // Post-call detection
  const appStateRef = useRef(AppState.currentState)
  const didCall     = useRef(false)

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active' && didCall.current) {
        didCall.current = false
        setTab('comms')
      }
      appStateRef.current = next
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    Promise.all([api.get('/products/active'), api.get('/users')]).then(([p, u]) => {
      setProducts(p.data?.data || p.data || [])
      setAgents(Array.isArray(u.data) ? u.data : (u.data?.data || []))
    }).catch(()=>{})
  }, [])

  useEffect(() => {
    if (lead) {
      setProductForm({product_id:String(lead.product_id||''), product_detail:lead.product_detail||''})
      fetchCommLogs()
    }
  }, [lead?.id])

  const fetchCommLogs = async () => {
    if (!lead?.id) return
    setCommLoading(true)
    try { const r = await api.get(`/leads/${lead.id}/communications`); setCommLogs(r.data?.data||r.data||[]) }
    catch {} finally { setCommLoading(false) }
  }

  const updateStatus = async (st) => {
    try { await api.patch(`/leads/${lead.id}/status`,{status:st}); setLead(p=>({...p,status:st})) }
    catch(e) { Alert.alert('Error',e.message) }
  }

  const saveProduct = async () => {
    setSavingProduct(true)
    try {
      await api.patch(`/leads/${lead.id}/product`, productForm)
      setLead(p=>({...p,...productForm})); setEditingProduct(false)
      Alert.alert('✅','Product updated')
    } catch(e) { Alert.alert('Error',e.message) }
    finally { setSavingProduct(false) }
  }

  const logComm = async (type, note='') => {
    setSavingComm(true)
    try {
      await api.post(`/leads/${lead.id}/communications`,{type,direction:'outbound',note:note||commNote||''})
      if (followUpDate && type==='call') {
        await api.post('/followups',{lead_id:lead.id,follow_up_date:followUpDate,notes:commNote||''}).catch(()=>{})
        setFollowUpDate('')
      }
      setCommNote(''); fetchCommLogs()
    } catch(e) { Alert.alert('Error',e.message) }
    finally { setSavingComm(false) }
  }

  const handleCall = () => {
    const phone=(lead?.phone||'').replace(/\s+/g,'')
    if (!phone) return Alert.alert('No phone')
    didCall.current = true
    Linking.openURL(`tel:${phone}`)
    logComm('call', commNote||'Call from lead detail')
  }

  const handleWhatsApp = () => {
    const p=(lead?.phone||'').replace(/[^0-9]/g,'')
    if (!p) return Alert.alert('No phone')
    Linking.openURL(`https://wa.me/${p.startsWith('91')?p:'91'+p}`)
    logComm('whatsapp', commNote||'WhatsApp from lead detail')
  }

  const handleEmail = () => {
    if (!lead?.email) return Alert.alert('No email')
    Linking.openURL(`mailto:${lead.email}`)
    logComm('email', commNote||'Email from lead detail')
  }

  const assignToAgent = async (agentId) => {
    try {
      await api.put(`/leads/${lead.id}`,{...lead,assigned_to:agentId})
      setLead(p=>({...p,assigned_to:agentId}))
      Alert.alert('✅',`Lead reassigned to ${agents.find(a=>a.id===agentId)?.name||'agent'}`)
    } catch(e) { Alert.alert('Error',e.message) }
  }

  if (!lead) return <View style={s.center}><Text>No lead data</Text></View>

  const sc = STATUS_COLORS[lead.status] || STATUS_COLORS.new
  const productName = products.find(p=>p.id===parseInt(lead.product_id))?.name

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={()=>navigation.goBack()} style={{padding:4}}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{flex:1}}>
          <Text style={s.hName} numberOfLines={1}>{lead.name||lead.contact_name}</Text>
          <Text style={s.hPhone}>{lead.phone}</Text>
        </View>
        <View style={[s.sBadge,{backgroundColor:sc.bg}]}>
          <Text style={[s.sBadgeText,{color:sc.text}]}>{lead.status?.replace(/_/g,' ')}</Text>
        </View>
      </View>

      {/* Quick actions */}
      <View style={s.quickBar}>
        <TouchableOpacity style={s.qBtn} onPress={handleCall}>
          <Ionicons name="call" size={19} color="#16A34A"/><Text style={[s.qTxt,{color:'#16A34A'}]}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.qBtn} onPress={handleWhatsApp}>
          <Ionicons name="logo-whatsapp" size={19} color="#15803D"/><Text style={[s.qTxt,{color:'#15803D'}]}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.qBtn} onPress={handleEmail}>
          <Ionicons name="mail" size={19} color="#1D4ED8"/><Text style={[s.qTxt,{color:'#1D4ED8'}]}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.qBtn} onPress={()=>navigation.navigate('PostCall',{lead})}>
          <Ionicons name="create-outline" size={19} color="#7C3AED"/><Text style={[s.qTxt,{color:'#7C3AED'}]}>Post-call</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs - horizontal compact */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar}>
        {[['info','Info'],['product','Product'],['comms','Comms & Log'],['assign','Assign']].map(([key,label])=>(
          <TouchableOpacity key={key} onPress={()=>setTab(key)}
            style={[s.tab, tab===key && s.tabActive]}>
            <Text style={[s.tabTxt, tab===key && s.tabTxtActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{flex:1}} contentContainerStyle={{padding:14,paddingBottom:40}}>

        {/* INFO */}
        {tab==='info' && <View style={{gap:8}}>
          {[['Email',lead.email||'—'],['City',lead.city||'—'],['Source',lead.source||'—'],
            ['Agent',lead.agent_name||'—'],['Remark',lead.admin_remark||'—']].map(([l,v])=>(
            <View key={l} style={s.infoCard}><Text style={s.infoLbl}>{l}</Text><Text style={s.infoVal}>{v}</Text></View>
          ))}
          <View style={s.section}>
            <Text style={s.secTitle}>Update Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {ALL_STATUSES.map(st=>{
                const c=STATUS_COLORS[st];const active=lead.status===st
                return <TouchableOpacity key={st} onPress={()=>updateStatus(st)}
                  style={[s.stChip,{backgroundColor:active?c.text:c.bg,marginRight:6}]}>
                  <Text style={[s.stChipText,{color:active?'#fff':c.text}]}>{st.replace(/_/g,' ')}</Text>
                </TouchableOpacity>
              })}
            </ScrollView>
          </View>
        </View>}

        {/* PRODUCT */}
        {tab==='product' && <View>
          {!editingProduct ? (
            <View style={s.prodDisplay}>
              <View style={{flex:1}}>
                <Text style={s.prodLabel}>Assigned Product</Text>
                {productName ? <>
                  <Text style={s.prodName}>{productName}</Text>
                  {lead.product_detail ? <Text style={s.prodDetail}>{lead.product_detail}</Text> : null}
                </> : <Text style={{color:'#9CA3AF',fontStyle:'italic'}}>No product assigned</Text>}
              </View>
              <TouchableOpacity style={s.editProdBtn} onPress={()=>setEditingProduct(true)}>
                <Ionicons name="create-outline" size={16} color="#4F46E5" />
                <Text style={{fontSize:13,color:'#4F46E5',fontWeight:'600'}}>{productName?'Update':'Assign'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.section}>
              <Text style={s.secTitle}>{productName?'Update':'Assign'} Product</Text>
              {products.map(p=>(
                <TouchableOpacity key={p.id}
                  style={[s.prodOption, String(productForm.product_id)===String(p.id) && s.prodOptionActive]}
                  onPress={()=>setProductForm(f=>({...f,product_id:String(p.id)}))}>
                  <Text style={[{fontSize:14,fontWeight:'600',color:'#374151'},String(productForm.product_id)===String(p.id)&&{color:'#fff'}]}>{p.name}</Text>
                  <Text style={{fontSize:11,color:'#9CA3AF'}}>{p.type}</Text>
                </TouchableOpacity>
              ))}
              <TextInput value={productForm.product_detail} onChangeText={t=>setProductForm(f=>({...f,product_detail:t}))}
                placeholder="Product notes…" style={[s.input,{marginTop:8}]} multiline placeholderTextColor="#9CA3AF" />
              <View style={{flexDirection:'row',gap:8,marginTop:8}}>
                <TouchableOpacity style={[s.saveBtn,{flex:1}]} onPress={saveProduct} disabled={savingProduct}>
                  <Text style={s.saveBtnText}>{savingProduct?'Saving…':'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={()=>setEditingProduct(false)}>
                  <Text style={{fontSize:14,color:'#374151',fontWeight:'600'}}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>}

        {/* COMMS */}
        {tab==='comms' && <View style={{gap:12}}>
          <View style={s.section}>
            <Text style={s.secTitle}>Add Note</Text>
            <TextInput value={commNote} onChangeText={setCommNote}
              placeholder="Discussion notes…"
              style={[s.input,{minHeight:80,textAlignVertical:'top',marginBottom:8}]}
              multiline placeholderTextColor="#9CA3AF" />
            {/* Follow-up date with calendar */}
            <TouchableOpacity onPress={()=>setShowCal(true)} style={s.dateBtn}>
              <Ionicons name="calendar-outline" size={16} color="#4F46E5" />
              <Text style={[{flex:1,fontSize:13,color:'#9CA3AF'},followUpDate&&{color:'#111827',fontWeight:'600'}]}>
                {followUpDate||'Add follow-up date (optional)'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Action buttons */}
          <View style={s.commBtns}>
            <TouchableOpacity style={[s.cBtn,{backgroundColor:'#DCFCE7',borderColor:'#86EFAC'}]} onPress={handleCall}>
              <Ionicons name="call" size={22} color="#16A34A" />
              <Text style={[s.cBtnTxt,{color:'#16A34A'}]}>Call Now</Text>
              <Text style={s.cBtnSub}>Opens dialer + logs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cBtn,{backgroundColor:'#DCFCE7',borderColor:'#6EE7B7'}]} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={22} color="#15803D" />
              <Text style={[s.cBtnTxt,{color:'#15803D'}]}>WhatsApp</Text>
              <Text style={s.cBtnSub}>Opens wa.me + logs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cBtn,{backgroundColor:'#DBEAFE',borderColor:'#93C5FD'}]} onPress={handleEmail}>
              <Ionicons name="mail" size={22} color="#1D4ED8" />
              <Text style={[s.cBtnTxt,{color:'#1D4ED8'}]}>Email</Text>
              <Text style={s.cBtnSub}>Opens mail + logs</Text>
            </TouchableOpacity>
          </View>

          {/* Manual log */}
          <View style={s.section}>
            <Text style={s.secTitle}>Manual Log</Text>
            <View style={{flexDirection:'row',gap:8,marginBottom:8}}>
              {['call','whatsapp','email'].map(t=>(
                <TouchableOpacity key={t} onPress={()=>setCommType(t)}
                  style={[s.tChip, commType===t&&{backgroundColor:'#4F46E5'}]}>
                  <Ionicons name={COMM_ICONS[t]} size={13} color={commType===t?'#fff':'#374151'} />
                  <Text style={[{fontSize:11,fontWeight:'600',textTransform:'capitalize',color:'#374151'},commType===t&&{color:'#fff'}]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[s.saveBtn,(!commNote.trim()||savingComm)&&{opacity:0.4}]}
              onPress={()=>logComm(commType)} disabled={!commNote.trim()||savingComm}>
              <Text style={s.saveBtnText}>{savingComm?'Logging…':'Log This'}</Text>
            </TouchableOpacity>
          </View>

          {/* Activity log */}
          <Text style={[s.secTitle,{marginTop:4}]}>Activity Log</Text>
          {commLoading ? <ActivityIndicator color={COLORS.primary} style={{padding:20}} />
            : commLogs.length===0
              ? <View style={{alignItems:'center',padding:24}}><Text style={{color:'#9CA3AF'}}>No logs yet</Text></View>
              : commLogs.map(log=>{
                  const color=COMM_COLORS[log.type]||'#374151'
                  return (
                    <View key={log.id} style={[s.logItem,{borderLeftColor:color}]}>
                      <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:3}}>
                        <Ionicons name={COMM_ICONS[log.type]||'chatbubble'} size={13} color={color} />
                        <Text style={{fontSize:12,fontWeight:'700',color,flex:1,textTransform:'capitalize'}}>
                          {log.type} · {log.direction}
                        </Text>
                        <Text style={{fontSize:11,color:'#9CA3AF'}}>
                          {log.created_at?new Date(log.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}
                        </Text>
                      </View>
                      {log.note?<Text style={{fontSize:13,color:'#374151'}}>{log.note}</Text>:null}
                      <Text style={{fontSize:11,color:'#9CA3AF',marginTop:2}}>by {log.agent_name}</Text>
                    </View>
                  )
                })}
        </View>}

        {/* ASSIGN */}
        {tab==='assign' && <View style={{gap:8}}>
          <Text style={[s.secTitle,{marginBottom:4}]}>Reassign this lead</Text>
          {agents.map(agent=>{
            const isCurrent=lead.assigned_to===agent.id
            return (
              <TouchableOpacity key={agent.id}
                style={[s.agentRow,isCurrent&&{borderColor:'#4F46E5',borderWidth:2,backgroundColor:'#EEF2FF'}]}
                onPress={()=>!isCurrent&&assignToAgent(agent.id)}>
                <View style={[s.agentAvatar,isCurrent&&{backgroundColor:'#4F46E5'}]}>
                  <Text style={{color:'#fff',fontWeight:'700',fontSize:13}}>{agent.name?.charAt(0)?.toUpperCase()}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={{fontSize:14,fontWeight:'600',color:'#111827'}}>{agent.name}</Text>
                  <Text style={{fontSize:12,color:'#6B7280'}}>{agent.role_name}</Text>
                </View>
                {isCurrent
                  ? <><Ionicons name="checkmark-circle" size={22} color="#4F46E5" /><Text style={{fontSize:11,color:'#4F46E5',marginLeft:4}}>Current</Text></>
                  : <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />}
              </TouchableOpacity>
            )
          })}
        </View>}
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
  hName:       {fontSize:16,fontWeight:'700',color:'#111827'},
  hPhone:      {fontSize:13,color:'#6B7280'},
  sBadge:      {paddingHorizontal:8,paddingVertical:4,borderRadius:20},
  sBadgeText:  {fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  quickBar:    {flexDirection:'row',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  qBtn:        {flex:1,alignItems:'center',paddingVertical:10,gap:2},
  qTxt:        {fontSize:10,fontWeight:'600'},
  tabBar:      {backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E7EB',paddingHorizontal:8,paddingVertical:4},
  tab:         {paddingHorizontal:14,paddingVertical:8,borderRadius:20,marginRight:4},
  tabActive:   {backgroundColor:'#4F46E5'},
  tabTxt:      {fontSize:13,color:'#6B7280',fontWeight:'500'},
  tabTxtActive:{color:'#fff',fontWeight:'700'},
  infoCard:    {backgroundColor:'#fff',borderRadius:12,padding:12},
  infoLbl:     {fontSize:11,color:'#9CA3AF'},
  infoVal:     {fontSize:14,fontWeight:'600',color:'#111827',marginTop:1},
  section:     {backgroundColor:'#fff',borderRadius:12,padding:14},
  secTitle:    {fontSize:13,fontWeight:'700',color:'#374151',marginBottom:8},
  stChip:      {paddingHorizontal:12,paddingVertical:7,borderRadius:20},
  stChipText:  {fontSize:12,fontWeight:'600',textTransform:'capitalize'},
  prodDisplay: {flexDirection:'row',alignItems:'flex-start',backgroundColor:'#EEF2FF',borderRadius:14,padding:14,borderWidth:1,borderColor:'#C7D2FE'},
  prodLabel:   {fontSize:10,color:'#6366F1',fontWeight:'700',textTransform:'uppercase',marginBottom:4},
  prodName:    {fontSize:17,fontWeight:'800',color:'#312E81'},
  prodDetail:  {fontSize:13,color:'#4338CA',marginTop:3},
  editProdBtn: {flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#fff',paddingHorizontal:10,paddingVertical:6,borderRadius:8,borderWidth:1,borderColor:'#C7D2FE'},
  prodOption:  {padding:12,borderRadius:10,backgroundColor:'#F3F4F6',flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:6},
  prodOptionActive:{backgroundColor:'#4F46E5'},
  input:       {backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,padding:12,fontSize:14,color:'#111827'},
  saveBtn:     {backgroundColor:'#4F46E5',padding:12,borderRadius:10,alignItems:'center'},
  saveBtnText: {fontSize:14,color:'#fff',fontWeight:'700'},
  cancelBtn:   {padding:12,borderRadius:10,borderWidth:1,borderColor:'#E5E7EB',alignItems:'center',paddingHorizontal:20},
  dateBtn:     {flexDirection:'row',alignItems:'center',gap:8,padding:10,backgroundColor:'#EEF2FF',borderRadius:10,borderWidth:1,borderColor:'#C7D2FE'},
  commBtns:    {flexDirection:'row',gap:8},
  cBtn:        {flex:1,alignItems:'center',padding:10,borderRadius:14,borderWidth:1.5,gap:3},
  cBtnTxt:     {fontSize:12,fontWeight:'700'},
  cBtnSub:     {fontSize:9,color:'#9CA3AF',textAlign:'center'},
  tChip:       {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,padding:8,borderRadius:8,backgroundColor:'#F3F4F6'},
  logItem:     {backgroundColor:'#fff',borderRadius:10,padding:12,marginBottom:8,borderLeftWidth:4},
  agentRow:    {flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#fff',borderRadius:14,padding:14,borderWidth:1,borderColor:'#E5E7EB'},
  agentAvatar: {width:38,height:38,borderRadius:19,backgroundColor:'#6B7280',alignItems:'center',justifyContent:'center'},
})
