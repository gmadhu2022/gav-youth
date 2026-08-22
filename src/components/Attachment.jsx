import { useEffect, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { signedUrl } from '../lib/storage'

function fmtSize(b) {
  if (!b) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0, n = b
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i > 0 && n < 10 ? 1 : 0)} ${u[i]}`
}

export default function Attachment({ message }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let alive = true
    signedUrl(message.attachment_path).then((u) => alive && setUrl(u))
    return () => { alive = false }
  }, [message.attachment_path])

  if (message.type === 'image') {
    return url
      ? <a href={url} target="_blank" rel="noreferrer"><img className="att-image" src={url} alt={message.attachment_name || ''} /></a>
      : <div className="att-loading">Loading image…</div>
  }

  if (message.type === 'audio') {
    return url
      ? <audio className="att-audio" controls src={url} />
      : <div className="att-loading">Loading voice note…</div>
  }

  // generic file
  return (
    <a className="att-file" href={url || '#'} target="_blank" rel="noreferrer" download={message.attachment_name}>
      <FileText size={22} />
      <div className="att-file-meta">
        <span className="att-file-name">{message.attachment_name || 'File'}</span>
        <span className="att-file-size">{fmtSize(message.attachment_size)}</span>
      </div>
      <Download size={18} />
    </a>
  )
}
