// web-admin/src/components/common/MultiSelect.jsx
// Reusable multi-select dropdown that looks/behaves like the existing
// single <select> filters, but lets the user pick several values.
// Value is always an array of strings; onChange receives the new array.
import React, { useEffect, useRef, useState } from 'react'

export default function MultiSelect({
  options,           // [{ value, label }]
  value = [],         // array of selected values (strings)
  onChange,           // (newArray) => void
  placeholder = 'All',
  className = '',
  widthClass = 'min-w-[10rem]',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const toggle = (val) => {
    if (value.includes(val)) onChange(value.filter(v => v !== val))
    else onChange([...value, val])
  }

  const selectAll = () => onChange(options.map(o => String(o.value)))
  const clearAll = () => onChange([])

  const label = value.length === 0
    ? placeholder
    : value.length === 1
      ? (options.find(o => String(o.value) === String(value[0]))?.label || value[0])
      : `${value.length} selected`

  return (
    <div ref={ref} className={`relative ${widthClass} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full border-2 rounded-xl px-3 py-2 text-sm text-left flex items-center justify-between gap-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 ${value.length ? 'border-indigo-300 text-indigo-700 font-semibold' : 'border-slate-200 text-slate-600'}`}
      >
        <span className="truncate">{label}</span>
        <span className="text-[10px] text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[14rem] bg-white border-2 border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-slate-50 sticky top-0">
            <button type="button" onClick={selectAll} className="text-xs font-bold text-indigo-600 hover:underline">Select all</button>
            <button type="button" onClick={clearAll} className="text-xs font-bold text-red-500 hover:underline">Clear</button>
          </div>
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-400">No options</div>
          )}
          {options.map(opt => {
            const val = String(opt.value)
            const checked = value.includes(val)
            return (
              <label key={val} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(val)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                />
                <span className="capitalize truncate">{opt.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
