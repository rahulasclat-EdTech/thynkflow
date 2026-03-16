import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { Colors, STATUS_COLORS } from '../../utils/colors'
import api from '../../api/client'

function StatCard({ value, label, valueColor }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statNum, valueColor && { color: valueColor }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function ReportRow({ item, onPress }) {
  const sc = STATUS_COLORS[item.status] || STATUS_COLORS.new
  return (
    <TouchableOpacity style={styles.reportRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.reportLeft}>
        <View style={[styles.reportDot, { backgroundColor: sc.text }]} />
        <View>
          <Text style={styles.reportLabel}>{item.status?.replace('_', ' ')}</Text>
          <Text style={styles.reportCount}>{item.count} leads</Text>
        </View>
      </View>
      <View style={styles.reportRight}>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${item.pct}%`, backgroundColor: sc.text }]} />
        </View>
        <Text style={styles.reportChevron}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function ReportsScreen() {
  const navigation = useNavigation()
  const [stats, setStats] = useState(null)
  const [statusData, setStatusData] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [expandedLeads, setExpandedLeads] = useState([])

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const [dashRes, statusRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/reports/status-wise')
      ])
      setStats(dashRes.data.totals)
      const total = statusRes.data.reduce((s, r) => s + parseInt(r.count), 0)
      setStatusData(statusRes.data.map(r => ({ ...r, pct: total > 0 ? Math.round((r.count / total) * 100) : 0 })))
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { fetchData() }, [fetchData]))

  const handleExpandStatus = async (status) => {
    if (expanded === status) { setExpanded(null); return }
    setExpanded(status)
    try {
      const res = await api.get('/leads', { params: { status, limit: 50 } })
      setExpandedLeads(res.data)
    } catch {}
  }

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
        <Text style={styles.subtitle}>My Reports</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchData(true)} tintColor={Colors.primaryLight} />}
      >
        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          <StatCard value={stats?.total_leads || 0} label="Total Leads" valueColor={Colors.primaryLight} />
          <StatCard value={stats?.unattended || 0} label="Unattended" valueColor={Colors.red} />
          <StatCard value={stats?.converted || 0} label="Converted" valueColor={Colors.green} />
          <StatCard value={stats?.hot || 0} label="Hot Leads" valueColor={Colors.amber} />
        </View>

        {/* Status Breakdown */}
        <Text style={styles.sectionTitle}>Status Breakdown</Text>
        <View style={styles.reportCard}>
          {statusData.map((item, i) => (
            <View key={item.status}>
              <ReportRow
                item={item}
                onPress={() => handleExpandStatus(item.status)}
              />
              {expanded === item.status && (
                <View style={styles.expandedList}>
                  {expandedLeads.length === 0 ? (
                    <Text style={styles.expandedEmpty}>No leads</Text>
                  ) : (
                    expandedLeads.map(lead => (
                      <TouchableOpacity
                        key={lead.id}
                        style={styles.expandedItem}
                        onPress={() => navigation.navigate('Leads', {
                          screen: 'LeadHistory',
                          params: { leadId: lead.id, leadName: lead.school_name || lead.contact_name }
                        })}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expandedName}>{lead.school_name || lead.contact_name || lead.phone}</Text>
                          {lead.last_remark && <Text style={styles.expandedRemark} numberOfLines={1}>"{lead.last_remark}"</Text>}
                        </View>
                        <Text style={styles.expandedPhone}>{lead.phone}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              )}
              {i < statusData.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  topBar: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 12 },
  appName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#93c5fd', fontSize: 11, marginTop: 1 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.white,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  statNum: { fontSize: 28, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  reportCard: { backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  reportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  reportLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reportDot: { width: 10, height: 10, borderRadius: 5 },
  reportLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, textTransform: 'capitalize' },
  reportCount: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  reportRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barBg: { width: 60, height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  reportChevron: { color: Colors.textLight, fontSize: 18 },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },
  expandedList: { backgroundColor: Colors.bg, paddingVertical: 4 },
  expandedItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  expandedName: { fontSize: 12, fontWeight: '600', color: Colors.text },
  expandedRemark: { fontSize: 11, color: Colors.textLight, fontStyle: 'italic', marginTop: 2 },
  expandedPhone: { fontSize: 11, color: Colors.primaryLight, fontWeight: '600', marginLeft: 8 },
  expandedEmpty: { textAlign: 'center', color: Colors.textLight, padding: 14, fontSize: 12 },
})
