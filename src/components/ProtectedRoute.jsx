import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="center-screen"><Loader2 className="spin" /></div>
  if (!session) return <Navigate to="/auth" replace />
  return children
}
