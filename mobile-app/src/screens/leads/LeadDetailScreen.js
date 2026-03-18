// mobile-app/src/screens/leads/LeadDetailScreen.js
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet, Linking, Alert
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import COLORS from '../../utils/colors'

const STATUS_COLORS = {
  new:            { bg: '#DBEAFE', text: '#1E40AF' },
  hot:            { bg: '#FEE2E2', text: '#991B1B' },
  warm:           { bg: '#FFEDD5', text: '#9A3412' },
  cold:           { bg: '#F3F4F6', text: '#374151' },
  converted:      { bg: '#DCFCE7', text: '#166534' },
  not_interested: { bg: '#F3F4F6', text: '#6B7280' },
  call_back:      { bg: '#EDE9FE', text: '#5B21B6' },
}

const ALL_STATUSES = ['new','hot','warm','cold','converted','not_interested','call_back']

const COMM_ICONS = { call: 'call', whatsapp: 'logo-whatsapp', email: 'mail' }
const COMM_COLORS = { call: '#16A34A', whatsapp: '#15803D', email: '#1D4ED8' }

export default function LeadDetailScreen({ route, navigation }) {
  const { lead: initialLead, create } = route.params || {}

  const [lead, setLead]               = useState(initialLead || null)
  const [products, setProducts]       = useState([])
  const [tab, setTab]                 = useState('info')
  const [loading, setLoading]         = useState(false)

  // product editing
  const [editingProduct, setEditingProduct] = useState(false)
  const [productForm, setProductForm] = useState({ product_id: '', product_detail: '' })
  const [savingProduct, setSavingProduct] = useState(false)

  // comms
  const [commLogs, setCommLogs]       = useState([])
  const [commLoading, setCommLoading] = useState(false)
  const [commNote, setCommNote]       = useState('')
  const [commType, setCommType]       = useState('call')
  const [savingComm, setSavingComm]   = useState(false)

  // status update
  const [updatingStatus, setUpdatingStatus] = useState(false)

  useEffect(() => {
    api.get('/products/active').then(r => setProducts(r.data?.data || r.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (lead) {
      setProductForm({ product_id: String(lead.product_id || ''), product_detail: lead.product_detail || '' })
      fetchCommLogs()
    }
  }, [lead?.id])

  const fetchCommLogs = async () => {
    if (!lead?.id) return
    setCommLoading(true)
    try {
      const res = await api.get(`/leads/${lead.id}/communications`)
      setCommLogs(res.data?.data || res.data || [])
    } catch {} finally { setCommLoading(false) }
  }

  // ── Status update ─────────────────────────────────────
  const updateStatus = async (newStatus) => {
    setUpdatingStatus(true)
    try {
      const res = await api.patch(`/leads/${lead.id}/status`, { status: newStatus })
      setLead(prev => ({ ...prev, status: newStatus }))
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setUpdatingStatus(false) }
  }

  // ── Product save ──────────────────────────────────────
  const saveProduct = async () => {
    setSavingProduct(true)
    try {
      const res = await api.patch(`/leads/${lead.id}/product`, productForm)
      setLead(res.data?.data || { ...lead, ...productForm })
      setEditingProduct(false)
      Alert.alert('✅ Saved', 'Product updated on this lead')
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setSavingProduct(false) }
  }

  // ── Communication actions ─────────────────────────────
  const logComm = async (type, note = '') => {
    if (!lead?.id) return
    setSavingComm(true)
    try {
      await api.post(`/leads/${lead.id}/communications`, {
        type, direction: 'outbound', note: note || commNote || ''
      })
      setCommNote('')
      fetchCommLogs()
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setSavingComm(false) }
  }

  const handleCall = async () => {
    const phone = lead?.phone?.replace(/\s+/g, '')
    if (!phone) return Alert.alert('No phone number')
    Linking.openURL(`tel:${phone}`)
    await logComm('call', commNote || 'Call initiated from app')
  }

  const handleWhatsApp = async () => {
    const p = lead?.phone?.replace(/[^0-9]/g, '')
    if (!p) return Alert.alert('No phone number')
    Linking.openURL(`https://wa.me/${p.startsWith('91') ? p : '91' + p}`)
    await logComm('whatsapp', commNote || 'WhatsApp opened from app')
  }

  const handleEmail = async () => {
    if (!lead?.email) return Alert.alert('No email address')
    Linking.openURL(`mailto:${lead.email}?subject=Following up — ThynkFlow`)
    await logComm('email', commNote || 'Email opened from app')
  }

  if (!lead) return (
    <View style={s.center}><Text style={s.emptyText}>No lead data</Text></View>
  )

  const sc = STATUS_COLORS[lead.status] || STATUS_COLORS.new
  const productName = products.find(p => p.id === parseInt(lead.product_id))?.name

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName} numberOfLines={1}>{lead.name || lead.contact_name}</Text>
          <Text style={s.headerPhone}>{lead.phone}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[s.statusText, { color: sc.text }]}>{lead.status?.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {/* Quick action bar */}
      <View style={s.quickBar}>
        <TouchableOpacity style={s.quickBtn} onPress={handleCall}>
          <Ionicons name="call" size={20} color="#16A34A" />
          <Text style={[s.quickText, { color: '#16A34A' }]}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={handleWhatsApp}>
          <Ionicons name="logo-whatsapp" size={20} color="#15803D" />
          <Text style={[s.quickText, { color: '#15803D' }]}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn} onPress={handleEmail}>
          <Ionicons name="mail" size={20} color="#1D4ED8" />
          <Text style={[s.quickText, { color: '#1D4ED8' }]}>Email</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quickBtn}
          onPress={() => navigation.navigate('PostCall', { lead })}>
          <Ionicons name="create-outline" size={20} color="#7C3AED" />
          <Text style={[s.quickText, { color: '#7C3AED' }]}>Post-call</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {[['info','Info'],['product','Product'],['comms','Comms & Log']].map(([key, label]) => (
          <TouchableOpacity key={key} style={[s.tab, tab === key && s.tabActive]} onPress={() => setTab(key)}>
            <Text style={[s.tabText, tab === key && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>

        {/* ── INFO TAB ────────────────────────────────── */}
        {tab === 'info' && (
          <View style={s.infoGrid}>
            {[
              ['Email',   lead.email      || '—', 'mail-outline'],
              ['City',    lead.city       || '—', 'location-outline'],
              ['Source',  lead.source     || '—', 'git-branch-outline'],
              ['Agent',   lead.agent_name || '—', 'person-outline'],
              ['Remark',  lead.admin_remark || '—', 'chatbox-outline'],
            ].map(([label, val, icon]) => (
              <View key={label} style={s.infoCard}>
                <Ionicons name={icon} size={14} color="#6B7280" />
                <View style={{ flex: 1 }}>
                  <Text style={s.infoLabel}>{label}</Text>
                  <Text style={s.infoValue}>{val}</Text>
                </View>
              </View>
            ))}

            {/* Status update */}
            <View style={s.sectionBox}>
              <Text style={s.sectionLabel}>Update Status</Text>
              <View style={s.statusGrid}>
                {ALL_STATUSES.map(st => {
                  const c = STATUS_COLORS[st]
                  const active = lead.status === st
                  return (
                    <TouchableOpacity key={st} onPress={() => updateStatus(st)}
                      style={[s.statusOption, { backgroundColor: active ? c.text : c.bg },
                              active && { shadowColor: c.text, shadowOpacity: 0.4, elevation: 4 }]}>
                      <Text style={[s.statusOptionText, { color: active ? '#fff' : c.text }]}>
                        {st.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </View>
        )}

        {/* ── PRODUCT TAB ─────────────────────────────── */}
        {tab === 'product' && (
          <View>
            {/* Current product display */}
            {!editingProduct ? (
              <View style={s.productDisplay}>
                <View style={{ flex: 1 }}>
                  <Text style={s.productDisplayLabel}>Assigned Product</Text>
                  {productName ? (
                    <>
                      <Text style={s.productDisplayName}>{productName}</Text>
                      {lead.product_detail ? (
                        <Text style={s.productDisplayDetail}>{lead.product_detail}</Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={s.productNone}>No product assigned yet</Text>
                  )}
                </View>
                <TouchableOpacity style={s.editProductBtn} onPress={() => setEditingProduct(true)}>
                  <Ionicons name="create-outline" size={16} color="#4F46E5" />
                  <Text style={s.editProductBtnText}>{productName ? 'Update' : 'Assign'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.productForm}>
                <Text style={s.productFormTitle}>{productName ? 'Update Product' : 'Assign Product'}</Text>

                <Text style={s.fieldLabel}>Select Product</Text>
                <View style={s.pickerWrap}>
                  {products.map(p => (
                    <TouchableOpacity key={p.id}
                      style={[s.productOption, String(productForm.product_id) === String(p.id) && s.productOptionActive]}
                      onPress={() => setProductForm(f => ({ ...f, product_id: String(p.id) }))}>
                      <Text style={[s.productOptionText,
                        String(productForm.product_id) === String(p.id) && s.productOptionTextActive]}>
                        {p.name}
                      </Text>
                      <Text style={s.productOptionType}>{p.type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.fieldLabel}>Notes (optional)</Text>
                <TextInput
                  value={productForm.product_detail}
                  onChangeText={t => setProductForm(f => ({ ...f, product_detail: t }))}
                  placeholder="e.g. 6-month plan, batch starting April…"
                  style={s.textInput} multiline numberOfLines={2} placeholderTextColor="#9CA3AF" />

                <View style={s.formBtns}>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingProduct(false)}>
                    <Text style={s.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.saveBtn} onPress={saveProduct} disabled={savingProduct}>
                    <Text style={s.saveBtnText}>{savingProduct ? 'Saving…' : 'Save Product'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <Text style={s.productHint}>
              Product changes are reflected in reports and the product dashboard immediately.
            </Text>
          </View>
        )}

        {/* ── COMMS TAB ───────────────────────────────── */}
        {tab === 'comms' && (
          <View>
            {/* Note input */}
            <TextInput
              value={commNote} onChangeText={setCommNote}
              placeholder="Add a note before calling / messaging…"
              style={[s.textInput, { marginBottom: 12 }]}
              multiline numberOfLines={2} placeholderTextColor="#9CA3AF" />

            {/* Big action buttons */}
            <View style={s.commBtns}>
              <TouchableOpacity style={[s.commBtn, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}
                onPress={handleCall}>
                <Ionicons name="call" size={24} color="#16A34A" />
                <Text style={[s.commBtnText, { color: '#16A34A' }]}>Call Now</Text>
                <Text style={s.commBtnSub}>Opens dialer + logs</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.commBtn, { backgroundColor: '#DCFCE7', borderColor: '#6EE7B7' }]}
                onPress={handleWhatsApp}>
                <Ionicons name="logo-whatsapp" size={24} color="#15803D" />
                <Text style={[s.commBtnText, { color: '#15803D' }]}>WhatsApp</Text>
                <Text style={s.commBtnSub}>Opens wa.me + logs</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.commBtn, { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' }]}
                onPress={handleEmail}>
                <Ionicons name="mail" size={24} color="#1D4ED8" />
                <Text style={[s.commBtnText, { color: '#1D4ED8' }]}>Email</Text>
                <Text style={s.commBtnSub}>Opens mail + logs</Text>
              </TouchableOpacity>
            </View>

            {/* Manual log */}
            <View style={s.manualLog}>
              <Text style={s.sectionLabel}>Add Manual Log</Text>
              <View style={s.commTypeRow}>
                {['call','whatsapp','email'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setCommType(t)}
                    style={[s.typeChip, commType === t && { backgroundColor: '#4F46E5' }]}>
                    <Ionicons name={COMM_ICONS[t]} size={14} color={commType === t ? '#fff' : '#374151'} />
                    <Text style={[s.typeChipText, commType === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[s.saveBtn, { opacity: (!commNote.trim() || savingComm) ? 0.5 : 1 }]}
                onPress={() => logComm(commType)} disabled={!commNote.trim() || savingComm}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={s.saveBtnText}>{savingComm ? 'Logging…' : 'Log This'}</Text>
              </TouchableOpacity>
            </View>

            {/* Activity log */}
            <Text style={[s.sectionLabel, { marginTop: 16 }]}>Activity Log</Text>
            {commLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ padding: 20 }} />
            ) : commLogs.length === 0 ? (
              <View style={s.emptyLog}>
                <Ionicons name="chatbubbles-outline" size={32} color="#D1D5DB" />
                <Text style={s.emptyText}>No communications logged yet</Text>
              </View>
            ) : (
              commLogs.map(log => {
                const color = COMM_COLORS[log.type] || '#374151'
                return (
                  <View key={log.id} style={[s.logItem, { borderLeftColor: color }]}>
                    <View style={s.logHeader}>
                      <Ionicons name={COMM_ICONS[log.type] || 'chatbubble'} size={14} color={color} />
                      <Text style={[s.logType, { color }]}>{log.type} · {log.direction}</Text>
                      <Text style={s.logTime}>{formatDate(log.created_at)}</Text>
                    </View>
                    {log.note ? <Text style={s.logNote}>{log.note}</Text> : null}
                    <Text style={s.logAgent}>by {log.agent_name}</Text>
                  </View>
                )
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F9FAFB' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText:    { color: '#9CA3AF', fontSize: 14, marginTop: 8 },

  header:       { flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingTop: 52, paddingBottom: 12,
                  backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:      { padding: 4 },
  headerName:   { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerPhone:  { fontSize: 13, color: '#6B7280', fontFamily: 'monospace' },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusText:   { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  quickBar:     { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  quickBtn:     { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  quickText:    { fontSize: 11, fontWeight: '600' },

  tabs:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:    { borderBottomColor: '#4F46E5' },
  tabText:      { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  tabTextActive:{ color: '#4F46E5', fontWeight: '700' },

  infoGrid:     { gap: 8 },
  infoCard:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#fff',
                  borderRadius: 12, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  infoLabel:    { fontSize: 11, color: '#9CA3AF' },
  infoValue:    { fontSize: 14, fontWeight: '600', color: '#111827', marginTop: 1 },

  sectionBox:   { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 4,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  statusGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusOptionText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  productDisplay: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EEF2FF',
                    borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  productDisplayLabel: { fontSize: 11, color: '#6366F1', fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  productDisplayName: { fontSize: 18, fontWeight: '800', color: '#312E81' },
  productDisplayDetail: { fontSize: 13, color: '#4338CA', marginTop: 4 },
  productNone:  { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  editProductBtn: { flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6,
                    borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' },
  editProductBtnText: { fontSize: 13, color: '#4F46E5', fontWeight: '600' },
  productHint:  { fontSize: 12, color: '#9CA3AF', marginTop: 12, textAlign: 'center' },

  productForm:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 8,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  productFormTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  fieldLabel:   { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  pickerWrap:   { gap: 6 },
  productOption:{ padding: 12, borderRadius: 10, backgroundColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  productOptionActive: { backgroundColor: '#4F46E5' },
  productOptionText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  productOptionTextActive: { color: '#fff' },
  productOptionType: { fontSize: 11, color: '#9CA3AF' },

  textInput:    { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
                  padding: 12, fontSize: 14, color: '#111827', textAlignVertical: 'top' },
  formBtns:     { flexDirection: 'row', gap: 8, marginTop: 4 },
  cancelBtn:    { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelBtnText:{ fontSize: 14, color: '#374151', fontWeight: '600' },
  saveBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: 12, borderRadius: 10, backgroundColor: '#4F46E5' },
  saveBtnText:  { fontSize: 14, color: '#fff', fontWeight: '700' },

  commBtns:     { flexDirection: 'row', gap: 8, marginBottom: 16 },
  commBtn:      { flex: 1, alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1.5, gap: 4 },
  commBtnText:  { fontSize: 13, fontWeight: '700' },
  commBtnSub:   { fontSize: 10, color: '#9CA3AF', textAlign: 'center' },

  manualLog:    { backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  commTypeRow:  { flexDirection: 'row', gap: 8 },
  typeChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 4, padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#374151', textTransform: 'capitalize' },

  logItem:      { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
                  borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  logHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  logType:      { fontSize: 12, fontWeight: '700', textTransform: 'capitalize', flex: 1 },
  logTime:      { fontSize: 11, color: '#9CA3AF' },
  logNote:      { fontSize: 13, color: '#374151', marginBottom: 4 },
  logAgent:     { fontSize: 11, color: '#9CA3AF' },

  emptyLog:     { alignItems: 'center', padding: 32, gap: 8 },
})
