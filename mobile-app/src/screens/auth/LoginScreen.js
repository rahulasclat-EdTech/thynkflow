import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert
} from 'react-native'
import { useAuth } from '../../context/AuthContext'
import { Colors } from '../../utils/colors'

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      return Alert.alert('Error', 'Please enter email and password')
    }
    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)
    } catch (err) {
      Alert.alert('Login Failed', err.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>T</Text>
          </View>
          <Text style={styles.appName}>ThynkFlow</Text>
          <Text style={styles.tagline}>EdTech CRM · Sales Team</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign In</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={Colors.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passWrap}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.textLight}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <Text style={styles.eyeText}>{showPass ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>

          <Text style={styles.hint}>Default: admin@thynkflow.com / Admin@123</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.primary, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 36 },
  logoBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  appName: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { color: '#93c5fd', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: Colors.white, borderRadius: 20, padding: 24 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text, backgroundColor: Colors.white,
    marginBottom: 0,
  },
  passWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: 10, overflow: 'hidden' },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  eyeText: { fontSize: 16 },
  btn: {
    backgroundColor: Colors.primaryLight, borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { textAlign: 'center', color: Colors.textLight, fontSize: 11, marginTop: 16 },
})
