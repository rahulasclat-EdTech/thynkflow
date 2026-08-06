// web-admin/src/utils/useTableControls.js
// Shared client-side sorting + free-text search for the report/list tables.
// Usage:
//   const { search, setSearch, sortKey, sortDir, toggleSort, rows } =
//     useTableControls(rawRows, { searchKeys: ['name','email'], defaultSortKey: 'created_at', defaultSortDir: 'desc' })
//   <SortableTh label="Name" sortKey="name" {...{sortKey_,sortDir,toggleSort}} />
//   rows.map(...)
import { useMemo, useState } from 'react'

function getValue(row, key) {
  if (!key) return undefined
  // supports dotted accessor paths, e.g. 'agent.name'
  return key.split('.').reduce((o, k) => (o == null ? o : o[k]), row)
}

export default function useTableControls(data, {
  searchKeys = [],
  defaultSortKey = null,
  defaultSortDir = 'asc',
} = {}) {
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState(defaultSortKey)
  const [sortDir, setSortDir] = useState(defaultSortDir) // 'asc' | 'desc'

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const rows = useMemo(() => {
    let out = Array.isArray(data) ? data : []

    if (search.trim() && searchKeys.length) {
      const q = search.trim().toLowerCase()
      out = out.filter(row =>
        searchKeys.some(key => String(getValue(row, key) ?? '').toLowerCase().includes(q))
      )
    }

    if (sortKey) {
      out = [...out].sort((a, b) => {
        let av = getValue(a, sortKey)
        let bv = getValue(b, sortKey)
        if (av == null && bv == null) return 0
        if (av == null) return sortDir === 'asc' ? -1 : 1
        if (bv == null) return sortDir === 'asc' ? 1 : -1
        // numeric compare when both look numeric, else locale string compare
        const an = Number(av), bn = Number(bv)
        let cmp
        if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== '' && bv !== '') {
          cmp = an - bn
        } else {
          cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return out
  }, [data, search, searchKeys, sortKey, sortDir])

  return { search, setSearch, sortKey, sortDir, toggleSort, rows }
}
