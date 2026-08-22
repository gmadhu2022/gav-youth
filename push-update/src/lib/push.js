import { supabase } from './supabase'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
}

export async function pushEnabled() {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return !!sub && Notification.permission === 'granted'
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Notifications are not supported in this browser.')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notification permission was blocked.')

  const { key } = await fetch(`${BASE}/push/key`).then((r) => r.json())
  if (!key) throw new Error('Push is not configured on the server yet.')

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })
  await fetch(`${BASE}/push/subscribe`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify(sub),
  })
  return true
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await fetch(`${BASE}/push/unsubscribe`, {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {})
    await sub.unsubscribe()
  }
  return true
}
