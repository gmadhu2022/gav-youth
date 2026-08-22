import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import CallOverlay from '../components/CallOverlay'

const CallContext = createContext(null)
export const useCall = () => useContext(CallContext)

// STUN is free and works on most networks. For reliable calls across mobile /
// corporate NATs, add a TURN server via env vars (see .env.example).
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
if (import.meta.env.VITE_TURN_URL) {
  iceServers.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  })
}

export function CallProvider({ children }) {
  const { user, profile } = useAuth()

  const [call, setCall] = useState(null)         // { status, callId, peer:{id,name,avatar}, video, isCaller }
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted, setMuted] = useState(false)
  const [camOff, setCamOff] = useState(false)

  const callRef = useRef(null)
  const pcRef = useRef(null)
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const candQueue = useRef([])
  const pendingOffer = useRef(null)
  const senders = useRef(new Map())
  const meRef = useRef({ id: null, name: '', avatar: null })

  useEffect(() => {
    meRef.current = { id: user?.id, name: profile?.name || profile?.username || 'Someone', avatar: profile?.avatar_url }
  }, [user?.id, profile])

  const applyCall = (next) => {
    callRef.current = typeof next === 'function' ? next(callRef.current) : next
    setCall(callRef.current)
  }

  // -- send a signal to another user's personal channel --
  const senderChannel = useCallback(async (topic) => {
    if (senders.current.has(topic)) return senders.current.get(topic)
    const ch = supabase.channel(topic, { config: { broadcast: { self: false } } })
    await new Promise((res) => ch.subscribe((s) => s === 'SUBSCRIBED' && res()))
    senders.current.set(topic, ch)
    return ch
  }, [])

  const sendSignal = useCallback(async (toUserId, payload) => {
    const ch = await senderChannel(`calls:${toUserId}`)
    ch.send({ type: 'broadcast', event: 'signal', payload: { ...payload, from: meRef.current.id } })
  }, [senderChannel])

  // -- teardown --
  const cleanup = useCallback(() => {
    if (pcRef.current) { try { pcRef.current.close() } catch { /* */ } pcRef.current = null }
    if (localRef.current) { localRef.current.getTracks().forEach((t) => t.stop()); localRef.current = null }
    remoteRef.current = null
    candQueue.current = []
    pendingOffer.current = null
    setLocalStream(null); setRemoteStream(null)
    setMuted(false); setCamOff(false)
    applyCall(null)
  }, [])

  const drainCandidates = async () => {
    const pc = pcRef.current
    if (!pc) return
    for (const c of candQueue.current) { try { await pc.addIceCandidate(c) } catch { /* */ } }
    candQueue.current = []
  }

  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers })
    pc.onicecandidate = (e) => {
      const c = callRef.current
      if (e.candidate && c) sendSignal(c.peer.id, { type: 'ice', callId: c.callId, candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      let rs = remoteRef.current
      if (!rs) { rs = new MediaStream(); remoteRef.current = rs; setRemoteStream(rs) }
      if (!rs.getTracks().some((t) => t.id === e.track.id)) rs.addTrack(e.track)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') applyCall((c) => (c ? { ...c, status: 'active' } : c))
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        if (callRef.current) cleanup()
      }
    }
    pcRef.current = pc
    return pc
  }, [sendSignal, cleanup])

  // -- caller starts a call --
  const startCall = useCallback(async (peer, video) => {
    if (callRef.current) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
      localRef.current = stream; setLocalStream(stream)
      const callId = crypto.randomUUID()
      applyCall({ status: 'calling', callId, peer, video, isCaller: true })
      const pc = createPeer()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await sendSignal(peer.id, {
        type: 'offer', callId, sdp: offer, video,
        fromName: meRef.current.name, fromAvatar: meRef.current.avatar,
      })
    } catch (err) {
      alert('Could not access camera/microphone: ' + (err.message || err))
      cleanup()
    }
  }, [createPeer, sendSignal, cleanup])

  // -- callee accepts --
  const acceptCall = useCallback(async () => {
    const c = callRef.current
    if (!c || c.status !== 'incoming') return
    try {
      applyCall((p) => ({ ...p, status: 'connecting' }))
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: c.video })
      localRef.current = stream; setLocalStream(stream)
      const pc = createPeer()
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer.current))
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      await drainCandidates()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendSignal(c.peer.id, { type: 'answer', callId: c.callId, sdp: answer })
    } catch (err) {
      alert('Could not access camera/microphone: ' + (err.message || err))
      sendSignal(c.peer.id, { type: 'hangup', callId: c.callId })
      cleanup()
    }
  }, [createPeer, sendSignal, cleanup])

  const rejectCall = useCallback(() => {
    const c = callRef.current
    if (c) sendSignal(c.peer.id, { type: 'reject', callId: c.callId })
    cleanup()
  }, [sendSignal, cleanup])

  const endCall = useCallback(() => {
    const c = callRef.current
    if (c) sendSignal(c.peer.id, { type: 'hangup', callId: c.callId })
    cleanup()
  }, [sendSignal, cleanup])

  const toggleMute = useCallback(() => {
    const s = localRef.current; if (!s) return
    s.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
    setMuted((m) => !m)
  }, [])

  const toggleCam = useCallback(() => {
    const s = localRef.current; if (!s) return
    s.getVideoTracks().forEach((t) => { t.enabled = !t.enabled })
    setCamOff((v) => !v)
  }, [])

  // -- incoming signals on my personal channel --
  const handleSignal = useCallback(async (payload) => {
    const c = callRef.current
    switch (payload.type) {
      case 'offer':
        if (c) { sendSignal(payload.from, { type: 'reject', callId: payload.callId, reason: 'busy' }); return }
        pendingOffer.current = payload.sdp
        applyCall({
          status: 'incoming', callId: payload.callId, video: payload.video, isCaller: false,
          peer: { id: payload.from, name: payload.fromName, avatar: payload.fromAvatar },
        })
        break
      case 'answer':
        if (pcRef.current && callRef.current?.callId === payload.callId) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          await drainCandidates()
        }
        break
      case 'ice':
        if (callRef.current?.callId !== payload.callId) break
        if (pcRef.current?.remoteDescription) { try { await pcRef.current.addIceCandidate(payload.candidate) } catch { /* */ } }
        else candQueue.current.push(payload.candidate)
        break
      case 'reject':
      case 'hangup':
      case 'cancel':
        if (callRef.current?.callId === payload.callId) cleanup()
        break
      default: break
    }
  }, [sendSignal, cleanup])

  const handlerRef = useRef(handleSignal)
  useEffect(() => { handlerRef.current = handleSignal }, [handleSignal])

  useEffect(() => {
    if (!user?.id) return
    const ch = supabase.channel(`calls:${user.id}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'signal' }, ({ payload }) => handlerRef.current(payload))
    ch.subscribe()
    return () => {
      supabase.removeChannel(ch)
      senders.current.forEach((c) => supabase.removeChannel(c))
      senders.current.clear()
      cleanup()
    }
  }, [user?.id, cleanup])

  const value = { call, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleCam, localStream, remoteStream, muted, camOff }

  return (
    <CallContext.Provider value={value}>
      {children}
      {call && <CallOverlay />}
    </CallContext.Provider>
  )
}
