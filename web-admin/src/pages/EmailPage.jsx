// web-admin/src/pages/EmailPage.jsx
// FIX: axios interceptor returns res.data directly
// All r.data?.data changed to r?.data, r.data?.data?.id to r?.data?.id etc.
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'

function StatusBadge({ status }) {
  const map = { sent:'bg-green-100 text-green-700', failed:'bg-red-100 text-red-700', bounced:'bg-orange-100 text-orange-700' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status]||'bg-gray-100 text-gray-600'}`}>{status}</span>
}

const CAT_COLORS = {
  introduction: 'bg-blue-50 text-blue-700 border-blue-200',
  followup:     'bg-purple-50 text-purple-700 border-purple-200',
  proposal:     'bg-amber-50 text-amber-700 border-amber-200',
  thankyou:     'bg-green-50 text-green-700 border-green-200',
  general:      'bg-gray-50 text-gray-700 border-gray-200',
}

export default function EmailPage() {
  const { user } = useAuth()
  const isAdmin = user?.role_name === 'admin'

  const [tab, setTab] = useState('compose')
  const [templates, setTemplates]   = useState([])
  const [history, setHistory]       = useState([])
  const [loading, setLoading]       = useState(false)

  // compose
  const [selectedLead, setSelectedLead]     = useState(null)
  const [leadSearch, setLeadSearch]         = useState('')
  const [leadResults, setLeadResults]       = useState([])
  const [showLeadDrop, setShowLeadDrop]     = useState(false)
  const [subject, setSubject]               = useState('')
  const [body, setBody]                     = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [sending, setSending]               = useState(false)

  // bulk
  const [bulkLeads, setBulkLeads]       = useState([])
  const [bulkSearch, setBulkSearch]     = useState('')
  const [bulkResults, setBulkResults]   = useState([])
  const [bulkSubject, setBulkSubject]   = useState('')
  const [bulkBody, setBulkBody]         = useState('')
  const [bulkTemplate, setBulkTemplate] = useState(null)
  const [sendingBulk, setSendingBulk]   = useState(false)
  const [bulkResult, setBulkResult]     = useState(null)

  // template modal
  const [showTplModal, setShowTplModal] = useState(false)
  const [editTpl, setEditTpl]           = useState(null)
  const [tplForm, setTplForm]           = useState({ name:'', subject:'', body:'', category:'general' })
  const [savingTpl, setSavingTpl]       = useState(false)

  const [viewEmail, setViewEmail] = useState(null)

  const fetchTemplates = useCallback(async () => {
    try {
      const r = await api.get('/emails/templates')
      // interceptor: r = {success, data:[...]}
      setTemplates(r?.data || [])
    } catch {}
  }, [])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/emails/history')
      setHistory(r?.data || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])
  useEffect(() => { if (tab === 'history') fetchHistory() }, [tab, fetchHistory])

  const searchLeads = async (q, isBulk = false) => {
    if (!q || q.length < 2) { isBulk ? setBulkResults([]) : setLeadResults([]); return }
    try {
      const r = await api.get(`/leads?search=${q}&per_page=10`)
      // interceptor: r = {success, data:[...], total:N}
      const rows = Array.isArray(r) ? r : (r?.data || [])
      isBulk ? setBulkResults(rows) : setLeadResults(rows)
    } catch {}
  }

  const applyTemplate = (tpl, leadName = '', isBulk = false) => {
    const agentName  = user?.name || 'Team ThynkFlow'
    const agentPhone = user?.phone || ''
    const fill = (text) => text
      .replace(/{{lead_name}}/g,   leadName || (isBulk ? '{{lead_name}}' : 'there'))
      .replace(/{{agent_name}}/g,  agentName)
      .replace(/{{agent_phone}}/g, agentPhone)
    if (isBulk) {
      setBulkTemplate(tpl); setBulkSubject(fill(tpl.subject)); setBulkBody(fill(tpl.body))
    } else {
      setSelectedTemplate(tpl); setSubject(fill(tpl.subject)); setBody(fill(tpl.body))
    }
  }

  const sendEmail = async () => {
    if (!selectedLead)          return toast.error('Please select a lead')
    if (!selectedLead.email)    return toast.error('This lead has no email address')
    if (!subject.trim())        return toast.error('Subject is required')
    if (!body.trim())           return toast.error('Body is required')
    setSending(true)
    try {
      await api.post('/emails/send', {
        lead_id: selectedLead.id, to_email: selectedLead.email,
        to_name: selectedLead.contact_name || selectedLead.name || '',
        subject, body, template_id: selectedTemplate?.id || null,
      })
      toast.success('Email sent ✅')
      setSelectedLead(null); setLeadSearch(''); setSubject(''); setBody(''); setSelectedTemplate(null)
    } catch (err) { toast.error(err.message || 'Failed to send') }
    finally { setSending(false) }
  }

  const sendBulk = async () => {
    if (!bulkLeads.length)   return toast.error('Add at least one lead')
    if (!bulkSubject.trim()) return toast.error('Subject is required')
    if (!bulkBody.trim())    return toast.error('Body is required')
    setSendingBulk(true); setBulkResult(null)
    try {
      const r = await api.post('/emails/bulk', {
        lead_ids: bulkLeads.map(l => l.id), subject: bulkSubject,
        body: bulkBody, template_id: bulkTemplate?.id || null,
      })
      // interceptor: r = {success, data:{sent,failed,total}}
      setBulkResult(r?.data)
      toast.success(`Sent ${r?.data?.sent} emails`)
    } catch (err) { toast.error(err.message || 'Bulk send failed') }
    finally { setSendingBulk(false) }
  }

  const openNewTpl  = () => { setEditTpl(null); setTplForm({ name:'', subject:'', body:'', category:'general' }); setShowTplModal(true) }
  const openEditTpl = (t) => { setEditTpl(t); setTplForm({ name:t.name, subject:t.subject, body:t.body, category:t.category }); setShowTplModal(true) }

  const saveTpl = async () => {
    if (!tplForm.name || !tplForm.subject || !tplForm.body) return toast.error('All fields required')
    setSavingTpl(true)
    try {
      if (editTpl) await api.put(`/emails/templates/${editTpl.id}`, { ...tplForm, is_active: true })
      else         await api.post('/emails/templates', tplForm)
      toast.success(editTpl ? 'Template updated' : 'Template created')
      setShowTplModal(false); fetchTemplates()
    } catch (err) { toast.error(err.message) }
    finally { setSavingTpl(false) }
  }

  const deleteTpl = async (id) => {
    if (!window.confirm('Delete this template?')) return
    try { await api.delete(`/emails/templates/${id}`); fetchTemplates(); toast.success('Deleted') }
    catch (err) { toast.error(err.message) }
  }

  const testSMTP = async () => {
    try {
      const r = await api.get('/emails/test')
      toast.success(r?.message || 'SMTP OK ✅')
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">📧 Internal Email</h1>
        {isAdmin && (
          <button onClick={testSMTP} className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50">🔧 Test SMTP</button>
        )}
      </div>

      <div className="flex border-b mb-6 gap-1">
        {[['compose','✉️ Compose'],['bulk','📨 Bulk Email'],['history','🕐 History'],['templates','📋 Templates']].map(([key,label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab===key?'border-indigo-600 text-indigo-600':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* COMPOSE */}
      {tab === 'compose' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Choose Template</h3>
            {templates.length === 0 && <p className="text-sm text-gray-400">No templates yet</p>}
            {templates.map(t => (
              <button key={t.id} onClick={() => applyTemplate(t, selectedLead?.contact_name || selectedLead?.name || '')}
                className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${selectedTemplate?.id===t.id?'border-indigo-400 bg-indigo-50':'border-gray-200 hover:border-indigo-200 hover:bg-gray-50'} ${CAT_COLORS[t.category]||''}`}>
                <p className="font-semibold">{t.name}</p>
                <p className="text-xs opacity-70 mt-0.5 truncate">{t.subject}</p>
              </button>
            ))}
            <button onClick={() => setTab('templates')} className="w-full text-xs text-indigo-600 py-2 border border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50">
              + Manage Templates
            </button>
          </div>

          <div className="col-span-2 space-y-4">
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">To (Lead) *</label>
              {selectedLead ? (
                <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-indigo-900">{selectedLead.contact_name||selectedLead.name}</p>
                    <p className="text-xs text-indigo-600">{selectedLead.email||'⚠️ No email address'}</p>
                  </div>
                  <button onClick={() => { setSelectedLead(null); setLeadSearch('') }} className="text-indigo-400 hover:text-indigo-700 text-lg">×</button>
                </div>
              ) : (
                <>
                  <input value={leadSearch}
                    onChange={e => { setLeadSearch(e.target.value); searchLeads(e.target.value); setShowLeadDrop(true) }}
                    onFocus={() => setShowLeadDrop(true)}
                    placeholder="Search lead by name or phone…"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  {showLeadDrop && leadResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {leadResults.map(l => (
                        <button key={l.id} onClick={() => {
                          setSelectedLead(l); setLeadSearch(''); setShowLeadDrop(false)
                          if (selectedTemplate) applyTemplate(selectedTemplate, l.contact_name||l.name)
                        }} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b last:border-0">
                          <p className="font-medium">{l.contact_name||l.school_name||l.name}</p>
                          <p className="text-xs text-gray-400">{l.email||'⚠️ No email'} · {l.phone}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Message *</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} placeholder="Write your email here…"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none font-mono" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setSubject(''); setBody(''); setSelectedTemplate(null) }}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50">Clear</button>
              <button onClick={sendEmail} disabled={sending||!selectedLead}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-50">
                {sending ? '⏳ Sending…' : '📤 Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK */}
      {tab === 'bulk' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Choose Template</h3>
              {templates.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t,'',true)}
                  className={`w-full text-left p-3 rounded-xl border text-sm mb-2 transition-all ${bulkTemplate?.id===t.id?'border-indigo-400 bg-indigo-50':'border-gray-200 hover:border-indigo-200'}`}>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-gray-400 truncate">{t.subject}</p>
                </button>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Recipients ({bulkLeads.length})</h3>
              <input value={bulkSearch} onChange={e => { setBulkSearch(e.target.value); searchLeads(e.target.value, true) }}
                placeholder="Search & add leads…"
                className="w-full border rounded-xl px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              {bulkResults.length > 0 && (
                <div className="border rounded-xl max-h-40 overflow-y-auto mb-2">
                  {bulkResults.map(l => (
                    <button key={l.id} onClick={() => {
                      if (!bulkLeads.find(x => x.id===l.id)) setBulkLeads(prev => [...prev, l])
                      setBulkSearch(''); setBulkResults([])
                    }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs border-b last:border-0">
                      <p className="font-medium">{l.contact_name||l.school_name}</p>
                      <p className="text-gray-400">{l.email||'⚠️ No email'}</p>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {bulkLeads.map(l => (
                  <div key={l.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5">
                    <div>
                      <p className="text-xs font-medium">{l.contact_name||l.school_name}</p>
                      <p className="text-xs text-gray-400">{l.email||'⚠️ No email'}</p>
                    </div>
                    <button onClick={() => setBulkLeads(prev => prev.filter(x => x.id!==l.id))} className="text-gray-400 hover:text-red-500 text-lg">×</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-2 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              <strong>Variables:</strong> <code className="bg-amber-100 px-1 rounded">{'{{lead_name}}'}</code>
              <code className="bg-amber-100 px-1 rounded ml-1">{'{{agent_name}}'}</code> — auto-filled per lead.
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
              <input value={bulkSubject} onChange={e => setBulkSubject(e.target.value)}
                placeholder="Subject (use {{lead_name}} for personalisation)…"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Message *</label>
              <textarea value={bulkBody} onChange={e => setBulkBody(e.target.value)} rows={12}
                placeholder="Dear {{lead_name}},&#10;&#10;Write your message here…"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none font-mono" />
            </div>
            {bulkResult && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="font-semibold text-green-800">Bulk Email Complete</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-green-600">✅ Sent: {bulkResult.sent}</span>
                  <span className="text-red-600">❌ Failed: {bulkResult.failed}</span>
                  <span className="text-gray-600">Total: {bulkResult.total}</span>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={sendBulk} disabled={sendingBulk||!bulkLeads.length}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-50">
                {sendingBulk?`⏳ Sending to ${bulkLeads.length} leads…`:`📨 Send to ${bulkLeads.length} Leads`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {tab === 'history' && (
        <div>
          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading history…</div>
          ) : !history.length ? (
            <div className="text-center py-16 text-gray-400">No emails sent yet</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['To','Subject','Agent','Status','Sent At','Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map(email => (
                    <tr key={email.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{email.to_name||'—'}</p>
                        <p className="text-xs text-gray-400">{email.to_email}</p>
                      </td>
                      <td className="px-4 py-3 max-w-xs"><p className="truncate text-gray-800">{email.subject}</p></td>
                      <td className="px-4 py-3 text-gray-600">{email.agent_name||'—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={email.status} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {email.sent_at?format(parseISO(email.sent_at),'dd MMM yy HH:mm'):'—'}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setViewEmail(email)} className="text-xs text-indigo-600 hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TEMPLATES */}
      {tab === 'templates' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">{templates.length} templates</p>
            {isAdmin && (
              <button onClick={openNewTpl} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700">
                + New Template
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {templates.map(t => (
              <div key={t.id} className={`border rounded-xl p-4 ${CAT_COLORS[t.category]||'bg-white border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs opacity-70 mt-0.5">{t.subject}</p>
                    <p className="text-xs mt-2 opacity-60 line-clamp-2">{t.body.slice(0,120)}…</p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => openEditTpl(t)} className="p-1.5 rounded hover:bg-white/50 text-xs">✏️</button>
                      <button onClick={() => deleteTpl(t.id)} className="p-1.5 rounded hover:bg-white/50 text-xs">🗑️</button>
                    </div>
                  )}
                </div>
                <button onClick={() => { setTab('compose'); applyTemplate(t) }}
                  className="mt-3 text-xs font-medium underline opacity-70 hover:opacity-100">
                  Use this template →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW EMAIL MODAL */}
      {viewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 truncate flex-1">{viewEmail.subject}</h2>
              <button onClick={() => setViewEmail(null)} className="p-2 rounded-lg hover:bg-gray-100 ml-2">✕</button>
            </div>
            <div className="px-6 py-4 border-b bg-gray-50">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">To:</span> <strong>{viewEmail.to_name}</strong> ({viewEmail.to_email})</div>
                <div><span className="text-gray-500">From:</span> {viewEmail.agent_name}</div>
                <div><span className="text-gray-500">Sent:</span> {viewEmail.sent_at?format(parseISO(viewEmail.sent_at),'dd MMM yyyy HH:mm'):'—'}</div>
                <div><span className="text-gray-500">Status:</span> <StatusBadge status={viewEmail.status} /></div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">{viewEmail.body}</pre>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE MODAL */}
      {showTplModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="font-bold">{editTpl?'Edit Template':'New Template'}</h2>
              <button onClick={() => setShowTplModal(false)} className="p-2 rounded-lg hover:bg-gray-100">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Template Name *</label>
                  <input value={tplForm.name} onChange={e => setTplForm(f=>({...f,name:e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select value={tplForm.category} onChange={e => setTplForm(f=>({...f,category:e.target.value}))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                    <option value="general">General</option>
                    <option value="introduction">Introduction</option>
                    <option value="followup">Follow-up</option>
                    <option value="proposal">Proposal</option>
                    <option value="thankyou">Thank You</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject *</label>
                <input value={tplForm.subject} onChange={e => setTplForm(f=>({...f,subject:e.target.value}))}
                  placeholder="Use {{lead_name}}, {{agent_name}} as variables"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Body *</label>
                <div className="text-xs text-gray-400 mb-1">Variables: {'{{lead_name}}'} {'{{agent_name}}'} {'{{agent_phone}}'}</div>
                <textarea rows={12} value={tplForm.body} onChange={e => setTplForm(f=>({...f,body:e.target.value}))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none font-mono" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTplModal(false)} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
                <button onClick={saveTpl} disabled={savingTpl}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                  {savingTpl?'Saving…':'Save Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
