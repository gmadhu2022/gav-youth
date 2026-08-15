import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data || null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      loadProfile(s?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  // Heartbeat: keep last_seen fresh while the tab is open
  useEffect(() => {
    if (!session?.user?.id) return
    const ping = () => supabase.from('profiles')
      .update({ last_seen: new Date().toISOString() }).eq('id', session.user.id)
    ping()
    const t = setInterval(ping, 30000)
    return () => clearInterval(t)
  }, [session?.user?.id])

  const value = {
    session,
    profile,
    loading,
    user: session?.user || null,
    refreshProfile: () => loadProfile(session?.user?.id),

    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),

    signUp: (email, password, name, username) =>
      supabase.auth.signUp({
        email, password,
        options: { data: { name, username } },
      }),

    signInWithGoogle: () =>
      supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/chats' },
      }),

    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
