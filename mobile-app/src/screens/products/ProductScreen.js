// mobile-app/src/screens/products/ProductScreen.js
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
  if (num >= 10000000) return '₹' + (num/10000000).toFixed(2) + ' Cr'
  if (num >= 100000)   return '₹' + (num/100000).toFixed(2) + ' L'
  if (num >= 1000)     return '₹' + (num/1000).toFixed(1) + 'K'
  return '₹' + num.toFixed(0)
}

export default function ProductScreen() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab]   = useState('products')

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/products/dashboard')
      setData(res.data?.data || res.data || {})
    } catch (e) { console.log(e.message) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  )

  const productStats   = data?.product_stats   || []
  const agentBreakdown = data?.agent_breakdown  || []
  const totalEarned    = parseFloat(data?.total_actual_earned || 0)
  const totalPotential = parseFloat(data?.total_potential     || 0)
  const remaining      = totalPotential - totalEarned
  const achievePct     = totalPotential > 0 ? Math.min((totalEarned / totalPotential) * 100, 100) : 0

  // Build agent map
  const agentMap = {}
  agentBreakdown.forEach(row => {
    if (!agentMap[row.agent_id]) {
      agentMap[row.agent_id] = {
        agent_id: row.agent_id, agent_name: row.agent_name,
        total_leads: 0, converted: 0, earned: 0, products: []
      }
    }
    agentMap[row.agent_id].total_leads += parseInt(row.total_leads || 0)
    agentMap[row.agent_id].converted   += parseInt(row.converted   || 0)
    agentMap[row.agent_id].earned      += parseFloat(row.earned    || 0)
    agentMap[row.agent_id].products.push(row)
  })
  const agents = Object.values(agentMap).sort((a, b) => b.converted - a.converted)

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>📦 Products</Text>
        <Text style={s.subtitle}>{isAdmin ? 'All Products Dashboard' : 'My Performance'}</Text>
      </View>

      {/* Overall Earning Summary */}
      <View style={s.earningBanner}>
        <View style={s.earningRow}>
          <View style={s.earningBox}>
            <Text style={s.earningLabel}>Actual Earned</Text>
            <Text style={[s.earningVal, { color: '#16A34A' }]}>{fmtMoney(totalEarned)}</Text>
          </View>
          <View style={s.earningDivider} />
          <View style={s.earningBox}>
            <Text style={s.earningLabel}>Potential</Text>
            <Text style={[s.earningVal, { color: '#7C3AED' }]}>{fmtMoney(totalPotential)}</Text>
          </View>
          <View style={s.earningDivider} />
          <View style={s.earningBox}>
            <Text style={s.earningLabel}>Remaining</Text>
            <Text style={[s.earningVal, { color: '#D97706' }]}>{fmtMoney(remaining)}</Text>
          </View>
        </View>
        {totalPotential > 0 && (
          <View style={{ marginTop: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, color: '#6B7280' }}>Overall Achievement</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#16A34A' }}>{achievePct.toFixed(1)}%</Text>
            </View>
            <View style={s.bigBar}>
              <View style={[s.bigBarFill, { width: `${achievePct}%` }]} />
            </View>
          </View>
        )}
      </View>

      {/* Tabs */}
      {isAdmin && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.tabBar}>
          {[['products','📦 By Product'], ['agents','👤 By Agent']].map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setActiveTab(key)}
              style={[s.tab, activeTab === key && s.tabActive]}>
              <Text style={[s.tabTxt, activeTab === key && s.tabTxtActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 80, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={COLORS.primary} />}>

        {/* ── BY PRODUCT ── */}
        {activeTab === 'products' && (
          productStats.length === 0
            ? <View style={s.empty}>
                <Ionicons name="cube-outline" size={48} color="#D1D5DB" />
                <Text style={s.emptyTxt}>No products found</Text>
              </View>
            : productStats.map(p => {
                const potential  = parseFloat(p.total_potential_earning || 0)
                const earned     = parseFloat(p.actual_earned || 0)
                const pct        = potential > 0 ? Math.min((earned / potential) * 100, 100) : 0
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
                            <Text style={[s.badgeTxt, { color: '#92400E' }]}>
                              {fmtMoney(perClosure)} / closure
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Earning cards */}
                    <View style={s.earningCards}>
                      <View style={[s.eCard, { borderColor: '#BBF7D0' }]}>
                        <Text style={s.eCardLabel}>Earned</Text>
                        <Text style={[s.eCardVal, { color: '#16A34A' }]}>{fmtMoney(earned)}</Text>
                      </View>
                      <View style={[s.eCard, { borderColor: '#DDD6FE' }]}>
                        <Text style={s.eCardLabel}>Potential</Text>
                        <Text style={[s.eCardVal, { color: '#7C3AED' }]}>{fmtMoney(potential)}</Text>
                      </View>
                      <View style={[s.eCard, { borderColor: '#FDE68A' }]}>
                        <Text style={s.eCardLabel}>Remaining</Text>
                        <Text style={[s.eCardVal, { color: '#D97706' }]}>{fmtMoney(potential - earned)}</Text>
                      </View>
                    </View>

                    {/* Achievement bar */}
                    {potential > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: 11, color: '#6B7280' }}>Achievement Rate</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: pct >= 70 ? '#16A34A' : '#D97706' }}>
                            {pct.toFixed(1)}%
                          </Text>
                        </View>
                        <View style={s.bar}>
                          <View style={[s.barFill, { width: `${pct}%`,
                            backgroundColor: pct >= 70 ? '#16A34A' : pct >= 40 ? '#D97706' : '#DC2626' }]} />
                        </View>
                      </View>
                    )}

                    {/* Lead stats */}
                    <View style={s.leadStats}>
                      {[
                        ['Total',  p.total_leads,     '#4F46E5'],
                        ['Hot',    p.hot_leads,        '#DC2626'],
                        ['Warm',   p.warm_leads,       '#D97706'],
                        ['Cold',   p.cold_leads,       '#6B7280'],
                        ['Conv.',  p.converted_leads,  '#16A34A'],
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
        {activeTab === 'agents' && (
          agents.length === 0
            ? <View style={s.empty}><Text style={s.emptyTxt}>No agent data</Text></View>
            : agents.map((agent, i) => {
                const convRate = agent.total_leads > 0
                  ? ((agent.converted / agent.total_leads) * 100).toFixed(1) : '0'
                return (
                  <View key={agent.agent_id} style={s.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={[s.avatar, { backgroundColor: i < 3 ? '#4F46E5' : '#9CA3AF' }]}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                          {agent.agent_name?.charAt(0)?.toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{agent.agent_name}</Text>
                        <Text style={{ fontSize: 12, color: '#6B7280' }}>
                          {agent.total_leads} leads · {agent.converted} converted · {convRate}% rate
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: '#16A34A' }}>
                          {fmtMoney(agent.earned)}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#9CA3AF' }}>earned</Text>
                      </View>
                    </View>
                    {agent.products.map(p => (
                      <View key={p.product_name}
                        style={{ flexDirection:'row', alignItems:'center', paddingVertical:6,
                                 borderTopWidth:1, borderTopColor:'#F3F4F6' }}>
                        <Text style={{ flex:1, fontSize:13, color:'#374151' }}>{p.product_name}</Text>
                        <Text style={{ fontSize:12, color:'#6B7280' }}>{p.total_leads} leads</Text>
                        <Text style={{ fontSize:12, fontWeight:'700', color:'#16A34A', marginLeft:12 }}>
                          {fmtMoney(p.earned)}
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
  container:     { flex:1, backgroundColor:'#F9FAFB' },
  center:        { flex:1, alignItems:'center', justifyContent:'center' },
  header:        { paddingHorizontal:16, paddingTop:52, paddingBottom:12,
                   backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor:'#E5E7EB' },
  title:         { fontSize:22, fontWeight:'800', color:'#111827' },
  subtitle:      { fontSize:13, color:'#6B7280', marginTop:2 },
  earningBanner: { backgroundColor:'#fff', padding:16, borderBottomWidth:1, borderBottomColor:'#E5E7EB' },
  earningRow:    { flexDirection:'row', alignItems:'center' },
  earningBox:    { flex:1, alignItems:'center' },
  earningDivider:{ width:1, height:36, backgroundColor:'#E5E7EB' },
  earningLabel:  { fontSize:11, color:'#6B7280', marginBottom:3 },
  earningVal:    { fontSize:17, fontWeight:'800' },
  bigBar:        { height:8, backgroundColor:'#F3F4F6', borderRadius:4, overflow:'hidden' },
  bigBarFill:    { height:8, backgroundColor:'#16A34A', borderRadius:4 },
  tabBar:        { backgroundColor:'#fff', paddingHorizontal:12, paddingVertical:6,
                   borderBottomWidth:1, borderBottomColor:'#E5E7EB', maxHeight:44 },
  tab:           { paddingHorizontal:14, borderRadius:20, backgroundColor:'#F3F4F6',
                   marginRight:6, height:30, alignItems:'center', justifyContent:'center' },
  tabActive:     { backgroundColor:'#4F46E5' },
  tabTxt:        { fontSize:13, color:'#6B7280', fontWeight:'500' },
  tabTxtActive:  { color:'#fff', fontWeight:'700' },
  card:          { backgroundColor:'#fff', borderRadius:14, padding:14,
                   shadowColor:'#000', shadowOffset:{width:0,height:1},
                   shadowOpacity:0.06, shadowRadius:4, elevation:2 },
  cardHead:      { flexDirection:'row', alignItems:'flex-start', marginBottom:12 },
  productName:   { fontSize:16, fontWeight:'800', color:'#111827' },
  badge:         { paddingHorizontal:8, paddingVertical:2, borderRadius:12 },
  badgeTxt:      { fontSize:11, fontWeight:'700' },
  earningCards:  { flexDirection:'row', gap:8, marginBottom:8 },
  eCard:         { flex:1, borderWidth:1.5, borderRadius:10, padding:8, alignItems:'center' },
  eCardLabel:    { fontSize:10, color:'#6B7280', marginBottom:2 },
  eCardVal:      { fontSize:14, fontWeight:'800' },
  bar:           { height:6, backgroundColor:'#F3F4F6', borderRadius:3, overflow:'hidden' },
  barFill:       { height:6, borderRadius:3 },
  leadStats:     { flexDirection:'row', gap:6, marginTop:10 },
  leadStat:      { flex:1, alignItems:'center', backgroundColor:'#F9FAFB', borderRadius:8, padding:6 },
  leadStatVal:   { fontSize:15, fontWeight:'800' },
  leadStatLabel: { fontSize:9, color:'#6B7280', marginTop:1 },
  avatar:        { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },
  empty:         { alignItems:'center', padding:40, gap:8 },
  emptyTxt:      { color:'#9CA3AF', fontSize:14 },
})
