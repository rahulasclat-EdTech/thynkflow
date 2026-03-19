// mobile-app/src/screens/products/ProductScreen.js
// 4 earning tabs: Potential / Actual Earned / Earning Lost / Still To Earn
// Admin: By Product + By Agent tabs
// Agent: sees only own data
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, StyleSheet
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import COLORS from '../../utils/colors'

function fmtMoney(n) {
  const num = parseFloat(n) || 0
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr'
  if (num >= 100000)   return '₹' + (num / 100000).toFixed(2) + ' L'
  if (num >= 1000)     return '₹' + (num / 1000).toFixed(1) + 'K'
  return '₹' + num.toFixed(0)
}

function pct(a, b) {
  return b > 0 ? Math.min(((a / b) * 100), 100).toFixed(1) : '0'
}

const EARNING_TABS = [
  { key: 'potential', label: '💰 Potential',    field: 'total_potential_earning', color: '#7C3AED' },
  { key: 'earned',    label: '✅ Earned',        field: 'actual_earned',           color: '#16A34A' },
  { key: 'lost',      label: '❌ Lost',           field: 'earning_lost',            color: '#DC2626' },
  { key: 'still',     label: '⏳ Still To Earn', field: 'still_to_earn',           color: '#D97706' },
]

const VIEW_TABS_ADMIN = [
  { key: 'products', label: '📦 Products' },
  { key: 'agents',   label: '👤 Agents'   },
]

export default function ProductScreen() {
  const { user }  = useAuth()
  const isAdmin   = user?.role_name === 'admin'
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [earningTab, setEarningTab] = useState('potential')
  const [viewTab, setViewTab]       = useState('products')

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/products/dashboard')
      setData(res.data?.data || res.data || {})
    } catch (e) { console.log('Products error:', e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
  )

  const productStats   = data?.product_stats   || []
  const agentBreakdown = data?.agent_breakdown  || []
  const totalPotential = parseFloat(data?.total_potential      || 0)
  const totalEarned    = parseFloat(data?.total_actual_earned  || 0)
  const totalLost      = parseFloat(data?.total_earning_lost   || 0)
  const totalStill     = parseFloat(data?.total_still_to_earn  || 0)

  // Build agent map
  const agentMap = {}
  agentBreakdown.forEach(row => {
    if (!agentMap[row.agent_id]) {
      agentMap[row.agent_id] = {
        agent_id: row.agent_id, agent_name: row.agent_name,
        total_leads: 0, converted: 0, not_interested: 0,
        potential: 0, earned: 0, lost: 0, still_to_earn: 0, products: []
      }
    }
    const a = agentMap[row.agent_id]
    a.total_leads    += parseInt(row.total_leads || 0)
    a.converted      += parseInt(row.converted || 0)
    a.not_interested += parseInt(row.not_interested || 0)
    a.potential      += parseFloat(row.potential || 0)
    a.earned         += parseFloat(row.earned || 0)
    a.lost           += parseFloat(row.lost || 0)
    a.still_to_earn  += parseFloat(row.still_to_earn || 0)
    a.products.push(row)
  })
  const agentList = Object.values(agentMap).sort((a, b) => b.earned - a.earned)

  const currentEarning = EARNING_TABS.find(t => t.key === earningTab) || EARNING_TABS[0]

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>📦 Products</Text>
        <Text style={s.subtitle}>{isAdmin ? 'All Products Dashboard' : 'My Performance'}</Text>
      </View>

      {/* Overall earning summary banner */}
      <View style={s.banner}>
        <View style={s.bannerRow}>
          {[
            { label: 'Potential',    val: totalPotential, color: '#7C3AED' },
            { label: 'Earned',       val: totalEarned,    color: '#16A34A' },
            { label: 'Lost',         val: totalLost,      color: '#DC2626' },
            { label: 'Still To Earn',val: totalStill,     color: '#D97706' },
          ].map(({ label, val, color }, i) => (
            <React.Fragment key={label}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.bannerBox}>
                <Text style={s.bannerLabel}>{label}</Text>
                <Text style={[s.bannerVal, { color }]}>{fmtMoney(val)}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
        {totalPotential > 0 && (
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, color: '#6B7280' }}>Achievement Rate</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#16A34A' }}>{pct(totalEarned, totalPotential)}%</Text>
            </View>
            <View style={s.bigBar}>
              <View style={[s.bigBarEarned, { width: `${pct(totalEarned, totalPotential)}%` }]} />
              <View style={[s.bigBarLost, { width: `${pct(totalLost, totalPotential)}%` }]} />
            </View>
          </View>
        )}
      </View>

      {/* Earning type tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar}>
        {EARNING_TABS.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setEarningTab(t.key)}
            style={[s.tab, earningTab === t.key && { backgroundColor: t.color }]}>
            <Text style={[s.tabTxt, earningTab === t.key && { color: '#fff', fontWeight: '700' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* View tabs — admin only */}
      {isAdmin && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.tabBar, { paddingTop: 2 }]}>
          {VIEW_TABS_ADMIN.map(t => (
            <TouchableOpacity key={t.key} onPress={() => setViewTab(t.key)}
              style={[s.tab, viewTab === t.key && s.tabActive]}>
              <Text style={[s.tabTxt, viewTab === t.key && s.tabTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 80, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchData() }}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── BY PRODUCT ── */}
        {(!isAdmin || viewTab === 'products') && (
          productStats.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
              <Text style={s.emptyTxt}>No products found</Text>
            </View>
          ) : productStats.map(p => {
            const activeVal  = parseFloat(p[currentEarning.field] || 0)
            const achPct     = parseFloat(pct(p.actual_earned, p.total_potential_earning))
            const perClosure = parseFloat(p.per_closure_earning || 0)
            return (
              <View key={p.product_id} style={s.card}>
                {/* Product header */}
                <View style={s.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.productName}>{p.product_name}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <View style={[s.badge, { backgroundColor: p.product_type === 'B2B' ? '#DBEAFE' : '#EDE9FE' }]}>
                        <Text style={[s.badgeTxt, { color: p.product_type === 'B2B' ? '#1E40AF' : '#5B21B6' }]}>
                          {p.product_type || 'B2C'}
                        </Text>
                      </View>
                      <View style={[s.badge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[s.badgeTxt, { color: '#92400E' }]}>{fmtMoney(perClosure)}/closure</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, color: '#6B7280' }}>{currentEarning.label}</Text>
                    <Text style={[s.activeVal, { color: currentEarning.color }]}>{fmtMoney(activeVal)}</Text>
                  </View>
                </View>

                {/* All 4 earning cards */}
                <View style={s.earningCards}>
                  {[
                    { label: 'Potential', val: p.total_potential_earning, color: '#7C3AED', border: '#DDD6FE' },
                    { label: 'Earned',    val: p.actual_earned,           color: '#16A34A', border: '#BBF7D0' },
                    { label: 'Lost',      val: p.earning_lost,            color: '#DC2626', border: '#FECACA' },
                    { label: 'Still',     val: p.still_to_earn,           color: '#D97706', border: '#FDE68A' },
                  ].map(({ label, val, color, border }) => (
                    <View key={label} style={[s.eCard, { borderColor: border }]}>
                      <Text style={s.eCardLabel}>{label}</Text>
                      <Text style={[s.eCardVal, { color }]}>{fmtMoney(val)}</Text>
                    </View>
                  ))}
                </View>

                {/* Achievement bar */}
                {parseFloat(p.total_potential_earning) > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 11, color: '#6B7280' }}>Achievement</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700',
                        color: achPct >= 70 ? '#16A34A' : achPct >= 40 ? '#D97706' : '#DC2626' }}>
                        {achPct}%
                      </Text>
                    </View>
                    <View style={s.bar}>
                      <View style={[s.barFill, { width: `${achPct}%`,
                        backgroundColor: achPct >= 70 ? '#16A34A' : achPct >= 40 ? '#D97706' : '#DC2626' }]} />
                    </View>
                  </View>
                )}

                {/* Lead stats row */}
                <View style={s.leadStats}>
                  {[
                    ['Total',  p.total_leads,           '#4F46E5'],
                    ['Conv.',  p.converted_leads,        '#16A34A'],
                    ['Lost',   p.not_interested_leads,   '#DC2626'],
                    ['Hot',    p.hot_leads,              '#EF4444'],
                    ['Warm',   p.warm_leads,             '#D97706'],
                  ].map(([label, val, color]) => (
                    <View key={label} style={s.leadStat}>
                      <Text style={[s.leadStatVal, { color }]}>{val || 0}</Text>
                      <Text style={s.leadStatLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )
          })
        )}

        {/* ── BY AGENT ── */}
        {isAdmin && viewTab === 'agents' && (
          agentList.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyTxt}>No agent data</Text></View>
          ) : agentList.map((agent, i) => {
            const activeVal = agent[
              earningTab === 'potential' ? 'potential' :
              earningTab === 'earned'    ? 'earned'    :
              earningTab === 'lost'      ? 'lost'      : 'still_to_earn'
            ]
            const convRate = pct(agent.converted, agent.total_leads)
            const achPct   = parseFloat(pct(agent.earned, agent.potential))
            return (
              <View key={agent.agent_id} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <View style={[s.avatar, { backgroundColor: i < 3 ? '#4F46E5' : '#9CA3AF' }]}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                      {agent.agent_name?.charAt(0)?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                      {['🥇','🥈','🥉'][i] || ''} {agent.agent_name}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>
                      {agent.total_leads} leads · {agent.converted} conv · {convRate}%
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: currentEarning.color }}>
                      {fmtMoney(activeVal)}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#9CA3AF' }}>{currentEarning.label}</Text>
                  </View>
                </View>

                {/* Agent earning cards */}
                <View style={s.earningCards}>
                  {[
                    { label: 'Potential', val: agent.potential,     color: '#7C3AED', border: '#DDD6FE' },
                    { label: 'Earned',    val: agent.earned,         color: '#16A34A', border: '#BBF7D0' },
                    { label: 'Lost',      val: agent.lost,           color: '#DC2626', border: '#FECACA' },
                    { label: 'Still',     val: agent.still_to_earn,  color: '#D97706', border: '#FDE68A' },
                  ].map(({ label, val, color, border }) => (
                    <View key={label} style={[s.eCard, { borderColor: border }]}>
                      <Text style={s.eCardLabel}>{label}</Text>
                      <Text style={[s.eCardVal, { color }]}>{fmtMoney(val)}</Text>
                    </View>
                  ))}
                </View>

                {/* Achievement bar */}
                {agent.potential > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 11, color: '#6B7280' }}>Achievement</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700',
                        color: achPct >= 70 ? '#16A34A' : achPct >= 40 ? '#D97706' : '#DC2626' }}>
                        {achPct}%
                      </Text>
                    </View>
                    <View style={s.bar}>
                      <View style={[s.barFill, { width: `${achPct}%`,
                        backgroundColor: achPct >= 70 ? '#16A34A' : achPct >= 40 ? '#D97706' : '#DC2626' }]} />
                    </View>
                  </View>
                )}

                {/* Products breakdown */}
                {agent.products.map(p => (
                  <View key={p.product_name}
                    style={{ flexDirection:'row', alignItems:'center', paddingVertical:6,
                             borderTopWidth:1, borderTopColor:'#F3F4F6', marginTop:4 }}>
                    <Text style={{ flex:1, fontSize:13, color:'#374151' }}>{p.product_name}</Text>
                    <Text style={{ fontSize:12, color:'#6B7280' }}>{p.total_leads} leads</Text>
                    <Text style={{ fontSize:12, fontWeight:'700', color:'#16A34A', marginLeft:12 }}>
                      {fmtMoney(p.earned)}
                    </Text>
                    <Text style={{ fontSize:11, color:'#DC2626', marginLeft:8 }}>
                      -{fmtMoney(p.lost)}
                    </Text>
                  </View>
                ))}
              </View>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#F9FAFB' },
  center:       { flex:1, alignItems:'center', justifyContent:'center' },
  header:       { paddingHorizontal:16, paddingTop:52, paddingBottom:12,
                  backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:'#E5E7EB' },
  title:        { fontSize:22, fontWeight:'800', color:'#111827' },
  subtitle:     { fontSize:13, color:'#6B7280', marginTop:2 },
  banner:       { backgroundColor:'#fff', padding:16,
                  borderBottomWidth:1, borderBottomColor:'#E5E7EB' },
  bannerRow:    { flexDirection:'row', alignItems:'center' },
  bannerBox:    { flex:1, alignItems:'center' },
  divider:      { width:1, height:36, backgroundColor:'#E5E7EB' },
  bannerLabel:  { fontSize:9, color:'#6B7280', marginBottom:2, textAlign:'center' },
  bannerVal:    { fontSize:14, fontWeight:'800' },
  bigBar:       { height:8, backgroundColor:'#F3F4F6', borderRadius:4, overflow:'hidden', flexDirection:'row' },
  bigBarEarned: { height:8, backgroundColor:'#16A34A' },
  bigBarLost:   { height:8, backgroundColor:'#DC2626' },
  tabBar:       { backgroundColor:'#fff', paddingHorizontal:12, paddingVertical:4,
                  borderBottomWidth:1, borderBottomColor:'#F3F4F6', maxHeight:44 },
  tab:          { paddingHorizontal:12, paddingVertical:6, borderRadius:20,
                  backgroundColor:'#F3F4F6', marginRight:6, alignItems:'center', justifyContent:'center' },
  tabActive:    { backgroundColor:'#4F46E5' },
  tabTxt:       { fontSize:12, color:'#374151', fontWeight:'500' },
  tabTxtActive: { color:'#fff', fontWeight:'700' },
  card:         { backgroundColor:'#fff', borderRadius:14, padding:14,
                  shadowColor:'#000', shadowOffset:{width:0,height:1},
                  shadowOpacity:0.06, shadowRadius:4, elevation:2 },
  cardHead:     { flexDirection:'row', alignItems:'flex-start', marginBottom:12 },
  productName:  { fontSize:16, fontWeight:'800', color:'#111827' },
  activeVal:    { fontSize:18, fontWeight:'800' },
  badge:        { paddingHorizontal:8, paddingVertical:2, borderRadius:12 },
  badgeTxt:     { fontSize:11, fontWeight:'700' },
  earningCards: { flexDirection:'row', gap:6, marginBottom:8 },
  eCard:        { flex:1, borderWidth:1.5, borderRadius:10, padding:6, alignItems:'center' },
  eCardLabel:   { fontSize:9, color:'#6B7280', marginBottom:2 },
  eCardVal:     { fontSize:12, fontWeight:'800' },
  bar:          { height:6, backgroundColor:'#F3F4F6', borderRadius:3, overflow:'hidden' },
  barFill:      { height:6, borderRadius:3 },
  leadStats:    { flexDirection:'row', gap:4, marginTop:10 },
  leadStat:     { flex:1, alignItems:'center', backgroundColor:'#F9FAFB', borderRadius:8, padding:5 },
  leadStatVal:  { fontSize:14, fontWeight:'800' },
  leadStatLabel:{ fontSize:9, color:'#6B7280', marginTop:1 },
  avatar:       { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },
  empty:        { alignItems:'center', padding:40, gap:8 },
  emptyTxt:     { color:'#9CA3AF', fontSize:14 },
})
