import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import Avatar from '../components/Avatar'
import BottomNav from '../components/BottomNav'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

export default function People() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [people, setPeople] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(null)

  useEffect(() => {
    api.listPeople()
      .then((data) => setPeople(data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const startChat = async (otherId) => {
    setOpening(otherId)
    try {
      const { conversation_id } = await api.startConversation(otherId)
      if (conversation_id) nav(`/chat/${conversation_id}`)
    } catch (e) {
      console.error(e)
    } finally {
      setOpening(null)
    }
  }

  const filtered = people.filter((p) =>
    (p.name || '').toLowerCase().includes(q.toLowerCase()) ||
    (p.username || '').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="app-shell list-page">
      <header className="top-header">
        <span className="brand-text" style={{ fontSize: 20 }}>People</span>
      </header>

      <div className="search-box">
        <Search size={18} />
        <input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {loading ? (
        <div className="center-screen" style={{ minHeight: 200 }}><Loader2 className="spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><h3>No one here yet</h3><p>Invite a friend to create an account.</p></div>
      ) : (
        filtered.map((p) => (
          <div className="chat-row" key={p.id} onClick={() => startChat(p.id)} role="button" style={{ cursor: 'pointer' }}>
            <Avatar name={p.name} url={p.avatar_url} size={52} />
            <div className="chat-meta">
              <div className="chat-name">{p.name || p.username}</div>
              <div className="chat-preview">@{p.username}{p.status_message ? ` · ${p.status_message}` : ''}</div>
            </div>
            {opening === p.id && <Loader2 size={18} className="spin" />}
          </div>
        ))
      )}

      <BottomNav />
    </div>
  )
}
