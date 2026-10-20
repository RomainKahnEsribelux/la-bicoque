import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function RequireAuth() {
  const { session, loading, error } = useAuth()
  if (loading) return <p role="status">Chargement de votre session...</p>
  if (error) return <p role="alert" className="text-red-700">{error}</p>
  if (!session) return <Navigate to="/connexion" replace />
  return <Outlet />
}
