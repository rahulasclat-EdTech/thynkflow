// mobile-app/src/screens/dashboard/DashboardScreen.js
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, StyleSheet, Modal, FlatList
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

// ── Drill-down modal ──────────────────────────────────────
function DrillModal({ title, leads, onClose }) {
  return (
    <Modal visible={!!leads} transparent animationType="slide">
      <View style={s.drillOverlay}>
        <View style={s.drillCard}>
          <View style={s.drillHeader}>
            <Text style={s.drillTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.drillClose}>
              <Ionicons name="close" size={22} color="#374151" />
            </TouchableOpacity>
          </View>
          <Text style={s.drillCount}>{leads?.length || 0} leads</Text>
          <FlatList
            data={leads || []}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <View style={s.drillRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.drillName}>{item.name || item.contact_name || item.school_name}</Text>
                  <Text style={s.drillPhone}>{item.phone}</Text>
                </View>
                <View style={[s.drillBadge, { backgroundColor: STATUS_COLORS[item.status]?.bg || '#F3F4F6' }]}>
                  <Text style={[s.drillBadgeText, { color: STATUS_COLORS[item.status]?.text || '#374151' }]}>
                    {item.status?.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  )
}

// ── KPI card ──────────────────────────────────────────────
function KPICard({ icon, label, value, color = '#4F46E5', sub, onPress }) {
  return (
    <TouchableOpacity style={[s.kpiCard, { borderLeftColor: color }]} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[s.kpiIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.kpiValue, { color }]}>{value ?? '0'}</Text>
        <Text style={s.kpiLabel}>{label}</Text>
        {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />}
    </TouchableOpacity>
  )
}

function SectionHeader({ icon, title }) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={16} color={COLORS.primary} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  )
}

function fmtMoney(n) {
  const num = parseFloat(n) || 0
  if (num >= 10000000) return '₹' + (num/10000000).toFixed(1) + 'Cr'
  if (num >= 100000)   return '₹' + (num/100000).toFixed(1) + 'L'
  if (num >= 1000)     return '₹' + (num/1000).toFixed(1) + 'K'
  return '₹' + num
}

// ══════════════════════════════════════════════════════════
export default function DashboardScreen({ navigation }) {
  const { user } = useAuth()
  const isAdmin  = user?.role_name === 'admin'

  const [dashData, setDashData]       = useState(null)
  const [prodData, setProdData]       = useState(null)
  const [actData, setActData]         = useState(null)
  const [followups, setFollowups]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)

  // drill-down
  const [drillTitle, setDrillTitle]   = useState('')
  const [drillLeads, setDrillLeads]   = useState(null)
  const [drillLoading, setDrillLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [d, p, a, f] = await Promise.all([
        api.get('/dashboard').catch(() => ({ data: {} })),
        api.get('/products/dashboard').catch(() => ({ data: {} })),
        api.get('/activities/dashboard').catch(() => ({ data: {} })),
        api.get('/followups?status=pending&per_page=5').catch(() => ({ data: [] })),
      ])
      setDashData(d.data?.data || d.data || {})
      setProdData(p.data?.data || p.data || {})
      setActData(a.data?.data  || a.data  || {})
      const raw = f.data?.data || f.data || []
      setFollowups(Array.isArray(raw) ? raw.slice(0,5) : [])
    } catch (e) { console.log('Dashboard error:', e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])
  const onRefresh = () => { setRefreshing(true); fetchAll() }

  const openDrill = async (title, statusFilter) => {
    setDrillTitle(title)
    setDrillLeads([])
    setDrillLoading(true)
    try {
      const params = statusFilter ? `?status=${statusFilter}&per_page=100` : '?per_page=100'
      const res = await api.get(`/leads${params}`)
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data || [])
      setDrillLeads(rows)
    } catch { setDrillLeads([]) }
    finally { setDrillLoading(false) }
  }

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={{ color: '#6B7280', marginTop: 10 }}>Loading dashboard…</Text>
    </View>
  )

  const dash = dashData || {}
  const prod = prodData || {}
  const act  = actData  || {}

  const totalLeads   = parseInt(dash.total_leads || 0)
  const converted    = parseInt(dash.converted_leads || dash.converted || 0)
  const convRate     = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0'
  const todayCalls   = parseInt(dash.today_calls || 0)
  const weekCalls    = parseInt(dash.week_calls  || 0)

  // Earnings
  const actualEarned    = parseFloat(prod.total_actual_earned || 0)
  const potentialEarning = parseFloat(prod.total_potential    || 0)
  const productStats    = prod.product_stats || []

  // Activities
  const totalAct    = parseInt(act.total_activities || 0)
  const completedAct = parseInt(act.completed       || 0)
  const pendingAct  = totalAct - completedAct
  const actPct      = totalAct > 0 ? Math.round((completedAct / totalAct) * 100) : 0
  const overdueAct  = parseInt(act.overdue          || 0)
  const agentSummary = act.agent_summary || []

  // Status breakdown
  const statusBreakdown = [
    { key: 'new',            label: 'New',          val: dash.new_leads         || 0 },
    { key: 'hot',            label: 'Hot',           val: dash.hot_leads         || 0 },
    { key: 'warm',           label: 'Warm',          val: dash.warm_leads        || 0 },
    { key: 'cold',           label: 'Cold',          val: dash.cold_leads        || 0 },
    { key: 'converted',      label: 'Converted',     val: dash.converted         || 0 },
    { key: 'call_back',      label: 'Call Back',     val: dash.call_back_leads || dash.call_back || 0 },
    { key: 'not_interested', label: 'Not Interested',val: dash.not_interested_leads || dash.not_interested || 0 },
  ]

  return (
    <ScrollView style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, {user?.name?.split(' ')[0]} 👋
          </Text>
          <Text style={s.headerSub}>{isAdmin ? 'Admin Dashboard' : 'My Dashboard'}</Text>
        </View>
        <View style={[s.roleBadge, { backgroundColor: isAdmin ? '#EDE9FE' : '#DBEAFE' }]}>
          <Text style={[s.roleText, { color: isAdmin ? '#5B21B6' : '#1D4ED8' }]}>{isAdmin ? 'Admin' : 'Agent'}</Text>
        </View>
      </View>

      {/* ── KPI Row ───────────────────────────────── */}
      <View style={s.kpiGrid}>
        <KPICard icon="people"     label="Total Leads"   value={totalLeads} color="#4F46E5"
          onPress={() => openDrill('All Leads', '')} />
        <KPICard icon="checkmark-circle" label="Converted" value={converted} color="#16A34A"
          sub={`${convRate}% rate`} onPress={() => openDrill('Converted Leads', 'converted')} />
        <KPICard icon="call"       label="Calls Today"   value={todayCalls}  color="#0891B2"
          sub={`${weekCalls} this week`} />
        <KPICard icon="alarm"      label="Pending Follow-ups" value={followups.length} color="#D97706"
          onPress={() => navigation.navigate('FollowUps')} />
      </View>

      {/* ── Status-wise Lead Count ────────────────── */}
      <SectionHeader icon="pie-chart-outline" title="Status-wise Lead Count" />
      <View style={s.card}>
        {statusBreakdown.map(({ key, label, val }) => {
          const c   = STATUS_COLORS[key] || { bg: '#F3F4F6', text: '#374151' }
          const pct = totalLeads > 0 ? (val / totalLeads) * 100 : 0
          return (
            <TouchableOpacity key={key} style={s.statusRow} onPress={() => openDrill(`${label} Leads`, key)}>
              <View style={[s.statusDot, { backgroundColor: c.text }]} />
              <Text style={s.statusLabel}>{label}</Text>
              <View style={s.statusBarWrap}>
                <View style={[s.statusBar, { width: `${pct}%`, backgroundColor: c.text }]} />
              </View>
              <Text style={[s.statusCount, { color: c.text }]}>{val}</Text>
              <Ionicons name="chevron-forward" size={12} color="#D1D5DB" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Earning Potential ─────────────────────── */}
      {(actualEarned > 0 || potentialEarning > 0) && (
        <>
          <SectionHeader icon="wallet-outline" title="Earning Potential" />
          <View style={s.card}>
            <View style={s.earningRow}>
              <View style={s.earningBox}>
                <Text style={s.earningLabel}>Actual Earned</Text>
                <Text style={[s.earningValue, { color: '#16A34A' }]}>{fmtMoney(actualEarned)}</Text>
              </View>
              <View style={[s.earningDivider]} />
              <View style={s.earningBox}>
                <Text style={s.earningLabel}>Potential</Text>
                <Text style={[s.earningValue, { color: '#7C3AED' }]}>{fmtMoney(potentialEarning)}</Text>
              </View>
              <View style={s.earningDivider} />
              <View style={s.earningBox}>
                <Text style={s.earningLabel}>Remaining</Text>
                <Text style={[s.earningValue, { color: '#D97706' }]}>{fmtMoney(potentialEarning - actualEarned)}</Text>
              </View>
            </View>
            {/* Progress */}
            {potentialEarning > 0 && (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Achievement</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>
                    {((actualEarned / potentialEarning) * 100).toFixed(1)}%
                  </Text>
                </View>
                <View style={s.bigProgressWrap}>
                  <View style={[s.bigProgressBar, { width: `${Math.min((actualEarned / potentialEarning) * 100, 100)}%` }]} />
                </View>
              </View>
            )}
            {/* Product-wise */}
            {productStats.slice(0, 3).map(p => (
              <View key={p.product_id} style={s.productEarnRow}>
                <Text style={s.productEarnName} numberOfLines={1}>{p.product_name}</Text>
                <Text style={s.productEarnActual}>{fmtMoney(p.actual_earned)}</Text>
                <Text style={s.productEarnPotential}>/ {fmtMoney(p.total_potential_earning)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── Activity Details ──────────────────────── */}
      {totalAct > 0 && (
        <>
          <SectionHeader icon="checkbox-outline" title="Activity Status" />
          <View style={s.card}>
            {/* Overall circle + stats */}
            <View style={s.actOverview}>
              <View style={s.actCircleWrap}>
                <View style={s.actCircle}>
                  <Text style={s.actPct}>{actPct}%</Text>
                  <Text style={s.actPctLabel}>Done</Text>
                </View>
              </View>
              <View style={s.actStats}>
                {[
                  { label: 'Total',     val: totalAct,     color: '#4F46E5' },
                  { label: 'Completed', val: completedAct, color: '#16A34A' },
                  { label: 'Pending',   val: pendingAct,   color: '#D97706' },
                  { label: 'Overdue',   val: overdueAct,   color: '#DC2626' },
                ].map(({ label, val, color }) => (
                  <View key={label} style={s.actStat}>
                    <Text style={[s.actStatVal, { color }]}>{val}</Text>
                    <Text style={s.actStatLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Pending % bar */}
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Completion Progress</Text>
              <View style={s.bigProgressWrap}>
                <View style={[s.bigProgressBar, { width: `${actPct}%`, backgroundColor: actPct >= 70 ? '#16A34A' : actPct >= 40 ? '#D97706' : '#DC2626' }]} />
              </View>
            </View>

            {/* Agent breakdown (admin only) */}
            {isAdmin && agentSummary.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6 }}>By Agent</Text>
                {agentSummary.slice(0, 4).map(a => {
                  const pct = parseInt(a.avg_pct || 0)
                  return (
                    <View key={a.agent_id} style={s.agentActRow}>
                      <View style={s.agentActAvatar}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                          {a.agent_name?.charAt(0)?.toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{a.agent_name}</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: pct >= 70 ? '#16A34A' : '#D97706' }}>{pct}%</Text>
                        </View>
                        <View style={s.bigProgressWrap}>
                          <View style={[s.bigProgressBar, { width: `${pct}%`, backgroundColor: pct >= 70 ? '#16A34A' : '#D97706' }]} />
                        </View>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}

            {/* Navigate to activities */}
            <TouchableOpacity style={s.viewAllBtn} onPress={() => navigation.navigate('Activities')}>
              <Text style={s.viewAllText}>View All Activities →</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Pending Follow-ups ────────────────────── */}
      {followups.length > 0 && (
        <>
          <SectionHeader icon="alarm-outline" title="Upcoming Follow-ups" />
          <View style={s.card}>
            {followups.map((f, i) => (
              <TouchableOpacity key={f.id} style={[s.followupRow, i < followups.length-1 && s.rowBorder]}
                onPress={() => navigation.navigate('FollowUps')}>
                <Ionicons name="alarm-outline" size={16} color="#D97706" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.followupName}>{f.lead_name || f.contact_name || 'Lead'}</Text>
                  <Text style={s.followupDate}>{formatDate(f.follow_up_date || f.scheduled_at)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.viewAllBtn} onPress={() => navigation.navigate('FollowUps')}>
              <Text style={s.viewAllText}>See all follow-ups →</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Admin: top agents */}
      {isAdmin && (act.agent_summary || []).length > 0 && (
        <>
          <SectionHeader icon="trophy-outline" title="Top Performing Agents" />
          <View style={s.card}>
            {(act.agent_summary || []).slice(0,5).map((a, i) => (
              <View key={a.agent_id} style={[s.agentRow, i > 0 && s.rowBorder]}>
                <View style={[s.rankBadge, { backgroundColor: i < 3 ? '#FEF3C7' : '#F3F4F6' }]}>
                  <Text style={s.rankText}>{i+1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.agentName}>{a.agent_name}</Text>
                  <Text style={s.agentSub}>{a.total || 0} tasks · {a.completed || 0} done</Text>
                </View>
                <Text style={[s.agentPct, { color: parseInt(a.avg_pct||0) >= 70 ? '#16A34A' : '#D97706' }]}>
                  {a.avg_pct || 0}%
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={{ height: 32 }} />

      {/* Drill-down modal */}
      <DrillModal title={drillTitle} leads={drillLeads} onClose={() => setDrillLeads(null)} />
    </ScrollView>
  )
}

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return String(d) }
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F9FAFB' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
                  backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  greeting:     { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSub:    { fontSize: 13, color: '#6B7280', marginTop: 2 },
  roleBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  roleText:     { fontSize: 12, fontWeight: '600' },
  kpiGrid:      { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 8 },
  kpiCard:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
                  borderRadius: 12, padding: 12, borderLeftWidth: 4, flex: 1, minWidth: '45%',
                  shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  kpiIcon:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiValue:     { fontSize: 20, fontWeight: '800' },
  kpiLabel:     { fontSize: 11, color: '#6B7280', marginTop: 1 },
  kpiSub:       { fontSize: 10, color: '#9CA3AF' },
  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  card:         { backgroundColor: '#fff', marginHorizontal: 12, borderRadius: 14, padding: 14,
                  shadowColor: '#000', shadowOffset: {width:0,height:1}, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
  statusRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  statusDot:    { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusLabel:  { width: 90, fontSize: 12, color: '#374151' },
  statusBarWrap:{ flex: 1, height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginHorizontal: 8 },
  statusBar:    { height: 5, borderRadius: 3 },
  statusCount:  { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  rowBorder:    { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  earningRow:   { flexDirection: 'row', alignItems: 'center' },
  earningBox:   { flex: 1, alignItems: 'center' },
  earningDivider:{ width: 1, height: 40, backgroundColor: '#E5E7EB' },
  earningLabel: { fontSize: 11, color: '#6B7280', marginBottom: 4 },
  earningValue: { fontSize: 18, fontWeight: '800' },
  bigProgressWrap: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  bigProgressBar:  { height: 8, backgroundColor: '#4F46E5', borderRadius: 4 },
  productEarnRow:  { flexDirection: 'row', alignItems: 'center', paddingTop: 8, marginTop: 4,
                     borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  productEarnName: { flex: 1, fontSize: 12, fontWeight: '600', color: '#374151' },
  productEarnActual: { fontSize: 13, fontWeight: '700', color: '#16A34A', marginRight: 2 },
  productEarnPotential: { fontSize: 11, color: '#9CA3AF' },
  actOverview:  { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actCircleWrap:{ alignItems: 'center', justifyContent: 'center' },
  actCircle:    { width: 70, height: 70, borderRadius: 35, backgroundColor: '#EEF2FF',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 3, borderColor: '#4F46E5' },
  actPct:       { fontSize: 18, fontWeight: '800', color: '#4F46E5' },
  actPctLabel:  { fontSize: 10, color: '#6B7280' },
  actStats:     { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actStat:      { flex: 1, minWidth: '40%', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 8, padding: 8 },
  actStatVal:   { fontSize: 20, fontWeight: '800' },
  actStatLabel: { fontSize: 10, color: '#6B7280', marginTop: 1 },
  agentActRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  agentActAvatar:{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  viewAllBtn:   { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6', alignItems: 'center' },
  viewAllText:  { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  followupRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  followupName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  followupDate: { fontSize: 12, color: '#D97706', marginTop: 1 },
  agentRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rankBadge:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText:     { fontSize: 12, fontWeight: '700', color: '#374151' },
  agentName:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  agentSub:     { fontSize: 12, color: '#6B7280' },
  agentPct:     { fontSize: 14, fontWeight: '700' },
  drillOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  drillCard:    { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
                  paddingHorizontal: 16, paddingTop: 16, maxHeight: '80%' },
  drillHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  drillTitle:   { fontSize: 17, fontWeight: '700', color: '#111827' },
  drillClose:   { padding: 4 },
  drillCount:   { fontSize: 13, color: '#6B7280', marginBottom: 12 },
  drillRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
                  borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  drillName:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  drillPhone:   { fontSize: 12, color: '#6B7280' },
  drillBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  drillBadgeText:{ fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
})
