// mobile-app/src/components/LeadFormModal.js
// Shared Create/Edit lead form. Extracted out of LeadsScreen's
// CreateLeadModal so the same full field-set (name, phone, email, city,
// school, lead type, status, product, assign-to, notes, follow-up date)
// can be reached both from "+ Add lead" on the Leads list AND from an
// "Edit" action on an existing lead — previously there was no way to
// edit a lead's core details (name/phone/email/city/source) from the
// mobile app at all once it was created.
import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, Alert, Modal, ScrollView
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../api/client'
import CalendarPicker from './CalendarPicker'
import VoiceInput from './VoiceInput'

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

const empty = {
  name:'', phone:'', email:'', city:'', source:'', school_name:'',
  lead_type:'', creation_comment:'', status:'new', product_id:'',
  notes:'', follow_up_date:'', assigned_to:'',
}

export default function LeadFormModal({
  visible, onClose, onSave, products = [], agents = [],
  leadTypes = [{label:'B2B',key:'b2b'},{label:'B2C',key:'b2c'}],
  editLead = null, // pass an existing lead object to edit it instead of creating
}) {
  const isEdit = !!editLead?.id
  const [form, setForm]       = useState(empty)
  const [saving, setSaving]   = useState(false)
  const [showCal, setShowCal] = useState(false)
  const f = (key) => (val) => setForm(p=>({...p,[key]:val}))

  // Re-seed the form whenever a different lead is opened for editing,
  // or the modal is opened fresh to create a new one.
  useEffect(() => {
    if (!visible) return
    if (isEdit) {
      setForm({
        name: editLead.name || editLead.contact_name || '',
        phone: editLead.phone || '',
        email: editLead.email || '',
        city: editLead.city || '',
        source: editLead.source || '',
        school_name: editLead.school_name || '',
        lead_type: editLead.lead_type || '',
        creation_comment: editLead.creation_comment || '',
        status: editLead.status || 'new',
        product_id: String(editLead.product_id || ''),
        notes: editLead.admin_remark || '',
        follow_up_date: '',
        assigned_to: editLead.assigned_to || '',
      })
    } else {
      setForm(empty)
    }
  }, [visible, editLead?.id])

  const handleSave = async () => {
    if (!form.name.trim()) return Alert.alert('Required','Enter lead name')
    if (!form.phone.trim()) return Alert.alert('Required','Enter phone number')
    setSaving(true)
    try {
      if (isEdit) {
        // PUT replaces the full row server-side, so send every field —
        // spreading the original lead first keeps anything this form
        // doesn't expose (e.g. internal timestamps) untouched.
        await api.put(`/leads/${editLead.id}`, {
          ...editLead,
          name: form.name.trim(), contact_name: form.name.trim(),
          school_name: form.school_name?.trim() || null,
          phone: form.phone.trim(), email: form.email || null, city: form.city || null,
          source: form.source || null, lead_type: form.lead_type || null,
          creation_comment: form.creation_comment?.trim() || null,
          status: form.status,
          product_id: form.product_id || null,
          product_detail: editLead.product_detail || null,
          admin_remark: form.notes || null,
          assigned_to: form.assigned_to || editLead.assigned_to || null,
        })
        if (form.follow_up_date) {
          await api.post('/followups', { lead_id: editLead.id, follow_up_date: form.follow_up_date, notes: form.notes || '' }).catch(()=>{})
        }
      } else {
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
      }
      setForm(empty); onSave(); onClose()
    } catch(err) { Alert.alert('Error', err.message || `Failed to ${isEdit ? 'update' : 'create'} lead`) }
    finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{flex:1,backgroundColor:'#fff'}}>
        <View style={s.mHeader}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#374151" /></TouchableOpacity>
          <Text style={s.mTitle}>{isEdit ? 'Edit Lead' : 'Add New Lead'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={s.mSave}>
            <Text style={{color:'#fff',fontWeight:'700',fontSize:14}}>{saving?'…':'Save'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{flex:1}} contentContainerStyle={{padding:16,paddingBottom:40}} keyboardShouldPersistTaps="handled">
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
            <TextInput value={form.school_name} onChangeText={t=>setForm(p=>({...p,school_name:t}))}
              placeholder="e.g. Delhi Public School" style={s.inp} placeholderTextColor="#9CA3AF" />
          </View>

          {/* Source */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Source</Text>
            <TextInput value={form.source} onChangeText={f('source')}
              placeholder="e.g. Website, Referral, Cold call…" style={s.inp} placeholderTextColor="#9CA3AF" />
          </View>

          {/* Lead Type */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>Lead Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[{label:'',key:''},...leadTypes].map(t=>{
                const lbl = typeof t === 'string' ? t : (t?.label ?? '')
                const sel = form.lead_type === lbl
                return <TouchableOpacity key={t?.key||lbl||'none'} onPress={()=>setForm(p=>({...p,lead_type:lbl}))}
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
              {Object.keys(STATUS_COLORS).map(st=>{
                const c=getMobStatusColor(st);const sel=form.status===st
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
            <TextInput value={form.creation_comment} onChangeText={t=>setForm(p=>({...p,creation_comment:t}))}
              placeholder="e.g. April batch upload, Cold calling list…"
              style={s.inp} placeholderTextColor="#9CA3AF" />
          </View>

          {/* Notes */}
          <View style={{marginBottom:14}}>
            <Text style={s.lbl}>{isEdit ? 'Remark' : 'Notes'}</Text>
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
        {/* Calendar as an in-place overlay, not a second <Modal> — nesting
            a RN Modal inside another Modal is a known cause of the whole
            screen becoming unresponsive ("frozen") after the inner one
            closes, since each Modal opens its own native window. */}
        {showCal && (
          <View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'center',zIndex:999,elevation:999}}>
            <CalendarPicker value={form.follow_up_date} onChange={d=>f('follow_up_date')(d)} onClose={()=>setShowCal(false)} />
          </View>
        )}
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  mHeader:   {flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:52,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#E5E7EB'},
  mTitle:    {fontSize:17,fontWeight:'700',color:'#111827'},
  mSave:     {backgroundColor:'#4F46E5',paddingHorizontal:16,paddingVertical:7,borderRadius:10},
  lbl:       {fontSize:12,fontWeight:'600',color:'#6B7280',marginBottom:6},
  inp:       {backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:'#111827'},
  chip:      {paddingHorizontal:10,paddingVertical:8,borderRadius:20,backgroundColor:'#F3F4F6'},
  chipActive:{backgroundColor:'#4F46E5'},
  chipTxt:   {fontSize:11,color:'#374151',textTransform:'capitalize',fontWeight:'500'},
  chipTxtActive:{color:'#fff',fontWeight:'600'},
  dateBtn:   {flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#F9FAFB',borderWidth:1,borderColor:'#E5E7EB',borderRadius:10,paddingHorizontal:12,paddingVertical:10},
  dropdownWrap:{borderWidth:1,borderColor:'#E5E7EB',borderRadius:12,overflow:'hidden',marginTop:4},
  dropdownItem:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderBottomWidth:1,borderBottomColor:'#F3F4F6',backgroundColor:'#fff'},
  dropdownItemActive:{backgroundColor:'#EEF2FF'},
  dropdownText:{fontSize:14,color:'#374151',fontWeight:'500'},
  dropdownTextActive:{color:'#4F46E5',fontWeight:'700'},
  dropdownSub: {fontSize:11,color:'#9CA3AF',marginTop:1},
  agentDot:    {width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center'},
})
