import React, { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

// ─── Constants ───────────────────────────────────────────────────────────────
const PLATFORMS = [
  { value: 'facebook',   label: '📘 Facebook Ads' },
  { value: 'instagram',  label: '📸 Instagram Ads' },
  { value: 'google',     label: '🔍 Google Ads' },
  { value: 'linkedin',   label: '💼 LinkedIn Ads' },
  { value: 'youtube',    label: '▶️ YouTube Ads' },
  { value: 'whatsapp',   label: '📱 WhatsApp' },
  { value: 'other',      label: '🌐 Other / Landing Page' },
]

const PLATFORM_COLORS = {
  facebook:  'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  google:    'bg-yellow-100 text-yellow-700',
  linkedin:  'bg-sky-100 text-sky-700',
  youtube:   'bg-red-100 text-red-700',
  whatsapp:  'bg-green-100 text-green-700',
  other:     'bg-slate-100 text-slate-700',
}

const STATUS_COLORS = {
  active:   'bg-green-100 text-green-700',
  paused:   'bg-yellow-100 text-yellow-700',
  ended:    'bg-slate-100 text-slate-500',
  archived: 'bg-red-100 text-red-500',
}

const EMPTY_FORM = {
  name: '', platform: 'facebook', status: 'active',
  budget: '', currency: 'INR', objective: '',
  target_url: '', utm_source: '', utm_medium: '',
  utm_campaign: '', utm_content: '',
  auto_assign_to: '', default_product_id: '',
  notes: '', start_date: '', end_date: '',
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function captureUrl(token) {
  const base = (import.meta.env.VITE_API_URL || window.location.origin + '/api')
    .replace(/\/api$/, '')
  return `${base}/api/campaigns/capture/${token}`
}
function formUrl(token) {
  return captureUrl(token) + '/form'
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copied!'))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBadge({ label, value, color }) {
  return (
    <div className={`rounded-xl px-3 py-2 text-center ${color}`}>
      <div className="text-xl font-bold">{value ?? 0}</div>
      <div className="text-xs font-medium opacity-75">{label}</div>
    </div>
  )
}

function CampaignCard({ camp, onEdit, onDelete, onView }) {
  const [showToken, setShowToken] = useState(false)
  const webhookUrl = captureUrl(camp.capture_token)
  const landingUrl = formUrl(camp.capture_token)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${PLATFORM_COLORS[camp.platform] || 'bg-slate-100 text-slate-600'}`}>
              {PLATFORMS.find(p => p.value === camp.platform)?.label || camp.platform}
            </span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[camp.status] || 'bg-slate-100 text-slate-500'}`}>
              {camp.status}
            </span>
          </div>
          <h3 className="font-bold text-slate-800 text-base mt-1.5 truncate">{camp.name}</h3>
          {camp.objective && <p className="text-xs text-slate-500 mt-0.5 truncate">{camp.objective}</p>}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => onView(camp)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-500" title="View Leads">👁</button>
          <button onClick={() => onEdit(camp)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500" title="Edit">✏️</button>
          <button onClick={() => onDelete(camp)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="Delete">🗑</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatBadge label="Total Leads" value={camp.lead_count} color="bg-indigo-50 text-indigo-700" />
        <StatBadge label="Last 7 Days" value={camp.leads_last_7d} color="bg-blue-50 text-blue-700" />
        <StatBadge label="Last 30 Days" value={camp.leads_last_30d} color="bg-violet-50 text-violet-700" />
      </div>

      {/* Budget / Dates */}
      {(camp.budget || camp.start_date) && (
        <div className="flex gap-4 text-xs text-slate-500">
          {camp.budget && (
            <span>💰 {Number(camp.budget).toLocaleString('en-IN')} {camp.currency}</span>
          )}
          {camp.start_date && (
            <span>📅 {camp.start_date?.slice(0, 10)}{camp.end_date ? ` → ${camp.end_date?.slice(0, 10)}` : ''}</span>
          )}
        </div>
      )}

      {camp.assigned_agent_name && (
        <div className="text-xs text-slate-500">👤 Auto-assign: <span className="font-medium text-slate-700">{camp.assigned_agent_name}</span></div>
      )}

      {/* Webhook / Form URLs */}
      <div className="space-y-2 border-t border-slate-50 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Webhook URL</span>
          <button onClick={() => copyText(webhookUrl)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Copy</button>
        </div>
        <div className="text-xs bg-slate-50 rounded-lg px-3 py-1.5 font-mono text-slate-600 truncate" title={webhookUrl}>
          {showToken ? webhookUrl : webhookUrl.replace(camp.capture_token, '••••••••')}
        </div>

        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Landing Form</span>
          <div className="flex gap-2">
            <a href={landingUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Open</a>
            <button onClick={() => copyText(landingUrl)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Copy</button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => setShowToken(!showToken)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            {showToken ? '🙈 Hide token' : '👁 Show token'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Create / Edit ─────────────────────────────────────────────────────
function CampaignModal({ initial, users, products, onClose, onSave }) {
  const [form, setForm] = useState(initial ? {
    ...EMPTY_FORM,
    ...initial,
    budget: initial.budget ?? '',
    start_date: initial.start_date?.slice(0, 10) || '',
    end_date:   initial.end_date?.slice(0, 10)   || '',
    auto_assign_to:     initial.auto_assign_to     || '',
    default_product_id: initial.default_product_id || '',
  } : { ...EMPTY_FORM })
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('basic')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Campaign name is required')
    setLoading(true)
    try {
      if (initial?.id) {
        await api.put(`/campaigns/${initial.id}`, form)
        toast.success('Campaign updated!')
      } else {
        await api.post('/campaigns', form)
        toast.success('Campaign created!')
      }
      onSave()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const Field = ({ label, children }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )

  const inp = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">
            {initial?.id ? '✏️ Edit Campaign' : '➕ New Campaign'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500 text-sm">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-6">
          {[['basic', '📋 Basic'], ['tracking', '🔗 Tracking & UTM'], ['assignment', '👤 Assignment']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${tab === key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {tab === 'basic' && (
            <>
              <Field label="Campaign Name *">
                <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Summer Admissions 2025" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Platform">
                  <select className={inp} value={form.platform} onChange={e => set('platform', e.target.value)}>
                    {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                    <option value="archived">Archived</option>
                  </select>
                </Field>
              </div>
              <Field label="Objective / Description">
                <input className={inp} value={form.objective} onChange={e => set('objective', e.target.value)} placeholder="e.g. School admissions lead gen via Facebook Ads" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Budget">
                  <input className={inp} type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Currency">
                  <select className={inp} value={form.currency} onChange={e => set('currency', e.target.value)}>
                    <option>INR</option><option>USD</option><option>AED</option><option>GBP</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <input className={inp} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                </Field>
                <Field label="End Date">
                  <input className={inp} type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
                </Field>
              </div>
              <Field label="Notes">
                <textarea className={inp + ' resize-none'} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes…" />
              </Field>
            </>
          )}

          {tab === 'tracking' && (
            <>
              <div className="p-3 bg-indigo-50 rounded-xl text-xs text-indigo-700 leading-relaxed">
                <strong>How it works:</strong> Each campaign gets a unique <strong>capture webhook URL</strong>. POST lead data to it from Facebook Lead Ads via Zapier/n8n, or use the hosted <strong>landing form</strong> for direct submissions. UTM parameters help you track attribution in analytics.
              </div>
              <Field label="Target / Landing Page URL">
                <input className={inp} value={form.target_url} onChange={e => set('target_url', e.target.value)} placeholder="https://yoursite.com/admissions" />
              </Field>
              <Field label="UTM Source">
                <input className={inp} value={form.utm_source} onChange={e => set('utm_source', e.target.value)} placeholder="facebook" />
              </Field>
              <Field label="UTM Medium">
                <input className={inp} value={form.utm_medium} onChange={e => set('utm_medium', e.target.value)} placeholder="paid_social" />
              </Field>
              <Field label="UTM Campaign">
                <input className={inp} value={form.utm_campaign} onChange={e => set('utm_campaign', e.target.value)} placeholder="summer_admissions_2025" />
              </Field>
              <Field label="UTM Content">
                <input className={inp} value={form.utm_content} onChange={e => set('utm_content', e.target.value)} placeholder="carousel_ad_v1" />
              </Field>
            </>
          )}

          {tab === 'assignment' && (
            <>
              <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
                Leads captured via this campaign will <strong>automatically be assigned</strong> to the agent selected below and tagged to the product.
              </div>
              <Field label="Auto-Assign To Agent">
                <select className={inp} value={form.auto_assign_to} onChange={e => set('auto_assign_to', e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                </select>
              </Field>
              <Field label="Default Product / Program">
                <select className={inp} value={form.default_product_id} onChange={e => set('default_product_id', e.target.value)}>
                  <option value="">— None —</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60">
            {loading ? 'Saving…' : (initial?.id ? 'Update Campaign' : 'Create Campaign')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: View Leads ────────────────────────────────────────────────────────
function CampaignLeadsModal({ campaign, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/campaigns/${campaign.id}`)
      .then(r => setDetail(r.data))
      .catch(() => toast.error('Failed to load leads'))
      .finally(() => setLoading(false))
  }, [campaign.id])

  const leads = detail?.leads || []

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800">📋 {campaign.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{leads.length} leads captured</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500 text-sm">✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">Loading…</div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm">No leads captured yet for this campaign</p>
              <p className="text-xs mt-1">Share the webhook or landing form URL to start capturing</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {['Name', 'Phone', 'Email', 'City', 'School', 'Captured'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {leads.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{l.contact_name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.phone}</td>
                    <td className="px-4 py-2.5 text-slate-500">{l.email || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{l.city || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{l.school_name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">
                      {new Date(l.captured_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={() => copyText(captureUrl(campaign.capture_token))}
            className="flex-1 py-2.5 rounded-xl border border-indigo-200 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
            📋 Copy Webhook URL
          </button>
          <a
            href={formUrl(campaign.capture_token)} target="_blank" rel="noreferrer"
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 text-center">
            🔗 Open Landing Form
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Integration Guide ────────────────────────────────────────────────────────
function IntegrationGuide({ token, onClose }) {
  const [platform, setPlatform] = useState('facebook')
  const url = captureUrl(token)
  const payload = `{
  "name": "{{lead.full_name}}",
  "phone": "{{lead.phone_number}}",
  "email": "{{lead.email}}",
  "city": "{{lead.city}}",
  "school_name": "{{lead.school_name}}"
}`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">🔗 Integration Guide</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500 text-sm">✕</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5 text-sm">
          <div className="flex gap-2 flex-wrap">
            {['facebook', 'google', 'zapier', 'n8n', 'manual'].map(p => (
              <button key={p} onClick={() => setPlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${platform === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {platform === 'facebook' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-700">Facebook / Instagram Lead Ads → Zapier</h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-600 text-xs leading-relaxed">
                <li>Go to <strong>Zapier → New Zap</strong> → Trigger: <strong>Facebook Lead Ads → New Lead</strong></li>
                <li>Action: <strong>Webhooks by Zapier → POST</strong></li>
                <li>Set URL to your campaign webhook URL (below)</li>
                <li>Set Payload Type to <strong>JSON</strong></li>
                <li>Map fields: <code className="bg-slate-100 px-1 rounded">full_name</code>, <code className="bg-slate-100 px-1 rounded">phone_number</code>, <code className="bg-slate-100 px-1 rounded">email</code></li>
              </ol>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Webhook URL</span>
                  <button onClick={() => copyText(url)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Copy</button>
                </div>
                <code className="text-xs text-slate-700 break-all">{url}</code>
              </div>
            </div>
          )}

          {platform === 'google' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-700">Google Ads Lead Form → n8n / Zapier</h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-600 text-xs leading-relaxed">
                <li>In Google Ads → <strong>Lead Form Assets</strong>, enable webhook delivery</li>
                <li>Or: use <strong>Zapier → Google Ads Lead Form → Webhook POST</strong></li>
                <li>POST to the URL below with fields: <code className="bg-slate-100 px-1 rounded">name</code>, <code className="bg-slate-100 px-1 rounded">phone</code>, <code className="bg-slate-100 px-1 rounded">email</code></li>
              </ol>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Webhook URL</span>
                  <button onClick={() => copyText(url)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">Copy</button>
                </div>
                <code className="text-xs text-slate-700 break-all">{url}</code>
              </div>
            </div>
          )}

          {platform === 'zapier' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-700">Generic Zapier Setup</h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-600 text-xs leading-relaxed">
                <li>Choose your trigger app (Facebook, Google, Typeform, etc.)</li>
                <li>Action: <strong>Webhooks by Zapier → POST</strong></li>
                <li>URL: paste webhook URL below</li>
                <li>Data: map <code className="bg-slate-100 px-1 rounded">phone</code> (required) + optional fields</li>
              </ol>
              <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                <div>
                  <div className="flex justify-between mb-1"><span className="text-xs font-semibold text-slate-500">POST URL</span><button onClick={() => copyText(url)} className="text-xs text-indigo-500 font-medium">Copy</button></div>
                  <code className="text-xs text-slate-700 break-all">{url}</code>
                </div>
                <div>
                  <div className="flex justify-between mb-1"><span className="text-xs font-semibold text-slate-500">Example JSON Payload</span><button onClick={() => copyText(payload)} className="text-xs text-indigo-500 font-medium">Copy</button></div>
                  <pre className="text-xs text-slate-600 bg-slate-100 rounded-lg p-2 overflow-x-auto">{payload}</pre>
                </div>
              </div>
            </div>
          )}

          {platform === 'n8n' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-700">n8n Workflow</h4>
              <ol className="list-decimal list-inside space-y-2 text-slate-600 text-xs leading-relaxed">
                <li>Add trigger node (Facebook Lead Ads, Typeform, Google Sheets, etc.)</li>
                <li>Add <strong>HTTP Request</strong> node → Method: POST</li>
                <li>URL: paste your webhook URL</li>
                <li>Body: JSON with <code className="bg-slate-100 px-1 rounded">phone</code>, <code className="bg-slate-100 px-1 rounded">name</code>, <code className="bg-slate-100 px-1 rounded">email</code></li>
              </ol>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex justify-between mb-1"><span className="text-xs font-semibold text-slate-500">Webhook URL</span><button onClick={() => copyText(url)} className="text-xs text-indigo-500 font-medium">Copy</button></div>
                <code className="text-xs text-slate-700 break-all">{url}</code>
              </div>
            </div>
          )}

          {platform === 'manual' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-700">Manual / cURL Test</h4>
              <p className="text-xs text-slate-600">Test your integration with a cURL command:</p>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">cURL Command</span>
                  <button onClick={() => copyText(`curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Test Lead","phone":"9999999999","email":"test@example.com","city":"Delhi"}'`)} className="text-xs text-indigo-500 font-medium">Copy</button>
                </div>
                <pre className="text-xs text-slate-600 overflow-x-auto whitespace-pre-wrap">{`curl -X POST "${url}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Test Lead","phone":"9999999999","email":"test@example.com","city":"Delhi"}'`}</pre>
              </div>
              <p className="text-xs text-slate-500">You can also use the hosted form to let users submit directly:</p>
              <a href={url.replace('/capture/', '/capture/') + '/form'.replace(token, token)} target="_blank" rel="noreferrer"
                className="block text-center py-2 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">
                🔗 Open Landing Form
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns, setCampaigns]   = useState([])
  const [users, setUsers]           = useState([])
  const [products, setProducts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterStatus, setFilterStatus]     = useState('active')
  const [editTarget, setEditTarget] = useState(null)   // null = closed, {} = new, {...} = edit
  const [viewTarget, setViewTarget] = useState(null)
  const [guideToken, setGuideToken] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, uRes, pRes] = await Promise.all([
        api.get('/campaigns'),
        api.get('/users'),
        api.get('/products'),
      ])
      setCampaigns(cRes.data || [])
      setUsers(uRes.data || [])
      setProducts(pRes.data || [])
    } catch (err) {
      toast.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (camp) => {
    if (!window.confirm(`Delete campaign "${camp.name}"? This will NOT delete the leads, only the campaign record.`)) return
    try {
      await api.delete(`/campaigns/${camp.id}`)
      toast.success('Campaign deleted')
      load()
    } catch {
      toast.error('Failed to delete')
    }
  }

  const filtered = campaigns.filter(c => {
    if (filterPlatform && c.platform !== filterPlatform) return false
    if (filterStatus  && c.status   !== filterStatus)   return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const totalLeads = filtered.reduce((a, c) => a + (c.lead_count || 0), 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📣 Campaigns</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track leads from Instagram, Facebook, Google Ads & more</p>
        </div>
        <button
          onClick={() => setEditTarget({})}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          ➕ New Campaign
        </button>
      </div>

      {/* Summary Bar */}
      {!loading && campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Campaigns', value: campaigns.length, icon: '📣' },
            { label: 'Active', value: campaigns.filter(c => c.status === 'active').length, icon: '🟢' },
            { label: 'Total Leads', value: campaigns.reduce((a,c) => a + (c.lead_count||0), 0), icon: '👥' },
            { label: 'Leads (30d)', value: campaigns.reduce((a,c) => a + (c.leads_last_30d||0), 0), icon: '📈' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <div className="text-xl font-bold text-slate-800">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 w-52"
          placeholder="🔍 Search campaigns…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
          value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
          <option value="">All Platforms</option>
          {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="ended">Ended</option>
          <option value="archived">Archived</option>
        </select>
        <button
          onClick={() => setGuideToken(campaigns[0]?.capture_token)}
          className="ml-auto border border-indigo-200 text-indigo-600 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-indigo-50">
          📖 Integration Guide
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="h-56 bg-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100">
          <div className="text-5xl mb-4">📣</div>
          <h3 className="text-lg font-bold text-slate-700">No campaigns yet</h3>
          <p className="text-slate-500 text-sm mt-1 mb-5">Create your first campaign to start capturing leads from social media ads</p>
          <button onClick={() => setEditTarget({})}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700">
            ➕ Create First Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(camp => (
            <CampaignCard
              key={camp.id}
              camp={camp}
              onEdit={c => setEditTarget(c)}
              onDelete={handleDelete}
              onView={c => setViewTarget(c)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {editTarget !== null && (
        <CampaignModal
          initial={editTarget.id ? editTarget : null}
          users={users}
          products={products}
          onClose={() => setEditTarget(null)}
          onSave={load}
        />
      )}
      {viewTarget && (
        <CampaignLeadsModal campaign={viewTarget} onClose={() => setViewTarget(null)} />
      )}
      {guideToken && (
        <IntegrationGuide token={guideToken} onClose={() => setGuideToken(null)} />
      )}
    </div>
  )
}
