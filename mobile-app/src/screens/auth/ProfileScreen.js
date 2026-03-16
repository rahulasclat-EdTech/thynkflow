import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, TextInput
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../utils/colors'
import api from '../../api/client'

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth()
  const [changing, setChanging] = useState(false)
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ])
  }

  const handleChangePassword = async () => {
    if (!form.current || !form.newPass || !form.confirm) return Alert.alert('Error', 'Fill all fields')
    if (form.newPass !== form.confirm) return Alert.alert('Error', 'New passwords do not match')
    if (form.newPass.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters')
    setSaving(true)
    try {
      await api.put('/auth/change-password', { currentPassword: form.current, newPassword: form.newPass })
      Alert.alert('Success', 'Password changed successfully')
      setChanging(false)
      setForm({ current: '', newPass: '', confirm: '' })
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setSaving(false)
    }
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.primary }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>{user?.role_name} · {user?.email}</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Menu */}
        <View style={styles.menuCard}>
          <MenuItem icon="🔑" label="Change Password" onPress={() => setChanging(!changing)} />
          <View style={styles.divider} />
          <MenuItem icon="📱" label={user?.phone || 'Add phone number'} onPress={() => {}} />
          <View style={styles.divider} />
          <MenuItem icon="🚪" label="Sign Out" onPress={handleLogout} danger />
        </View>

        {/* Change Password Form */}
        {changing && (
          <View style={styles.changePassCard}>
            <Text style={styles.sectionTitle}>Change Password</Text>
            <TextInput style={styles.input} placeholder="Current password" secureTextEntry value={form.current} onChangeText={t => setForm({ ...form, current: t })} placeholderTextColor={Colors.textLight} />
            <TextInput style={styles.input} placeholder="New password" secureTextEntry value={form.newPass} onChangeText={t => setForm({ ...form, newPass: t })} placeholderTextColor={Colors.textLight} />
            <TextInput style={styles.input} placeholder="Confirm new password" secureTextEntry value={form.confirm} onChangeText={t => setForm({ ...form, confirm: t })} placeholderTextColor={Colors.textLight} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function MenuItem({ icon, label, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuIcon}><Text style={{ fontSize: 16 }}>{icon}</Text></View>
      <Text style={[styles.menuLabel, danger && { color: Colors.red }]}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  header: { padding: 16 },
  backBtn: { paddingVertical: 4 },
  backText: { color: '#93c5fd', fontSize: 14, fontWeight: '500' },
  profileSection: { alignItems: 'center', paddingBottom: 28, paddingTop: 8 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  name: { color: '#fff', fontSize: 20, fontWeight: '700' },
  role: { color: '#93c5fd', fontSize: 13, marginTop: 4, textTransform: 'capitalize' },
  body: { flex: 1, backgroundColor: Colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16 },
  menuCard: { backgroundColor: Colors.white, borderRadius: 14, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  menuIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.text },
  menuArrow: { color: Colors.textLight, fontSize: 20 },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: 60 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 14 },
  changePassCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text, marginBottom: 10,
  },
  saveBtn: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
