// web-admin/src/components/common/SortableTh.jsx
// Drop-in replacement for a plain <th> that adds click-to-sort behaviour.
// Pass the same sortKey/sortDir/toggleSort you got back from useTableControls.
import React from 'react'

export default function SortableTh({ label, columnKey, sortKey, sortDir, toggleSort, className = '' }) {
  const active = sortKey === columnKey
  return (
    <th
      onClick={() => toggleSort(columnKey)}
      className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-indigo-600 transition-colors ${active ? 'text-indigo-600' : 'text-slate-500'} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-[10px] leading-none">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  )
}
