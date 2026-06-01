import React, { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

// ─── Shared style helpers ─────────────────────────────────────────────────────
const inp = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-50 bg-white font-mono'
const inpNormal = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-50 bg-white'

function Label({ children }) {
  return <label className="block text-[10px] font-bold tracking-widest uppercase text-slate-500 mb-1.5">{children}</label>
}

function SecretInput({ label, hint, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className={inp + ' pr-10'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || hint}
        />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm">
          {show ? '🙈' : '👁️'}
        </button>
      </div>
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      className="relative cursor-pointer flex-shrink-0"
      style={{ width: 44, height: 24 }}>
      <div className={`absolute inset-0 rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-slate-200'}`} />
      <div className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow transition-all ${value ? 'left-[23px]' : 'left-[3px]'}`} />
    </div>
  )
}

// ─── WhatsApp providers ───────────────────────────────────────────────────────
const WA_PROVIDERS = {
  thynkcomm: {
    label: 'ThynkComm', badge: '⚡ Recommended',
    badgeColor: '#166534', badgeBg: 'rgba(22,101,52,0.1)',
    icon: '💬', iconBg: 'linear-gradient(135deg,#1ab8a8,#0e8a7d)',
    color: '#1ab8a8', colorBg: 'rgba(26,184,168,0.08)', colorBorder: 'rgba(26,184,168,0.3)',
    description: 'Use your ThynkComm deployment. Authenticate with API Key + Secret.',
    docsUrl: 'https://thynkcomm.vercel.app',
  },
  meta: {
    label: 'Meta Cloud API', badge: 'Direct',
    badgeColor: '#1d4ed8', badgeBg: 'rgba(29,78,216,0.1)',
    icon: '🔵', iconBg: 'linear-gradient(135deg,#1877F2,#0d47a1)',
    color: '#1877F2', colorBg: 'rgba(24,119,242,0.08)', colorBorder: 'rgba(24,119,242,0.3)',
    description: 'Connect directly to Meta WhatsApp Business Cloud API.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  },
  twilio: {
    label: 'Twilio', badge: 'International',
    badgeColor: '#6B21A8', badgeBg: 'rgba(107,33,168,0.1)',
    icon: '🔴', iconBg: 'linear-gradient(135deg,#F22F46,#a51829)',
    color: '#F22F46', colorBg: 'rgba(242,47,70,0.08)', colorBorder: 'rgba(242,47,70,0.3)',
    description: 'Twilio WhatsApp sandbox and production. Best for international setups.',
    docsUrl: 'https://www.twilio.com/docs/whatsapp',
  },
}

const WA_DEFAULTS = {
  provider: 'thynkcomm', enabled: false,
  tcUrl: '', tcApiKey: '', tcApiSecret: '',
  metaToken: '', metaPhoneId: '',
  accountSid: '', authToken: '', fromNumber: '',
}

// ─── WhatsApp Tab ─────────────────────────────────────────────────────────────
function WhatsAppTab() {
  const [wa, setWa]           = useState(WA_DEFAULTS)
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testMsg,   setTestMsg]   = useState('Hello from ThynkFlow! Your WhatsApp integration is working. 🎉')
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    api.get('/integrations/raw').then(r => {
      if (r?.data?.whatsapp && Object.keys(r.data.whatsapp).length) {
        setWa(prev => ({ ...WA_DEFAULTS, ...r.data.whatsapp }))
      }
    }).catch(() => {})
  }, [])

  const set = patch => setWa(p => ({ ...p, ...patch }))

  const save = async () => {
    setSaving(true)
    try {
      await api.post('/integrations/whatsapp', wa)
      toast.success('✅ WhatsApp settings saved!')
    } catch (err) {
      toast.error('❌ Save failed: ' + (err.message || 'Unknown error'))
    } finally { setSaving(false) }
  }

  const normalisePhone = raw => {
    let d = raw.replace(/\D/g, '')
    if (d.length === 10 && d[0] !== '0') d = '91' + d
    if (d.length === 11 && d[0] === '0') d = '91' + d.slice(1)
    return d
  }

  const isConfigured = () => {
    if (wa.provider === 'thynkcomm') return !!(wa.tcUrl && wa.tcApiKey && wa.tcApiSecret)
    if (wa.provider === 'meta')      return !!(wa.metaToken && wa.metaPhoneId)
    if (wa.provider === 'twilio')    return !!(wa.accountSid && wa.authToken && wa.fromNumber)
    return false
  }

  const sendTest = async () => {
    if (!testPhone.trim()) { toast.error('Enter a test phone number'); return }
    if (!isConfigured())   { toast.error('Save credentials first'); return }
    setTesting(true); setTestResult(null)
    try {
      const r = await api.post('/integrations/test-whatsapp', {
        to: normalisePhone(testPhone.trim()),
        message: testMsg,
      })
      setTestResult({ ok: true, msg: r.message || 'Message queued successfully' })
      toast.success('✅ Test message sent!')
    } catch (err) {
      setTestResult({ ok: false, msg: err.message || 'Send failed' })
      toast.error('❌ Test failed')
    } finally { setTesting(false) }
  }

  const prov = WA_PROVIDERS[wa.provider]

  return (
    <div className="space-y-5">
      {/* Provider Selector */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="font-bold text-slate-800 text-sm">WhatsApp Provider</div>
            <div className="text-xs text-slate-500 mt-0.5">Choose how ThynkFlow sends WhatsApp messages</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${wa.enabled ? 'text-green-600' : 'text-slate-400'}`}>
              {wa.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <Toggle value={wa.enabled} onChange={v => set({ enabled: v })} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(WA_PROVIDERS).map(([id, meta]) => {
            const selected = wa.provider === id
            return (
              <button key={id} onClick={() => set({ provider: id })}
                className="text-left rounded-xl p-4 transition-all outline-none"
                style={{
                  border: `2px solid ${selected ? meta.color : '#e2e8f0'}`,
                  background: selected ? meta.colorBg : '#f8fafc',
                }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: meta.iconBg }}>
                    {meta.icon}
                  </div>
                  {selected && (
                    <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white"
                      style={{ background: meta.color }}>✓</div>
                  )}
                </div>
                <div className="font-bold text-slate-800 text-xs mb-1">{meta.label}</div>
                <div className="text-[9px] font-bold px-2 py-0.5 rounded-full inline-block mb-2"
                  style={{ background: meta.badgeBg, color: meta.badgeColor }}>
                  {meta.badge}
                </div>
                <div className="text-[10px] text-slate-500 leading-relaxed">{meta.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Credentials */}
      <div className="bg-white rounded-2xl p-6" style={{ border: `1.5px solid ${prov.colorBorder}` }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: prov.iconBg }}>{prov.icon}</div>
            <div>
              <div className="font-bold text-slate-800 text-sm">{prov.label} Credentials</div>
              <div className={`text-xs mt-0.5 ${isConfigured() ? 'text-green-600' : 'text-red-500'}`}>
                {isConfigured() ? '✓ All credentials provided' : '⚠ Missing required credentials'}
              </div>
            </div>
          </div>
          <a href={prov.docsUrl} target="_blank" rel="noreferrer"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: prov.colorBorder, color: prov.color, background: prov.colorBg }}>
            🔗 {wa.provider === 'thynkcomm' ? 'Open ThynkComm' : 'View Docs'}
          </a>
        </div>

        {wa.provider === 'thynkcomm' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl text-xs leading-relaxed"
              style={{ background: 'rgba(26,184,168,0.07)', border: '1px solid rgba(26,184,168,0.2)' }}>
              <div className="font-bold mb-2" style={{ color: '#1ab8a8' }}>⚡ How to get your ThynkComm API Key</div>
              <ol className="list-decimal list-inside space-y-1 text-slate-600">
                <li>Open your ThynkComm dashboard</li>
                <li>Go to <strong>Integrations → Other Apps</strong></li>
                <li>Click <strong>+ New Integration Key</strong></li>
                <li>Select permission: <strong>Send Messages ✓</strong></li>
                <li>Click <strong>Generate Key</strong> — copy API Key and Secret</li>
              </ol>
            </div>
            <div>
              <Label>ThynkComm URL *</Label>
              <input className={inpNormal} value={wa.tcUrl} onChange={e => set({ tcUrl: e.target.value })}
                placeholder="https://thynkcomm.vercel.app" />
              <p className="text-[10px] text-slate-400 mt-1">Your Vercel deployment URL — no trailing slash</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>API Key *</Label>
                <input className={inp} value={wa.tcApiKey} onChange={e => set({ tcApiKey: e.target.value })} placeholder="tk_XXXXXXXXXXXXXXXX" />
                <p className="text-[10px] text-slate-400 mt-1">From ThynkComm → Integrations</p>
              </div>
              <SecretInput label="API Secret *" value={wa.tcApiSecret} onChange={v => set({ tcApiSecret: v })} placeholder="sk_live_xxxxxxxx" hint="Starts with sk_live_" />
            </div>
          </div>
        )}

        {wa.provider === 'meta' && (
          <div className="space-y-4">
            <SecretInput label="Access Token *" value={wa.metaToken} onChange={v => set({ metaToken: v })} placeholder="EAAxxxxxxxx…" hint="⚠ Use a permanent System User token — temporary tokens expire in 24h" />
            <div>
              <Label>Phone Number ID *</Label>
              <input className={inp} value={wa.metaPhoneId} onChange={e => set({ metaPhoneId: e.target.value })} placeholder="1234567890" />
              <p className="text-[10px] text-slate-400 mt-1">Meta → WhatsApp → API Setup → Phone Number ID</p>
            </div>
          </div>
        )}

        {wa.provider === 'twilio' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Account SID *</Label>
              <input className={inp} value={wa.accountSid} onChange={e => set({ accountSid: e.target.value })} placeholder="ACxxxxxxxxxxxxxxxx" />
            </div>
            <SecretInput label="Auth Token *" value={wa.authToken} onChange={v => set({ authToken: v })} placeholder="••••••••" hint="Twilio Console → Account Info" />
            <div className="col-span-2">
              <Label>WhatsApp From Number *</Label>
              <input className={inp} value={wa.fromNumber} onChange={e => set({ fromNumber: e.target.value })} placeholder="whatsapp:+14155238886" />
              <p className="text-[10px] text-slate-400 mt-1">Include the whatsapp: prefix</p>
            </div>
          </div>
        )}
      </div>

      {/* Test */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="font-bold text-slate-800 text-sm mb-1">📤 Send a Test Message</div>
        <div className="text-xs text-slate-500 mb-4">Verify the integration is working before going live</div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <Label>Phone Number *</Label>
            <input className={inp} value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="919876543210" />
            <p className="text-[10px] text-slate-400 mt-1">Indian 10-digit auto-prefixed with 91</p>
          </div>
          <div className="col-span-2">
            <Label>Message</Label>
            <input className={inpNormal} value={testMsg} onChange={e => setTestMsg(e.target.value)} />
          </div>
        </div>
        {testResult && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            <span>{testResult.ok ? '✅' : '❌'}</span>
            <span>{testResult.msg}</span>
          </div>
        )}
        <button onClick={sendTest} disabled={testing || !isConfigured()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
          style={{ background: isConfigured() ? '#15803d' : '#94a3b8' }}>
          {testing ? '⏳ Sending…' : '📤 Send Test Message'}
        </button>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-60">
          {saving ? '⏳ Saving…' : '💾 Save WhatsApp Settings'}
        </button>
      </div>
    </div>
  )
}

// ─── Email Tab ────────────────────────────────────────────────────────────────
const SMTP_DEFAULTS = {
  fromName: 'ThynkFlow', fromEmail: '',
  smtpHost: 'smtp.gmail.com', smtpPort: '587',
  smtpUser: '', smtpPass: '', enabled: true,
}

function EmailTab() {
  const [cfg, setCfg]         = useState(SMTP_DEFAULTS)
  const [saving, setSaving]   = useState(false)
  const [testing, setTesting] = useState(false)
  const [testTo, setTestTo]   = useState('')
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    api.get('/integrations/raw').then(r => {
      if (r?.data?.email && Object.keys(r.data.email).length) {
        setCfg(prev => ({ ...SMTP_DEFAULTS, ...r.data.email }))
      }
    }).catch(() => {})
  }, [])

  const set = patch => setCfg(p => ({ ...p, ...patch }))

  const isConfigured = !!(cfg.smtpHost && cfg.smtpUser && cfg.smtpPass)

  const save = async () => {
    if (!cfg.smtpHost || !cfg.smtpUser) { toast.error('SMTP Host and Username are required'); return }
    setSaving(true)
    try {
      await api.post('/integrations/email', cfg)
      toast.success('✅ Email SMTP configuration saved!')
    } catch (err) {
      toast.error('❌ Save failed: ' + (err.message || 'Unknown'))
    } finally { setSaving(false) }
  }

  const testSmtp = async () => {
    if (!testTo.trim()) { toast.error('Enter a test email address'); return }
    if (!isConfigured)  { toast.error('Save SMTP credentials first'); return }
    setTesting(true); setTestResult(null)
    try {
      const r = await api.post('/integrations/test-email', { to: testTo.trim() })
      setTestResult({ ok: true, msg: r.message || `Test email sent to ${testTo}` })
      toast.success('✅ Test email sent!')
    } catch (err) {
      setTestResult({ ok: false, msg: err.message || 'Test failed' })
      toast.error('❌ SMTP test failed')
    } finally { setTesting(false) }
  }

  const SMTP_PRESETS = [
    { label: 'Gmail', host: 'smtp.gmail.com', port: '587' },
    { label: 'Outlook', host: 'smtp.office365.com', port: '587' },
    { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '465' },
    { label: 'Zoho', host: 'smtp.zoho.in', port: '587' },
    { label: 'Brevo', host: 'smtp-relay.brevo.com', port: '587' },
    { label: 'Custom', host: '', port: '587' },
  ]

  return (
    <div className="space-y-5">
      {/* Info */}
      <div className="p-4 rounded-xl text-xs leading-relaxed bg-indigo-50 border border-indigo-100">
        <div className="font-bold text-indigo-700 mb-1">📧 SMTP Configuration</div>
        <div className="text-indigo-600">
          Configure your outgoing email server. All emails sent via ThynkFlow (templates, bulk campaigns) will use this SMTP account.
          For Gmail, use an <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noreferrer" className="underline font-semibold">App Password</a> — not your main password.
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 space-y-5">
        {/* Status + Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-800 text-sm">SMTP Server</div>
            <div className={`text-xs mt-0.5 ${isConfigured ? 'text-green-600' : 'text-amber-500'}`}>
              {isConfigured ? '✓ Credentials configured' : '⚠ Not configured — emails will fail'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${cfg.enabled ? 'text-green-600' : 'text-slate-400'}`}>
              {cfg.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <Toggle value={cfg.enabled} onChange={v => set({ enabled: v })} />
          </div>
        </div>

        {/* Quick presets */}
        <div>
          <Label>Quick Preset</Label>
          <div className="flex gap-2 flex-wrap">
            {SMTP_PRESETS.map(p => (
              <button key={p.label}
                onClick={() => p.host && set({ smtpHost: p.host, smtpPort: p.port })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  cfg.smtpHost === p.host ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Sender Name</Label>
            <input className={inpNormal} value={cfg.fromName} onChange={e => set({ fromName: e.target.value })} placeholder="ThynkFlow Sales" />
          </div>
          <div>
            <Label>From Email</Label>
            <input className={inp} value={cfg.fromEmail} onChange={e => set({ fromEmail: e.target.value })} placeholder="sales@yourdomain.com" />
            <p className="text-[10px] text-slate-400 mt-1">Leave blank to use SMTP Username as sender</p>
          </div>
          <div>
            <Label>SMTP Host *</Label>
            <input className={inp} value={cfg.smtpHost} onChange={e => set({ smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <Label>SMTP Port *</Label>
            <input className={inp} value={cfg.smtpPort} onChange={e => set({ smtpPort: e.target.value })} placeholder="587" />
            <p className="text-[10px] text-slate-400 mt-1">587 = TLS (recommended) · 465 = SSL · 25 = no encryption</p>
          </div>
          <div>
            <Label>SMTP Username *</Label>
            <input className={inp} value={cfg.smtpUser} onChange={e => set({ smtpUser: e.target.value })} placeholder="your@gmail.com" />
          </div>
          <SecretInput
            label="Password / App Password *"
            value={cfg.smtpPass}
            onChange={v => set({ smtpPass: v })}
            placeholder="xxxx xxxx xxxx xxxx"
            hint="Gmail: use App Password (16 chars), not your account password"
          />
        </div>
      </div>

      {/* Test */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <div className="font-bold text-slate-800 text-sm mb-1">📤 Send a Test Email</div>
        <div className="text-xs text-slate-500 mb-4">Verify SMTP is working before sending to leads</div>
        <div className="flex gap-3 items-end mb-4">
          <div className="flex-1">
            <Label>Send test to *</Label>
            <input className={inpNormal} value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="your@email.com" />
          </div>
          <button onClick={testSmtp} disabled={testing || !testTo.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold border border-indigo-400 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap">
            {testing ? '⏳ Testing…' : '🔌 Test SMTP'}
          </button>
        </div>
        {testResult && (
          <div className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
            <span>{testResult.ok ? '✅' : '❌'}</span>
            <span>{testResult.msg}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-60">
          {saving ? '⏳ Saving…' : '💾 Save SMTP Configuration'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const [tab, setTab] = useState('email')

  const TABS = [
    { k: 'email',     icon: '📧', label: 'Email / SMTP' },
    { k: 'whatsapp',  icon: '💬', label: 'WhatsApp' },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">🔗 Integrations</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure email SMTP and WhatsApp for sending messages to leads</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
              tab === t.k
                ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'email'    && <EmailTab />}
      {tab === 'whatsapp' && <WhatsAppTab />}
    </div>
  )
}
