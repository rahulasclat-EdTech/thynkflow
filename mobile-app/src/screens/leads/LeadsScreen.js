// mobile-app/src/screens/leads/LeadsScreen.js
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  RefreshControl, ActivityIndicator, StyleSheet, Linking
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
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

export default function LeadsScreen({ navigation }) {
  const { user } = useAuth()
  const [leads, setLeads]           = useState([])
  const [products, setProducts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [page, setPage]             = useState(1)
  const [hasMore, setHasMore]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const PER_PAGE = 20

  const fetchLeads = useCallback(async (pageNum = 1, append = false) => {
    if (pageNum === 1) setLoading(true); else setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        page: pageNum, per_page: PER_PAGE,
        ...(search && { search }),
        ...(filterStatus && { status: filterStatus }),
        ...(filterProduct && { product_id: filterProduct }),
      })
      const res = await api.get(`/leads?${params}`)
      const raw = res.data
      const rows = Array.isArray(raw) ? raw : (raw.data || [])
      const total = raw.total || rows.length
      if (append) setLeads(prev => [...prev, ...rows])
      else setLeads(rows)
      setHasMore(pageNum * PER_PAGE < total)
    } catch (e) { console.log(e.message) }
    finally { setLoading(false); setLoadingMore(false); setRefreshing(false) }
  }, [search, filterStatus, filterProduct])

  useEffect(() => { setPage(1); fetchLeads(1) }, [fetchLeads])

  const loadMore = () => {
    if (!hasMore || loadingMore) return
    const next = page + 1
    setPage(next)
    fetchLeads(next, true)
  }

  useEffect(() => {
    api.get('/products/active').then(r => setProducts(r.data?.data || r.data || [])).catch(() => {})
  }, [])

  const onRefresh = () => { setRefreshing(true); setPage(1); fetchLeads(1) }

  const quickCall = async (lead) => {
    const phone = lead.phone?.replace(/\s+/g, '')
    if (!phone) return
    Linking.openURL(`tel:${phone}`)
    // Log the call
    try {
      await api.post(`/leads/${lead.id}/communications`, {
        type: 'call', direction: 'outbound', note: 'Call initiated from leads list'
      })
    } catch {}
  }

  const quickWhatsApp = (lead) => {
    const p = lead.phone?.replace(/[^0-9]/g, '')
    if (!p) return
    Linking.openURL(`https://wa.me/${p.startsWith('91') ? p : '91' + p}`)
  }

  const renderLead = ({ item }) => {
    const sc    = STATUS_COLORS[item.status] || STATUS_COLORS.new
    const pname = products.find(p => p.id === parseInt(item.product_id))?.name

    return (
      <TouchableOpacity style={s.card} onPress={() => navigation.navigate('LeadDetail', { lead: item })}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={s.leadName}>{item.name || item.contact_name || item.school_name}</Text>
            <Text style={s.leadPhone}>{item.phone}</Text>
            {pname && (
              <View style={s.productBadge}>
                <Ionicons name="cube-outline" size={11} color="#4F46E5" />
                <Text style={s.productBadgeText}>{pname}</Text>
              </View>
            )}
          </View>
          <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[s.statusText, { color: sc.text }]}>{item.status?.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <View style={s.cardActions}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#DCFCE7' }]}
            onPress={() => quickCall(item)}>
            <Ionicons name="call" size={16} color="#16A34A" />
            <Text style={[s.actionText, { color: '#16A34A' }]}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#DCFCE7' }]}
            onPress={() => quickWhatsApp(item)}>
            <Ionicons name="logo-whatsapp" size={16} color="#15803D" />
            <Text style={[s.actionText, { color: '#15803D' }]}>WhatsApp</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#EDE9FE' }]}
            onPress={() => navigation.navigate('LeadDetail', { lead: item })}>
            <Ionicons name="open-outline" size={16} color="#5B21B6" />
            <Text style={[s.actionText, { color: '#5B21B6' }]}>Detail</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#DBEAFE' }]}
            onPress={() => navigation.navigate('PostCall', { lead: item })}>
            <Ionicons name="create-outline" size={16} color="#1E40AF" />
            <Text style={[s.actionText, { color: '#1E40AF' }]}>Update</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Leads</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('LeadDetail', { lead: null, create: true })}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginRight: 6 }} />
          <TextInput
            value={search} onChangeText={t => { setSearch(t); setPage(1) }}
            placeholder="Search name, phone…" placeholderTextColor="#9CA3AF"
            style={s.searchInput} />
        </View>
      </View>

      {/* Filters */}
      <View style={s.filterRow}>
        <ScrollableChips
          items={[{ label: 'All', value: '' }, ...Object.keys(STATUS_COLORS).map(s => ({ label: s.replace(/_/g,' '), value: s }))]}
          selected={filterStatus} onSelect={v => { setFilterStatus(v); setPage(1) }} />
      </View>
      {products.length > 0 && (
        <View style={s.filterRow}>
          <ScrollableChips
            items={[{ label: '📦 All Products', value: '' }, ...products.map(p => ({ label: p.name, value: String(p.id) }))]}
            selected={filterProduct} onSelect={v => { setFilterProduct(v); setPage(1) }} />
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={item => String(item.id)}
          renderItem={renderLead}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ padding: 16 }} /> : null}
          ListEmptyComponent={<View style={s.center}><Text style={s.emptyText}>No leads found</Text></View>}
        />
      )}
    </View>
  )
}

function ScrollableChips({ items, selected, onSelect }) {
  const { ScrollView } = require('react-native')
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 12 }}>
      {items.map(item => (
        <TouchableOpacity key={item.value} onPress={() => onSelect(item.value)}
          style={[s.chip, selected === item.value && s.chipActive]}>
          <Text style={[s.chipText, selected === item.value && s.chipTextActive]}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F9FAFB' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
                  backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:        { fontSize: 22, fontWeight: '800', color: '#111827' },
  addBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  searchRow:    { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 },
  searchBox:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:  { flex: 1, fontSize: 14, color: '#111827' },
  filterRow:    { paddingVertical: 6 },
  chip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 6 },
  chipActive:   { backgroundColor: '#4F46E5' },
  chipText:     { fontSize: 12, color: '#374151', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  emptyText:    { color: '#9CA3AF', fontSize: 14 },

  card:         { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardTop:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  leadName:     { fontSize: 15, fontWeight: '700', color: '#111827' },
  leadPhone:    { fontSize: 13, color: '#6B7280', fontFamily: 'monospace', marginTop: 2 },
  productBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4,
                  backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  productBadgeText: { fontSize: 11, color: '#4F46E5', fontWeight: '600' },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:   { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  cardActions:  { flexDirection: 'row', gap: 6 },
  actionBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 4, paddingVertical: 7, borderRadius: 8 },
  actionText:   { fontSize: 12, fontWeight: '600' },
})
