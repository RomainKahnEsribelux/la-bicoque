import { Link, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import FamilyBanner from './FamilyBanner'
import { isSiteOwner } from '../lib/bookings'
import { useEffect } from 'react'

export default function Layout() {
  const { session, loading, error: authError } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [year] = useState(() => new Date().getFullYear())
  const [ownerId, setOwnerId] = useState<string | null>(null)
  useEffect(() => {
    if (!session?.user.email_confirmed_at) return
    let active = true
    const userId = session.user.id
    void isSiteOwner().then(owner => { if (active) setOwnerId(owner ? userId : null) })
      .catch(() => { if (active) setError('Impossible de vérifier les droits de gestion. Réessaie en rechargeant la page.') })
    return () => { active = false }
  }, [session?.user.id, session?.user.email_confirmed_at])

  async function signOut() {
    if (!supabase || signingOut) return
    setSigningOut(true)
    setError(null)
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) setError('D\u00e9connexion impossible. Veuillez r\u00e9essayer.')
    } catch {
      setError('Le service est inaccessible. Veuillez r\u00e9essayer la d\u00e9connexion.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col text-slate-800">
      <header className="site-header">
        <nav aria-label="Navigation principale" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="site-brand text-2xl font-bold">La bicoque</Link>
          <div className="flex flex-wrap items-center gap-4 sm:gap-7">
            <Link to="/" className="site-nav-link">Accueil</Link>
            <Link to="/a-propos" className="site-nav-link">La maison</Link>
            <Link to="/reservation" className="site-nav-link">Réservation</Link>
            <Link to="/contact" className="site-nav-link">Contact</Link>
            {!loading && !authError && (session
              ? <>
                  <Link to="/histoires" className="site-nav-link">Histoires</Link>
                  <Link to="/documents" className="site-nav-link">Documents</Link>
                  <Link to="/profil" className="site-nav-link">Mon profil</Link>
                  {ownerId === session.user.id && <Link to="/gestion" className="site-nav-link">Gestion</Link>}
                  <button type="button" onClick={signOut} disabled={signingOut} className="site-nav-link disabled:opacity-60">
                    {signingOut ? 'D\u00e9connexion...' : 'Se d\u00e9connecter'}
                  </button>
                </>
              : <><Link to="/connexion" className="site-nav-link">Connexion</Link>
                  <Link to="/inscription" className="site-nav-link">Créer un compte</Link></>)}
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
        {authError && <p role="status" className="mb-4 text-red-700">Le service de connexion est indisponible.</p>}
        <FamilyBanner />
        <Outlet />
      </main>
      <footer className="border-t border-[#5b5d43]/15 px-4 py-5 text-center text-sm text-slate-500">
        La bicoque <span aria-hidden="true">·</span> © {year}
        <p className="mt-1">Société des Bicoquins · Stavelot, Belgique</p>
      </footer>
    </div>
  )
}
