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
import LeadFormModal from '../../components/LeadFormModal'
import { format } from 'date-fns'

// Formats an ISO timestamp as "12 Aug, 3:45 PM"; returns '—' when absent.
function fmtDateTime(iso) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'd MMM, h:mm a') } catch { return '—' }
}
// Activity-count colour rule: >5 red, >3 dark blue, else default text colour.
function activityNameColor(count) {
  const n = parseInt(count) || 0
  if (n > 5) return '#DC2626'
  if (n > 3) return '#1E3A8A'
  return '#111827'
}

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

export default function LeadsScreen({ navigation }) {
  const { user } = useAuth()
  const [leads, setLeads]             = useState([])
  const [products, setProducts]       = useState([])
  const [agents, setAgents]           = useState([])
  const [leadTypes, setLeadTypes]     = useState([{label:'B2B',key:'b2b'},{label:'B2C',key:'b2c'}])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [search, setSearch]           = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterAgent, setFilterAgent] = useState('')
  const [page, setPage]               = useState(1)
  const [hasMore, setHasMore]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [callLead, setCallLead]       = useState(null)
  const [showPostCallPrompt, setShowPostCallPrompt] = useState(false)
  const appStateRef  = useRef(AppState.currentState)
  const calledLeadRef = useRef(null)
  const PER_PAGE = 20

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
        ...(filterProduct && { product_id: filterProduct }),
        ...(filterAgent && { assigned_to: filterAgent }) })
      const res = await api.get(`/leads?${params}`)
      // NOTE: api client's interceptor already unwraps res.data, so `res`
      // here IS the {success, data, total, page, per_page} body — `total`
      // is a sibling of `data`, not nested inside it. Reading it off the
      // leads array (raw.total) was always undefined, which made hasMore
      // go false right after page 1 — the list looked capped at ~20 items
      // no matter how many leads actually existed.
      const raw = res.data
      const rows = Array.isArray(raw) ? raw : (raw?.data || [])
      const total = res.total ?? rows.length
      if (append) setLeads(p => [...p, ...rows]); else setLeads(rows)
      setHasMore(pageNum * PER_PAGE < total)
    } catch (e) { console.log(e.message) }
    finally { setLoading(false); setLoadingMore(false); setRefreshing(false) }
  }, [search, filterStatus, filterProduct, filterAgent])

  useEffect(() => { setPage(1); fetchLeads(1) }, [fetchLeads])

  useEffect(() => {
    Promise.all([api.get('/products/active'), api.get('/users'), api.get('/settings')]).then(([p, u, s]) => {
      setProducts(p.data?.data || p.data || [])
      // Use /users (not /chat/users) so admin appears in assign dropdown
      setAgents(Array.isArray(u.data?.data) ? u.data.data : (Array.isArray(u.data) ? u.data : []))
      const sData = s.data?.data || s.data || {}
      setLeadTypes(sData.lead_type || sData.lead_types || [{label:'B2B',key:'b2b'},{label:'B2C',key:'b2c'}])
      const sts = sData.lead_status || sData.statuses || []
      if (sts.length) { applyMobStatusColors(sts); ALL_STATUSES = sts.map(s2 => typeof s2==='string'?s2:s2.key) }
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
    const sc = getMobStatusColor(item.status)
    const psc = item.previous_status ? getMobStatusColor(item.previous_status) : null
    const pname = products.find(p => p.id === parseInt(item.product_id))?.name
    const nameColor = activityNameColor(item.activity_count)
    return (
      <TouchableOpacity style={s.card} onPress={() => navigation.navigate('LeadDetail', { lead: item })}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <Text style={[s.leadName,{color:nameColor}]}>{item.name || item.contact_name || item.school_name}</Text>
              {parseInt(item.activity_count) > 0 && (
                <View style={{flexDirection:'row',alignItems:'center',gap:2,backgroundColor:nameColor+'1A',paddingHorizontal:5,paddingVertical:1,borderRadius:8}}>
                  <Ionicons name="pulse-outline" size={10} color={nameColor} />
                  <Text style={{fontSize:10,fontWeight:'700',color:nameColor}}>{item.activity_count}</Text>
                </View>
              )}
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
            <Text style={{fontSize:11,color:'#6B7280',marginTop:3}}>
              👤 {item.agent_name ? item.agent_name : 'Unassigned'}
            </Text>
          </View>
          {/* Status log: Previous status → Current status */}
          <View style={{alignItems:'flex-end',gap:4}}>
            {psc && item.previous_status !== item.status && (
              <View style={{flexDirection:'row',alignItems:'center',gap:3}}>
                <View style={[s.sBadge,{backgroundColor:psc.bg,opacity:0.7}]}>
                  <Text style={[s.sBadgeText,{color:psc.text,fontSize:9}]}>{item.previous_status?.replace(/_/g,' ')}</Text>
                </View>
                <Ionicons name="arrow-forward" size={10} color="#9CA3AF" />
              </View>
            )}
            <View style={[s.sBadge, { backgroundColor: sc.bg }]}>
              <Text style={[s.sBadgeText, { color: sc.text }]}>{item.status?.replace(/_/g,' ')}</Text>
            </View>
          </View>
        </View>
        {(item.last_remark || item.admin_remark || item.creation_comment) && (
          <View style={{paddingHorizontal:2,paddingBottom:6}}>
            {(item.last_remark || item.admin_remark) ? (
              <>
                <Text style={{fontSize:11,color:'#7C3AED',lineHeight:16}} numberOfLines={2}>
                  📝 {item.last_remark || item.admin_remark}
                </Text>
                {(item.last_remark_by || item.last_called_at) && (
                  <Text style={{fontSize:10,color:'#9CA3AF',marginTop:1}}>
                    — {item.last_remark_by || 'Unknown'} · {fmtDateTime(item.last_called_at)}
                  </Text>
                )}
              </>
            ) : null}
            {item.creation_comment ? (
              <Text style={{fontSize:11,color:'#6B7280',lineHeight:16,marginTop:2}} numberOfLines={1}>
                💬 {item.creation_comment}
              </Text>
            ) : null}
          </View>
        )}
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
          <TouchableOpacity style={[s.aBtn, { backgroundColor:'#FEF3C7', flex:0.7 }]}
            onPress={() => setEditingLead(item)}>
            <Ionicons name="pencil" size={14} color="#B45309" /><Text style={[s.aTxt,{color:'#B45309'}]}>Edit</Text>
          </TouchableOpacity>
        </View>
        <View style={s.updatedFooter}>
          <Ionicons name="time-outline" size={11} color="#9CA3AF" />
          <Text style={s.updatedFooterText}>
            Last updated {fmtDateTime(item.updated_at)}{(item.last_updated_by || item.agent_name) ? ` by ${item.last_updated_by || item.agent_name}` : ''}
          </Text>
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

      {/* Filter chips — each row is independently scrollable, no overlap */}
      <View style={{backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#F3F4F6'}}>
        {/* Agent-wise filter — only meaningful for admins/managers who see other agents' leads */}
        {user?.role_name !== 'agent' && agents.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{paddingHorizontal:12,paddingTop:6,paddingBottom:2,flexDirection:'row',alignItems:'center'}}>
            {[{name:'All Agents',id:''}, ...agents].map(a=>(
              <TouchableOpacity key={String(a.id)} onPress={()=>{setFilterAgent(a.id?String(a.id):'');setPage(1)}}
                style={[s.chip, filterAgent===(a.id?String(a.id):'') && s.chipActive]}>
                <Text style={[s.chipTxt, filterAgent===(a.id?String(a.id):'') && s.chipTxtActive]}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{paddingHorizontal:12,paddingTop:6,paddingBottom:4,flexDirection:'row',alignItems:'center'}}>
          {[{label:'All',value:''}, ...ALL_STATUSES.map(s2=>({label:s2.replace(/_/g,' '),value:s2}))].map(item=>(
            <TouchableOpacity key={item.value} onPress={()=>{setFilterStatus(item.value);setPage(1)}}
              style={[s.chip, filterStatus===item.value && s.chipActive]}>
              <Text style={[s.chipTxt, filterStatus===item.value && s.chipTxtActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {products.length>0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{paddingHorizontal:12,paddingTop:2,paddingBottom:6,flexDirection:'row',alignItems:'center'}}>
            {[{name:'All Products',id:''}, ...products].map(p=>(
              <TouchableOpacity key={String(p.id)} onPress={()=>{setFilterProduct(p.id?String(p.id):'');setPage(1)}}
                style={[s.chip, filterProduct===(p.id?String(p.id):'') && s.chipActive]}>
                <Text style={[s.chipTxt, filterProduct===(p.id?String(p.id):'') && s.chipTxtActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {loading ? <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList data={leads} keyExtractor={item=>String(item.id)} renderItem={renderLead}
          style={{flex:1}}
          contentContainerStyle={{padding:12, paddingBottom:80}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);setPage(1);fetchLeads(1)}} tintColor={COLORS.primary} />}
          onEndReached={()=>{if(!hasMore||loadingMore)return;const n=page+1;setPage(n);fetchLeads(n,true)}}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore?<ActivityIndicator color={COLORS.primary} style={{padding:16}}/>:null}
          ListEmptyComponent={<View style={s.center}><Text style={{color:'#9CA3AF'}}>No leads found</Text></View>} />
      )}

      <LeadFormModal visible={showCreate} onClose={()=>setShowCreate(false)}
        onSave={()=>{setPage(1);fetchLeads(1)}} products={products} agents={agents} leadTypes={leadTypes} />

      <LeadFormModal visible={!!editingLead} editLead={editingLead} onClose={()=>setEditingLead(null)}
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
              <TouchableOpacity style={s.popupUpdate} onPress={()=>{
                // Freeze fix: navigating in the SAME tick as closing a native
                // <Modal> races the modal's own dismiss animation — on both
                // iOS and Android this can leave the newly-pushed screen
                // touch-unresponsive (looks like the whole app "froze") even
                // though visible={false} was set. Let the modal actually
                // finish closing (one frame is enough) before pushing the
                // next screen.
                setShowPostCallPrompt(false)
                if (callLead) {
                  const lead = callLead
                  requestAnimationFrame(() => setTimeout(() => navigation.navigate('PostCall', { lead }), 250))
                }
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

const s = StyleSheet.create({
  container: {flex:1,backgroundColor:'#F9FAFB'},
  center:    {flex:1,alignItems:'center',justifyContent:'center',padding:32},
  header:    {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  title:     {fontSize:22,fontWeight:'800',color:'#111827'},
  addBtn:    {width:38,height:38,borderRadius:19,backgroundColor:'#4F46E5',alignItems:'center',justifyContent:'center'},
  searchBox: {flexDirection:'row',alignItems:'center',backgroundColor:'#F3F4F6',borderRadius:10,paddingHorizontal:12,paddingVertical:8},
  searchInput:{flex:1,fontSize:14,color:'#111827'},
  filterBar: {paddingVertical:6,paddingHorizontal:12,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#F3F4F6',flexGrow:0},
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
  updatedFooter: {flexDirection:'row',alignItems:'center',gap:4,marginTop:8,paddingTop:8,borderTopWidth:1,borderTopColor:'#F3F4F6'},
  updatedFooterText: {fontSize:10,color:'#9CA3AF'},
  aBtn:      {flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3,paddingVertical:7,borderRadius:8},
  aTxt:      {fontSize:11,fontWeight:'600'},
  mHeader:   {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  mTitle:    {fontSize:17,fontWeight:'700',color:'#111827'},
  mSave:     {backgroundColor:'#4F46E5',paddingHorizontal:16,paddingVertical:7,borderRadius:10},
  lbl:       {fontSize:12,fontWeight:'600',color:'#6B7280',marginBottom:6},
  inp:       {backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:'#111827'},
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
