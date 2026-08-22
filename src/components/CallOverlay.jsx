import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react'
import Avatar from './Avatar'
import { useCall } from '../context/CallContext'

function useTimer(active) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [active])
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function CallOverlay() {
  const { call, acceptCall, rejectCall, endCall, toggleMute, toggleCam, localStream, remoteStream, muted, camOff } = useCall()
  const remoteVideo = useRef(null)
  const localVideo = useRef(null)
  const active = call?.status === 'active'
  const timer = useTimer(active)

  useEffect(() => { if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream || null }, [remoteStream])
  useEffect(() => { if (localVideo.current) localVideo.current.srcObject = localStream || null }, [localStream])

  if (!call) return null
  const { peer, video, status } = call
  const statusText = {
    calling: 'Calling…',
    incoming: video ? 'Incoming video call' : 'Incoming voice call',
    connecting: 'Connecting…',
    active: timer,
  }[status]

  const showRemoteVideo = video && active && remoteStream

  return (
    <div className="call-overlay">
      {/* remote video fills the screen for video calls once connected */}
      {video && (
        <video ref={remoteVideo} className={`call-remote ${showRemoteVideo ? 'on' : ''}`} autoPlay playsInline />
      )}

      {/* avatar view (voice calls, or before video connects) */}
      {!showRemoteVideo && (
        <div className="call-center">
          <Avatar name={peer.name} url={peer.avatar} size={120} />
          <h2 className="call-name">{peer.name}</h2>
          <p className="call-status">{statusText}</p>
        </div>
      )}

      {showRemoteVideo && (
        <div className="call-topbar">
          <span className="call-name-sm">{peer.name}</span>
          <span className="call-timer">{timer}</span>
        </div>
      )}

      {/* local preview (video calls) */}
      {video && localStream && (
        <video ref={localVideo} className="call-local" autoPlay playsInline muted />
      )}

      {/* controls */}
      <div className="call-controls">
        {status === 'incoming' ? (
          <>
            <button className="call-btn decline" onClick={rejectCall} aria-label="Decline"><PhoneOff size={26} /></button>
            <button className="call-btn accept" onClick={acceptCall} aria-label="Accept">
              {video ? <Video size={26} /> : <Phone size={26} />}
            </button>
          </>
        ) : (
          <>
            <button className={`call-btn ctrl ${muted ? 'active' : ''}`} onClick={toggleMute} aria-label="Mute">
              {muted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            {video && (
              <button className={`call-btn ctrl ${camOff ? 'active' : ''}`} onClick={toggleCam} aria-label="Camera">
                {camOff ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            )}
            <button className="call-btn decline" onClick={endCall} aria-label="End call"><PhoneOff size={26} /></button>
          </>
        )}
      </div>
    </div>
  )
}
