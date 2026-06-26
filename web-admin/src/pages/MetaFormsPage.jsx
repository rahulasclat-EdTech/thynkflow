// web-admin/src/pages/MetaFormsPage.jsx
// Meta Form → Campaign Mapping Manager
import React, { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const SOURCE_BADGE = {
  meta_lead_ad: { label: '📘 Meta Lead Ad', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  facebook:     { label: '📘 Facebook',     bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  instagram:    { label: '📸 Instagram',    bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8' },
  google:       { label: '🔍 Google',       bg: '#fefce8', color: '#854d0e', border: '#fde68a' },
  manual:       { label: '✋ Manual',       bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  website:      { label: '🌐 Website',      bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  referral:     { label: '🤝 Referral',     bg: '#faf5ff', color: '#6b21a8', border: '#e9d5ff' },
  whatsapp:     { label: '💬 WhatsApp',     bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
}

function SourceBadge({ source }) {
  const s = SOURCE_BADGE[source] || { label: source || '—', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' }
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold border"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}>
      {s.label}
    </span>
  )
}

const EMPTY = {
  meta_form_id: '', meta_form_name: '', meta_page_id: '', meta_page_name: '',
  campaign_id: '', auto_assign_to: '', default_product_id: '', notes: '', is_active: true,
}

export default function MetaFormsPage() {
  const [maps, setMaps]           = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [agents, setAgents]       = useState([])
  const [products, setProducts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [config, setConfig]       = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [mRes, cRes, aRes, pRes, cfgRes] = await Promise.all([
        api.get('/meta/forms'),
        api.get('/campaigns'),
        api.get('/users'),
        api.get('/products/active'),
        api.get('/meta/config'),
      ])
      setMaps(    Array.isArray(mRes)   ? mRes   : (mRes?.data   || []))
      setCampaigns(Array.isArray(cRes)  ? cRes   : (cRes?.data   || []))
      setAgents(  Array.isArray(aRes)   ? aRes   : (aRes?.data   || []))
      setProducts(Array.isArray(pRes)   ? pRes   : (pRes?.data   || []))
      setConfig(cfgRes?.data || cfgRes || null)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit   = (m) => {
    setEditing(m)
    setForm({
      meta_form_id:      m.meta_form_id      || '',
      meta_form_name:    m.meta_form_name    || '',
      meta_page_id:      m.meta_page_id      || '',
      meta_page_name:    m.meta_page_name    || '',
      campaign_id:       m.campaign_id       || '',
      auto_assign_to:    m.auto_assign_to    || '',
      default_product_id: m.default_product_id || '',
      notes:             m.notes             || '',
      is_active:         m.is_active !== false,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.meta_form_id.trim()) return toast.error('Meta Form ID is required')
    if (!form.campaign_id)         return toast.error('Select a ThynkFlow campaign')
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/meta/forms/${editing.id}`, form)
        toast.success('Mapping updated ✓')
      } else {
        await api.post('/meta/forms', form)
        toast.success('Mapping created ✓')
      }
      setShowModal(false)
      fetchAll()
    } catch (err) { toast.error(err.message || 'Failed') }
    finally { setSaving(false) }
  }

  const handleToggle = async (m) => {
    try {
      await api.patch(`/meta/forms/${m.id}/toggle`)
      toast.success(m.is_active ? 'Paused' : 'Resumed')
      fetchAll()
    } catch { toast.error('Failed') }
  }

  const handleDelete = async (m) => {
    if (!confirm(`Delete mapping for "${m.meta_form_name || m.meta_form_id}"?`)) return
    try { await api.delete(`/meta/forms/${m.id}`); toast.success('Deleted'); fetchAll() }
    catch { toast.error('Failed') }
  }

  const F = (label, key, opts = {}) => (
    <div key={key}>
      <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
      {opts.type === 'select' ? (
        <select value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
          <option value="">— {opts.placeholder || 'Select'} —</option>
          {(opts.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : opts.type === 'textarea' ? (
        <textarea rows={2} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={opts.placeholder || ''}
          className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
      ) : (
        <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={opts.placeholder || ''}
          className="w-full border-2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800">📘 Meta Form Mappings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Map each Meta Lead Ad form to a ThynkFlow campaign</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-200 active:scale-95 transition-all">
          + New Mapping
        </button>
      </div>

      {/* Webhook Config Box */}
      {config && (
        <div className="rounded-2xl border-2 border-blue-100 bg-blue-50 p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔗</span>
            <h3 className="font-black text-blue-900">Your Meta Webhook URL</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${config.app_secret_set ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {config.app_secret_set ? '✓ App Secret Set' : '⚠ App Secret Missing'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Callback URL (paste in Meta)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 font-mono text-blue-900 truncate">
                  {config.webhook_url}
                </code>
                <button onClick={() => { navigator.clipboard.writeText(config.webhook_url); toast.success('Copied!') }}
                  className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg font-bold hover:bg-blue-700 flex-shrink-0">
                  Copy
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Verify Token</p>
              <code className="block text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 font-mono text-blue-900">
                {config.verify_token}
              </code>
            </div>
          </div>
          <p className="text-xs text-blue-600">
            Go to <strong>Meta Business Suite → Settings → Integrations → Leads Access → Assign CRM</strong>, 
            then in your Meta App → Webhooks, paste the Callback URL and Verify Token above.
          </p>
        </div>
      )}

      {/* Mappings List */}
      {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400">Loading mappings…</p>
        </div>
      ) : maps.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-bold text-slate-500 text-lg">No form mappings yet</p>
          <p className="text-slate-400 text-sm mt-1 mb-4">Create one to start routing Meta leads to campaigns</p>
          <button onClick={openCreate}
            className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
            + Create First Mapping
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {maps.map(m => (
            <div key={m.id} className={`bg-white rounded-2xl border-2 p-5 flex flex-col gap-3 shadow-sm transition-all ${m.is_active ? 'border-slate-100 hover:shadow-md' : 'border-slate-200 opacity-60'}`}>
              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {m.is_active ? '● Active' : '○ Paused'}
                    </span>
                    {m.total_leads > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                        {m.total_leads} leads
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-slate-800 text-sm truncate">
                    {m.meta_form_name || `Form ${m.meta_form_id}`}
                  </h3>
                  {m.meta_page_name && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">📄 {m.meta_page_name}</p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 text-sm" title="Edit">✏️</button>
                  <button onClick={() => handleToggle(m)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600 text-sm" title={m.is_active ? 'Pause' : 'Resume'}>
                    {m.is_active ? '⏸' : '▶️'}
                  </button>
                  <button onClick={() => handleDelete(m)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 text-sm" title="Delete">🗑</button>
                </div>
              </div>

              {/* Campaign */}
              <div className="bg-indigo-50 rounded-xl px-3 py-2 border border-indigo-100">
                <p className="text-xs text-indigo-500 font-bold uppercase tracking-wide mb-0.5">→ ThynkFlow Campaign</p>
                <p className="text-sm font-black text-indigo-900 truncate">{m.campaign_name}</p>
                {m.campaign_platform && (
                  <p className="text-xs text-indigo-500 capitalize">{m.campaign_platform}</p>
                )}
              </div>

              {/* Details */}
              <div className="space-y-1.5 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-400 w-20 flex-shrink-0">Form ID</span>
                  <code className="bg-slate-50 px-2 py-0.5 rounded font-mono text-slate-600 truncate">{m.meta_form_id}</code>
                </div>
                {m.agent_name && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-400 w-20 flex-shrink-0">Auto-assign</span>
                    <span className="font-medium text-slate-700">👤 {m.agent_name}</span>
                  </div>
                )}
                {m.product_name && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-400 w-20 flex-shrink-0">Product</span>
                    <span className="font-medium text-slate-700">📦 {m.product_name}</span>
                  </div>
                )}
                {m.notes && (
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-slate-400 w-20 flex-shrink-0 mt-0.5">Notes</span>
                    <span className="text-slate-500 italic">{m.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HOW TO FIND FORM ID — Help Box */}
      <div className="rounded-2xl border-2 border-slate-100 bg-slate-50 p-5">
        <h3 className="font-black text-slate-700 mb-3">💡 How to find your Meta Form ID</h3>
        <ol className="space-y-2 text-sm text-slate-600">
          {[
            'Go to Meta Ads Manager → Lead Ads Forms library',
            'Click on the form you want to connect',
            'The URL will contain the Form ID: facebook.com/ads/leadgen/.../<FORM_ID>/...',
            'OR use Meta Graph API: GET /me/leadgen_forms?access_token=...',
            'Copy that number and paste it as Meta Form ID above',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">{i+1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' }}>
              <div>
                <h2 className="text-lg font-black text-white">
                  {editing ? 'Edit Mapping' : 'New Form Mapping'}
                </h2>
                <p className="text-blue-200 text-xs mt-0.5">Connect a Meta form to a ThynkFlow campaign</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-white/20 text-white text-lg">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Meta Form Section */}
              <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-4 space-y-3">
                <p className="text-xs font-black text-blue-700 uppercase tracking-widest">📘 Meta Side</p>
                {F('Meta Form ID *', 'meta_form_id', { placeholder: 'e.g. 1234567890123456' })}
                {F('Meta Form Name', 'meta_form_name', { placeholder: 'e.g. WhyCosmos SEA Oct 2025' })}
                {F('Meta Page ID', 'meta_page_id', { placeholder: 'Optional — your Facebook Page ID' })}
                {F('Meta Page Name', 'meta_page_name', { placeholder: 'Optional — e.g. WhyCosmos India' })}
              </div>

              {/* ThynkFlow Section */}
              <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4 space-y-3">
                <p className="text-xs font-black text-indigo-700 uppercase tracking-widest">🎯 ThynkFlow Side</p>
                {F('Campaign *', 'campaign_id', {
                  type: 'select',
                  placeholder: 'Select campaign',
                  options: campaigns.map(c => ({ value: c.id, label: `${c.name} (${c.platform || 'other'})` })),
                })}
                {F('Auto-assign Agent', 'auto_assign_to', {
                  type: 'select',
                  placeholder: 'No auto-assign',
                  options: agents.map(a => ({ value: a.id, label: a.name })),
                })}
                {F('Default Product', 'default_product_id', {
                  type: 'select',
                  placeholder: 'No default product',
                  options: products.map(p => ({ value: p.id, label: p.name })),
                })}
              </div>

              {F('Notes', 'notes', { type: 'textarea', placeholder: 'Internal notes about this mapping…' })}

              <label className="flex items-center gap-2 text-sm font-semibold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded" style={{ accentColor: '#2563eb' }} />
                Active (leads will flow when checked)
              </label>
            </div>

            <div className="flex gap-2 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-100 text-slate-600">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 disabled:opacity-50 shadow-md shadow-blue-200 active:scale-95 transition-all">
                {saving ? 'Saving…' : editing ? 'Save Changes ✓' : 'Create Mapping ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
