// mobile-app/src/screens/reports/ReportsScreen.js
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
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

function KPI({ label, value, color = '#4F46E5', sub }) {
  return (
    <View style={[s.kpi, { borderLeftColor: color }]}>
      <Text style={[s.kpiValue, { color }]}>{value ?? '0'}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  )
}

function ProgressBar({ pct, color = '#4F46E5' }) {
  return (
    <View style={s.progressWrap}>
      <View style={[s.progressBar, { width: `${Math.min(pct || 0, 100)}%`, backgroundColor: color }]} />
    </View>
  )
}

const TABS = [
  { key: 'overview',   label: 'Overview',   icon: 'grid-outline' },
  { key: 'status',     label: 'Status',     icon: 'pie-chart-outline' },
  { key: 'agent',      label: 'Agents',     icon: 'people-outline' },
  { key: 'conversion', label: 'Conversion', icon: 'trending-up-outline' },
  { key: 'pipeline',   label: 'Pipeline',   icon: 'funnel-outline' },
]

export default function ReportsScreen() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchReports = useCallback(async () => {
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        api.get('/reports/overview').catch(() => ({ data: {} })),
        api.get('/reports/status-wise').catch(() => ({ data: [] })),
        api.get('/reports/agent-wise').catch(() => ({ data: [] })),
        api.get('/reports/conversion').catch(() => ({ data: [] })),
      ])
      setData({
        overview:   r1.data?.data || r1.data || {},
        status:     r2.data?.data || r2.data || [],
        agents:     r3.data?.data || r3.data || [],
        conversion: r4.data?.data || r4.data || [],
      })
    } catch (err) {
      console.log('Reports error:', err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])
  const onRefresh = () => { setRefreshing(true); fetchReports() }

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={{ color: '#6B7280', marginTop: 10 }}>Loading reports…</Text>
    </View>
  )

  const ov = data?.overview || {}
  const statusData = Array.isArray(data?.status) ? data.status : []
  const agentData  = Array.isArray(data?.agents)  ? data.agents  : []
  const convData   = Array.isArray(data?.conversion) ? data.conversion : []
  const totalLeads = parseInt(ov.total_leads || 0)
  const converted  = parseInt(ov.converted   || 0)
  const convRate   = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0'

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>📊 Reports</Text>
        <Text style={s.subtitle}>{isAdmin ? 'Team Performance' : 'My Performance'}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
            style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
            <Ionicons name={t.icon} size={14} color={tab === t.key ? '#fff' : '#6B7280'} />
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>

        {tab === 'overview' && (
          <View style={{ gap: 12 }}>
            <View style={s.kpiGrid}>
              <KPI label="Total Leads"    value={ov.total_leads    || 0} color="#4F46E5" />
              <KPI label="Converted"      value={ov.converted      || 0} color="#16A34A" sub={`${convRate}% rate`} />
              <KPI label="Hot Leads"      value={ov.hot_leads      || 0} color="#DC2626" />
              <KPI label="Warm Leads"     value={ov.warm_leads     || 0} color="#D97706" />
              <KPI label="Cold Leads"     value={ov.cold_leads     || 0} color="#6B7280" />
              <KPI label="Call Back"      value={ov.call_back      || 0} color="#7C3AED" />
              <KPI label="Not Interested" value={ov.not_interested || 0} color="#9CA3AF" />
              <KPI label="New Leads"      value={ov.new_leads      || 0} color="#0891B2" />
            </View>
            {totalLeads > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Overall Conversion Rate</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ProgressBar pct={parseFloat(convRate)} color="#16A34A" />
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#16A34A' }}>{convRate}%</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {tab === 'status' && (
          <View style={{ gap: 12 }}>
            <Text style={s.sectionTitle}>Leads by Status</Text>
            {statusData.length === 0 ? (
              <Text style={s.empty}>No data available</Text>
            ) : (
              <View style={s.card}>
                {statusData.map((item, i) => {
                  const c   = STATUS_COLORS[item.status] || { bg: '#F3F4F6', text: '#374151' }
                  const pct = totalLeads > 0 ? (item.count / totalLeads) * 100 : 0
                  return (
                    <View key={i} style={[s.statusRow, i < statusData.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}>
                      <View style={[s.badge, { backgroundColor: c.bg, width: 110 }]}>
                        <Text style={[s.badgeText, { color: c.text }]}>{item.status?.replace(/_/g, ' ')}</Text>
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <ProgressBar pct={pct} color={c.text} />
                      </View>
                      <Text style={s.countText}>{item.count}</Text>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {tab === 'agent' && (
          <View style={{ gap: 10 }}>
            <Text style={s.sectionTitle}>Performance by Agent</Text>
            {agentData.length === 0 ? (
              <Text style={s.empty}>No agent data available</Text>
            ) : agentData.map((agent, i) => {
              const total = parseInt(agent.total_leads || 0)
              const conv  = parseInt(agent.converted   || 0)
              const rate  = total > 0 ? ((conv / total) * 100).toFixed(1) : '0'
              return (
                <View key={i} style={s.agentCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={s.agentAvatar}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                        {agent.agent_name?.charAt(0)?.toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{agent.agent_name}</Text>
                      <Text style={{ fontSize: 12, color: '#6B7280' }}>{total} leads · {conv} converted</Text>
                    </View>
                    <View style={[s.rateBadge, { backgroundColor: parseFloat(rate) >= 50 ? '#DCFCE7' : '#F3F4F6' }]}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: parseFloat(rate) >= 50 ? '#16A34A' : '#6B7280' }}>
                        {rate}%
                      </Text>
                    </View>
                  </View>
                  <ProgressBar pct={parseFloat(rate)} color={parseFloat(rate) >= 50 ? '#16A34A' : '#4F46E5'} />
                  <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                    {[['Hot', agent.hot_leads||0, '#DC2626'], ['Warm', agent.warm_leads||0, '#D97706'],
                      ['New', agent.new_leads||0, '#0891B2'], ['Conv', agent.converted||0, '#16A34A']].map(([label, val, color]) => (
                      <View key={label} style={{ flex: 1, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 8, padding: 6 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color }}>{val}</Text>
                        <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )
            })}
          </View>
        )}

        {tab === 'conversion' && (
          <View style={{ gap: 12 }}>
            <View style={s.kpiGrid}>
              <KPI label="Total Leads" value={totalLeads} color="#4F46E5" />
              <KPI label="Converted"   value={converted}  color="#16A34A" />
              <KPI label="Conv. Rate"  value={`${convRate}%`} color="#7C3AED" />
              <KPI label="Remaining"   value={totalLeads - converted} color="#D97706" />
            </View>
            {convData.length > 0 && (
              <>
                <Text style={s.sectionTitle}>By Agent</Text>
                {convData.map((agent, i) => {
                  const rate = parseFloat(agent.conversion_rate || 0)
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827', width: 100 }}>{agent.agent_name}</Text>
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <ProgressBar pct={rate} color="#16A34A" />
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#16A34A', width: 45, textAlign: 'right' }}>
                        {rate.toFixed(1)}%
                      </Text>
                    </View>
                  )
                })}
              </>
            )}
          </View>
        )}

        {tab === 'pipeline' && (
          <View style={{ gap: 8 }}>
            <Text style={s.sectionTitle}>Lead Pipeline</Text>
            {[
              { stage: 'New Leads',      key: 'new_leads',      color: '#0891B2', icon: '🆕' },
              { stage: 'Hot',            key: 'hot_leads',      color: '#DC2626', icon: '🔥' },
              { stage: 'Warm',           key: 'warm_leads',     color: '#D97706', icon: '☀️' },
              { stage: 'Cold',           key: 'cold_leads',     color: '#6B7280', icon: '❄️' },
              { stage: 'Call Back',      key: 'call_back',      color: '#7C3AED', icon: '📞' },
              { stage: 'Not Interested', key: 'not_interested', color: '#9CA3AF', icon: '🚫' },
              { stage: 'Converted',      key: 'converted',      color: '#16A34A', icon: '✅' },
            ].map((item, i) => {
              const count = parseInt(ov[item.key] || 0)
              const pct   = totalLeads > 0 ? (count / totalLeads) * 100 : 0
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontSize: 20, width: 30 }}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{item.stage}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: item.color }}>{count}</Text>
                    </View>
                    <ProgressBar pct={pct} color={item.color} />
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F9FAFB' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:      { paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
                 backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:       { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle:    { fontSize: 13, color: '#6B7280', marginTop: 2 },
  tabBar:      { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6,
                 borderBottomWidth: 1, borderBottomColor: '#E5E7EB', maxHeight: 46 },
  tabBtn:      { flexDirection: 'row', alignItems: 'center', gap: 5,
                 paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                 backgroundColor: '#F3F4F6', marginRight: 6, height: 32 },
  tabBtnActive:{ backgroundColor: '#4F46E5' },
  tabText:     { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  tabTextActive:{ color: '#fff' },
  sectionTitle:{ fontSize: 15, fontWeight: '700', color: '#111827' },
  empty:       { color: '#9CA3AF', textAlign: 'center', padding: 32, fontSize: 14 },
  kpiGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi:         { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderLeftWidth: 4,
                 flex: 1, minWidth: '45%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                 shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 },
  kpiValue:    { fontSize: 24, fontWeight: '800' },
  kpiLabel:    { fontSize: 11, color: '#6B7280', marginTop: 2 },
  kpiSub:      { fontSize: 10, color: '#9CA3AF', marginTop: 1 },
  card:        { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  cardTitle:   { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  statusRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText:   { fontSize: 11, fontWeight: '600', textTransform: 'capitalize', textAlign: 'center' },
  countText:   { fontSize: 14, fontWeight: '700', color: '#111827', width: 30, textAlign: 'right' },
  progressWrap:{ flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: 6, borderRadius: 3 },
  agentCard:   { backgroundColor: '#fff', borderRadius: 14, padding: 14 },
  agentAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4F46E5',
                 alignItems: 'center', justifyContent: 'center' },
  rateBadge:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
})
