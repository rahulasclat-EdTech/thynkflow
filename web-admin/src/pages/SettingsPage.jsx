import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

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
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${value === color ? 'border-slate-800 scale-110' : 'border-transparent'}`}
          style={{ background: color }}
        />
      ))}
    </div>
  )
}

function SettingRow({ item, onToggle, onDelete, onEdit }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
      {/* Color dot */}
      <div className="w-4 h-4 rounded-full flex-shrink-0 border border-white shadow-sm" style={{ background: item.color }} />

      {/* Label & key */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
        <p className="text-xs text-slate-400 font-mono">{item.key}</p>
      </div>

      {/* Badge preview */}
      <div className="hidden sm:block">
        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: item.color + '20', color: item.color }}>
          {item.label}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Edit">
          ✏️
        </button>
        <button onClick={() => onToggle(item)} className={`p-1.5 rounded-lg transition-colors text-xs font-bold ${item.is_active ? 'hover:bg-red-50 text-slate-400 hover:text-red-500' : 'hover:bg-green-50 text-slate-400 hover:text-green-500'}`} title={item.is_active ? 'Disable' : 'Enable'}>
          {item.is_active ? '🔴' : '🟢'}
        </button>
        <button onClick={() => onDelete(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Delete">
          🗑️
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
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
    } catch (err) {
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
    } catch {
      toast.error('Failed to update')
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.label}"? This cannot be undone.`)) return
    try {
      await api.delete(`/settings/${item.id}`)
      toast.success('Option deleted')
      fetchSettings()
    } catch {
      toast.error('Failed to delete')
    }
  }

  const activeCategoryData = settings[activeCategory] || []
  const activeCategoryInfo = CATEGORIES.find(c => c.key === activeCategory)

  return (
    <div className="max-w-4xl space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">⚙️ Settings & Configuration</h1>
        <p className="text-slate-500 text-sm mt-1">Manage dropdown options used throughout the app</p>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeCategory === cat.key
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeCategory === cat.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {settings[cat.key]?.length || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Category Info + Add Button */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>{activeCategoryInfo?.icon}</span>
              {activeCategoryInfo?.label}
            </h2>
            <p className="text-sm text-slate-500 mt-1">{activeCategoryInfo?.description}</p>
          </div>
          <button onClick={openCreate} className="btn-primary flex-shrink-0">
            + Add Option
          </button>
        </div>

        {/* Preview */}
        <div className="mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Preview — how these look in the app:</p>
          <div className="flex flex-wrap gap-2">
            {activeCategoryData.filter(i => i.is_active).map(item => (
              <span key={item.id} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: item.color + '20', color: item.color }}>
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <p className="text-center text-slate-400 py-8 text-sm">Loading...</p>
        ) : activeCategoryData.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-slate-500 font-medium">No options yet</p>
            <p className="text-slate-400 text-sm mt-1">Click "+ Add Option" to create your first one</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeCategoryData.map(item => (
              <SettingRow
                key={item.id}
                item={item}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onEdit={openEdit}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-800 mb-2">💡 How This Works</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Options you add here appear in the dropdowns on the mobile app and web panel</li>
          <li>• <strong>Disable</strong> an option to hide it without deleting (historical data is preserved)</li>
          <li>• <strong>Delete</strong> permanently removes an option (use with caution)</li>
          <li>• Colors you pick here are used for badges and labels throughout the app</li>
          <li>• Changes take effect immediately — no restart needed</li>
        </ul>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-5">
              {editItem ? `Edit "${editItem.label}"` : `Add to ${activeCategoryInfo?.label}`}
            </h3>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                  Display Label *
                </label>
                <input
                  className="input"
                  placeholder="e.g. Very Interested"
                  value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value, key: editItem ? form.key : e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_') })}
                  required
                />
              </div>

              {!editItem && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Key (auto-generated)
                  </label>
                  <input
                    className="input font-mono text-sm bg-slate-50"
                    value={form.key}
                    onChange={e => setForm({ ...form, key: e.target.value })}
                    placeholder="very_interested"
                  />
                  <p className="text-xs text-slate-400 mt-1">Used internally — lowercase letters and underscores only</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                  Badge Color
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl border border-slate-200 flex-shrink-0" style={{ background: form.color }} />
                  <div className="flex-1">
                    <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: form.color + '20', color: form.color }}>
                      {form.label || 'Preview'}
                    </span>
                  </div>
                </div>
                <ColorPicker value={form.color} onChange={color => setForm({ ...form, color })} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                  Sort Order
                </label>
                <input
                  type="number"
                  className="input w-24"
                  value={form.sort_order}
                  onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) })}
                  min="0"
                />
                <p className="text-xs text-slate-400 mt-1">Lower number = appears first in dropdown</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
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
