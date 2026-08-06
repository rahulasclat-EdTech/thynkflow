// web-admin/src/pages/InboundEmailPage.jsx
// Add to App.jsx routes: <Route path="inbound-email" element={<AdminRoute><InboundEmailPage /></AdminRoute>} />
// Add to sidebar nav: { to: '/inbound-email', label: 'Inbound Email', icon: '📥', adminOnly: true }

import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import SortableTh from '../components/common/SortableTh'
import useTableControls from '../utils/useTableControls'

const emptyForm = {
  enabled: false, host: '', port: 993, secure: true,
  user: '', pass: '', folder: 'INBOX', pollIntervalMinutes: 5, defaultLeadType: 'B2C',
}

export default function InboundEmailPage() {
  const [form, setForm]         = useState(emptyForm)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [testing, setTesting]   = useState(false)
  const [polling, setPolling]   = useState(false)
  const [logs, setLogs]         = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cfgRes, logRes] = await Promise.all([
        api.get('/inbound-email/config'),
        api.get('/inbound-email/logs'),
      ])
      setForm(f => ({ ...f, ...(cfgRes.data || {}) }))
      setLogs(logRes.data || [])
    } catch {
      toast.error('Failed to load inbound email settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const { search, setSearch, sortKey, sortDir, toggleSort, rows: sortedLogs } = useTableControls(logs, {
    searchKeys: ['from_name', 'from_email', 'subject', 'action', 'lead_status'],
    defaultSortKey: 'processed_at',
    defaultSortDir: 'desc',
  })

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/inbound-email/config', form)
      toast.success('Inbound email settings saved')
      fetchAll()
    } catch (err) {
      toast.error(err?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      await api.post('/inbound-email/test-connection', {}, { timeout: 45000 }) // IMAP handshake can be slow on first connect — default 15s client timeout was firing before the server-side attempt finished
      toast.success('IMAP connection successful ✅')
    } catch (err) {
      toast.error(err?.message || 'Connection failed')
    } finally {
      setTesting(false)
    }
  }

  const pollNow = async () => {
    setPolling(true)
    try {
      const r = await api.post('/inbound-email/poll-now', {}, { timeout: 60000 }) // fetching + parsing every unseen message can take a while with a full inbox
      if (r.skipped) toast(r.reason || 'Skipped', { icon: 'ℹ️' })
      else toast.success(`Processed ${r.processed || 0} message(s), ${r.errors || 0} error(s)`)
      fetchAll()
    } catch (err) {
      toast.error(err?.message || 'Poll failed')
    } finally {
      setPolling(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-slate-800">📥 Inbound Email → Lead Capture</h1>
        <p className="text-sm text-slate-500 mt-1">
          Point a mailbox (e.g. <code>enquiries@thynksuccess.com</code>) here. Anyone who emails that
          address — or anything forwarded into it — is automatically checked every few minutes:
          new senders become new leads, replies from existing leads are logged against them.
        </p>
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-100 p-5 space-y-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.enabled}
            onChange={e => setForm({ ...form, enabled: e.target.checked })}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400 w-5 h-5" />
          <span className="font-bold text-slate-700">Enabled</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">IMAP Host</label>
            <input value={form.host} onChange={e => setForm({ ...form, host: e.target.value })}
              placeholder="imap.gmail.com"
              className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Port</label>
            <input type="number" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 993 })}
              className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Mailbox / Username</label>
            <input value={form.user} onChange={e => setForm({ ...form, user: e.target.value })}
              placeholder="enquiries@thynksuccess.com"
              className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Password / App Password</label>
            <input type="password" value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })}
              placeholder="•••••••• (leave unchanged to keep current)"
              className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <p className="text-[11px] text-slate-400 mt-1">Gmail/Office365 with 2FA need an app-specific password, not your normal login password.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Folder</label>
            <input value={form.folder} onChange={e => setForm({ ...form, folder: e.target.value })}
              className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">Default Lead Type</label>
            <select value={form.defaultLeadType} onChange={e => setForm({ ...form, defaultLeadType: e.target.value })}
              className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="B2C">B2C</option>
              <option value="B2B">B2B</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={save} disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button onClick={testConnection} disabled={testing}
            className="px-5 py-2 border-2 border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 disabled:opacity-50">
            {testing ? 'Testing…' : 'Test Connection'}
          </button>
          <button onClick={pollNow} disabled={polling}
            className="px-5 py-2 border-2 border-green-200 text-green-700 rounded-xl text-sm font-bold hover:bg-green-50 disabled:opacity-50">
            {polling ? 'Polling…' : '📬 Poll Now'}
          </button>
        </div>
      </div>

      {/* Recent activity log */}
      <div className="bg-white rounded-2xl border-2 border-slate-100 overflow-x-auto">
        <div className="px-5 py-3 border-b font-bold text-sm text-slate-700 flex items-center justify-between gap-3">
          <span>Recent Processed Emails</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search sender, subject, action…"
            className="border-2 rounded-xl px-3 py-1.5 text-xs font-normal focus:outline-none focus:ring-2 focus:ring-indigo-300 w-64" />
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <SortableTh label="From" columnKey="from_name" {...{ sortKey, sortDir, toggleSort }} />
              <SortableTh label="Subject" columnKey="subject" {...{ sortKey, sortDir, toggleSort }} />
              <SortableTh label="Action" columnKey="action" {...{ sortKey, sortDir, toggleSort }} />
              <SortableTh label="Lead Status" columnKey="lead_status" {...{ sortKey, sortDir, toggleSort }} />
              <SortableTh label="When" columnKey="processed_at" {...{ sortKey, sortDir, toggleSort }} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedLogs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No emails processed yet</td></tr>
            )}
            {sortedLogs.map(l => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-slate-700">{l.from_name || '—'}</p>
                  <p className="text-xs text-slate-400">{l.from_email}</p>
                </td>
                <td className="px-4 py-2.5 max-w-[260px] truncate" title={l.subject}>{l.subject}</td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    l.action === 'created' ? 'bg-green-100 text-green-700' :
                    l.action === 'matched_existing' ? 'bg-blue-100 text-blue-700' :
                    l.action === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                  }`}>{l.action?.replace(/_/g,' ')}</span>
                </td>
                <td className="px-4 py-2.5 capitalize text-slate-500">{l.lead_status || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{l.processed_at ? format(parseISO(l.processed_at), 'dd MMM yyyy, h:mm a') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
