// web-admin/src/pages/RegistrationIntegrationPage.jsx
// Admin screen for the ThynkFlow → Thynk Registration bridge:
//   1. Connection (Registration base URL + API key)
//   2. Consultant mapping — which ThynkFlow user pushes as which Registration consultant
//   3. Product ↔ Program mapping — which ThynkFlow product lands on which Registration program
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

function SectionCard({ title, description, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      {description && <p className="text-sm text-slate-400 mt-1 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </div>
  )
}

function ConnectionSection() {
  const [form, setForm] = useState({ base_url: '', api_key: '' })
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api.get('/registration-integration/config').then(res => {
      const d = res.data || res
      setStatus(d)
      setForm(f => ({ ...f, base_url: d.base_url || '' }))
    }).catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/registration-integration/config', form)
      toast.success('Connection saved')
      setForm(f => ({ ...f, api_key: '' }))
      load()
    } catch (e) { toast.error(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <SectionCard title="🔗 Registration Connection" description="Where and how ThynkFlow reaches Thynk Registration when a consultant taps 'Create School'.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-500">Registration Base URL</label>
          <input
            value={form.base_url}
            onChange={e => setForm({ ...form, base_url: e.target.value })}
            placeholder="https://app.thynksuccess.com"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500">
            API Key {status?.api_key_set && <span className="text-emerald-600 font-mono">({status.api_key_preview} set)</span>}
          </label>
          <input
            value={form.api_key}
            onChange={e => setForm({ ...form, api_key: e.target.value })}
            placeholder={status?.api_key_set ? 'Leave blank to keep current key' : 'Paste the integration API key'}
            type="password"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <button onClick={save} disabled={saving}
        className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-bold">
        {saving ? 'Saving…' : 'Save Connection'}
      </button>
      <p className="text-xs text-slate-400 mt-3">
        The API key is generated on the Registration side (Admin → Integrations → ThynkFlow CRM) and pasted here.
      </p>
    </SectionCard>
  )
}

function ConsultantMappingSection() {
  const [mappings, setMappings] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ thynkflow_user_id: '', registration_consultant_id: '', registration_consultant_code: '', registration_consultant_name: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api.get('/registration-integration/consultant-mapping').then(res => setMappings(res.data?.data || res.data || [])).catch(() => {})
    api.get('/users').then(res => setUsers(res.data?.data || res.data || [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.thynkflow_user_id || !form.registration_consultant_id) return toast.error('Pick a ThynkFlow user and enter the Registration consultant ID')
    setSaving(true)
    try {
      await api.post('/registration-integration/consultant-mapping', form)
      toast.success('Mapping saved')
      setForm({ thynkflow_user_id: '', registration_consultant_id: '', registration_consultant_code: '', registration_consultant_name: '' })
      load()
    } catch (e) { toast.error(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!window.confirm('Remove this mapping?')) return
    try { await api.delete(`/registration-integration/consultant-mapping/${id}`); load() }
    catch (e) { toast.error(e.message || 'Failed to delete') }
  }

  const mappedUserIds = new Set(mappings.map(m => m.thynkflow_user_id))

  return (
    <SectionCard title="👤 Consultant Mapping" description="Which Registration consultant account a ThynkFlow user's converted leads get pushed under. Find the Registration consultant_id on Registration's Admin → Consultants page.">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <select value={form.thynkflow_user_id} onChange={e => setForm({ ...form, thynkflow_user_id: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">ThynkFlow user…</option>
          {users.filter(u => !mappedUserIds.has(u.id)).map(u => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
        <input value={form.registration_consultant_id} onChange={e => setForm({ ...form, registration_consultant_id: e.target.value })}
          placeholder="Registration consultant_id (uuid)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <input value={form.registration_consultant_code} onChange={e => setForm({ ...form, registration_consultant_code: e.target.value })}
          placeholder="Consultant code (optional label)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-bold">
          {saving ? 'Saving…' : '+ Add Mapping'}
        </button>
      </div>

      <div className="space-y-2">
        {mappings.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No consultants mapped yet.</p>}
        {mappings.map(m => (
          <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
            <div>
              <p className="text-sm font-semibold text-slate-800">{m.thynkflow_user_name} <span className="text-slate-400 font-normal">({m.thynkflow_user_email})</span></p>
              <p className="text-xs text-slate-400 font-mono">→ {m.registration_consultant_id} {m.registration_consultant_code ? `· ${m.registration_consultant_code}` : ''}</p>
            </div>
            <button onClick={() => remove(m.id)} className="text-slate-400 hover:text-red-500 p-1.5">🗑️</button>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function ProductMappingSection() {
  const [mappings, setMappings] = useState([])
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ thynkflow_product_id: '', registration_project_id: '', registration_project_name: '', registration_project_slug: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api.get('/registration-integration/product-mapping').then(res => setMappings(res.data?.data || res.data || [])).catch(() => {})
    api.get('/products/active').then(res => setProducts(res.data?.data || res.data || [])).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.thynkflow_product_id || !form.registration_project_id) return toast.error('Pick a product and enter the Registration program ID')
    setSaving(true)
    try {
      await api.post('/registration-integration/product-mapping', form)
      toast.success('Mapping saved')
      setForm({ thynkflow_product_id: '', registration_project_id: '', registration_project_name: '', registration_project_slug: '' })
      load()
    } catch (e) { toast.error(e.message || 'Failed to save') }
    finally { setSaving(false) }
  }

  const remove = async (id) => {
    if (!window.confirm('Remove this mapping?')) return
    try { await api.delete(`/registration-integration/product-mapping/${id}`); load() }
    catch (e) { toast.error(e.message || 'Failed to delete') }
  }

  const mappedProductIds = new Set(mappings.map(m => m.thynkflow_product_id))

  return (
    <SectionCard title="📦 Product ↔ Program Mapping" description="Which Registration program (project) a ThynkFlow product corresponds to. Find the Registration project_id on Registration's Admin → Projects/Programs page.">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <select value={form.thynkflow_product_id} onChange={e => setForm({ ...form, thynkflow_product_id: e.target.value })}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">ThynkFlow product…</option>
          {products.filter(p => !mappedProductIds.has(p.id)).map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input value={form.registration_project_id} onChange={e => setForm({ ...form, registration_project_id: e.target.value })}
          placeholder="Registration project_id (uuid)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <input value={form.registration_project_name} onChange={e => setForm({ ...form, registration_project_name: e.target.value })}
          placeholder="Program name (optional label)" className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-bold">
          {saving ? 'Saving…' : '+ Add Mapping'}
        </button>
      </div>

      <div className="space-y-2">
        {mappings.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No products mapped yet.</p>}
        {mappings.map(m => (
          <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
            <div>
              <p className="text-sm font-semibold text-slate-800">{m.thynkflow_product_name}</p>
              <p className="text-xs text-slate-400 font-mono">→ {m.registration_project_id} {m.registration_project_name ? `· ${m.registration_project_name}` : ''}</p>
            </div>
            <button onClick={() => remove(m.id)} className="text-slate-400 hover:text-red-500 p-1.5">🗑️</button>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

export default function RegistrationIntegrationPage() {
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [runningSetup, setRunningSetup] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    api.get('/registration-integration/consultant-mapping').catch(e => {
      if (/does not exist/i.test(e?.message || '')) setSetupNeeded(true)
    })
  }, [refreshKey])

  const runSetup = async () => {
    setRunningSetup(true)
    try {
      await api.post('/registration-integration/setup')
      toast.success('Setup complete — tables created')
      setSetupNeeded(false)
      setRefreshKey(k => k + 1)
    } catch (e) {
      toast.error(e.message || 'Setup failed')
    } finally {
      setRunningSetup(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-black text-slate-800 mb-1">Registration Integration</h1>
      <p className="text-sm text-slate-400 mb-6">
        Controls the "Create School" button on Converted leads — where the push goes, and how consultants &amp; products map across systems.
      </p>

      {setupNeeded && (
        <div className="mb-6 p-4 rounded-2xl border border-amber-300 bg-amber-50 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-amber-800">⚠️ Setup needed</p>
            <p className="text-xs text-amber-700 mt-1">The database tables for this integration haven't been created yet on this environment.</p>
          </div>
          <button onClick={runSetup} disabled={runningSetup}
            className="shrink-0 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm font-bold">
            {runningSetup ? 'Running…' : 'Run Setup'}
          </button>
        </div>
      )}

      <ConnectionSection key={`c-${refreshKey}`} />
      <ConsultantMappingSection key={`u-${refreshKey}`} />
      <ProductMappingSection key={`p-${refreshKey}`} />
    </div>
  )
}
