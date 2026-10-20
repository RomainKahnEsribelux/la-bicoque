import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authConfigurationError, supabase } from '../lib/supabase'
import { AuthContext } from './AuthContext'

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!authConfigurationError)
  const [error, setError] = useState<string | null>(authConfigurationError)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let authEventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      authEventReceived = true
      setSession(nextSession)
      setError(null)
      setLoading(false)
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return
      setSession(sessionError ? null : data.session)
      setError(sessionError ? 'Impossible de restaurer la session. Rechargez la page pour r\u00e9essayer.' : null)
      setLoading(false)
    }).catch(() => {
      if (!active || authEventReceived) return
      setError('Impossible de restaurer la session. V\u00e9rifiez votre connexion et rechargez la page.')
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={{ session, loading, error }}>{children}</AuthContext.Provider>
}
