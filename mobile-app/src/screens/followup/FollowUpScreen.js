import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, Linking, ActivityIndicator
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Colors, STATUS_COLORS } from '../../utils/colors'
import api from '../../api/client'
import { format } from 'date-fns'

const GROUP_CONFIG = {
  missed: { label: '⚠️ Missed Follow-ups', borderColor: Colors.red, dotColor: Colors.red },
  today: { label: '📅 Today', borderColor: Colors.green, dotColor: Colors.green },
  tomorrow: { label: '⏭ Tomorrow', borderColor: Colors.accent, dotColor: Colors.accent },
  upcoming: { label: '🗓 Upcoming', borderColor: Colors.textLight, dotColor: Colors.textLight },
}

function FollowUpCard({ item, onCall, onHistory }) {
  const sc = STATUS_COLORS[item.lead_status] || STATUS_COLORS.new
  const groupCfg = GROUP_CONFIG[item.followup_type] || GROUP_CONFIG.upcoming

  return (
    <View style={[styles.card, { borderLeftColor: groupCfg.borderColor }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.school_name || item.contact_name || item.phone}
          </Text>
          <Text style={styles.cardPhone}>{item.phone}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{item.lead_status?.replace('_', ' ')}</Text>
        </View>
      </View>

      {item.discussion && (
        <View style={styles.remarkBox}>
          <Text style={styles.remarkText} numberOfLines={2}>"{item.discussion}"</Text>
        </View>
      )}

      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>
          👤 {item.agent_name}
          {item.next_followup_date ? `  ·  📅 ${format(new Date(item.next_followup_date), 'dd MMM')}` : ''}
        </Text>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.histBtn} onPress={onHistory}>
            <Text style={styles.histBtnText}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.callBtn} onPress={onCall}>
            <Text style={styles.callBtnText}>📞 Call</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

export default function FollowUpScreen() {
  const navigation = useNavigation()
  const [data, setData] = useState({ missed: [], today: [], tomorrow: [], upcoming: [] })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const res = await api.get('/followups')
      setData(res.data)
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { fetchData() }, [fetchData]))

  const handleCall = (item) => {
    const lead = { id: item.lead_id, phone: item.phone, school_name: item.school_name, contact_name: item.contact_name }
    Alert.alert(`Call ${item.school_name || item.contact_name || item.phone}`, item.phone, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Call Now', onPress: () => {
          Linking.openURL(`tel:${item.phone}`)
          setTimeout(() => navigation.navigate('Leads', { screen: 'PostCall', params: { lead } }), 1000)
        }
      }
    ])
  }

  const handleHistory = (item) => {
    navigation.navigate('Leads', {
      screen: 'LeadHistory',
      params: { leadId: item.lead_id, leadName: item.school_name || item.contact_name || item.phone }
    })
  }

  const allItems = [
    ...data.missed.map(i => ({ ...i, followup_type: 'missed' })),
    ...data.today.map(i => ({ ...i, followup_type: 'today' })),
    ...data.tomorrow.map(i => ({ ...i, followup_type: 'tomorrow' })),
    ...data.upcoming.map(i => ({ ...i, followup_type: 'upcoming' })),
  ]

  const sections = Object.entries(GROUP_CONFIG)
    .filter(([key]) => data[key]?.length > 0)
    .map(([key, cfg]) => ({
      key,
      cfg,
      items: data[key],
    }))

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}><Text style={styles.appName}>ThynkFlow</Text></View>
        <ActivityIndicator style={{ flex: 1 }} color={Colors.primaryLight} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.appName}>ThynkFlow</Text>
        <Text style={styles.subtitle}>Follow Ups · {allItems.length} pending</Text>
      </View>

      <FlatList
        data={sections}
        keyExtractor={s => s.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={Colors.primaryLight} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyText}>No pending follow-ups</Text>
          </View>
        }
        renderItem={({ item: section }) => (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: section.cfg.dotColor }]} />
              <Text style={styles.sectionLabel}>{section.cfg.label}</Text>
              <View style={styles.sectionCount}><Text style={styles.sectionCountText}>{section.items.length}</Text></View>
            </View>
            {section.items.map(item => (
              <FollowUpCard
                key={item.id}
                item={{ ...item, followup_type: section.key }}
                onCall={() => handleCall(item)}
                onHistory={() => handleHistory(item)}
              />
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 12 },
  appName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 11, marginTop: 1 },
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1 },
  sectionCount: { backgroundColor: Colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  sectionCountText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  card: {
    backgroundColor: Colors.white, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: Colors.border,
    borderLeftWidth: 4, marginBottom: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  cardLeft: { flex: 1 },
  cardName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  cardPhone: { fontSize: 11, color: Colors.primaryLight, fontWeight: '600', marginTop: 2 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  remarkBox: { backgroundColor: Colors.bg, borderRadius: 8, padding: 8, marginBottom: 8 },
  remarkText: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic', lineHeight: 16 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: { fontSize: 10, color: Colors.textLight, flex: 1 },
  cardActions: { flexDirection: 'row', gap: 6 },
  histBtn: { backgroundColor: Colors.bg, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  histBtnText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  callBtn: { backgroundColor: Colors.green, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  callBtnText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 6 },
  emptyText: { color: Colors.textMuted, fontSize: 14 },
})
