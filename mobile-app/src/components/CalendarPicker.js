// mobile-app/src/components/CalendarPicker.js
import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export default function CalendarPicker({ value, onChange, onClose }) {
  const today = new Date()
  const [viewDate, setViewDate] = useState(value ? new Date(value + 'T00:00:00') : new Date())
  const year  = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']

  const daysInMonth  = new Date(year, month + 1, 0).getDate()
  const firstDaySlot = new Date(year, month, 1).getDay()

  const todayStr = today.toDateString()
  const selStr   = value ? new Date(value + 'T00:00:00').toDateString() : null

  const cells = []
  for (let i = 0; i < firstDaySlot; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))

  const selectDay = (day) => {
    const d = new Date(year, month, day)
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (d < todayMidnight) return // no past dates
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(iso)
    onClose()
  }

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <TouchableOpacity onPress={prevMonth} style={s.navBtn}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={s.navBtn}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      <View style={s.dayNames}>
        {DAYS.map(d => <Text key={d} style={s.dayName}>{d}</Text>)}
      </View>

      <View style={s.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={s.cell} />
          const thisStr  = new Date(year, month, day).toDateString()
          const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          const isPast   = new Date(year, month, day) < todayMid
          const isSel    = thisStr === selStr
          const isToday  = thisStr === todayStr
          return (
            <TouchableOpacity key={day} onPress={() => selectDay(day)}
              disabled={isPast}
              style={[s.cell, isSel && s.cellSel, isToday && !isSel && s.cellToday]}>
              <Text style={[s.cellText, isSel && s.selText, isPast && s.pastText, isToday && !isSel && s.todayText]}>
                {day}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={s.footer}>
        <TouchableOpacity style={s.todayBtn} onPress={() => {
          const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
          onChange(iso); onClose()
        }}>
          <Text style={s.todayBtnText}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
          <Text style={s.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  wrap:       { backgroundColor: '#fff', borderRadius: 20, padding: 16, margin: 20,
                shadowColor: '#000', shadowOffset: {width:0,height:4}, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn:     { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 10 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dayNames:   { flexDirection: 'row', marginBottom: 6 },
  dayName:    { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  grid:       { flexDirection: 'row', flexWrap: 'wrap' },
  cell:       { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSel:    { backgroundColor: '#4F46E5', borderRadius: 100 },
  cellToday:  { borderWidth: 1.5, borderColor: '#4F46E5', borderRadius: 100 },
  cellText:   { fontSize: 14, color: '#111827' },
  selText:    { color: '#fff', fontWeight: '700' },
  pastText:   { color: '#D1D5DB' },
  todayText:  { color: '#4F46E5', fontWeight: '700' },
  footer:     { flexDirection: 'row', gap: 10, marginTop: 12 },
  todayBtn:   { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#4F46E5', alignItems: 'center' },
  todayBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cancelBtn:  { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
})
