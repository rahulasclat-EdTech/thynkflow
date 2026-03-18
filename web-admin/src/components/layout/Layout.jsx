import React, { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../utils/api'
import toast from 'react-hot-toast'
import NotificationBell from '../NotificationBell'

const navItems = [
  { to: '/dashboard',  label: 'Dashboard',   icon: '▦',  adminOnly: false },
  { to: '/leads',      label: 'Leads',        icon: '👥', adminOnly: false },
  { to: '/activities', label: 'Activities',   icon: '✅', adminOnly: false },
  { to: '/followups',  label: 'Follow Ups',   icon: '📅', adminOnly: false },
  { to: '/products',   label: 'Products',     icon: '📦', adminOnly: false },
  { to: '/email',      label: 'Email',        icon: '📧', adminOnly: false },
  { to: '/chat',       label: 'Chat',         icon: '💬', adminOnly: false },
  { to: '/assign',     label: 'Assign Leads', icon: '↗',  adminOnly: true },
  { to: '/reports',    label: 'Reports',      icon: '📊', adminOnly: false },
  { to: '/users',      label: 'Users',        icon: '👤', adminOnly: true },
  { to: '/settings',   label: 'Settings',     icon: '⚙️', adminOnly: true },
]

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: '', newPass: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState({ current: false, newPass: false, confirm: false })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.newPass.length < 6) return toast.error('New password must be at least 6 characters')
    if (form.newPass !== form.confirm) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      await api.put('/auth/change-password', { current_password: form.current, new_password: form.newPass })
      toast.success('Password changed successfully!')
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800">🔐 Change Password</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[{ key: 'current', label: 'Current Password', ph: 'Enter current password' },
            { key: 'newPass', label: 'New Password', ph: 'Min. 6 characters' },
            { key: 'confirm', label: 'Confirm New Password', ph: 'Repeat new password' }
          ].map(({ key, label, ph }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">{label}</label>
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                <input type={show[key] ? 'text' : 'password'} className="flex-1 px-3 py-2.5 text-sm outline-none"
                  placeholder={ph} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} required />
                <button type="button" className="px-3 text-slate-400 hover:text-slate-600"
                  onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}>
                  {show[key] ? '🙈' : '👁'}
                </button>
              </div>
              {key === 'confirm' && form.confirm && (
                <p className={`text-xs mt-1 ${form.newPass === form.confirm ? 'text-green-500' : 'text-red-500'}`}>
                  {form.newPass === form.confirm ? '✓ Passwords match' : 'Passwords do not match'}
                </p>
              )}
            </div>
          ))}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function LastLoginModal({ user, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-800">🕐 Login Details</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 text-slate-500">✕</button>
        </div>
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold mb-3">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <p className="font-bold text-slate-800 text-lg">{user?.name}</p>
          <p className="text-slate-400 text-sm capitalize">{user?.role_name}</p>
        </div>
        <div className="space-y-3">
          {[
            { label: '📧 Email', value: user?.email },
            { label: '🎭 Role', value: user?.role_name },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm text-slate-500 font-medium">{label}</span>
              <span className="text-sm font-semibold text-slate-700 capitalize">{value || '—'}</span>
            </div>
          ))}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-sm text-blue-600 font-medium">🕐 Last Login</span>
            <span className="text-sm font-semibold text-blue-700">
              {user?.last_login
                ? new Date(user.last_login).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
                : 'This session'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
            <span className="text-sm text-green-600 font-medium">✅ Current Session</span>
            <span className="text-sm font-semibold text-green-700">Active now</span>
          </div>
        </div>
        <button onClick={onClose} className="btn-secondary w-full mt-5 justify-center">Close</button>
      </div>
    </div>
  )
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showLastLogin, setShowLastLogin] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-[#1a2e4a] flex flex-col transition-all duration-200 flex-shrink-0`}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">T</div>
          {sidebarOpen && <span className="text-white font-bold text-base tracking-tight">ThynkFlow</span>}
        </div>
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.filter(n => !n.adminOnly || isAdmin).map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`
              }>
              <span className="text-base flex-shrink-0">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{user?.name}</p>
                <p className="text-slate-400 text-xs capitalize">{user?.role_name}</p>
              </div>
              <button onClick={handleLogout} className="text-slate-400 hover:text-white text-xs" title="Logout">⏻</button>
            </div>
          ) : (
            <button onClick={handleLogout} className="w-full flex justify-center text-slate-400 hover:text-white">⏻</button>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-slate-600 text-xl">☰</button>
          <div className="flex items-center gap-3">
            <NotificationBell />
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2.5 hover:bg-slate-50 px-3 py-1.5 rounded-xl transition-colors">
              <span className="text-sm text-slate-500">Welcome, <strong className="text-slate-700">{user?.name}</strong></span>
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <span className="text-slate-400 text-xs">{menuOpen ? '▲' : '▼'}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-800">{user?.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{user?.role_name} · {user?.email}</p>
                </div>
                <div className="py-1">
                  <button onClick={() => { setMenuOpen(false); setShowLastLogin(true) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    <span>🕐</span>
                    <div className="text-left">
                      <p className="font-medium">Last Login Details</p>
                      <p className="text-xs text-slate-400">View session info</p>
                    </div>
                  </button>
                  <button onClick={() => { setMenuOpen(false); setShowChangePassword(true) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    <span>🔐</span>
                    <div className="text-left">
                      <p className="font-medium">Change Password</p>
                      <p className="text-xs text-slate-400">Update your password</p>
                    </div>
                  </button>
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    <button onClick={() => { setMenuOpen(false); handleLogout() }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
                      <span>⏻</span>
                      <div className="text-left">
                        <p className="font-medium">Log Out</p>
                        <p className="text-xs text-red-400">End your session</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <Outlet />
        </main>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
      {showLastLogin && <LastLoginModal user={user} onClose={() => setShowLastLogin(false)} />}
    </div>
  )
}
