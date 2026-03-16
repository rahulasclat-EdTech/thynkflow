import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, Linking, Alert, ActivityIndicator
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import { Colors, STATUS_COLORS } from '../../utils/colors'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'

const STATUSES = ['', 'new', 'hot', 'warm', 'cold', 'converted', 'not_interested', 'call_back']

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{status?.replace('_', ' ')}</Text>
    </View>
  )
}

function LeadCard({ lead, onCall, onPress }) {
  const initials = (lead.school_name || lead.contact_name || '?').slice(0, 2).toUpperCase()
  const avatarColors = ['#dbeafe', '#dcfce7', '#fef3c7', '#ede9fe', '#fee2e2']
  const textColors = ['#1e40af', '#15803d', '#92400e', '#5b21b6', '#991b1b']
  const colorIdx = lead.phone?.charCodeAt(0) % 5 || 0

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: avatarColors[colorIdx] }]}>
          <Text style={[styles.avatarText, { color: textColors[colorIdx] }]}>{initials}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {lead.school_name || lead.contact_name || lead.phone}
          </Text>
          {lead.school_name && lead.contact_name && (
            <Text style={styles.cardOrg} numberOfLines={1}>{lead.contact_name}</Text>
          )}
        </View>
        {!lead.last_called_at && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.phone}>{lead.phone}</Text>
        <TouchableOpacity style={styles.callBtn} onPress={() => onCall(lead)} activeOpacity={0.8}>
          <Text style={styles.callBtnText}>📞 Call</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardFooter}>
        <StatusBadge status={lead.last_status || lead.status} />
        {lead.last_remark && (
          <Text style={styles.remark} numberOfLines={1}>"{lead.last_remark}"</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default function LeadsScreen() {
  const navigation = useNavigation()
  const { user } = useAuth()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [unattendedOnly, setUnattendedOnly] = useState(true)
  const [total, setTotal] = useState(0)

  const fetchLeads = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const params = { limit: 100 }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      if (unattendedOnly) params.unattended = 'true'
      const res = await api.get('/leads', { params })
      setLeads(res.data)
      setTotal(res.total)
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [search, statusFilter, unattendedOnly])

  useFocusEffect(useCallback(() => { fetchLeads() }, [fetchLeads]))

  const handleCall = (lead) => {
    Alert.alert(
      `Call ${lead.school_name || lead.contact_name || lead.phone}`,
      lead.phone,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call Now',
          onPress: () => {
            Linking.openURL(`tel:${lead.phone}`)
            setTimeout(() => {
              navigation.navigate('PostCall', { lead })
            }, 1000)
          }
        }
      ]
    )
  }

  const renderItem = ({ item }) => (
    <LeadCard
      lead={item}
      onCall={handleCall}
      onPress={() => navigation.navigate('LeadHistory', { leadId: item.id, leadName: item.school_name || item.contact_name || item.phone })}
    />
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appName}>ThynkFlow</Text>
          <Text style={styles.subtitle}>Leads · {total} total</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={styles.avatarBtn}>
          <Text style={styles.avatarBtnText}>{user?.name?.[0]?.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search school, name, phone..."
          placeholderTextColor={Colors.textLight}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => fetchLeads()}
          returnKeyType="search"
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Text style={{ color: Colors.textLight }}>✕</Text></TouchableOpacity> : null}
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterPill, unattendedOnly && styles.filterPillActive]}
          onPress={() => setUnattendedOnly(!unattendedOnly)}
        >
          <Text style={[styles.filterPillText, unattendedOnly && styles.filterPillTextActive]}>
            Unattended
          </Text>
        </TouchableOpacity>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUSES}
          keyExtractor={s => s || 'all'}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterPill, statusFilter === item && styles.filterPillActive]}
              onPress={() => { setStatusFilter(item); setUnattendedOnly(false) }}
            >
              <Text style={[styles.filterPillText, statusFilter === item && styles.filterPillTextActive]}>
                {item || 'All'}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ gap: 6 }}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primaryLight} size="large" /></View>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchLeads(true)} tintColor={Colors.primaryLight} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No leads found</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 12,
  },
  appName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 11, marginTop: 1 },
  avatarBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, margin: 12, marginBottom: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 8,
    gap: 6, alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.white, borderRadius: 20,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterPillActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primaryLight },
  filterPillText: { fontSize: 11, fontWeight: '600', color: Colors.textMuted },
  filterPillTextActive: { color: Colors.primaryLight },
  list: { paddingHorizontal: 12, paddingBottom: 20, gap: 8 },
  card: {
    backgroundColor: Colors.white, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 13, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  cardOrg: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.red },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  phone: { fontSize: 12, color: Colors.primaryLight, fontWeight: '600' },
  callBtn: {
    backgroundColor: Colors.green, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  callBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  remark: { flex: 1, fontSize: 11, color: Colors.textLight, fontStyle: 'italic' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 15, fontWeight: '500' },
})
