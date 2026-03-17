import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

// ─── DROPDOWN SETTINGS ───────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'lead_status', label: 'Lead Statuses', icon: '🏷️', description: 'Status options shown after each call (e.g. Hot, Warm, Converted)' },
  { key: 'lead_source', label: 'Lead Sources', icon: '📥', description: 'Where leads come from (e.g. Excel Upload, Referral, Website)' },
  { key: 'city', label: 'Cities', icon: '🏙️', description: 'City options for lead location filtering' },
]

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#f59e0b', '#22c55e',
  '#a855f7', '#0ea5e9', '#64748b', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16'
]

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {PRESET_COLORS.map(color => (
        <button key={color} type="button" onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${value === color ? 'border-slate-800 scale-110' : 'border-transparent'}`}
          style={{ background: color }} />
      ))}
    </div>
  )
}

function SettingRow({ item, onToggle, onDelete, onEdit }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
      <div className="w-4 h-4 rounded-full flex-shrink-0 border border-white shadow-sm" style={{ background: item.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
        <p className="text-xs text-slate-400 font-mono">{item.key}</p>
      </div>
      <div className="hidden sm:block">
        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: item.color + '20', color: item.color }}>
          {item.label}
        </span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">✏️</button>
        <button onClick={() => onToggle(item)} className={`p-1.5 rounded-lg transition-colors ${item.is_active ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-green-50 text-slate-400 hover:text-green-500'}`}>
          {item.is_active ? '🔴' : '🟢'}
        </button>
        <button onClick={() => onDelete(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">🗑️</button>
      </div>
    </div>
  )
}

// ─── PRODUCTS SECTION ─────────────────────────────────────────────────────────

function ProductRow({ product, onEdit, onDelete, onToggle }) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${product.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-semibold text-slate-800">{product.name}</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${product.type === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
            {product.type}
          </span>
        </div>
        {product.description && <p className="text-xs text-slate-400 truncate">{product.description}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-lg font-black text-green-600">
          ₹{Number(product.per_closure_earning).toLocaleString('en-IN')}
        </p>
        <p className="text-xs text-slate-400">per closure</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(product)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">✏️</button>
        <button onClick={() => onToggle(product)} className={`p-1.5 rounded-lg transition-colors ${product.is_active ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-green-50 text-slate-400 hover:text-green-500'}`}>
          {product.is_active ? '🔴' : '🟢'}
        </button>
        <button onClick={() => onDelete(product)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">🗑️</button>
      </div>
    </div>
  )
}

function ProductsSection() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ name: '', type: 'B2B', description: '', per_closure_earning: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/products')
      setProducts(res.data || [])
    } catch {
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  const openCreate = () => {
    setEditItem(null)
    setForm({ name: '', type: 'B2B', description: '', per_closure_earning: '', sort_order: products.length + 1 })
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ name: item.name, type: item.type, description: item.description || '', per_closure_earning: item.per_closure_earning, sort_order: item.sort_order })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('Product name is required')
    if (!form.per_closure_earning || isNaN(form.per_closure_earning)) return toast.error('Valid earning amount is required')
    setSaving(true)
    try {
      if (editItem) {
        await api.put(`/products/${editItem.id}`, { ...form, is_active: editItem.is_active })
        toast.success('Product updated!')
      } else {
        await api.post('/products', form)
        toast.success('Product added!')
      }
      setShowModal(false)
      fetchProducts()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    try {
      await api.patch(`/products/${item.id}/toggle`)
      toast.success(`${item.name} ${item.is_active ? 'disabled' : 'enabled'}`)
      fetchProducts()
    } catch {
      toast.error('Failed to update')
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/products/${item.id}`)
      toast.success('Product deleted')
      fetchProducts()
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📦</span> Products
          </h2>
          <p className="text-sm text-slate-500 mt-1">Define products with type and per-closure earning for agents</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex-shrink-0">+ Add Product</button>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-8 text-sm">Loading...</p>
      ) : products.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-slate-500 font-medium">No products yet</p>
          <p className="text-slate-400 text-sm mt-1">Click "+ Add Product" to create your first product</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map(product => (
            <ProductRow
              key={product.id}
              product={product}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {products.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <p className="text-sm text-blue-700">
            <strong>{products.filter(p => p.is_active).length}</strong> active products ·
            Avg earning: <strong>₹{Math.round(products.filter(p => p.is_active).reduce((s, p) => s + parseFloat(p.per_closure_earning), 0) / Math.max(1, products.filter(p => p.is_active).length)).toLocaleString('en-IN')}</strong> per closure
          </p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">
                {editItem ? `Edit "${editItem.name}"` : 'Add New Product'}
              </h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Product Name *</label>
                <input className="input" placeholder="e.g. School ERP Software"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Product Type *</label>
                <div className="flex gap-3">
                  {['B2B', 'B2C'].map(t => (
                    <button key={t} type="button"
                      onClick={() => setForm({ ...form, type: t })}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${form.type === t
                        ? t === 'B2B' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per Closure Earning */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Per Closure Earning (₹) *</label>
                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                  <span className="px-3 py-2.5 bg-slate-50 text-slate-500 border-r border-slate-200 font-bold">₹</span>
                  <input type="number" className="flex-1 px-3 py-2.5 text-sm outline-none" placeholder="e.g. 2000"
                    value={form.per_closure_earning} onChange={e => setForm({ ...form, per_closure_earning: e.target.value })}
                    min="0" required />
                </div>
                <p className="text-xs text-slate-400 mt-1">Amount agent earns when a lead converts for this product</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Description (Optional)</label>
                <textarea className="input resize-none h-20 text-sm" placeholder="Brief description of this product..."
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              {/* Sort Order */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Sort Order</label>
                <input type="number" className="input w-24" min="0"
                  value={form.sort_order} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) })} />
              </div>

              {/* Preview */}
              {form.name && form.per_closure_earning && (
                <div className="p-3 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-xs text-green-600 font-semibold mb-1">Preview</p>
                  <p className="text-sm text-green-700">
                    <strong>{form.name}</strong> ({form.type}) · ₹{Number(form.per_closure_earning).toLocaleString('en-IN')} per closure
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN SETTINGS PAGE ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('products')
  const [activeCategory, setActiveCategory] = useState('lead_status')
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ label: '', key: '', color: '#3b82f6', sort_order: 0 })
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/settings')
      setSettings(res.data)
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const openCreate = () => {
    setEditItem(null)
    setForm({ label: '', key: '', color: '#3b82f6', sort_order: (settings[activeCategory]?.length || 0) + 1 })
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({ label: item.label, key: item.key, color: item.color, sort_order: item.sort_order })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.label.trim()) return toast.error('Label is required')
    setSaving(true)
    try {
      if (editItem) {
        await api.put(`/settings/${editItem.id}`, form)
        toast.success('Option updated!')
      } else {
        await api.post('/settings', { ...form, category: activeCategory })
        toast.success('Option added!')
      }
      setShowModal(false)
      fetchSettings()
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item) => {
    try {
      await api.patch(`/settings/${item.id}/toggle`)
      toast.success(`${item.label} ${item.is_active ? 'disabled' : 'enabled'}`)
      fetchSettings()
    } catch { toast.error('Failed to update') }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.label}"?`)) return
    try {
      await api.delete(`/settings/${item.id}`)
      toast.success('Option deleted')
      fetchSettings()
    } catch { toast.error('Failed to delete') }
  }

  const activeCategoryData = settings[activeCategory] || []
  const activeCategoryInfo = CATEGORIES.find(c => c.key === activeCategory)

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">⚙️ Settings & Configuration</h1>
        <p className="text-slate-500 text-sm mt-1">Manage products, dropdown options, and app configuration</p>
      </div>

      {/* Main tabs: Products | Dropdowns */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'products' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          📦 Products
        </button>
        <button onClick={() => setActiveTab('dropdowns')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'dropdowns' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
          🏷️ Dropdown Options
        </button>
      </div>

      {/* Products Tab */}
      {activeTab === 'products' && <ProductsSection />}

      {/* Dropdowns Tab */}
      {activeTab === 'dropdowns' && (
        <>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeCategory === cat.key ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeCategory === cat.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {settings[cat.key]?.length || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="card p-5">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span>{activeCategoryInfo?.icon}</span>
                  {activeCategoryInfo?.label}
                </h2>
                <p className="text-sm text-slate-500 mt-1">{activeCategoryInfo?.description}</p>
              </div>
              <button onClick={openCreate} className="btn-primary flex-shrink-0">+ Add Option</button>
            </div>

            <div className="mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Preview:</p>
              <div className="flex flex-wrap gap-2">
                {activeCategoryData.filter(i => i.is_active).map(item => (
                  <span key={item.id} className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{ background: item.color + '20', color: item.color }}>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-center text-slate-400 py-8 text-sm">Loading...</p>
            ) : activeCategoryData.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-slate-500 font-medium">No options yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeCategoryData.map(item => (
                  <SettingRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} onEdit={openEdit} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Dropdown option modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-5">
              {editItem ? `Edit "${editItem.label}"` : `Add to ${activeCategoryInfo?.label}`}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Display Label *</label>
                <input className="input" placeholder="e.g. Very Interested" value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value, key: editItem ? form.key : e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_') })}
                  required />
              </div>
              {!editItem && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Key (auto-generated)</label>
                  <input className="input font-mono text-sm bg-slate-50" value={form.key}
                    onChange={e => setForm({ ...form, key: e.target.value })} placeholder="very_interested" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Badge Color</label>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl border border-slate-200" style={{ background: form.color }} />
                  <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: form.color + '20', color: form.color }}>
                    {form.label || 'Preview'}
                  </span>
                </div>
                <ColorPicker value={form.color} onChange={color => setForm({ ...form, color })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Sort Order</label>
                <input type="number" className="input w-24" value={form.sort_order} min="0"
                  onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Option'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
