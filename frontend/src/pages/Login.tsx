import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { session, loading, error: sessionError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) {
        setError(signInError.code === 'email_not_confirmed'
          ? 'Votre adresse e-mail doit \u00eatre confirm\u00e9e avant la connexion.'
          : signInError.status === 429
            ? 'Trop de tentatives. Patientez avant de r\u00e9essayer.'
            : 'Connexion impossible. V\u00e9rifiez vos identifiants et votre connexion, puis r\u00e9essayez.')
      } else {
        setPassword('')
      }
    } catch {
      setError('Le service de connexion est inaccessible. V\u00e9rifiez votre connexion et r\u00e9essayez.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p role="status" className="rounded-2xl border border-[#5b5d43]/15 bg-white/80 p-6">Chargement de votre session...</p>
  if (sessionError) return <p role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-6 text-red-700">{sessionError}</p>
  if (session) return <Navigate to="/reservation" replace />

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.08)] sm:p-8">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">La bicoque</p>
      <h1 className="mb-4 text-3xl font-semibold">Connexion</h1>
      <p className="mb-6 leading-relaxed text-slate-600">
        Connectez-vous avec le compte fourni par le propri&eacute;taire pour acc&eacute;der aux r&eacute;servations.
      </p>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1 block font-medium">Adresse e-mail</label>
          <input id="email" type="email" autoComplete="username" required maxLength={254}
            value={email} onChange={event => setEmail(event.target.value)} disabled={submitting}
            className="w-full rounded-xl border border-slate-400 bg-white p-3" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block font-medium">Mot de passe</label>
          <input id="password" type="password" autoComplete="current-password" required
            value={password} onChange={event => setPassword(event.target.value)} disabled={submitting}
            className="w-full rounded-xl border border-slate-400 bg-white p-3" />
        </div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button type="submit" disabled={submitting} className="w-full rounded-xl bg-indigo-700 p-3 font-medium text-white shadow-sm hover:bg-indigo-800 disabled:opacity-60">
          {submitting ? 'Connexion en cours...' : 'Se connecter'}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        Pas de compte ou mot de passe oubli&eacute; ? Contactez le propri&eacute;taire.
        {' '}<Link to="/" className="text-indigo-700 underline">Retour &agrave; l&apos;accueil</Link>
      </p>
    </section>
  )
}
