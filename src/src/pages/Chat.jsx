import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Check, CheckCheck, Loader2, Paperclip, Mic, X, Phone, Video, Sparkles, ScrollText, ChevronUp } from 'lucide-react'
import Avatar from '../components/Avatar'
import Attachment from '../components/Attachment'
import { useAuth } from '../context/AuthContext'
import { useCall } from '../context/CallContext'
import { usePresence } from '../context/PresenceContext'
import { supabase, fmtTime, fmtSeen } from '../lib/supabase'
import { api } from '../lib/api'
import { uploadAttachment } from '../lib/storage'
import { compressImage } from '../lib/image'

function dayLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'long', day: 'numeric' })
}

const MEDIA_LABEL = { image: '📷 Photo', audio: '🎙️ Voice note', file: '📎 File' }

export default function Chat() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const { startCall } = useCall()
  const { isOnline } = usePresence()

  const [other, setOther] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const [suggestions, setSuggestions] = useState([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [summary, setSummary] = useState({ open: false, loading: false, text: null, error: null })
  const [otherTyping, setOtherTyping] = useState(false)

  const endRef = useRef(null)
  const scrollRef = useRef(null)
  const fileRef = useRef(null)
  const imageRef = useRef(null)
  const recRef = useRef(null)
  const chunksRef = useRef([])
  const recTimer = useRef(null)
  const recSecsRef = useRef(0)
  const suggestedFor = useRef(null)
  const anchorRef = useRef(null)   // scrollHeight snapshot for prepend
  const lastIdRef = useRef(null)
  const typingChanRef = useRef(null)
  const lastTypingSent = useRef(0)
  const typingClearTimer = useRef(null)

  const scrollDown = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

  const markRead = useCallback(async () => {
    try { await api.markRead(id) } catch (e) { /* non-critical */ }
  }, [id])

  const addMessage = (msg) =>
    setMessages((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]))

  // load participant + recent history
  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setSummary({ open: false, loading: false, text: null, error: null })
      try {
        const data = await api.getConversation(id)
        if (alive) { setOther(data.other || null); setMessages(data.messages || []); setHasMore(!!data.has_more) }
      } catch (e) { console.error(e) } finally { if (alive) setLoading(false) }
      markRead()
    })()
    return () => { alive = false }
  }, [id, user.id, markRead])

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`conv-${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => { addMessage(payload.new); if (payload.new.sender_id !== user.id) markRead() })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => setMessages((m) => m.map((x) => (x.id === payload.new.id ? payload.new : x))))
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [id, user.id, markRead])

  // scroll to bottom only when a NEW message lands at the end (not on prepend)
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last && last.id !== lastIdRef.current) {
      lastIdRef.current = last.id
      if (anchorRef.current == null) scrollDown()
    }
  }, [messages])

  // preserve scroll position after prepending older messages
  useLayoutEffect(() => {
    if (anchorRef.current != null && scrollRef.current) {
      const el = scrollRef.current
      el.scrollTop = el.scrollHeight - anchorRef.current
      anchorRef.current = null
    }
  }, [messages])

  // typing indicator over a broadcast channel
  useEffect(() => {
    const ch = supabase.channel(`typing-${id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (payload.from === user.id) return
      setOtherTyping(true)
      clearTimeout(typingClearTimer.current)
      typingClearTimer.current = setTimeout(() => setOtherTyping(false), 3000)
    })
    ch.subscribe()
    typingChanRef.current = ch
    return () => { supabase.removeChannel(ch); clearTimeout(typingClearTimer.current); setOtherTyping(false) }
  }, [id, user.id])

  const notifyTyping = () => {
    const now = Date.now()
    if (now - lastTypingSent.current < 1200) return
    lastTypingSent.current = now
    typingChanRef.current?.send({ type: 'broadcast', event: 'typing', payload: { from: user.id } })
  }

  const onComposerChange = (e) => { setText(e.target.value); notifyTyping() }

  const loadOlder = async () => {
    if (!messages.length || loadingOlder) return
    setLoadingOlder(true)
    anchorRef.current = scrollRef.current?.scrollHeight || 0
    try {
      const data = await api.olderMessages(id, messages[0].created_at)
      setMessages((m) => [...(data.messages || []), ...m])
      setHasMore(!!data.has_more)
    } catch (e) { anchorRef.current = null } finally { setLoadingOlder(false) }
  }

  // AI reply suggestions
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last || last.sender_id === user.id) { setSuggestions([]); return }
    if (suggestedFor.current === last.id) return
    suggestedFor.current = last.id
    let alive = true
    setSuggestLoading(true); setSuggestions([])
    api.suggestions(id)
      .then((r) => { if (alive) setSuggestions(r.suggestions || []) })
      .catch(() => {})
      .finally(() => alive && setSuggestLoading(false))
    return () => { alive = false }
  }, [messages, id, user.id])

  // Catch me up
  const catchMeUp = async () => {
    setSummary({ open: true, loading: true, text: null, error: null })
    try {
      const r = await api.summary(id)
      setSummary({ open: true, loading: false, text: r.summary, error: r.error })
    } catch (e) {
      setSummary({ open: true, loading: false, text: null, error: 'Could not summarize right now.' })
    }
  }

  const sendText = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    try { addMessage(await api.sendMessage(id, { content: body, type: 'text' })) }
    catch (err) { setText(body) }
  }

  const sendSuggestion = async (s) => {
    setSuggestions([])
    try { addMessage(await api.sendMessage(id, { content: s, type: 'text' })) } catch (e) { /* */ }
  }

  const sendAttachment = async (file, type, extra = {}) => {
    setUploading(true)
    try {
      const meta = await uploadAttachment(id, file)
      addMessage(await api.sendMessage(id, { type, content: MEDIA_LABEL[type], ...meta, ...extra }))
    } catch (err) {
      alert('Upload failed: ' + (err.message || 'unknown error'))
    } finally { setUploading(false) }
  }

  const onPickImage = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    const compressed = await compressImage(f)
    sendAttachment(compressed, 'image')
  }
  const onPickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.type.startsWith('image/')) sendAttachment(await compressImage(f), 'image')
    else sendAttachment(f, 'file')
  }

  // voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        clearInterval(recTimer.current)
        const secs = recSecsRef.current
        setRecording(false); setRecSecs(0)
        if (rec._cancelled) return
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        await sendAttachment(file, 'audio', { duration_ms: secs * 1000 })
      }
      recRef.current = rec
      rec.start()
      setRecording(true); setRecSecs(0); recSecsRef.current = 0
      recTimer.current = setInterval(() => { recSecsRef.current += 1; setRecSecs(recSecsRef.current) }, 1000)
    } catch (err) {
      alert('Microphone access is required to record a voice note.')
    }
  }
  const stopRecording = () => recRef.current?.stop()
  const cancelRecording = () => { if (recRef.current) { recRef.current._cancelled = true; recRef.current.stop() } }

  const callPeer = (video) => other && startCall({ id: other.id, name: other.name || other.username, avatar: other.avatar_url }, video)

  return (
    <div className="conv">
      <header className="conv-header">
        <button className="back-btn" onClick={() => nav('/chats')} aria-label="Back"><ArrowLeft size={22} /></button>
        <Avatar name={other?.name} url={other?.avatar_url} size={42} />
        <div style={{ flex: 1 }}>
          <div className="name">{other?.name || other?.username || '…'}</div>
          <div className="seen">
            {otherTyping
              ? <span className="typing-ind">typing<span className="typing-dots"><i /><i /><i /></span></span>
              : isOnline(other?.id)
                ? <span className="online-text">online</span>
                : fmtSeen(other?.last_seen)}
          </div>
        </div>
        <button className="chev" aria-label="Catch me up" onClick={catchMeUp}><ScrollText size={20} /></button>
        <button className="chev" aria-label="Voice call" disabled={!other} onClick={() => callPeer(false)}><Phone size={20} /></button>
        <button className="chev" aria-label="Video call" disabled={!other} onClick={() => callPeer(true)}><Video size={20} /></button>
      </header>

      {summary.open && (
        <div className="summary-card">
          <div className="summary-head">
            <Sparkles size={14} /> <span>Catch me up</span>
            <button className="summary-close" onClick={() => setSummary((s) => ({ ...s, open: false }))} aria-label="Close"><X size={15} /></button>
          </div>
          {summary.loading ? (
            <div className="summary-body muted"><Loader2 size={14} className="spin" /> Summarizing…</div>
          ) : summary.error ? (
            <div className="summary-body muted">{summary.error}</div>
          ) : (
            <div className="summary-body">{summary.text}</div>
          )}
        </div>
      )}

      <div className="messages" ref={scrollRef}>
        {hasMore && (
          <button className="load-older" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? <Loader2 size={14} className="spin" /> : <ChevronUp size={14} />} Load older messages
          </button>
        )}
        {loading ? (
          <div className="center-screen"><Loader2 className="spin" /></div>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === user.id
            const showDay = i === 0 || dayLabel(m.created_at) !== dayLabel(messages[i - 1].created_at)
            const isMedia = m.type && m.type !== 'text'
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {showDay && <div className="day-sep">{dayLabel(m.created_at)}</div>}
                <div className={`bubble ${mine ? 'mine' : 'theirs'} ${isMedia ? 'has-media' : ''}`}>
                  {isMedia ? <Attachment message={m} /> : m.content}
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

      {recording ? (
        <div className="composer recording">
          <button className="rec-cancel" onClick={cancelRecording} aria-label="Cancel"><X size={20} /></button>
          <div className="rec-status"><span className="rec-dot" /> Recording… {String(Math.floor(recSecs / 60)).padStart(2, '0')}:{String(recSecs % 60).padStart(2, '0')}</div>
          <button className="send-btn" onClick={stopRecording} aria-label="Send voice note"><Send size={20} /></button>
        </div>
      ) : (
        <>
          {(suggestLoading || suggestions.length > 0) && (
            <div className="suggest-bar">
              <Sparkles size={15} className="suggest-spark" />
              {suggestLoading && suggestions.length === 0 ? (
                <span className="suggest-loading">Thinking of replies…</span>
              ) : (
                suggestions.map((s, i) => (
                  <button key={i} type="button" className="suggest-chip" onClick={() => sendSuggestion(s)}>{s}</button>
                ))
              )}
            </div>
          )}
          <form className="composer" onSubmit={sendText}>
            <input ref={imageRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            <input ref={fileRef} type="file" hidden onChange={onPickFile} />
            <button type="button" className="attach-btn" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Attach file">
              {uploading ? <Loader2 size={20} className="spin" /> : <Paperclip size={20} />}
            </button>
            <input placeholder={uploading ? 'Uploading…' : 'Message'} value={text} onChange={onComposerChange} />
            {text.trim() ? (
              <button className="send-btn" aria-label="Send"><Send size={20} /></button>
            ) : (
              <button type="button" className="send-btn" onClick={startRecording} aria-label="Record voice note"><Mic size={20} /></button>
            )}
          </form>
        </>
      )}
      <div className="composer-hint">Images, files, voice notes & calls · AI replies and summaries</div>
    </div>
  )
}
