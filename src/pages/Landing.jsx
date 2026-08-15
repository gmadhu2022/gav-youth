import { Link, Navigate } from 'react-router-dom'
import { MessageSquareHeart, Sparkles, PhoneCall, ArrowRight } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'

const features = [
  { Icon: MessageSquareHeart, title: 'Real-time chats', desc: 'Messages land instantly with read states.' },
  { Icon: Sparkles, title: 'Your identity', desc: 'Username, avatar, bio and status message.' },
  { Icon: PhoneCall, title: 'Built to grow', desc: 'Groups, status and calling come next.' },
]

export default function Landing() {
  const { session, loading } = useAuth()
  if (!loading && session) return <Navigate to="/chats" replace />

  return (
    <div className="landing">
      <div className="landing-inner">
        <Logo size={112} />
        <h1 className="hero-title brand-text">GAV YOUTH</h1>
        <p className="hero-sub">Connect. Chat. Share.</p>

        {features.map(({ Icon, title, desc }) => (
          <div className="feature" key={title}>
            <div className="feature-ico"><Icon size={22} /></div>
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          </div>
        ))}

        <Link to="/auth" className="btn-grad" style={{ textDecoration: 'none', marginTop: 12 }}>
          Get Started <ArrowRight size={18} />
        </Link>

        <p className="signin-line">
          Already with us? <Link to="/auth">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
