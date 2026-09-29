// mobile-app/src/screens/leads/DeletedLeadsScreen.js
// The separate register of deleted leads. Deleted leads are excluded from
// the Dashboard and every report; admins can restore them from here.
import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, StyleSheet, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'
import COLORS from '../../utils/colors'
import { format } from 'date-fns'

const fmtDT = (iso) => { try { return iso ? format(new Date(iso), 'd MMM yy, h:mm a') : '—' } catch { return '—' } }

export default function DeletedLeadsScreen({ navigation }) {
  const { user } = useAuth()
  const isAdmin = user?.role_id === 1 || user?.role_name === 'admin'
  const [rows, setRows]             = useState([])
  const [total, setTotal]           = useState(0)
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const q = `per_page=100${search ? `&search=${encodeURIComponent(search)}` : ''}`
      const r = await api.get(`/leads/deleted?${q}`)
      setRows(r.data || []); setTotal(r.total || 0)
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [search])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const restore = (row) => {
    Alert.alert('Restore lead', `Restore “${row.contact_name || row.phone}”? It will reappear in Leads, Dashboard and Reports with its call history.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', onPress: async () => {
        try {
          const r = await api.post(`/leads/deleted/${row.id}/restore`)
          Alert.alert('✅ Restored', r.duplicates_found ? `Note: ${r.duplicates_found} other lead(s) share this phone number.` : 'Lead restored')
          load()
        } catch (e) { Alert.alert('Error', e.message) }
      } },
    ])
  }

  const renderItem = ({ item }) => (
    <View style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{item.contact_name || item.school_name || '—'}</Text>
        {!!item.school_name && item.school_name !== item.contact_name && <Text style={s.sub}>🏫 {item.school_name}</Text>}
        <Text style={s.phone}>{item.phone}</Text>
        <Text style={s.sub}>👤 Was: {item.agent_name || 'Unassigned'}{item.product_name ? ` · 📦 ${item.product_name}` : ''}</Text>
        <Text style={s.meta}>Deleted by {item.deleted_by_name || '—'} · {fmtDT(item.deleted_at)}</Text>
        {!!item.delete_reason && <Text style={s.meta}>Reason: {item.delete_reason}</Text>}
      </View>
      {isAdmin && (
        <TouchableOpacity style={s.restoreBtn} onPress={() => restore(item)}>
          <Ionicons name="arrow-undo-outline" size={16} color="#047857" />
          <Text style={s.restoreTxt}>Restore</Text>
        </TouchableOpacity>
      )}
    </View>
  )

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Deleted Leads</Text>
          <Text style={s.hSub}>{total} deleted · not counted in Dashboard / Reports</Text>
        </View>
      </View>
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 }}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color="#9CA3AF" style={{ marginRight: 6 }} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search deleted leads…" placeholderTextColor="#9CA3AF" style={{ flex: 1, fontSize: 14 }} />
        </View>
      </View>
      {loading ? <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList data={rows} keyExtractor={r => String(r.id)} renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}
          ListEmptyComponent={<View style={s.center}><Text style={{ color: '#9CA3AF' }}>No deleted leads</Text></View>} />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 52, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:     { fontSize: 18, fontWeight: '800', color: '#111827' },
  hSub:      { fontSize: 11, color: '#6B7280', marginTop: 1 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 10, height: 38 },
  card:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  name:      { fontSize: 15, fontWeight: '700', color: '#111827' },
  phone:     { fontSize: 13, color: '#374151', marginTop: 2 },
  sub:       { fontSize: 11, color: '#6B7280', marginTop: 2 },
  meta:      { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  restoreBtn:{ alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#D1FAE5', marginLeft: 8 },
  restoreTxt:{ fontSize: 10, fontWeight: '700', color: '#047857', marginTop: 2 },
})
