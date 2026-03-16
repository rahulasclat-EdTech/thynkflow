import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Linking, Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors, STATUS_COLORS } from '../../utils/colors'
import api from '../../api/client'
import { format } from 'date-fns'

export default function LeadHistoryScreen({ route, navigation }) {
  const { leadId, leadName } = route.params
  const [lead, setLead] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/leads/${leadId}`)
      .then(res => setLead(res.data))
      .catch(err => Alert.alert('Error', err.message))
      .finally(() => setLoading(false))
  }, [leadId])

  const handleCall = () => {
    if (!lead?.phone) return
    Alert.alert(`Call ${lead.school_name || lead.contact_name || lead.phone}`, lead.phone, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Call Now', onPress: () => {
          Linking.openURL(`tel:${lead.phone}`)
          setTimeout(() => navigation.navigate('PostCall', { lead }), 1000)
        }
      }
    ])
  }

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ flex: 1 }} color={Colors.primaryLight} /></SafeAreaView>
  }

  const sc = STATUS_COLORS[lead?.status] || STATUS_COLORS.new

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{lead?.school_name || lead?.contact_name || lead?.phone}</Text>
          {lead?.school_name && lead?.contact_name && <Text style={styles.headerSub}>{lead.contact_name}</Text>}
        </View>
        <TouchableOpacity onPress={handleCall} style={styles.callBtn}>
          <Text style={styles.callBtnText}>📞 Call</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Lead Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{lead?.phone}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusBadgeText, { color: sc.text }]}>{lead?.status?.replace('_', ' ')}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Assigned To</Text>
            <Text style={styles.infoValue}>{lead?.agent_name || 'Unassigned'}</Text>
          </View>
          {lead?.city && <>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>City</Text>
              <Text style={styles.infoValue}>{lead.city}</Text>
            </View>
          </>}
          {lead?.email && <>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{lead.email}</Text>
            </View>
          </>}
        </View>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Call History ({lead?.history?.length || 0} interactions)</Text>

        {!lead?.history?.length ? (
          <View style={styles.emptyHistory}>
            <Text style={styles.emptyIcon}>📞</Text>
            <Text style={styles.emptyText}>No calls logged yet</Text>
            <TouchableOpacity onPress={handleCall} style={styles.callFirstBtn}>
              <Text style={styles.callFirstBtnText}>Make First Call</Text>
            </TouchableOpacity>
          </View>
        ) : (
          lead.history.map((log, i) => {
            const lsc = STATUS_COLORS[log.status] || STATUS_COLORS.new
            return (
              <View key={log.id} style={styles.timelineItem}>
                <View style={styles.timelineLine}>
                  <View style={[styles.timelineDot, { backgroundColor: lsc.text }]} />
                  {i < lead.history.length - 1 && <View style={styles.timelineConnector} />}
                </View>
                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: lsc.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: lsc.text }]}>{log.status?.replace('_', ' ')}</Text>
                    </View>
                    <Text style={styles.timelineDate}>
                      {format(new Date(log.called_at), 'dd MMM yy, hh:mm a')}
                    </Text>
                  </View>
                  <Text style={styles.timelineAgent}>by {log.agent_name}</Text>
                  {log.discussion && (
                    <View style={styles.remarkBox}>
                      <Text style={styles.remarkText}>"{log.discussion}"</Text>
                    </View>
                  )}
                  {log.next_followup_date && (
                    <Text style={styles.followupTag}>
                      📅 Follow-up: {format(new Date(log.next_followup_date), 'dd MMM yyyy')}
                    </Text>
                  )}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 20, fontWeight: '300' },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  headerSub: { color: '#93c5fd', fontSize: 11, marginTop: 1 },
  callBtn: { backgroundColor: Colors.green, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  callBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  infoCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  infoLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  infoValue: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 14 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  timelineLine: { alignItems: 'center', width: 20 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, flexShrink: 0 },
  timelineConnector: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 4, marginBottom: -4 },
  timelineContent: { flex: 1, backgroundColor: Colors.white, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  timelineDate: { fontSize: 10, color: Colors.textLight },
  timelineAgent: { fontSize: 11, color: Colors.textMuted, marginBottom: 6 },
  remarkBox: { backgroundColor: Colors.bg, borderRadius: 8, padding: 10, marginTop: 4 },
  remarkText: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', lineHeight: 18 },
  followupTag: { fontSize: 11, color: Colors.primaryLight, marginTop: 8, fontWeight: '600' },
  emptyHistory: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: Colors.textMuted, fontSize: 14, marginBottom: 16 },
  callFirstBtn: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  callFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
