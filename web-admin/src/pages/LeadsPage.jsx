import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import LeadDetailModal from '../components/leads/LeadDetailModal'
import * as XLSX from 'xlsx'

const STATUSES = ['new','hot','warm','cold','converted','not_interested','call_back']

export default function LeadsPage() {
  const { isAdmin } = useAuth()
  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', unattended: '', search: '' })
  const [page, setPage] = useState(1)
  const [selectedLead, setSelectedLead] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [uploading, setUploading] = useState(false)

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 50, ...filters }
      Object.keys(params).forEach(k => !params[k] && delete params[k])
      const res = await api.get('/leads', { params })
      setLeads(res.data)
      setTotal(res.total)
    } catch (err) {
      toast.error('Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const res = await api.post('/leads/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success(res.message)
      fetchLeads()
      setShowUpload(false)
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handlePaste = async () => {
    try {
      const lines = pasteText.trim().split('\n').filter(Boolean)
      const leads = lines.map(line => {
        const parts = line.split(/[\t,]/)
        return { school_name: parts[0]?.trim() || '', contact_name: parts[1]?.trim() || '', phone: parts[2]?.trim() || parts[0]?.trim() || '' }
      }).filter(l => l.phone)
      if (!leads.length) return toast.error('No valid leads found. Format: School, Name, Phone')
      const res = await api.post('/leads/paste', { leads })
      toast.success(res.message)
      fetchLeads()
      setShowPaste(false)
      setPasteText('')
    } catch (err) {
      toast.error(err.message || 'Failed to add leads')
    }
  }

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['school_name', 'contact_name', 'phone', 'email', 'city'],
      ['Delhi Public School', 'Ashok Kumar', '9810012345', 'ashok@dps.com', 'Delhi'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Leads')
    XLSX.writeFile(wb, 'thynkflow_leads_template.xlsx')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leads</h1>
          <p className="text-slate-500 text-sm">{total} total leads</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={downloadTemplate} className="btn-secondary">📥 Template</button>
            <button onClick={() => setShowPaste(true)} className="btn-secondary">📋 Paste Leads</button>
            <button onClick={() => setShowUpload(true)} className="btn-primary">📤 Upload Excel</button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <input
          className="input w-48"
          placeholder="Search name, school, phone..."
          value={filters.search}
          onChange={e => setFilters({ ...filters, search: e.target.value })}
        />
        <select className="input w-40" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={filters.unattended === 'true'} onChange={e => setFilters({ ...filters, unattended: e.target.checked ? 'true' : '' })} />
          Unattended only
        </label>
        <button onClick={() => { setFilters({ status: '', unattended: '', search: '' }); setPage(1) }} className="btn-secondary ml-auto">Reset</button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">School / Name</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Agent</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Last Remark</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Next Follow-up</th>
                <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">Loading leads...</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No leads found</td></tr>
              ) : leads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{lead.school_name || lead.contact_name || '—'}</p>
                    {lead.school_name && <p className="text-xs text-slate-400">{lead.contact_name}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-blue-600 font-medium">{lead.phone}</p>
                    {lead.email && <p className="text-xs text-slate-400">{lead.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.agent_name || <span className="text-red-400 text-xs">Unassigned</span>}</td>
                  <td className="px-4 py-3">
                    <span className={`badge-${lead.status}`}>{lead.status?.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-xs text-slate-500 truncate">{lead.last_remark || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {lead.next_followup_date ? format(new Date(lead.next_followup_date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedLead(lead.id)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">View History</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {total > 50 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Page {page} · {total} total</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary py-1 px-3">← Prev</button>
              <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary py-1 px-3">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Upload Leads via Excel</h3>
            <p className="text-sm text-slate-500 mb-4">Expected columns: <code className="bg-slate-100 px-1 rounded">school_name, contact_name, phone, email, city</code></p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100 mb-4" />
            {uploading && <p className="text-sm text-blue-600 mb-3">Uploading...</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowUpload(false)} className="btn-secondary">Cancel</button>
              <button onClick={downloadTemplate} className="btn-primary">Download Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Paste Modal */}
      {showPaste && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Paste Leads</h3>
            <p className="text-sm text-slate-500 mb-3">One lead per line. Format: <code className="bg-slate-100 px-1 rounded">School Name, Contact Name, Phone</code></p>
            <textarea
              className="input h-40 resize-none font-mono text-xs"
              placeholder={"Delhi Public School, Ashok Kumar, 9810012345\nSunrise Academy, Rohit Verma, 9123456789"}
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setShowPaste(false); setPasteText('') }} className="btn-secondary">Cancel</button>
              <button onClick={handlePaste} className="btn-primary">Add Leads</button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Detail */}
      <LeadDetailModal leadId={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  )
}
