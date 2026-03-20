// web-admin/src/pages/UsersPage.jsx
import React, { useEffect, useState, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const ROLES = [
  { id: 1, name: 'admin' },
  { id: 2, name: 'agent' },
]

export default function UsersPage() {
  const [users, setUsers]                         = useState([])
  const [loading, setLoading]                     = useState(true)
  const [showModal, setShowModal]                 = useState(false)
  const [showLogsModal, setShowLogsModal]         = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedUser, setSelectedUser]           = useState(null)
  const [editUser, setEditUser]                   = useState(null)
  const [form, setForm]                           = useState({ name:'', email:'', password:'', phone:'', role_name:'agent' })
  const [passwordForm, setPasswordForm]           = useState({ newPass:'', confirm:'' })
  const [saving, setSaving]                       = useState(false)
  const [logs, setLogs]                           = useState({ login_logs:[], working_logs:[] })
  const [logsLoading, setLogsLoading]             = useState(false)
  const [logsTab, setLogsTab]                     = useState('login')
  const [showInactive, setShowInactive]           = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/users')
      setUsers(Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []))
    } catch { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const activeUsers   = users.filter(u => u.is_active)
  const inactiveUsers = users.filter(u => !u.is_active)

  const openCreate = () => {
    setEditUser(null)
    setForm({ name:'', email:'', password:'', phone:'', role_name:'agent' })
    setShowModal(true)
  }

  const openEdit = (user) => {
    setEditUser(user)
    setForm({ name:user.name, email:user.email, password:'', phone:user.phone||'', role_name:user.role_name||'agent' })
    setShowModal(true)
  }

  const openLogs = async (user) => {
    setSelectedUser(user)
    setShowLogsModal(true)
    setLogsLoading(true)
    setLogsTab('login')
    try {
      const r = await api.get(`/users/${user.id}/logs`)
      setLogs(r?.data || { login_logs:[], working_logs:[] })
    } catch {
      setLogs({ login_logs:[], working_logs:[] })
    } finally { setLogsLoading(false) }
  }

  const openChangePassword = (user) => {
    setSelectedUser(user)
    setPasswordForm({ newPass:'', confirm:'' })
    setShowPasswordModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editUser) {
        await api.put(`/users/${editUser.id}`, {
          name: form.name, email: editUser.email,
          phone: form.phone, role_name: form.role_name,
          is_active: editUser.is_active,
        })
        toast.success('User updated')
      } else {
        await api.post('/users', {
          name: form.name, email: form.email,
          password: form.password, phone: form.phone,
          role_name: form.role_name,
        })
        toast.success('User created')
      }
      setShowModal(false); fetchUsers()
    } catch (err) { toast.error(err.message || 'Failed to save user') }
    finally { setSaving(false) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (passwordForm.newPass.length < 6) return toast.error('Password must be at least 6 characters')
    if (passwordForm.newPass !== passwordForm.confirm) return toast.error('Passwords do not match')
    setSaving(true)
    try {
      await api.put(`/users/${selectedUser.id}/reset-password`, { new_password: passwordForm.newPass })
      toast.success(`Password changed for ${selectedUser.name}`)
      setShowPasswordModal(false)
    } catch (err) { toast.error(err.message || 'Failed to change password') }
    finally { setSaving(false) }
  }

  const toggleActive = async (user) => {
    try {
      if (user.is_active) {
        await api.patch(`/users/${user.id}/deactivate`)
        toast.success(`${user.name} deactivated`)
      } else {
        await api.patch(`/users/${user.id}/reactivate`)
        toast.success(`${user.name} reactivated`)
      }
      fetchUsers()
    } catch (err) { toast.error(err.message || 'Failed to update') }
  }

  const UserRow = ({ user, isInactive = false }) => (
    <tr key={user.id} className={`hover:bg-slate-50 ${isInactive ? 'opacity-60 bg-slate-50' : ''}`}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
            {user.name?.[0]?.toUpperCase()}
          </div>
          <span className="font-medium text-slate-800">{user.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-600">{user.email}</td>
      <td className="px-4 py-3 text-slate-600">{user.phone||'—'}</td>
      <td className="px-4 py-3">
        <span className={user.role_name==='admin'
          ? 'bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full'
          : 'bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-0.5 rounded-full'}>
          {user.role_name}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-400 text-xs">
        {user.last_login ? (() => { try { return format(new Date(user.last_login),'dd MMM yy HH:mm') } catch { return '—' } })() : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 flex-wrap">
          {!isInactive && (
            <>
              <button onClick={() => openEdit(user)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
              <button onClick={() => openLogs(user)} className="text-purple-600 hover:text-purple-800 text-xs font-medium">📋 Logs</button>
              <button onClick={() => openChangePassword(user)} className="text-orange-500 hover:text-orange-700 text-xs font-medium">🔐 Password</button>
            </>
          )}
          <button onClick={() => toggleActive(user)}
            className={`text-xs font-medium ${user.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
            {user.is_active ? 'Deactivate' : '✅ Reactivate'}
          </button>
        </div>
      </td>
    </tr>
  )

  const TableHeader = () => (
    <thead className="bg-slate-50 border-b border-slate-200">
      <tr>
        {['Name','Email','Phone','Role','Status','Last Login','Actions'].map(h => (
          <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">{h}</th>
        ))}
      </tr>
    </thead>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-slate-500 text-sm">
            {activeUsers.length} active · {inactiveUsers.length} inactive
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ Add User</button>
      </div>

      {/* Active Users Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">✅ Active Users ({activeUsers.length})</h2>
        </div>
        <table className="w-full text-sm">
          <TableHeader />
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Loading...</td></tr>
            ) : activeUsers.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">No active users</td></tr>
            ) : activeUsers.map(user => <UserRow key={user.id} user={user} />)}
          </tbody>
        </table>
      </div>

      {/* Deactivated Users Section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-700 flex items-center gap-2">
            🔴 Deactivated Users ({inactiveUsers.length})
          </h2>
          <button onClick={() => setShowInactive(!showInactive)}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
            {showInactive ? 'Hide' : 'Show'}
          </button>
        </div>
        {showInactive && (
          <table className="w-full text-sm">
            <TableHeader />
            <tbody className="divide-y divide-slate-100">
              {inactiveUsers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No deactivated users</td></tr>
              ) : inactiveUsers.map(user => <UserRow key={user.id} user={user} isInactive={true} />)}
            </tbody>
          </table>
        )}
        {!showInactive && inactiveUsers.length > 0 && (
          <div className="px-5 py-3 text-xs text-slate-400">
            Click Show to view and reactivate deactivated users
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">{editUser?'Edit User':'Create New User'}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
                <input className="input" value={form.name} onChange={e => setForm({...form,name:e.target.value})} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm({...form,email:e.target.value})} required disabled={!!editUser} />
              </div>
              {!editUser && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Password *</label>
                  <input type="password" className="input" value={form.password} onChange={e => setForm({...form,password:e.target.value})} required minLength={6} />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                <input className="input" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role *</label>
                <select className="input" value={form.role_name} onChange={e => setForm({...form,role_name:e.target.value})}>
                  {ROLES.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving?'Saving...':'Save User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-800">🔐 Change Password</h3>
                <p className="text-sm text-slate-400 mt-0.5">For: <strong>{selectedUser.name}</strong></p>
              </div>
              <button onClick={() => setShowPasswordModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">New Password *</label>
                <input type="password" className="input" placeholder="Min. 6 characters"
                  value={passwordForm.newPass} onChange={e => setPasswordForm({...passwordForm,newPass:e.target.value})} required minLength={6} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Confirm Password *</label>
                <input type="password" className="input" placeholder="Repeat new password"
                  value={passwordForm.confirm} onChange={e => setPasswordForm({...passwordForm,confirm:e.target.value})} required />
                {passwordForm.confirm && (
                  <p className={`text-xs mt-1 ${passwordForm.newPass===passwordForm.confirm?'text-green-500':'text-red-500'}`}>
                    {passwordForm.newPass===passwordForm.confirm?'✓ Passwords match':'Passwords do not match'}
                  </p>
                )}
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-xs text-amber-700">⚠️ This will immediately change the password for <strong>{selectedUser.name}</strong>.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPasswordModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">{saving?'Saving...':'Change Password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {showLogsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800">📋 Activity Logs — {selectedUser.name}</h2>
                <p className="text-sm text-slate-400 mt-0.5">{selectedUser.email} · {selectedUser.role_name}</p>
              </div>
              <button onClick={() => setShowLogsModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <div className="flex gap-1 p-4 border-b border-slate-100">
              <button onClick={() => setLogsTab('login')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${logsTab==='login'?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-100'}`}>
                🔐 Login Logs ({logs.login_logs?.length||0})
              </button>
              <button onClick={() => setLogsTab('working')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${logsTab==='working'?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-100'}`}>
                📞 Working Logs ({logs.working_logs?.length||0})
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {logsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : logsTab === 'login' ? (
                <div className="space-y-2">
                  {!logs.login_logs?.length ? (
                    <div className="text-center py-10 text-slate-400"><p className="text-3xl mb-2">🔐</p><p>No login logs found</p></div>
                  ) : logs.login_logs.map((log, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-green-500" />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">✅ Login</p>
                          {log.ip_address && <p className="text-xs text-slate-400">IP: {log.ip_address}</p>}
                        </div>
                      </div>
                      <p className="text-xs font-medium text-slate-600">
                        {log.logged_in_at ? (() => { try { return format(new Date(log.logged_in_at),'dd MMM yyyy, hh:mm a') } catch { return '—' } })() : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {!logs.working_logs?.length ? (
                    <div className="text-center py-10 text-slate-400"><p className="text-3xl mb-2">📞</p><p>No working logs found</p></div>
                  ) : logs.working_logs.map((log, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                          {(log.school_name||log.contact_name||'?')?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{log.school_name||log.contact_name||log.phone||'—'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">{log.type||'call'}</span>
                            {log.product_name && <span className="text-xs text-slate-400">📦 {log.product_name}</span>}
                          </div>
                          {log.discussion && <p className="text-xs text-slate-400 mt-0.5 italic truncate max-w-xs">"{log.discussion}"</p>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-slate-600">
                          {log.called_at ? (() => { try { return format(new Date(log.called_at),'dd MMM yyyy') } catch { return '—' } })() : '—'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {log.called_at ? (() => { try { return format(new Date(log.called_at),'hh:mm a') } catch { return '' } })() : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-between items-center">
              <p className="text-xs text-slate-400">
                {logsTab==='login' ? `${logs.login_logs?.length||0} login records` : `${logs.working_logs?.length||0} call records`}
              </p>
              <button onClick={() => setShowLogsModal(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
