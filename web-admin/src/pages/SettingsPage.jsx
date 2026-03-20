// web-admin/src/pages/SettingsPage.jsx
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const CATEGORIES = [
  { key: 'lead_status',  label: 'Lead Statuses',  icon: '🏷️', description: 'Status options shown after each call (e.g. Hot, Warm, Converted)' },
  { key: 'lead_source',  label: 'Lead Sources',   icon: '📥', description: 'Where leads come from (e.g. Excel Upload, Referral, Website)' },
  { key: 'lead_type',    label: 'Lead Types',     icon: '🏢', description: 'Type of lead — B2B or B2C and more' },
  { key: 'school_name',  label: 'School Names',   icon: '🏫', description: 'School / Organisation names.' },
  { key: 'city',         label: 'Cities',         icon: '🏙️', description: 'City options for lead location filtering' },
]

const PRESET_COLORS = [
  '#3b82f6','#ef4444','#f59e0b','#22c55e',
  '#a855f7','#0ea5e9','#64748b','#ec4899',
  '#14b8a6','#f97316','#6366f1','#84cc16'
]

const CAT_COLORS = {
  introduction: 'bg-blue-50 text-blue-700 border-blue-200',
  followup:     'bg-purple-50 text-purple-700 border-purple-200',
  proposal:     'bg-amber-50 text-amber-700 border-amber-200',
  thankyou:     'bg-green-50 text-green-700 border-green-200',
  general:      'bg-gray-50 text-gray-700 border-gray-200',
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {PRESET_COLORS.map(color => (
        <button key={color} type="button" onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${value===color?'border-slate-800 scale-110':'border-transparent'}`}
          style={{ background: color }} />
      ))}
    </div>
  )
}

function SettingRow({ item, onToggle, onDelete, onEdit }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.is_active?'bg-white border-slate-200':'bg-slate-50 border-slate-100 opacity-60'}`}>
      <div className="w-4 h-4 rounded-full flex-shrink-0 border border-white shadow-sm" style={{ background: item.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
        <p className="text-xs text-slate-400 font-mono">{item.key}</p>
      </div>
      <span className="text-xs font-bold px-3 py-1 rounded-full hidden sm:block" style={{ background:item.color+'20', color:item.color }}>{item.label}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">✏️</button>
        <button onClick={() => onToggle(item)} className={`p-1.5 rounded-lg ${item.is_active?'hover:bg-red-50 text-slate-400 hover:text-red-500':'hover:bg-green-50 text-slate-400 hover:text-green-500'}`}>
          {item.is_active?'🔴':'🟢'}
        </button>
        <button onClick={() => onDelete(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">🗑️</button>
      </div>
    </div>
  )
}

function ProductRow({ product, onEdit, onDelete, onToggle }) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${product.is_active?'bg-white border-slate-200':'bg-slate-50 border-slate-100 opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-slate-800">{product.name}</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${product.type==='B2B'?'bg-blue-100 text-blue-700':'bg-purple-100 text-purple-700'}`}>{product.type}</span>
        </div>
        {product.description && <p className="text-xs text-slate-400 truncate">{product.description}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-lg font-black text-green-600">₹{Number(product.per_closure_earning).toLocaleString('en-IN')}</p>
        <p className="text-xs text-slate-400">per closure</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(product)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">✏️</button>
        <button onClick={() => onToggle(product)} className={`p-1.5 rounded-lg ${product.is_active?'hover:bg-red-50 text-slate-400 hover:text-red-500':'hover:bg-green-50 text-slate-400 hover:text-green-500'}`}>
          {product.is_active?'🔴':'🟢'}
        </button>
        <button onClick={() => onDelete(product)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">🗑️</button>
      </div>
    </div>
  )
}

function ProductsSection() {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm]         = useState({ name:'', type:'B2B', description:'', per_closure_earning:'', sort_order:0 })
  const [saving, setSaving]     = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/products')
      setProducts(Array.isArray(r) ? r : (r?.data || []))
    } catch { toast.error('Failed to load products') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const openCreate = () => { setEditItem(null); setForm({ name:'', type:'B2B', description:'', per_closure_earning:'', sort_order:products.length+1 }); setShowModal(true) }
  const openEdit   = (item) => { setEditItem(item); setForm({ name:item.name, type:item.type, description:item.description||'', per_closure_earning:item.per_closure_earning, sort_order:item.sort_order }); setShowModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Product name is required')
    if (!form.per_closure_earning||isNaN(form.per_closure_earning)) return toast.error('Valid earning amount is required')
    setSaving(true)
    try {
      if (editItem) { await api.put(`/products/${editItem.id}`, { ...form, is_active: editItem.is_active }); toast.success('Product updated!') }
      else          { await api.post('/products', form); toast.success('Product added!') }
      setShowModal(false); fetchProducts()
    } catch (err) { toast.error(err.message||'Failed to save') }
    finally { setSaving(false) }
  }

  const handleToggle = async (item) => {
    try { await api.put(`/products/${item.id}`, { name:item.name, type:item.type, per_closure_earning:item.per_closure_earning, is_active:!item.is_active }); toast.success(`${item.name} ${item.is_active?'disabled':'enabled'}`); fetchProducts() }
    catch { toast.error('Failed to update') }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    try { await api.delete(`/products/${item.id}`); toast.success('Product deleted'); fetchProducts() }
    catch { toast.error('Failed to delete') }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><span>📦</span> Products</h2>
          <p className="text-sm text-slate-500 mt-1">Define products with type and per-closure earning for agents</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex-shrink-0">+ Add Product</button>
      </div>
      {loading ? <p className="text-center text-slate-400 py-8 text-sm">Loading...</p>
      : products.length === 0 ? (
        <div className="text-center py-10"><p className="text-4xl mb-3">📦</p><p className="text-slate-500 font-medium">No products yet</p></div>
      ) : (
        <div className="space-y-2">
          {products.map(p => <ProductRow key={p.id} product={p} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} />)}
        </div>
      )}
      {products.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-sm text-blue-700">
            <strong>{products.filter(p=>p.is_active).length}</strong> active products ·
            Avg earning: <strong>₹{Math.round(products.filter(p=>p.is_active).reduce((s,p)=>s+parseFloat(p.per_closure_earning),0)/Math.max(1,products.filter(p=>p.is_active).length)).toLocaleString('en-IN')}</strong> per closure
          </p>
        </div>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">{editItem?`Edit "${editItem.name}"` : 'Add New Product'}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Product Name *</label>
                <input className="input" placeholder="e.g. Memory Program" value={form.name} onChange={e => setForm({...form,name:e.target.value})} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Product Type *</label>
                <div className="flex gap-3">
                  {['B2B','B2C'].map(t => (
                    <button key={t} type="button" onClick={() => setForm({...form,type:t})}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${form.type===t?(t==='B2B'?'border-blue-500 bg-blue-50 text-blue-700':'border-purple-500 bg-purple-50 text-purple-700'):'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Per Closure Earning (₹) *</label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <span className="px-3 py-2.5 bg-slate-50 text-slate-500 border-r border-slate-200 font-bold">₹</span>
                  <input type="number" className="flex-1 px-3 py-2.5 text-sm outline-none" placeholder="e.g. 2000"
                    value={form.per_closure_earning} onChange={e => setForm({...form,per_closure_earning:e.target.value})} min="0" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Description (Optional)</label>
                <textarea className="input resize-none h-20 text-sm" placeholder="Brief description..." value={form.description} onChange={e => setForm({...form,description:e.target.value})} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving?'Saving...':editItem?'Save Changes':'Add Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings]             = useState({})
  const [loading, setLoading]               = useState(true)
  const [activeTab, setActiveTab]           = useState('products')
  const [activeCategory, setActiveCategory] = useState('lead_status')
  const [showModal, setShowModal]           = useState(false)
  const [editItem, setEditItem]             = useState(null)
  const [form, setForm]                     = useState({ label:'', key:'', color:'#3b82f6', sort_order:0 })
  const [saving, setSaving]                 = useState(false)

  // Email templates
  const [templates, setTemplates]       = useState([])
  const [tplLoading, setTplLoading]     = useState(false)
  const [showTplModal, setShowTplModal] = useState(false)
  const [editTpl, setEditTpl]           = useState(null)
  const [tplForm, setTplForm]           = useState({ name:'', subject:'', body:'', category:'general' })
  const [savingTpl, setSavingTpl]       = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/settings')
      setSettings(r?.data || r || {})
    } catch { toast.error('Failed to load settings') }
    finally { setLoading(false) }
  }, [])

  const fetchTemplates = useCallback(async () => {
    setTplLoading(true)
    try {
      const r = await api.get('/emails/templates')
      setTemplates(r?.data || [])
    } catch {} finally { setTplLoading(false) }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])
  useEffect(() => { if (activeTab === 'templates') fetchTemplates() }, [activeTab, fetchTemplates])

  const openCreate = () => { setEditItem(null); setForm({ label:'', key:'', color:'#3b82f6', sort_order:(settings[activeCategory]?.length||0)+1 }); setShowModal(true) }
  const openEdit   = (item) => { setEditItem(item); setForm({ label:item.label, key:item.key, color:item.color, sort_order:item.sort_order }); setShowModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.label.trim()) return toast.error('Label is required')
    setSaving(true)
    try {
      if (editItem) { await api.put(`/settings/${editItem.id}`, form); toast.success('Option updated!') }
      else          { await api.post('/settings', { ...form, category: activeCategory }); toast.success('Option added!') }
      setShowModal(false); fetchSettings()
    } catch (err) { toast.error(err.message||'Failed to save') }
    finally { setSaving(false) }
  }

  const handleToggle = async (item) => {
    try { await api.patch(`/settings/${item.id}/toggle`); toast.success(`${item.label} ${item.is_active?'disabled':'enabled'}`); fetchSettings() }
    catch { toast.error('Failed to update') }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.label}"?`)) return
    try { await api.delete(`/settings/${item.id}`); toast.success('Option deleted'); fetchSettings() }
    catch { toast.error('Failed to delete') }
  }

  const openNewTpl  = () => { setEditTpl(null); setTplForm({ name:'', subject:'', body:'', category:'general' }); setShowTplModal(true) }
  const openEditTpl = (t) => { setEditTpl(t); setTplForm({ name:t.name, subject:t.subject, body:t.body, category:t.category }); setShowTplModal(true) }

  const saveTpl = async (e) => {
    e.preventDefault()
    if (!tplForm.name||!tplForm.subject||!tplForm.body) return toast.error('All fields required')
    setSavingTpl(true)
    try {
      if (editTpl) await api.put(`/emails/templates/${editTpl.id}`, { ...tplForm, is_active: true })
      else         await api.post('/emails/templates', tplForm)
      toast.success(editTpl ? 'Template updated' : 'Template created')
      setShowTplModal(false); fetchTemplates()
    } catch (err) { toast.error(err.message||'Failed to save') }
    finally { setSavingTpl(false) }
  }

  const deleteTpl = async (id) => {
    if (!window.confirm('Delete this template?')) return
    try { await api.delete(`/emails/templates/${id}`); fetchTemplates(); toast.success('Deleted') }
    catch (err) { toast.error(err.message) }
  }

  const activeCategoryData = settings[activeCategory] || []
  const activeCategoryInfo = CATEGORIES.find(c => c.key === activeCategory)

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">⚙️ Settings & Configuration</h1>
        <p className="text-slate-500 text-sm mt-1">Manage products, dropdown options, email templates and app configuration</p>
      </div>

      {/* Main tabs */}
      <div className="flex gap-2 flex-wrap">
        {[['products','📦 Products'],['dropdowns','🏷️ Dropdown Options'],['templates','📧 Email Templates']].map(([key,label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab===key?'bg-blue-600 text-white shadow-lg shadow-blue-200':'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && <ProductsSection />}

      {/* Dropdowns Tab */}
      {activeTab === 'dropdowns' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeCategory===cat.key?'bg-blue-600 text-white shadow-lg shadow-blue-200':'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                <span>{cat.icon}</span><span>{cat.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeCategory===cat.key?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{settings[cat.key]?.length||0}</span>
              </button>
            ))}
          </div>
          <div className="card p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><span>{activeCategoryInfo?.icon}</span>{activeCategoryInfo?.label}</h2>
                <p className="text-sm text-slate-500 mt-1">{activeCategoryInfo?.description}</p>
              </div>
              <button onClick={openCreate} className="btn-primary flex-shrink-0">+ Add Option</button>
            </div>
            <div className="mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Preview:</p>
              <div className="flex flex-wrap gap-2">
                {activeCategoryData.filter(i=>i.is_active).map(item => (
                  <span key={item.id} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background:item.color+'20', color:item.color }}>{item.label}</span>
                ))}
              </div>
            </div>
            {loading ? <p className="text-center text-slate-400 py-8 text-sm">Loading...</p>
            : activeCategoryData.length === 0 ? (
              <div className="text-center py-10"><p className="text-4xl mb-3">📭</p><p className="text-slate-500 font-medium">No options yet</p></div>
            ) : (
              <div className="space-y-2">
                {activeCategoryData.map(item => <SettingRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} onEdit={openEdit} />)}
              </div>
            )}
          </div>
        </>
      )}

      {/* Email Templates Tab */}
      {activeTab === 'templates' && (
        <div className="card p-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><span>📧</span> Email Templates</h2>
              <p className="text-sm text-slate-500 mt-1">Create and manage reusable email templates. Use <code className="bg-slate-100 px-1 rounded text-xs">{'{{lead_name}}'}</code> <code className="bg-slate-100 px-1 rounded text-xs">{'{{agent_name}}'}</code> as variables.</p>
            </div>
            <button onClick={openNewTpl} className="btn-primary flex-shrink-0">+ New Template</button>
          </div>

          {tplLoading ? <p className="text-center text-slate-400 py-8 text-sm">Loading...</p>
          : templates.length === 0 ? (
            <div className="text-center py-10"><p className="text-4xl mb-3">📧</p><p className="text-slate-500 font-medium">No templates yet</p></div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {templates.map(t => (
                <div key={t.id} className={`border rounded-xl p-4 ${CAT_COLORS[t.category]||'bg-white border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm">{t.name}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/60 font-medium capitalize">{t.category}</span>
                      </div>
                      <p className="text-xs font-medium opacity-80 mb-1">📌 {t.subject}</p>
                      <p className="text-xs opacity-60 line-clamp-2 whitespace-pre-wrap">{t.body.slice(0,150)}…</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditTpl(t)}
                        className="px-3 py-1.5 bg-white/70 hover:bg-white rounded-lg text-xs font-semibold border border-white/50 transition-colors">
                        ✏️ Edit
                      </button>
                      <button onClick={() => deleteTpl(t.id)}
                        className="px-3 py-1.5 bg-white/70 hover:bg-red-50 rounded-lg text-xs font-semibold border border-white/50 text-red-500 transition-colors">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dropdown option modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-5">{editItem?`Edit "${editItem.label}"` : `Add to ${activeCategoryInfo?.label}`}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Display Label *</label>
                <input className="input" placeholder="e.g. Very Interested" value={form.label}
                  onChange={e => setForm({...form,label:e.target.value,key:editItem?form.key:e.target.value.toLowerCase().replace(/[^a-z0-9]/g,'_')})} required />
              </div>
              {!editItem && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Key</label>
                  <input className="input font-mono text-sm bg-slate-50" value={form.key} onChange={e => setForm({...form,key:e.target.value})} />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Badge Color</label>
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl border border-slate-200" style={{ background:form.color }} />
                  <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background:form.color+'20', color:form.color }}>{form.label||'Preview'}</span>
                </div>
                <ColorPicker value={form.color} onChange={color => setForm({...form,color})} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Sort Order</label>
                <input type="number" className="input w-24" value={form.sort_order} min="0" onChange={e => setForm({...form,sort_order:parseInt(e.target.value)})} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving?'Saving...':editItem?'Save Changes':'Add Option'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Template modal */}
      {showTplModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <h2 className="font-bold text-slate-800">{editTpl ? 'Edit Template' : 'New Email Template'}</h2>
              <button onClick={() => setShowTplModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={saveTpl} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Template Name *</label>
                  <input className="input" placeholder="e.g. Introduction Email" value={tplForm.name}
                    onChange={e => setTplForm(f=>({...f,name:e.target.value}))} required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Category</label>
                  <select className="input" value={tplForm.category} onChange={e => setTplForm(f=>({...f,category:e.target.value}))}>
                    <option value="general">General</option>
                    <option value="introduction">Introduction</option>
                    <option value="followup">Follow-up</option>
                    <option value="proposal">Proposal</option>
                    <option value="thankyou">Thank You</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Subject *</label>
                <input className="input" placeholder="Use {{lead_name}}, {{agent_name}} as variables"
                  value={tplForm.subject} onChange={e => setTplForm(f=>({...f,subject:e.target.value}))} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Body *</label>
                <p className="text-xs text-slate-400 mb-1">Available variables: <code className="bg-slate-100 px-1 rounded">{'{{lead_name}}'}</code> <code className="bg-slate-100 px-1 rounded">{'{{agent_name}}'}</code> <code className="bg-slate-100 px-1 rounded">{'{{agent_phone}}'}</code></p>
                <textarea rows={12} className="input resize-none font-mono text-sm"
                  placeholder="Dear {{lead_name}},&#10;&#10;Write your email here…"
                  value={tplForm.body} onChange={e => setTplForm(f=>({...f,body:e.target.value}))} required />
              </div>
              {/* Preview */}
              {tplForm.name && (
                <div className={`p-3 rounded-xl border text-xs ${CAT_COLORS[tplForm.category]||'bg-gray-50 border-gray-200'}`}>
                  <p className="font-bold mb-1">Preview: {tplForm.name}</p>
                  <p className="opacity-70">📌 {tplForm.subject||'(no subject)'}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTplModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={savingTpl} className="btn-primary flex-1 justify-center">
                  {savingTpl ? 'Saving…' : editTpl ? 'Save Changes' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
