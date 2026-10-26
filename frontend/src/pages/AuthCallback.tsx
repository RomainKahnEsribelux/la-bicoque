import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { resolveAuthLink } from '../lib/authFlow'

export default function AuthCallback() {
  const [destination, setDestination] = useState<'password' | 'profile' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const validation = useRef<ReturnType<typeof resolveAuthLink> | null>(null)
  useEffect(() => {
    let active = true
    if (!validation.current) {
      validation.current = (supabase
        ? resolveAuthLink(supabase, window.location.href)
        : Promise.reject(new Error('Service de connexion indisponible.')))
        .finally(() => window.history.replaceState(window.history.state, '', window.location.pathname))
    }
    void validation.current.then(result => { if (active) setDestination(result) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Validation du lien impossible.') })
    return () => { active = false }
  }, [])
  if (destination) return <Navigate to={destination === 'password' ? '/nouveau-mot-de-passe' : '/profil'} replace />
  return <section className="mx-auto max-w-md rounded-2xl bg-white/85 p-6">
    <h1 className="mb-4 text-3xl font-semibold">Validation du lien de connexion</h1>
    {error ? <p role="alert" className="text-red-800">{error}</p> : <p role="status">Vérification de la session...</p>}
    <Link className="mt-5 inline-block underline" to="/connexion">Retour à la connexion</Link>
  </section>
}
