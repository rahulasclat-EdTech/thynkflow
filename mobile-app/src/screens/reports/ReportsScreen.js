// mobile-app/src/screens/reports/ReportsScreen.js
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Modal
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import COLORS from '../../utils/colors'
import CalendarPicker from '../../components/CalendarPicker'

const STATUS_COLORS = {
  new:            { bg: '#DBEAFE', text: '#1E40AF' },
  hot:            { bg: '#FEE2E2', text: '#991B1B' },
  warm:           { bg: '#FFEDD5', text: '#9A3412' },
  cold:           { bg: '#F3F4F6', text: '#374151' },
  converted:      { bg: '#DCFCE7', text: '#166534' },
  not_interested: { bg: '#F3F4F6', text: '#6B7280' },
  call_back:      { bg: '#EDE9FE', text: '#5B21B6' },
}
const STATUS_ICONS = {
  new: '🆕', hot: '🔥', warm: '☀️', cold: '❄️',
  call_back: '📞', not_interested: '🚫', converted: '✅',
}
// Fallback palette + icon for any status that isn't one of the known ones
// above (custom statuses added in Settings) — without this, the Pipeline
// tab was hardcoded to only these 7 keys and silently dropped every
// custom status that existed in the actual lead data.
const _FALLBACK_COLORS = [
  { bg: '#FCE7F3', text: '#9D174D' }, { bg: '#ECFDF5', text: '#065F46' },
  { bg: '#FFF7ED', text: '#9A3412' }, { bg: '#F0F9FF', text: '#0369A1' },
  { bg: '#FAF5FF', text: '#6B21A8' }, { bg: '#FEFCE8', text: '#854D0E' },
]
let _fbIdx = 0
function getStatusColor(key) {
  if (STATUS_COLORS[key]) return STATUS_COLORS[key]
  const c = _FALLBACK_COLORS[_fbIdx % _FALLBACK_COLORS.length]; _fbIdx++
  STATUS_COLORS[key] = c; return c
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
  { key: 'daily',      label: 'Daily Calls',    icon: 'call-outline' },
  { key: 'statuschange', label: 'Status Changes', icon: 'sync-outline' },
]

function todayStr() { return new Date().toISOString().slice(0, 10) }
function daysAgoStr(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
function startOfMonthStr() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().slice(0, 10)
}
function fmtShort(iso) {
  if (!iso) return ''
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }
  catch { return iso }
}

// Reusable date-range bar: From/To chips (each opens the calendar) plus
// quick presets, used by both the Daily Calls and Status Change tabs.
function DateRangeBar({ from, to, onPickFrom, onPickTo, onPreset }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={onPickFrom} style={s.dateChip}>
          <Ionicons name="calendar-outline" size={14} color="#4F46E5" />
          <Text style={s.dateChipText}>From: {fmtShort(from)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPickTo} style={s.dateChip}>
          <Ionicons name="calendar-outline" size={14} color="#4F46E5" />
          <Text style={s.dateChipText}>To: {fmtShort(to)}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {[
          { label: 'Today', from: todayStr(), to: todayStr() },
          { label: 'Yesterday', from: daysAgoStr(1), to: daysAgoStr(1) },
          { label: 'Last 7 Days', from: daysAgoStr(6), to: todayStr() },
          { label: 'This Month', from: startOfMonthStr(), to: todayStr() },
        ].map(p => (
          <TouchableOpacity key={p.label} onPress={() => onPreset(p.from, p.to)} style={s.presetChip}>
            <Text style={s.presetChipText}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

export default function ReportsScreen({ navigation }) {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const openLead = (row) => {
    if (!row.lead_id) return
    navigation.navigate('Leads', {
      screen: 'LeadDetail',
      params: {
        lead: {
          id: row.lead_id,
          contact_name: row.contact_name || row.lead_name,
          school_name: row.school_name,
          phone: row.phone,
          status: row.status || row.to_status,
          product_id: row.product_id,
          product_name: row.product_name,
        },
      },
    })
  }

  const fetchReports = useCallback(async () => {
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        api.get('/reports/overview').catch(() => ({ data: {} })),
        api.get('/reports/status-wise').catch(() => ({ data: [] })),
        api.get('/reports/agent-wise').catch(() => ({ data: [] })),
        api.get('/reports/conversion').catch(() => ({ data: [] })),
      ])
      // /reports/overview returns { success, data: { total_leads, hot_leads, ... } }
      const ovRaw = r1.data?.data || r1.data || {}
      // Normalise field names - backend returns both with and without _leads suffix
      const ovNorm = {
        ...ovRaw,
        call_back: ovRaw.call_back || ovRaw.call_back_leads || 0,
        not_interested: ovRaw.not_interested || ovRaw.not_interested_leads || 0,
        converted: ovRaw.converted || ovRaw.converted_leads || 0,
      }
      setData({
        overview:   ovNorm,
        status:     Array.isArray(r2.data?.data) ? r2.data.data : (Array.isArray(r2.data) ? r2.data : []),
        agents:     Array.isArray(r3.data?.data) ? r3.data.data : (Array.isArray(r3.data) ? r3.data : []),
        conversion: Array.isArray(r4.data?.data) ? r4.data.data : (Array.isArray(r4.data) ? r4.data : []),
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

  // ── Daily Calls (product-wise, agent-wise & status-wise) — lazy-loaded ──
  // Uses the same /reports/daily-calls endpoint the web app uses (backed by
  // communication_logs, which includes every call — ad-hoc and follow-up-
  // completion alike). Previously this screen called /reports/call-logs-daily,
  // which reads call_logs — a table populated ONLY by the follow-up flow —
  // so it silently missed every ad-hoc call and under-reported totals.
  const [dailyData, setDailyData]       = useState(null)
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyFrom, setDailyFrom]       = useState(todayStr())
  const [dailyTo, setDailyTo]           = useState(todayStr())
  const [showDailyCal, setShowDailyCal] = useState(null) // 'from' | 'to' | null
  const fetchDaily = useCallback(async (from, to) => {
    setDailyLoading(true)
    try {
      const r = await api.get(`/reports/daily-calls?from=${from}&to=${to}`)
      const rows = r.data || []

      const byAgent = {}, byProduct = {}, byStatus = {}
      rows.forEach(row => {
        const aKey = row.agent_name || 'Unassigned'
        byAgent[aKey] = byAgent[aKey] || { agent_name: aKey, call_count: 0, followup_count: 0 }
        byAgent[aKey].call_count++
        if (row.is_followup) byAgent[aKey].followup_count++

        const pKey = row.product_name || 'No Product'
        byProduct[pKey] = byProduct[pKey] || { product_name: pKey, call_count: 0 }
        byProduct[pKey].call_count++

        const sKey = row.status || 'unknown'
        byStatus[sKey] = byStatus[sKey] || { status: sKey, call_count: 0 }
        byStatus[sKey].call_count++
      })

      setDailyData({
        calls: rows,
        by_agent: Object.values(byAgent).sort((a,b)=>b.call_count-a.call_count),
        by_product: Object.values(byProduct).sort((a,b)=>b.call_count-a.call_count),
        by_status: Object.values(byStatus).sort((a,b)=>b.call_count-a.call_count),
        total: rows.length,
        followup_total: rows.filter(r2 => r2.is_followup).length,
      })
    } catch (e) { console.log('Daily calls report error:', e.message) }
    finally { setDailyLoading(false) }
  }, [])
  useEffect(() => { if (tab === 'daily' && !dailyData) fetchDaily(dailyFrom, dailyTo) }, [tab])

  // ── Status Change Report (product-wise & agent-wise) — lazy-loaded ──
  const [scData, setScData]       = useState(null)
  const [scLoading, setScLoading] = useState(false)
  const [scFrom, setScFrom]       = useState(todayStr())
  const [scTo, setScTo]           = useState(todayStr())
  const [showScCal, setShowScCal] = useState(null) // 'from' | 'to' | null
  const fetchStatusChange = useCallback(async (from, to) => {
    setScLoading(true)
    try {
      const r = await api.get(`/reports/status-change?from=${from}&to=${to}`)
      const body = r.data || r
      setScData({
        changes:    body.changes || [],
        by_agent:   body.by_agent || [],
        by_product: body.by_product || [],
        by_status:  body.by_status || [],
        by_transition:       body.by_transition || [],
        by_agent_transition: body.by_agent_transition || [],
        total:      body.total || 0,
      })
    } catch (e) { console.log('Status change report error:', e.message) }
    finally { setScLoading(false) }
  }, [])
  useEffect(() => { if (tab === 'statuschange' && !scData) fetchStatusChange(scFrom, scTo) }, [tab])

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
  const converted  = parseInt(ov.converted || ov.converted_leads || 0)
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
              <KPI label="Converted"      value={ov.converted_leads || ov.converted || 0} color="#16A34A" sub={`${convRate}% rate`} />
              <KPI label="Hot Leads"      value={ov.hot_leads || 0} color="#DC2626" />
              <KPI label="Warm Leads"     value={ov.warm_leads || 0} color="#D97706" />
              <KPI label="Cold Leads"     value={ov.cold_leads || 0} color="#6B7280" />
              <KPI label="Call Back"      value={ov.call_back_leads || ov.call_back || 0} color="#7C3AED" />
              <KPI label="Not Interested" value={ov.not_interested_leads || ov.not_interested || 0} color="#9CA3AF" />
              <KPI label="New Leads"      value={ov.new_leads || 0} color="#0891B2" />
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
                  const c   = getStatusColor(item.status)
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
            {statusData.length === 0 ? (
              <Text style={s.empty}>No data available</Text>
            ) : statusData
              // Highest-count stage first so the biggest bottleneck is obvious at a glance
              .slice().sort((a, b) => (b.count || 0) - (a.count || 0))
              .map((item, i) => {
                const color = getStatusColor(item.status).text
                const icon  = STATUS_ICONS[item.status] || '📌'
                const count = parseInt(item.count || 0)
                const pct   = totalLeads > 0 ? (count / totalLeads) * 100 : 0
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 20, width: 30 }}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'capitalize' }}>{item.status?.replace(/_/g, ' ')}</Text>
                        <Text style={{ fontSize: 14, fontWeight: '800', color }}>{count}</Text>
                      </View>
                      <ProgressBar pct={pct} color={color} />
                    </View>
                  </View>
                )
              })}
          </View>
        )}
        {tab === 'daily' && (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.sectionTitle}>Daily Calls</Text>
              <TouchableOpacity onPress={() => fetchDaily(dailyFrom, dailyTo)}>
                <Ionicons name="refresh" size={18} color="#4F46E5" />
              </TouchableOpacity>
            </View>
            <DateRangeBar
              from={dailyFrom} to={dailyTo}
              onPickFrom={() => setShowDailyCal('from')}
              onPickTo={() => setShowDailyCal('to')}
              onPreset={(f, t) => { setDailyFrom(f); setDailyTo(t); fetchDaily(f, t) }}
            />
            {dailyLoading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} /> : !dailyData || dailyData.total === 0 ? (
              <Text style={s.empty}>No calls logged for this range</Text>
            ) : (
              <>
                <View style={s.kpiGrid}>
                  <KPI label="Total Calls" value={dailyData.total} color="#4F46E5" />
                  <KPI label="Follow-up Calls" value={dailyData.followup_total} color="#7C3AED" />
                </View>
                <Text style={s.cardTitle}>By Agent</Text>
                <View style={s.card}>
                  {dailyData.by_agent.map((a, i) => (
                    <View key={i} style={s.statusRow}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' }}>{a.agent_name}</Text>
                      {a.followup_count > 0 && (
                        <Text style={{ fontSize: 11, color: '#7C3AED', fontWeight: '600', marginRight: 8 }}>{a.followup_count} follow-up</Text>
                      )}
                      <Text style={s.countText}>{a.call_count}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.cardTitle}>By Product</Text>
                <View style={s.card}>
                  {dailyData.by_product.map((p, i) => (
                    <View key={i} style={s.statusRow}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' }}>{p.product_name}</Text>
                      <Text style={s.countText}>{p.call_count}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.cardTitle}>By Status</Text>
                <View style={s.card}>
                  {dailyData.by_status.map((st, i) => (
                    <View key={i} style={s.statusRow}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'capitalize' }}>{(st.status||'').replace(/_/g,' ')}</Text>
                      <Text style={s.countText}>{st.call_count}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.cardTitle}>Call Log · tap a lead to open it</Text>
                {dailyData.calls.slice(0, 30).map((c, i) => (
                  <TouchableOpacity key={i} onPress={() => openLead(c)} style={[
                    { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6 },
                    c.is_followup && { borderLeftWidth: 3, borderLeftColor: '#7C3AED', backgroundColor: '#FAF5FF' },
                  ]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', flex: 1 }} numberOfLines={1}>{c.contact_name || c.school_name || 'Lead'}</Text>
                      {c.is_followup && (
                        <View style={{ backgroundColor: '#EDE9FE', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#6D28D9' }}>FOLLOW-UP</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
                    </View>
                    {c.school_name ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }} numberOfLines={1}>🏫 {c.school_name}</Text> : null}
                    {c.phone ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>📱 {c.phone}</Text> : null}
                    <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>
                      {c.agent_name} · {c.product_name || 'No product'}
                    </Text>
                    {c.discussion ? <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, fontStyle: 'italic' }} numberOfLines={1}>{c.discussion}</Text> : null}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {tab === 'statuschange' && (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={s.sectionTitle}>Status Changes</Text>
              <TouchableOpacity onPress={() => fetchStatusChange(scFrom, scTo)}>
                <Ionicons name="refresh" size={18} color="#4F46E5" />
              </TouchableOpacity>
            </View>
            <DateRangeBar
              from={scFrom} to={scTo}
              onPickFrom={() => setShowScCal('from')}
              onPickTo={() => setShowScCal('to')}
              onPreset={(f, t) => { setScFrom(f); setScTo(t); fetchStatusChange(f, t) }}
            />
            {scLoading ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} /> : !scData || scData.total === 0 ? (
              <Text style={s.empty}>No status changes for this date</Text>
            ) : (
              <>
                <View style={s.kpiGrid}>
                  <KPI label="Total Changes" value={scData.total} color="#4F46E5" />
                </View>
                <Text style={s.cardTitle}>By Agent</Text>
                <View style={s.card}>
                  {scData.by_agent.map((a, i) => (
                    <View key={i} style={s.statusRow}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' }}>{a.agent_name}</Text>
                      <Text style={s.countText}>{a.count}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.cardTitle}>By Product</Text>
                <View style={s.card}>
                  {scData.by_product.map((p, i) => (
                    <View key={i} style={s.statusRow}>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#374151' }}>{p.product_name}</Text>
                      <Text style={s.countText}>{p.count}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.cardTitle}>Old → New (Summary)</Text>
                <View style={s.card}>
                  {(scData.by_transition || []).map((t, i) => (
                    <View key={i} style={s.statusRow}>
                      <Text style={{ flex: 1, fontSize: 12, color: '#6B7280' }}>
                        <Text style={{ fontStyle: t.from_status ? 'normal' : 'italic' }}>
                          {t.from_status ? t.from_status.replace(/_/g,' ') : 'new lead'}
                        </Text>
                        {'  →  '}
                        <Text style={{ fontWeight: '700', color: '#4F46E5' }}>{t.to_status.replace(/_/g,' ')}</Text>
                      </Text>
                      <Text style={s.countText}>{t.count}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.cardTitle}>Agent-wise — Old → New</Text>
                {Object.values((scData.by_agent_transition || []).reduce((groups, t) => {
                  const key = t.agent_name || 'Unknown'
                  groups[key] = groups[key] || { agent_name: key, total: 0, rows: [] }
                  groups[key].rows.push(t)
                  groups[key].total += t.count
                  return groups
                }, {})).sort((a,b)=>b.total-a.total).map((g, gi) => (
                  <View key={gi} style={[s.card, { marginBottom: 8 }]}>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{g.agent_name}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#9CA3AF' }}>{g.total} total</Text>
                    </View>
                    {g.rows.map((t, i) => (
                      <View key={i} style={[s.statusRow, { paddingVertical: 4 }]}>
                        <Text style={{ flex: 1, fontSize: 11, color: '#6B7280' }}>
                          <Text style={{ fontStyle: t.from_status ? 'normal' : 'italic' }}>
                            {t.from_status ? t.from_status.replace(/_/g,' ') : 'new lead'}
                          </Text>
                          {'  →  '}
                          <Text style={{ fontWeight: '700', color: '#4F46E5' }}>{t.to_status.replace(/_/g,' ')}</Text>
                        </Text>
                        <Text style={[s.countText, { fontSize: 12 }]}>{t.count}</Text>
                      </View>
                    ))}
                  </View>
                ))}
                <Text style={s.cardTitle}>Recent Transitions · tap a lead to open it</Text>
                {scData.changes.slice(0, 30).map((c, i) => (
                  <TouchableOpacity key={i} onPress={() => openLead(c)} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', flex: 1 }} numberOfLines={1}>{c.lead_name}</Text>
                      <Ionicons name="chevron-forward" size={14} color="#D1D5DB" />
                    </View>
                    {c.school_name ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>🏫 {c.school_name}</Text> : null}
                    {c.phone ? <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>📱 {c.phone}</Text> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text style={{ fontSize: 11, color: '#9CA3AF', fontStyle: c.from_status ? 'normal' : 'italic' }}>
                        {c.from_status ? c.from_status.replace(/_/g,' ') : 'new lead'}
                      </Text>
                      <Ionicons name="arrow-forward" size={11} color="#9CA3AF" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#4F46E5' }}>{c.to_status.replace(/_/g,' ')}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{c.agent_name} · {c.product_name || 'No product'}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {showDailyCal && (
          <Modal visible transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarPicker
                value={showDailyCal === 'from' ? dailyFrom : dailyTo}
                onChange={d => {
                  const nf = showDailyCal === 'from' ? d : dailyFrom
                  const nt = showDailyCal === 'to' ? d : dailyTo
                  if (showDailyCal === 'from') setDailyFrom(d); else setDailyTo(d)
                  setShowDailyCal(null)
                  fetchDaily(nf, nt)
                }}
                onClose={() => setShowDailyCal(null)} />
            </View>
          </Modal>
        )}

        {showScCal && (
          <Modal visible transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarPicker
                value={showScCal === 'from' ? scFrom : scTo}
                onChange={d => {
                  const nf = showScCal === 'from' ? d : scFrom
                  const nt = showScCal === 'to' ? d : scTo
                  if (showScCal === 'from') setScFrom(d); else setScTo(d)
                  setShowScCal(null)
                  fetchStatusChange(nf, nt)
                }}
                onClose={() => setShowScCal(null)} />
            </View>
          </Modal>
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
  dateChip:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff',
                 borderWidth: 1.5, borderColor: '#E0E7FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  dateChipText:{ fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  presetChip:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#EEF2FF', marginRight: 8 },
  presetChipText:{ fontSize: 11, fontWeight: '600', color: '#4F46E5' },
})
