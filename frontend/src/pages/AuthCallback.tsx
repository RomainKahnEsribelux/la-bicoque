import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type CallbackState =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'unverified' }
  | { status: 'no-session' }
  | { status: 'error'; message: string }

const cardClass = 'mx-auto max-w-md rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.08)] sm:p-8'

function readUrlError(query: URLSearchParams, hash: URLSearchParams) {
  const code = query.get('error_code') ?? hash.get('error_code')
  const error = query.get('error') ?? hash.get('error')
  if (!code && !error) return null
  if (code === 'otp_expired') return 'Ce lien de confirmation a expir\u00e9 ou a d\u00e9j\u00e0 \u00e9t\u00e9 utilis\u00e9. Essayez de vous connecter ; si votre adresse n\u2019est pas confirm\u00e9e, inscrivez-vous \u00e0 nouveau pour recevoir un nouveau lien.'
  if (error === 'access_denied') return 'Le lien de confirmation a \u00e9t\u00e9 refus\u00e9. Il est peut-\u00eatre invalide ou expir\u00e9.'
  return 'La confirmation de votre adresse a \u00e9chou\u00e9. Le lien est peut-\u00eatre invalide ou expir\u00e9.'
}

function clearAuthParamsFromUrl() {
  window.history.replaceState(window.history.state, '', window.location.pathname)
}

export default function AuthCallback() {
  const [state, setState] = useState<CallbackState>(() => supabase
    ? { status: 'loading' }
    : { status: 'error', message: 'Connexion indisponible : Supabase n\u2019est pas configur\u00e9.' })
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const client = supabase
    if (!client) return
    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

    async function run() {
      const urlError = readUrlError(query, hash)
      if (urlError) {
        clearAuthParamsFromUrl()
        return setState({ status: 'error', message: urlError })
      }
      // Implicit flow: the client detects tokens in the URL hash during initialisation; getSession waits for it.
      let { data, error } = await client!.auth.getSession()
      if (error) {
        clearAuthParamsFromUrl()
        return setState({ status: 'error', message: 'Impossible de valider votre session depuis ce lien. Essayez de vous connecter.' })
      }
      const code = query.get('code')
      if (!data.session && code) {
        const exchange = await client!.auth.exchangeCodeForSession(code)
        if (exchange.error) {
          clearAuthParamsFromUrl()
          return setState({ status: 'error', message: 'Ce lien de confirmation est invalide, expir\u00e9 ou a \u00e9t\u00e9 ouvert dans un autre navigateur. Votre adresse est peut-\u00eatre d\u00e9j\u00e0 confirm\u00e9e : essayez de vous connecter.' })
        }
        ;({ data, error } = await client!.auth.getSession())
      }
      clearAuthParamsFromUrl()
      const session = error ? null : data.session
      if (!session) return setState({ status: 'no-session' })
      setState({ status: session.user.email_confirmed_at ? 'success' : 'unverified' })
    }

    run().catch(() => {
      clearAuthParamsFromUrl()
      setState({ status: 'error', message: 'Le service de connexion est inaccessible. V\u00e9rifiez votre connexion et r\u00e9essayez.' })
    })
  }, [])

  if (state.status === 'success') return <Navigate to="/profil" replace />
  if (state.status === 'loading') {
    return <p role="status" className="rounded-2xl border border-[#5b5d43]/15 bg-white/80 p-6">Validation de votre adresse e-mail...</p>
  }

  return (
    <section className={cardClass}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">La bicoque</p>
      <h1 className="mb-4 text-3xl font-semibold">Confirmation de l&apos;adresse</h1>
      {state.status === 'error' && <p role="alert" className="mb-4 text-red-700">{state.message}</p>}
      {state.status === 'unverified' && (
        <p role="alert" className="mb-4 text-red-700">Votre adresse e-mail n&apos;est pas encore confirm&eacute;e. Ouvrez le lien re&ccedil;u par e-mail.</p>
      )}
      {state.status === 'no-session' && (
        <p role="status" className="mb-4 leading-relaxed text-slate-600">
          Aucune session active n&apos;a &eacute;t&eacute; trouv&eacute;e. Si vous venez de confirmer votre adresse, connectez-vous pour continuer.
        </p>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/connexion" className="rounded-xl bg-indigo-700 px-5 py-3 font-medium text-white shadow-sm hover:bg-indigo-800">Se connecter</Link>
        <Link to="/" className="self-center text-indigo-700 underline">Retour &agrave; l&apos;accueil</Link>
      </div>
    </section>
  )
}
