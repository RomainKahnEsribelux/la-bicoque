import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  loading: boolean
  error: string | null
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth requires AuthProvider')
  return auth
}
