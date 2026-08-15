import { useEffect, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import Avatar from '../components/Avatar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export default function Profile() {
  const { profile, user, refreshProfile, signOut } = useAuth()
  const [form, setForm] = useState({ name: '', username: '', bio: '', status_message: '', avatar_url: '' })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (profile) setForm({
      name: profile.name || '',
      username: profile.username || '',
      bio: profile.bio || '',
      status_message: profile.status_message || '',
      avatar_url: profile.avatar_url || '',
    })
  }, [profile])

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setSaved(false) }

  const save = async () => {
    setBusy(true); setErr(''); setSaved(false)
    try {
      await api.updateProfile({
        name: form.name.trim(),
        username: form.username.trim(),
        bio: form.bio.trim(),
        status_message: form.status_message.trim(),
        avatar_url: form.avatar_url.trim() || null,
      })
      setSaved(true)
      refreshProfile()
    } catch (e) {
      setErr(e.message || 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell list-page">
      <div className="profile-head">
        <Avatar name={form.name} url={form.avatar_url} size={96} />
        <h2>{form.name || 'Your profile'}</h2>
        <div className="uname">@{form.username || 'username'}</div>
      </div>

      <div className="profile-body">
        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={set('name')} placeholder="Your name" />
        </div>
        <div className="field">
          <label>Username</label>
          <input value={form.username} onChange={set('username')} placeholder="username" />
        </div>
        <div className="field">
          <label>Status message</label>
          <input value={form.status_message} onChange={set('status_message')} placeholder="Available" />
        </div>
        <div className="field">
          <label>Bio</label>
          <textarea rows={3} value={form.bio} onChange={set('bio')} placeholder="A little about you" />
        </div>
        <div className="field">
          <label>Avatar URL (optional)</label>
          <input value={form.avatar_url} onChange={set('avatar_url')} placeholder="https://…/photo.jpg" />
        </div>

        {err && <div className="error-note">{err}</div>}

        <button className="btn-grad" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : saved ? <><Check size={18} /> Saved</> : 'Save changes'}
        </button>

        <button className="logout-btn" onClick={signOut}>Sign out</button>
      </div>

      <BottomNav />
    </div>
  )
}
