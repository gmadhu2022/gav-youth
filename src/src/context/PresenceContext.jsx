import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const PresenceContext = createContext(null)
export const usePresence = () => useContext(PresenceContext)

export function PresenceProvider({ children }) {
  const { user } = useAuth()
  const [online, setOnline] = useState(new Set())
  const chRef = useRef(null)

  useEffect(() => {
    if (!user?.id) { setOnline(new Set()); return }
    const ch = supabase.channel('online-users', { config: { presence: { key: user.id } } })
    ch.on('presence', { event: 'sync' }, () => {
      setOnline(new Set(Object.keys(ch.presenceState())))
    })
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ online_at: Date.now() })
    })
    chRef.current = ch
    return () => { supabase.removeChannel(ch); chRef.current = null; setOnline(new Set()) }
  }, [user?.id])

  const isOnline = (id) => !!id && online.has(id)
  return <PresenceContext.Provider value={{ isOnline, online }}>{children}</PresenceContext.Provider>
}
