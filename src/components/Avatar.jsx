import { initials } from '../lib/supabase'

export default function Avatar({ name, url, size = 52, className = '' }) {
  return (
    <div className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {url ? <img src={url} alt={name || ''} /> : initials(name)}
    </div>
  )
}
