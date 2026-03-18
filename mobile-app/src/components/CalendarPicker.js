// mobile-app/src/components/CalendarPicker.js
// Reusable calendar component used across leads, followups, postcall screens
import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export default function CalendarPicker({ value, onChange, onClose }) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(value ? new Date(value) : today)
  const year   = viewDate.getFullYear()
  const month  = viewDate.getMonth()
  const monthNames  = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const dayNames    = ['Su','Mo','Tu','We','Th','Fr','Sa']
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay    = new Date(year, month, 1).getDay()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const selDate = value ? new Date(value) : null
  const todayStr = today.toDateString()

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => setViewDate(new Date(year, month - 1, 1))} style={s.navBtn}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{monthNames[month]} {year}</Text>
        <TouchableOpacity onPress={() => setViewDate(new Date(year, month + 1, 1))} style={s.navBtn}>
          <Ionicons name="chevron-forward" size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Day names */}
      <View style={s.dayRow}>
        {dayNames.map(d => <Text key={d} style={s.dayName}>{d}</Text>)}
      </View>

      {/* Cells */}
      <View style={s.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={s.cell} />
          const thisDate  = new Date(year, month, day)
          const isToday   = thisDate.toDateString() === todayStr
          const isSel     = selDate && thisDate.toDateString() === selDate.toDateString()
          const isPast    = thisDate < new Date(new Date().setHours(0,0,0,0))
          return (
            <TouchableOpacity key={day}
              style={[s.cell, isSel && s.cellSel, isToday && !isSel && s.cellToday]}
              onPress={() => { onChange(thisDate.toISOString().split('T')[0]); onClose() }}
              disabled={isPast}>
              <Text style={[s.cellText, isSel && s.cellTextSel, isPast && s.cellTextPast, isToday && !isSel && s.cellTextToday]}>
                {day}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Today shortcut */}
      <View style={s.footer}>
        <TouchableOpacity onPress={() => { onChange(today.toISOString().split('T')[0]); onClose() }} style={s.todayBtn}>
          <Text style={s.todayBtnText}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container:    { backgroundColor: '#fff', borderRadius: 20, padding: 16, margin: 20,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  navBtn:       { padding: 8, borderRadius: 10, backgroundColor: '#F3F4F6' },
  monthLabel:   { fontSize: 17, fontWeight: '700', color: '#111827' },
  dayRow:       { flexDirection: 'row', marginBottom: 8 },
  dayName:      { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#9CA3AF' },
  grid:         { flexDirection: 'row', flexWrap: 'wrap' },
  cell:         { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellSel:      { backgroundColor: '#4F46E5', borderRadius: 100 },
  cellToday:    { borderWidth: 1.5, borderColor: '#4F46E5', borderRadius: 100 },
  cellText:     { fontSize: 14, color: '#111827', fontWeight: '500' },
  cellTextSel:  { color: '#fff', fontWeight: '700' },
  cellTextPast: { color: '#D1D5DB' },
  cellTextToday:{ color: '#4F46E5', fontWeight: '700' },
  footer:       { flexDirection: 'row', gap: 10, marginTop: 14 },
  todayBtn:     { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#4F46E5', alignItems: 'center' },
  todayBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  closeBtn:     { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
})
