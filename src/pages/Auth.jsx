import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldCheck, Loader2 } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.9 6.1 29.7 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.9 6.1 29.7 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.9 35.6 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z"/>
    </svg>
  )
}

export default function Auth() {
  const { session, loading, signIn, signUp, signInWithGoogle } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (!loading && session) return <Navigate to="/chats" replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await signIn(form.email, form.password)
        if (error) throw error
        nav('/chats')
      } else {
        if (!form.name.trim() || !form.username.trim()) throw new Error('Name and username are required.')
        const { data, error } = await signUp(form.email, form.password, form.name.trim(), form.username.trim())
        if (error) throw error
        if (data.session) nav('/chats')
        else setErr('Check your email to confirm your account, then sign in.')
      }
    } catch (e) {
      setErr(e.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setErr('')
    const { error } = await signInWithGoogle()
    if (error) setErr(error.message)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={40} />
          <span className="brand-text">GAV YOUTH</span>
        </div>

        <h1 className="auth-h">Join the conversation</h1>
        <p className="auth-sub">Use your email or Google account. Your password is never stored by us.</p>

        <div className="tabs">
          <button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setErr('') }}>Sign in</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setErr('') }}>Create account</button>
        </div>

        <form className="form-grid" onSubmit={submit}>
          {mode === 'signup' && (
            <div className="two-col">
              <div className="field">
                <label>Name</label>
                <input value={form.name} onChange={set('name')} placeholder="Gaurav Sharma" />
              </div>
              <div className="field">
                <label>Username</label>
                <input value={form.username} onChange={set('username')} placeholder="gav_star" />
              </div>
            </div>
          )}

          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </div>

          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" required minLength={6} />
          </div>

          {err && <div className="error-note">{err}</div>}

          <button className="btn-grad" disabled={busy}>
            {busy ? <Loader2 size={18} className="spin" /> : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>
        </form>

        <div className="divider">or</div>

        <button className="btn-ghost" onClick={google}>
          <GoogleIcon /> Continue with Google
        </button>

        <div className="privacy-note">
          <ShieldCheck size={16} />
          <span>Your chats are protected by per-account access rules — only people in a conversation can read them.</span>
        </div>
      </div>
    </div>
  )
}
