import { supabase } from './supabase'

const BUCKET = 'attachments'

// Upload a file to {conversationId}/{uuid}-{name}; returns attachment metadata.
export async function uploadAttachment(conversationId, file, filename) {
  const name = filename || file.name || 'file'
  const safe = name.replace(/[^\w.\-]/g, '_')
  const path = `${conversationId}/${crypto.randomUUID()}-${safe}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error
  return {
    attachment_path: path,
    attachment_name: name,
    attachment_size: file.size,
    attachment_mime: file.type || 'application/octet-stream',
  }
}

// Signed URLs for a private bucket, cached ~55 min.
const cache = new Map()
export async function signedUrl(path) {
  if (!path) return null
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return null
  cache.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 })
  return data.signedUrl
}
