// mobile-app/src/components/VoiceInput.js
// Safe voice-to-text using @react-native-voice/voice
// Add to package.json: "@react-native-voice/voice": "^3.2.4"
// Then rebuild APK

import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Platform, ActivityIndicator
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// Safe import — won't crash if package not installed
let Voice = null
try {
  Voice = require('@react-native-voice/voice').default
} catch (e) {
  // Package not installed — component shows fallback
}

export default function VoiceInput({ onResult, placeholder = 'Tap mic to speak', style }) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript]   = useState('')
  const [error, setError]             = useState(null)
  const [available, setAvailable]     = useState(false)

  useEffect(() => {
    if (!Voice) return

    // Check if voice recognition is available on this device
    Voice.isAvailable()
      .then(avail => setAvailable(!!avail))
      .catch(() => setAvailable(false))

    // Set up event listeners
    Voice.onSpeechStart    = () => { setTranscript(''); setError(null) }
    Voice.onSpeechEnd      = () => setIsListening(false)
    Voice.onSpeechError    = (e) => {
      setIsListening(false)
      // Don't show error for common non-issues like "no match" or user stopping
      const code = e?.error?.code
      if (code !== '7' && code !== '5') { // 7=no match, 5=client error(stopped)
        setError('Could not hear clearly. Try again.')
      }
    }
    Voice.onSpeechResults  = (e) => {
      const text = e.value?.[0] || ''
      setTranscript(text)
      if (text) {
        onResult(text)
        setTranscript('')
      }
      setIsListening(false)
    }
    Voice.onSpeechPartialResults = (e) => {
      setTranscript(e.value?.[0] || '')
    }

    return () => {
      // Cleanup
      try { Voice.destroy().then(Voice.removeAllListeners) } catch {}
    }
  }, [])

  const startListening = async () => {
    if (!Voice || !available) {
      Alert.alert(
        '🎤 Voice Input',
        'Voice recognition is not available on this device.\n\nTip: Use the microphone 🎤 button on your keyboard instead!',
        [{ text: 'OK' }]
      )
      return
    }

    try {
      setError(null)
      setTranscript('')
      setIsListening(true)
      await Voice.start('en-IN') // Indian English
    } catch (e) {
      setIsListening(false)
      setError('Could not start. Try keyboard mic instead.')
    }
  }

  const stopListening = async () => {
    try {
      await Voice.stop()
      setIsListening(false)
    } catch {}
  }

  // If package not installed at all — show keyboard hint only
  if (!Voice) {
    return (
      <View style={[s.hintOnly, style]}>
        <Ionicons name="mic-outline" size={14} color="#9CA3AF" />
        <Text style={s.hintText}>Use 🎤 mic on your keyboard for voice input</Text>
      </View>
    )
  }

  return (
    <View style={[s.container, style]}>
      <TouchableOpacity
        onPress={isListening ? stopListening : startListening}
        style={[s.btn, isListening && s.btnActive]}
        activeOpacity={0.7}>
        {isListening
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="mic" size={18} color={isListening ? '#fff' : '#4F46E5'} />
        }
        <Text style={[s.btnText, isListening && s.btnTextActive]}>
          {isListening ? 'Listening… tap to stop' : '🎤 Voice Input'}
        </Text>
      </TouchableOpacity>

      {/* Live transcript preview */}
      {transcript ? (
        <View style={s.transcriptBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={12} color="#4F46E5" />
          <Text style={s.transcriptText} numberOfLines={2}>{transcript}</Text>
        </View>
      ) : null}

      {/* Error message */}
      {error ? (
        <Text style={s.errorText}>{error}</Text>
      ) : null}

      {/* Fallback hint */}
      {!isListening && !transcript && (
        <Text style={s.hintText}>Or use 🎤 mic on your keyboard</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container:      { gap: 6 },
  btn:            { flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                    borderWidth: 1.5, borderColor: '#4F46E5', alignSelf: 'flex-start',
                    backgroundColor: '#EEF2FF' },
  btnActive:      { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  btnText:        { fontSize: 13, fontWeight: '600', color: '#4F46E5' },
  btnTextActive:  { color: '#fff' },
  transcriptBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6,
                    backgroundColor: '#EEF2FF', padding: 8, borderRadius: 8,
                    borderLeftWidth: 3, borderLeftColor: '#4F46E5' },
  transcriptText: { flex: 1, fontSize: 13, color: '#4338CA', fontStyle: 'italic' },
  errorText:      { fontSize: 11, color: '#DC2626', marginTop: 2 },
  hintOnly:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText:       { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },
})
