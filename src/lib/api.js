import { supabase } from './supabase'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function req(path, { method = 'GET', body } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.detail || res.statusText)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  // conversations
  listConversations: () => req('/conversations'),
  getConversation: (id) => req(`/conversations/${id}`),
  startConversation: (otherUser) => req('/conversations', { method: 'POST', body: { other_user: otherUser } }),
  sendMessage: (id, content) => req(`/conversations/${id}/messages`, { method: 'POST', body: { content } }),
  markRead: (id) => req(`/conversations/${id}/read`, { method: 'POST' }),
  // people & profile
  listPeople: () => req('/people'),
  updateProfile: (data) => req('/profile', { method: 'PUT', body: data }),
}
