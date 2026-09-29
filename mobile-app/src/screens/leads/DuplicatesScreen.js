// mobile-app/src/screens/leads/DuplicatesScreen.js
// Groups of leads that share a phone number (last 10 digits).
// Lets the user delete the extra copies (deleted leads go to the
// separate "Deleted Leads" register and are excluded from all counts).
import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import COLORS from '../../utils/colors'
import { format } from 'date-fns'

const fmtDate = (iso) => { try { return iso ? format(new Date(iso), 'd MMM yy') : '—' } catch { return '—' } }

export default function DuplicatesScreen({ navigation }) {
  const [groups, setGroups]         = useState([])
  const [meta, setMeta]             = useState({ groups: 0, extra: 0 })
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy]             = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/leads/duplicates')
      setGroups(r.data || [])
      setMeta({ groups: r.total_groups || 0, extra: r.extra_copies || 0 })
    } catch (e) { Alert.alert('Error', e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const remove = (ids, message) => {
    if (!ids.length) return
    Alert.alert('Delete duplicate', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true)
        try {
          const r = await api.post('/leads/bulk-delete', { ids, reason: 'Duplicate lead' })
          Alert.alert('✅', r.message || 'Deleted')
          await load()
        } catch (e) { Alert.alert('Error', e.message) }
        finally { setBusy(false) }
      } },
    ])
  }

  const renderGroup = ({ item: g }) => {
    const oldest = g.leads[0]
    const extras = g.leads.filter(l => l.id !== oldest.id && l.can_delete)
    return (
      <View style={s.card}>
        <View style={s.cardHead}>
          <Text style={s.phone}>📞 {g.phone}</Text>
          <View style={s.countPill}><Text style={s.countTxt}>{g.count} leads</Text></View>
        </View>
        {g.leads.map(l => (
          <View key={l.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>
                {l.contact_name || l.school_name || '—'}
                {l.id === oldest.id ? '  ' : ''}
                {l.id === oldest.id && <Text style={s.oldest}>OLDEST</Text>}
              </Text>
              <Text style={s.sub}>
                👤 {l.agent_name || 'Unassigned'} · {(l.status || '').replace(/_/g, ' ')} · {l.activity_count} calls · {fmtDate(l.created_at)}
              </Text>
              {!!l.product_name && <Text style={s.sub}>📦 {l.product_name}</Text>}
            </View>
            {l.can_delete && (
              <TouchableOpacity disabled={busy} style={s.delBtn}
                onPress={() => remove([l.id], `Delete “${l.contact_name || l.phone}”? It will move to Deleted Leads.`)}>
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {extras.length > 0 && (
          <TouchableOpacity disabled={busy} style={s.keepBtn}
            onPress={() => remove(extras.map(l => l.id), `Keep the oldest lead and delete the other ${extras.length}?`)}>
            <Text style={s.keepTxt}>Keep oldest, delete the rest</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Duplicate Leads</Text>
          <Text style={s.hSub}>{meta.groups} group(s) · {meta.extra} extra copies · matched on phone number</Text>
        </View>
      </View>
      {loading ? <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View> : (
        <FlatList data={groups} keyExtractor={g => g.key} renderItem={renderGroup}
          contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={COLORS.primary} />}
          ListEmptyComponent={<View style={s.center}><Text style={{ fontSize: 40 }}>✅</Text><Text style={{ color: '#6B7280', marginTop: 6 }}>No duplicate leads found</Text></View>} />
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
  card:      { backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#FED7AA', overflow: 'hidden' },
  cardHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF7ED', paddingHorizontal: 12, paddingVertical: 8 },
  phone:     { fontSize: 14, fontWeight: '800', color: '#9A3412' },
  countPill: { backgroundColor: '#FED7AA', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countTxt:  { fontSize: 11, fontWeight: '700', color: '#9A3412' },
  row:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  name:      { fontSize: 14, fontWeight: '700', color: '#111827' },
  oldest:    { fontSize: 9, fontWeight: '800', color: '#047857', backgroundColor: '#D1FAE5' },
  sub:       { fontSize: 11, color: '#6B7280', marginTop: 2 },
  delBtn:    { padding: 8, borderRadius: 8, backgroundColor: '#FEE2E2', marginLeft: 8 },
  keepBtn:   { margin: 10, marginTop: 4, paddingVertical: 9, borderRadius: 10, backgroundColor: '#EA580C', alignItems: 'center' },
  keepTxt:   { color: '#fff', fontWeight: '700', fontSize: 13 },
})
