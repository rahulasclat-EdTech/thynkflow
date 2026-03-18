// mobile-app/src/screens/leads/PostCallScreen.js
import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Alert, ActivityIndicator
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import COLORS from '../../utils/colors'

const ALL_STATUSES = ['new','hot','warm','cold','converted','not_interested','call_back']
const STATUS_COLORS = {
  new:            { bg: '#DBEAFE', text: '#1E40AF' },
  hot:            { bg: '#FEE2E2', text: '#991B1B' },
  warm:           { bg: '#FFEDD5', text: '#9A3412' },
  cold:           { bg: '#F3F4F6', text: '#374151' },
  converted:      { bg: '#DCFCE7', text: '#166534' },
  not_interested: { bg: '#F3F4F6', text: '#6B7280' },
  call_back:      { bg: '#EDE9FE', text: '#5B21B6' },
}

export default function PostCallScreen({ route, navigation }) {
  const { lead } = route.params || {}

  const [status, setStatus]           = useState(lead?.status || 'new')
  const [discussion, setDiscussion]   = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [productId, setProductId]     = useState(String(lead?.product_id || ''))
  const [productDetail, setProductDetail] = useState(lead?.product_detail || '')
  const [products, setProducts]       = useState([])
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    api.get('/products/active').then(r => setProducts(r.data?.data || r.data || [])).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!discussion.trim()) return Alert.alert('Required', 'Please add call discussion notes')
    setSaving(true)
    try {
      // 1. Log the call with discussion
      await api.post(`/leads/${lead.id}/communications`, {
        type: 'call', direction: 'outbound', note: discussion
      })

      // 2. Update status
      await api.patch(`/leads/${lead.id}/status`, { status })

      // 3. Update product if changed
      if (productId !== String(lead?.product_id || '') || productDetail !== (lead?.product_detail || '')) {
        await api.patch(`/leads/${lead.id}/product`, { product_id: productId || null, product_detail: productDetail || null })
      }

      // 4. Schedule follow-up if date provided
      if (followUpDate.trim()) {
        await api.post('/followups', {
          lead_id:      lead.id,
          follow_up_date: followUpDate,
          notes:        discussion,
        }).catch(() => {}) // non-blocking
      }

      Alert.alert('✅ Saved', 'Call logged and lead updated', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save')
    } finally { setSaving(false) }
  }

  if (!lead) return (
    <View style={s.center}><Text>No lead data</Text></View>
  )

  const currentProduct = products.find(p => String(p.id) === productId)

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Post-Call Update</Text>
          <Text style={s.headerSub}>{lead.name || lead.contact_name} · {lead.phone}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>

        {/* Discussion */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📝 Call Discussion *</Text>
          <TextInput
            value={discussion} onChangeText={setDiscussion}
            placeholder="What was discussed on the call? Any key points…"
            style={s.textArea} multiline numberOfLines={4}
            placeholderTextColor="#9CA3AF" textAlignVertical="top" />
        </View>

        {/* Status */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📊 Update Lead Status</Text>
          <View style={s.statusGrid}>
            {ALL_STATUSES.map(st => {
              const c = STATUS_COLORS[st]
              const active = status === st
              return (
                <TouchableOpacity key={st} onPress={() => setStatus(st)}
                  style={[s.statusChip, { backgroundColor: active ? c.text : c.bg }]}>
                  <Text style={[s.statusChipText, { color: active ? '#fff' : c.text }]}>
                    {st.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Product */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>📦 Product Interest</Text>
          <Text style={s.hint}>Update or assign product discussed on call</Text>

          <View style={s.productList}>
            <TouchableOpacity
              style={[s.productChip, !productId && s.productChipActive]}
              onPress={() => setProductId('')}>
              <Text style={[s.productChipText, !productId && s.productChipTextActive]}>No product</Text>
            </TouchableOpacity>
            {products.map(p => (
              <TouchableOpacity key={p.id}
                style={[s.productChip, productId === String(p.id) && s.productChipActive]}
                onPress={() => setProductId(String(p.id))}>
                <Text style={[s.productChipText, productId === String(p.id) && s.productChipTextActive]}>
                  {p.name}
                </Text>
                <Text style={s.productType}>{p.type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {productId ? (
            <TextInput
              value={productDetail} onChangeText={setProductDetail}
              placeholder="Product notes, plan, pricing discussed…"
              style={[s.textArea, { marginTop: 8, minHeight: 60 }]}
              multiline placeholderTextColor="#9CA3AF" textAlignVertical="top" />
          ) : null}
        </View>

        {/* Follow-up date */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>🗓️ Schedule Follow-up</Text>
          <TextInput
            value={followUpDate} onChangeText={setFollowUpDate}
            placeholder="YYYY-MM-DD HH:MM  (leave blank to skip)"
            style={s.input} placeholderTextColor="#9CA3AF" />
        </View>

        {/* Summary */}
        <View style={s.summary}>
          <Text style={s.summaryTitle}>Summary</Text>
          <Text style={s.summaryRow}>Status: <Text style={s.summaryVal}>{status.replace(/_/g,' ')}</Text></Text>
          {currentProduct && <Text style={s.summaryRow}>Product: <Text style={s.summaryVal}>{currentProduct.name}</Text></Text>}
          {followUpDate ? <Text style={s.summaryRow}>Follow-up: <Text style={s.summaryVal}>{followUpDate}</Text></Text> : null}
        </View>

        {/* Save button */}
        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#fff" />
            : <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={s.saveBtnText}>Save Post-Call Update</Text></>
          }
        </TouchableOpacity>

      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F9FAFB' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 12, paddingTop: 52, paddingBottom: 12,
                  backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle:  { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerSub:    { fontSize: 12, color: '#6B7280' },

  section:      { backgroundColor: '#fff', borderRadius: 14, padding: 14,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  hint:         { fontSize: 12, color: '#6B7280', marginBottom: 8, marginTop: -6 },

  textArea:     { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
                  borderRadius: 10, padding: 12, fontSize: 14, color: '#111827', minHeight: 100 },
  input:        { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
                  borderRadius: 10, padding: 12, fontSize: 14, color: '#111827' },

  statusGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip:   { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  statusChipText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  productList:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  productChip:  { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' },
  productChipActive: { backgroundColor: '#4F46E5' },
  productChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  productChipTextActive: { color: '#fff' },
  productType:  { fontSize: 10, color: '#9CA3AF', marginTop: 1 },

  summary:      { backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  summaryTitle: { fontSize: 13, fontWeight: '700', color: '#4338CA', marginBottom: 6 },
  summaryRow:   { fontSize: 13, color: '#374151', marginBottom: 3 },
  summaryVal:   { fontWeight: '700', color: '#111827' },

  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 8, backgroundColor: '#4F46E5', padding: 16, borderRadius: 14 },
  saveBtnText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
})
