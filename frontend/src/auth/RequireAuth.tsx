import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { getMyProfile, isProfileComplete } from '../lib/profiles'
import { canManageBookings } from '../lib/management'

const statusClass = 'rounded-2xl border border-[#5b5d43]/15 bg-white/80 p-6'
const alertClass = 'rounded-2xl border border-red-300 bg-red-50 p-6 text-red-700'

export const PROFILE_PATH = '/profil'

export default function RequireAuth() {
  const { session, loading, error } = useAuth()
  if (loading) return <p role="status" className={statusClass}>Chargement de votre session...</p>
  if (error) return <p role="alert" className={alertClass}>{error}</p>
  if (!session) return <Navigate to="/connexion" replace />
  if (!session.user.email_confirmed_at) {
    return (
      <p role="alert" className={alertClass}>
        Votre adresse e-mail n&apos;est pas encore confirm&eacute;e. Ouvrez le lien re&ccedil;u par e-mail, puis reconnectez-vous.
      </p>
    )
  }
  return <Outlet />
}

/**
 * Place inside <RequireAuth />. Redirects to /profil until the member profile is complete.
 * With allowOwner, booking managers may pass with an incomplete profile (bootstrap admin on /gestion).
 * Owner pages must still enforce rights server-side; this only skips the profile redirect.
 */
export function ProfileRequired({ allowOwner = false }: { allowOwner?: boolean }) {
  const { session } = useAuth()
  const location = useLocation()
  const userId = session?.user.id
  const onProfilePage = location.pathname === PROFILE_PATH
  const [state, setState] = useState<{ userId: string; complete: boolean } | { userId: string; error: string } | null>(null)

  useEffect(() => {
    if (!userId || onProfilePage) return
    let active = true
    getMyProfile(userId)
      .then(async profile => {
        const complete = isProfileComplete(profile) || (allowOwner && await canManageBookings())
        if (active) setState({ userId, complete })
      })
      .catch((err: unknown) => {
        if (active) setState({ userId, error: err instanceof Error ? err.message : 'Impossible de v\u00e9rifier votre profil.' })
      })
    return () => { active = false }
  }, [userId, onProfilePage, allowOwner, location.pathname])

  if (onProfilePage) return <Outlet />
  if (!userId) return <Navigate to="/connexion" replace />
  if (!state || state.userId !== userId) return <p role="status" className={statusClass}>V&eacute;rification de votre profil...</p>
  if ('error' in state) return <p role="alert" className={alertClass}>{state.error}</p>
  if (!state.complete) return <Navigate to={PROFILE_PATH} replace state={{ from: location.pathname }} />
  return <Outlet />
}
