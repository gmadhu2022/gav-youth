import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Send, Check, CheckCheck, Loader2 } from 'lucide-react'
import Avatar from '../components/Avatar'
import { useAuth } from '../context/AuthContext'
import { supabase, fmtTime, fmtSeen } from '../lib/supabase'
import { api } from '../lib/api'

function dayLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' })
}

export default function Chat() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const [other, setOther] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)

  const scrollDown = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

  const markRead = useCallback(async () => {
    try { await api.markRead(id) } catch (e) { /* non-critical */ }
  }, [id])

  // load participant + history
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const data = await api.getConversation(id)
        if (alive) {
          setOther(data.other || null)
          setMessages(data.messages || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        if (alive) setLoading(false)
      }
      markRead()
    })()
    return () => { alive = false }
  }, [id, user.id, markRead])

  // realtime for this conversation
  useEffect(() => {
    const ch = supabase
      .channel(`conv-${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          setMessages((m) => (m.some((x) => x.id === payload.new.id) ? m : [...m, payload.new]))
          if (payload.new.sender_id !== user.id) markRead()
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => setMessages((m) => m.map((x) => (x.id === payload.new.id ? payload.new : x))))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [id, user.id, markRead])

  useEffect(() => { scrollDown() }, [messages.length])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setSending(true); setText('')
    try {
      const msg = await api.sendMessage(id, body)
      // optimistic: realtime will also deliver it, de-duped by id
      setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]))
    } catch (e) {
      setText(body)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="conv">
      <header className="conv-header">
        <button className="back-btn" onClick={() => nav('/chats')} aria-label="Back"><ArrowLeft size={22} /></button>
        <Avatar name={other?.name} url={other?.avatar_url} size={42} />
        <div style={{ flex: 1 }}>
          <div className="name">{other?.name || other?.username || '…'}</div>
          <div className="seen">{fmtSeen(other?.last_seen)}</div>
        </div>
        <button className="chev" aria-label="Details"><ChevronDown size={22} /></button>
      </header>

      <div className="messages">
        {loading ? (
          <div className="center-screen"><Loader2 className="spin" /></div>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === user.id
            const showDay = i === 0 || dayLabel(m.created_at) !== dayLabel(messages[i - 1].created_at)
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {showDay && <div className="day-sep">{dayLabel(m.created_at)}</div>}
                <div className={`bubble ${mine ? 'mine' : 'theirs'}`}>
                  {m.content}
                  <span className="time">
                    {fmtTime(m.created_at)}
                    {mine && (m.read_at ? <CheckCheck size={13} /> : <Check size={13} />)}
                  </span>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={send}>
        <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="send-btn" disabled={sending || !text.trim()} aria-label="Send">
          <Send size={20} />
        </button>
      </form>
      <div className="composer-hint">Photos, voice notes and calls arrive in the next release.</div>
    </div>
  )
}
