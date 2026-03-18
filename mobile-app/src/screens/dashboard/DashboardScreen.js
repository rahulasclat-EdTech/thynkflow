// mobile-app/src/screens/dashboard/DashboardScreen.js
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, StyleSheet
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'
import COLORS from '../../utils/colors'

// ── helpers ──────────────────────────────────────────────────
const STATUS_COLORS = {
  new:           { bg: '#DBEAFE', text: '#1E40AF' },
  hot:           { bg: '#FEE2E2', text: '#991B1B' },
  warm:          { bg: '#FFEDD5', text: '#9A3412' },
  cold:          { bg: '#F3F4F6', text: '#374151' },
  converted:     { bg: '#DCFCE7', text: '#166534' },
  not_interested:{ bg: '#F3F4F6', text: '#6B7280' },
  call_back:     { bg: '#EDE9FE', text: '#5B21B6' },
}

function KPICard({ icon, label, value, sub, color = COLORS.primary, onPress }) {
  return (
    <TouchableOpacity style={[s.kpiCard, { borderLeftColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={s.kpiIcon}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.kpiValue}>{value}</Text>
        <Text style={s.kpiLabel}>{label}</Text>
        {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  )
}

function SectionHeader({ title, icon }) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={16} color={COLORS.primary} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  )
}

// ═════════════════════════════════════════════════════════════
export default function DashboardScreen({ navigation }) {
  const { user } = useAuth()
  const isAdmin  = user?.role_name === 'admin'

  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDashboard = useCallback(async () => {
    try {
      const [dashRes, prodRes, followRes] = await Promise.all([
        api.get('/dashboard'),
        api.get('/products/dashboard'),
        api.get('/followups?status=pending&per_page=100'),
      ])
      setData({
        dash:    dashRes.data?.data    || dashRes.data    || {},
        prod:    prodRes.data?.data    || prodRes.data    || {},
        followup: followRes.data?.data || followRes.data  || [],
      })
    } catch (err) {
      console.log('Dashboard fetch error', err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  const onRefresh = () => { setRefreshing(true); fetchDashboard() }

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={s.loadingText}>Loading dashboard…</Text>
    </View>
  )

  const dash         = data?.dash     || {}
  const prodData     = data?.prod     || {}
  const followups    = Array.isArray(data?.followup) ? data.followup : []
  const productStats = prodData.product_stats || []
  const agentStats   = prodData.agent_breakdown || []

  const totalLeads    = dash.total_leads      || 0
  const converted     = dash.converted        || 0
  const convRate      = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0'
  const todayCalls    = dash.today_calls      || 0
  const weekCalls     = dash.week_calls       || 0
  const pendingFollowups = followups.length
  const totalEarnings = prodData.total_actual_earned || 0
  const potentialEarning = prodData.total_potential || 0

  const statusBreakdown = dash.status_breakdown || {}

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* ── Header ────────────────────────────────────── */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Good {getTimeOfDay()}, {user?.name?.split(' ')[0]} 👋</Text>
          <Text style={s.subGreeting}>{isAdmin ? 'Admin Dashboard' : 'Your Performance'}</Text>
        </View>
        <View style={[s.roleBadge, { backgroundColor: isAdmin ? '#EDE9FE' : '#DBEAFE' }]}>
          <Text style={[s.roleText, { color: isAdmin ? '#5B21B6' : '#1D4ED8' }]}>
            {isAdmin ? 'Admin' : 'Agent'}
          </Text>
        </View>
      </View>

      {/* ── KPI Row ───────────────────────────────────── */}
      <View style={s.kpiGrid}>
        <KPICard icon="people"      label="Total Leads"   value={totalLeads}   color="#4F46E5" />
        <KPICard icon="checkmark-circle" label="Converted" value={converted}   color="#16A34A" sub={`${convRate}% rate`} />
        <KPICard icon="call"        label="Calls Today"   value={todayCalls}   color="#0891B2" sub={`${weekCalls} this week`} />
        <KPICard icon="alarm"       label="Pending Follow-ups" value={pendingFollowups} color="#D97706"
          onPress={() => navigation.navigate('FollowUps')} />
      </View>

      {/* ── Earnings (if products configured) ────────── */}
      {totalEarnings > 0 || potentialEarning > 0 ? (
        <>
          <SectionHeader title="Earnings" icon="wallet-outline" />
          <View style={s.kpiGrid}>
            <KPICard icon="cash"    label="Actual Earned"  value={`₹${fmtNum(totalEarnings)}`}    color="#16A34A" />
            <KPICard icon="trending-up" label="Potential"  value={`₹${fmtNum(potentialEarning)}`} color="#7C3AED" />
          </View>
        </>
      ) : null}

      {/* ── Status Breakdown ──────────────────────────── */}
      {Object.keys(statusBreakdown).length > 0 && (
        <>
          <SectionHeader title="Lead Status Breakdown" icon="pie-chart-outline" />
          <View style={s.card}>
            {Object.entries(statusBreakdown).map(([status, count]) => {
              const pct   = totalLeads > 0 ? (count / totalLeads) * 100 : 0
              const color = STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#374151' }
              return (
                <View key={status} style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: color.text }]} />
                  <Text style={s.statusLabel}>{status.replace(/_/g, ' ')}</Text>
                  <View style={s.statusBarWrap}>
                    <View style={[s.statusBar, { width: `${pct}%`, backgroundColor: color.text }]} />
                  </View>
                  <Text style={s.statusCount}>{count}</Text>
                </View>
              )
            })}
          </View>
        </>
      )}

      {/* ── Product-wise Leads ────────────────────────── */}
      {productStats.length > 0 && (
        <>
          <SectionHeader title="Product-wise Leads" icon="cube-outline" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll}>
            {productStats.map(p => (
              <View key={p.product_id} style={s.productCard}>
                <Text style={s.productName} numberOfLines={1}>{p.product_name}</Text>
                <Text style={s.productType}>{p.product_type}</Text>
                <Text style={s.productLeads}>{p.total_leads}</Text>
                <Text style={s.productLeadsLabel}>leads</Text>
                <View style={s.productDivider} />
                <Text style={s.productConverted}>{p.converted_leads} converted</Text>
                <Text style={s.productEarned}>₹{fmtNum(p.actual_earned)}</Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {/* ── Top Agents (admin only) ───────────────────── */}
      {isAdmin && agentStats.length > 0 && (
        <>
          <SectionHeader title="Top Performing Agents" icon="trophy-outline" />
          <View style={s.card}>
            {groupByAgent(agentStats).slice(0, 5).map((agent, i) => (
              <View key={agent.agent_id} style={s.agentRow}>
                <View style={[s.agentRank, { backgroundColor: i < 3 ? '#FEF3C7' : '#F3F4F6' }]}>
                  <Text style={s.agentRankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.agentName}>{agent.agent_name}</Text>
                  <Text style={s.agentSub}>{agent.total_leads} leads · {agent.converted} converted</Text>
                </View>
                <Text style={s.agentEarned}>₹{fmtNum(agent.earned)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Pending Follow-ups Preview ────────────────── */}
      {followups.length > 0 && (
        <>
          <SectionHeader title="Upcoming Follow-ups" icon="alarm-outline" />
          <View style={s.card}>
            {followups.slice(0, 5).map(f => (
              <TouchableOpacity key={f.id} style={s.followupRow}
                onPress={() => navigation.navigate('Leads', { screen: 'LeadDetail', params: { leadId: f.lead_id } })}>
                <Ionicons name="alarm-outline" size={16} color="#D97706" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.followupName}>{f.lead_name || f.contact_name || 'Lead'}</Text>
                  <Text style={s.followupDate}>{formatDate(f.follow_up_date || f.scheduled_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
            {followups.length > 5 && (
              <TouchableOpacity onPress={() => navigation.navigate('FollowUps')}>
                <Text style={s.seeAll}>See all {followups.length} follow-ups →</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

// ── utils ────────────────────────────────────────────────────
function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function fmtNum(n) {
  const num = parseFloat(n) || 0
  if (num >= 100000) return (num / 100000).toFixed(1) + 'L'
  if (num >= 1000)   return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

function groupByAgent(rows) {
  const map = {}
  rows.forEach(r => {
    if (!map[r.agent_id]) {
      map[r.agent_id] = { agent_id: r.agent_id, agent_name: r.agent_name, total_leads: 0, converted: 0, earned: 0 }
    }
    map[r.agent_id].total_leads += parseInt(r.total_leads) || 0
    map[r.agent_id].converted   += parseInt(r.converted)   || 0
    map[r.agent_id].earned      += parseFloat(r.earned)    || 0
  })
  return Object.values(map).sort((a, b) => b.converted - a.converted)
}

// ── styles ───────────────────────────────────────────────────
const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F9FAFB' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:    { marginTop: 12, color: '#6B7280', fontSize: 14 },

  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff',
                    borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  greeting:       { fontSize: 20, fontWeight: '700', color: '#111827' },
  subGreeting:    { fontSize: 13, color: '#6B7280', marginTop: 2 },
  roleBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  roleText:       { fontSize: 12, fontWeight: '600' },

  kpiGrid:        { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  kpiCard:        { flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: '#fff', borderRadius: 12, padding: 14,
                    borderLeftWidth: 4, flex: 1, minWidth: '45%',
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  kpiIcon:        { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  kpiValue:       { fontSize: 22, fontWeight: '800', color: '#111827' },
  kpiLabel:       { fontSize: 11, color: '#6B7280', marginTop: 1 },
  kpiSub:         { fontSize: 11, color: '#9CA3AF', marginTop: 1 },

  sectionHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionTitle:   { fontSize: 15, fontWeight: '700', color: '#111827' },

  card:           { backgroundColor: '#fff', marginHorizontal: 12, borderRadius: 14, padding: 12,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },

  statusRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  statusDot:      { width: 8, height: 8, borderRadius: 4 },
  statusLabel:    { width: 100, fontSize: 12, color: '#374151', textTransform: 'capitalize' },
  statusBarWrap:  { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  statusBar:      { height: 6, borderRadius: 3 },
  statusCount:    { width: 30, textAlign: 'right', fontSize: 12, fontWeight: '600', color: '#111827' },

  hScroll:        { paddingLeft: 12, paddingBottom: 4 },
  productCard:    { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginRight: 10, width: 150,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  productName:    { fontSize: 13, fontWeight: '700', color: '#111827' },
  productType:    { fontSize: 11, color: '#6B7280', marginBottom: 8 },
  productLeads:   { fontSize: 28, fontWeight: '800', color: '#4F46E5' },
  productLeadsLabel: { fontSize: 11, color: '#6B7280' },
  productDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  productConverted: { fontSize: 12, color: '#16A34A', fontWeight: '600' },
  productEarned:  { fontSize: 12, color: '#7C3AED', fontWeight: '600', marginTop: 2 },

  agentRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10,
                    borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  agentRank:      { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  agentRankText:  { fontSize: 12, fontWeight: '700', color: '#374151' },
  agentName:      { fontSize: 14, fontWeight: '600', color: '#111827' },
  agentSub:       { fontSize: 12, color: '#6B7280' },
  agentEarned:    { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  followupRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                    borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  followupName:   { fontSize: 14, fontWeight: '600', color: '#111827' },
  followupDate:   { fontSize: 12, color: '#D97706', marginTop: 2 },
  seeAll:         { textAlign: 'center', color: '#4F46E5', fontSize: 13, fontWeight: '600', paddingTop: 10 },
})
