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
  olderMessages: (id, before) => req(`/conversations/${id}/messages?before=${encodeURIComponent(before)}`),
  summary: (id) => req(`/conversations/${id}/summary`),
  startConversation: (otherUser) => req('/conversations', { method: 'POST', body: { other_user: otherUser } }),
  sendMessage: (id, payload) =>
    req(`/conversations/${id}/messages`, {
      method: 'POST',
      body: typeof payload === 'string' ? { content: payload } : payload,
    }),
  markRead: (id) => req(`/conversations/${id}/read`, { method: 'POST' }),
  suggestions: (id) => req(`/conversations/${id}/suggestions`),
  // people & profile
  listPeople: () => req('/people'),
  updateProfile: (data) => req('/profile', { method: 'PUT', body: data }),
}
