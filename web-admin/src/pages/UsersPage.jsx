import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role_id: '2' })
  const [saving, setSaving] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, rolesRes] = await Promise.all([api.get('/users'), api.get('/users/roles')])
      setUsers(usersRes.data)
      setRoles(rolesRes.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const openCreate = () => {
    setEditUser(null)
    setForm({ name: '', email: '', password: '', phone: '', role_id: '2' })
    setShowModal(true)
  }

  const openEdit = (user) => {
    setEditUser(user)
    setForm({ name: user.name, email: user.email, password: '', phone: user.phone || '', role_id: String(user.role_id) })
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editUser) {
        await api.put(`/users/${editUser.id}`, { name: form.name, phone: form.phone, role_id: parseInt(form.role_id), is_active: editUser.is_active })
        toast.success('User updated')
      } else {
        await api.post('/users', { ...form, role_id: parseInt(form.role_id) })
        toast.success('User created')
      }
      setShowModal(false)
      fetchUsers()
    } catch (err) {
      toast.error(err.message || 'Failed to save user')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (user) => {
    try {
      if (user.is_active) {
        await api.patch(`/users/${user.id}/deactivate`)
        toast.success(`${user.name} deactivated. Historical data preserved.`)
      } else {
        await api.patch(`/users/${user.id}/reactivate`)
        toast.success(`${user.name} reactivated`)
      }
      fetchUsers()
    } catch (err) {
      toast.error(err.message || 'Failed to update user')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-slate-500 text-sm">Manage agents and admins</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ Add User</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Email</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Phone</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Leads</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
            ) : users.map(user => (
              <tr key={user.id} className={`hover:bg-slate-50 ${!user.is_active ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                      {user.name[0]}
                    </div>
                    <span className="font-medium text-slate-800">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{user.email}</td>
                <td className="px-4 py-3 text-slate-600">{user.phone || '—'}</td>
                <td className="px-4 py-3">
                  <span className={user.role_name === 'admin'
                    ? 'bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full'
                    : 'bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-0.5 rounded-full'}>
                    {user.role_name}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{user.lead_count || 0}</td>
                <td className="px-4 py-3">
                  <span className={user.is_active ? 'badge-converted' : 'badge-cold'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(user)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                    <button onClick={() => toggleActive(user)}
                      className={`text-xs font-medium ${user.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
                      {user.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-800 mb-5">{editUser ? 'Edit User' : 'Create New User'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required disabled={!!editUser} />
              </div>
              {!editUser && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Password *</label>
                  <input type="password" className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role *</label>
                <select className="input" value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })}>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving ? 'Saving...' : 'Save User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
