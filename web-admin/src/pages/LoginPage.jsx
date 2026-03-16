import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const user = await login(form.email, form.password)
      toast.success(`Welcome back, ${user.name}!`)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a2e4a] to-[#2563eb] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">T</span>
          </div>
          <h1 className="text-white text-3xl font-bold">ThynkFlow</h1>
          <p className="text-blue-200 text-sm mt-1">EdTech CRM — Admin Panel</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">Sign in to your account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="admin@thynkflow.com"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-3 text-base mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 mt-6">
            Default: admin@thynkflow.com / Admin@123
          </p>
        </div>
      </div>
    </div>
  )
}
