import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SquarePen, Search, Loader2 } from 'lucide-react'
import Avatar from '../components/Avatar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'
import { supabase, fmtListDate } from '../lib/supabase'
import { api } from '../lib/api'

export default function Chats() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.listConversations()
      setRows(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // refresh the list whenever any message the user can see changes
    const ch = supabase
      .channel('chats-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  const filtered = rows.filter((r) =>
    (r.other_name || '').toLowerCase().includes(q.toLowerCase()) ||
    (r.other_username || '').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="app-shell list-page">
      <header className="top-header">
        <Avatar name={profile?.name} url={profile?.avatar_url} size={40} />
        <span className="brand-text">GAV YOUTH</span>
        <button className="icon-btn" onClick={() => nav('/people')} aria-label="New chat">
          <SquarePen size={18} />
        </button>
      </header>

      <div className="search-box">
        <Search size={18} />
        <input placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><Loader2 className="spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>No chats yet</h3>
          <p>Head to People to start your first conversation.</p>
        </div>
      ) : (
        filtered.map((r) => {
          const preview = r.last_message
            ? (r.last_sender_id === user.id ? 'You: ' : '') + r.last_message
            : 'Say hi 👋'
          return (
            <Link className="chat-row" to={`/chat/${r.conversation_id}`} key={r.conversation_id}>
              <Avatar name={r.other_name} url={r.other_avatar} size={52} />
              <div className="chat-meta">
                <div className="row1">
                  <span className="chat-name">{r.other_name || r.other_username}</span>
                  <span className="chat-time">{fmtListDate(r.last_message_at)}</span>
                </div>
                <div className="row1">
                  <span className="chat-preview">{preview}</span>
                  {Number(r.unread_count) > 0 && <span className="unread-dot">{r.unread_count}</span>}
                </div>
              </div>
            </Link>
          )
        })
      )}

      <BottomNav />
    </div>
  )
}
