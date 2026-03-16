import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../utils/colors'
import api from '../../api/client'

const STATUSES = [
  { value: 'hot', label: '🔥 Hot Lead' },
  { value: 'warm', label: '☀️ Warm Lead' },
  { value: 'cold', label: '❄️ Cold Lead' },
  { value: 'converted', label: '✅ Converted' },
  { value: 'not_interested', label: '🚫 Not Interested' },
  { value: 'call_back', label: '🔄 Call Back' },
]

export default function PostCallScreen({ route, navigation }) {
  const { lead } = route.params
  const [status, setStatus] = useState('')
  const [discussion, setDiscussion] = useState('')
  const [followupDate, setFollowupDate] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!status) return Alert.alert('Required', 'Please select a call status')
    setSaving(true)
    try {
      await api.post('/followups', {
        lead_id: lead.id,
        status,
        discussion: discussion.trim(),
        next_followup_date: followupDate || null,
      })
      Alert.alert('Saved!', 'Call log saved successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Handle bar */}
      <View style={styles.handle} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Post-Call Update</Text>
          <Text style={styles.leadName} numberOfLines={1}>
            {lead.school_name || lead.contact_name || lead.phone}
          </Text>
          <Text style={styles.phone}>{lead.phone}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Status Selection */}
        <Text style={styles.sectionLabel}>Call Status *</Text>
        <View style={styles.statusGrid}>
          {STATUSES.map(s => (
            <TouchableOpacity
              key={s.value}
              style={[styles.statusChip, status === s.value && styles.statusChipActive]}
              onPress={() => setStatus(s.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.statusChipText, status === s.value && styles.statusChipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Discussion Notes */}
        <Text style={styles.sectionLabel}>Discussion Notes</Text>
        <TextInput
          style={styles.textarea}
          placeholder="What was discussed during the call? Key points, objections, interest level..."
          placeholderTextColor={Colors.textLight}
          value={discussion}
          onChangeText={setDiscussion}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Next Follow-up Date */}
        <Text style={styles.sectionLabel}>Next Follow-up Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD (e.g. 2025-03-20)"
          placeholderTextColor={Colors.textLight}
          value={followupDate}
          onChangeText={setFollowupDate}
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.dateHint}>Leave empty if no follow-up needed</Text>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, !status && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving || !status}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Call Log</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginTop: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  leadName: { fontSize: 13, fontWeight: '600', color: Colors.primaryLight, marginTop: 4, maxWidth: 260 },
  phone: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: Colors.textMuted, fontSize: 14 },
  body: { flex: 1, padding: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, marginTop: 18, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.white,
  },
  statusChipActive: { borderColor: Colors.primaryLight, backgroundColor: Colors.primaryBg },
  statusChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  statusChipTextActive: { color: Colors.primaryLight },
  textarea: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.text,
    minHeight: 100, backgroundColor: Colors.white,
  },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: Colors.text,
    backgroundColor: Colors.white,
  },
  dateHint: { fontSize: 11, color: Colors.textLight, marginTop: 5 },
  saveBtn: {
    backgroundColor: Colors.primaryLight, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 28,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', paddingVertical: 14 },
  skipBtnText: { color: Colors.textLight, fontSize: 14 },
})
