import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { BRANCHES, NAME_MAX_LENGTH, isBranch } from '../lib/profiles'
import type { Branch } from '../lib/profiles'

const PASSWORD_MIN_LENGTH = 8
const inputClass = 'w-full rounded-xl border border-slate-400 bg-white p-3'
const cardClass = 'mx-auto max-w-md rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.08)] sm:p-8'

function getSignupErrorMessage(error: { code?: string; status?: number }) {
  switch (error.code) {
    case 'weak_password': return `Mot de passe trop faible : utilisez au moins ${PASSWORD_MIN_LENGTH} caract\u00e8res, en m\u00e9langeant lettres et chiffres.`
    case 'email_address_invalid': return 'Cette adresse e-mail n\u2019est pas accept\u00e9e. V\u00e9rifiez-la.'
    case 'signup_disabled':
    case 'email_provider_disabled': return 'Les inscriptions sont actuellement d\u00e9sactiv\u00e9es. Contactez le propri\u00e9taire.'
    case 'over_email_send_rate_limit': return 'Trop d\u2019e-mails envoy\u00e9s. Patientez quelques minutes avant de r\u00e9essayer.'
    case 'user_already_exists':
    case 'email_exists': return 'Un compte existe d\u00e9j\u00e0 pour cette adresse. Connectez-vous.'
  }
  if (error.status === 429) return 'Trop de tentatives. Patientez avant de r\u00e9essayer.'
  return 'Inscription impossible. V\u00e9rifiez les informations saisies et votre connexion, puis r\u00e9essayez.'
}

export default function Signup() {
  const { session, error: authError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [branch, setBranch] = useState<Branch | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<'verify' | 'session' | null>(null)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || submitting) return
    const first = firstName.trim()
    const last = lastName.trim()
    if (!first || !last) return setError('Indiquez votre pr\u00e9nom et votre nom.')
    if (!isBranch(branch)) return setError('Choisissez votre branche.')
    if (password.length < PASSWORD_MIN_LENGTH) return setError(`Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caract\u00e8res.`)
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { first_name: first, last_name: last, branch },
        },
      })
      if (signUpError) {
        setError(getSignupErrorMessage(signUpError))
      } else {
        setPassword('')
        setResult(data.session ? 'session' : 'verify')
      }
    } catch {
      setError('Le service d\u2019inscription est inaccessible. V\u00e9rifiez votre connexion et r\u00e9essayez.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <section className={cardClass} aria-live="polite">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">La bicoque</p>
        <h1 className="mb-4 text-3xl font-semibold">{result === 'verify' ? 'V\u00e9rifiez vos e-mails' : 'Compte cr\u00e9\u00e9'}</h1>
        {result === 'verify' ? (
          <div className="space-y-3 leading-relaxed text-slate-600">
            <p>
              Si l&apos;adresse <strong>{email.trim()}</strong> peut &ecirc;tre inscrite, un e-mail de confirmation vient d&apos;y &ecirc;tre envoy&eacute;.
              Ouvrez le lien qu&apos;il contient pour activer votre compte.
            </p>
            <p>
              Une fois l&apos;adresse confirm&eacute;e, vous pourrez v&eacute;rifier et compl&eacute;ter votre profil (pr&eacute;nom, nom et branche) sur la page profil.
            </p>
            <p className="text-sm">Rien re&ccedil;u ? V&eacute;rifiez vos courriers ind&eacute;sirables, ou patientez quelques minutes avant de r&eacute;essayer.</p>
          </div>
        ) : (
          <div className="space-y-4 leading-relaxed text-slate-600">
            <p>Votre compte est cr&eacute;&eacute; et vous &ecirc;tes connect&eacute;. Compl&eacute;tez maintenant votre profil.</p>
            <Link to="/profil" className="inline-block rounded-xl bg-indigo-700 px-5 py-3 font-medium text-white shadow-sm hover:bg-indigo-800">Compl&eacute;ter mon profil</Link>
          </div>
        )}
        <p className="mt-6 text-sm text-slate-600">
          <Link to="/connexion" className="text-indigo-700 underline">Aller &agrave; la connexion</Link>
        </p>
      </section>
    )
  }

  return (
    <section className={cardClass}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">La bicoque</p>
      <h1 className="mb-4 text-3xl font-semibold">Cr&eacute;er un compte</h1>
      <p className="mb-6 leading-relaxed text-slate-600">
        Inscrivez-vous pour demander une r&eacute;servation. Un e-mail de confirmation vous sera envoy&eacute;.
      </p>
      {authError && <p role="alert" className="mb-6 text-red-700">{authError}</p>}
      {session && (
        <p role="status" className="mb-6 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">
          Vous &ecirc;tes d&eacute;j&agrave; connect&eacute;. <Link to="/profil" className="underline">Voir mon profil</Link>
        </p>
      )}
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="signup-first-name" className="mb-1 block font-medium">Pr&eacute;nom</label>
            <input id="signup-first-name" autoComplete="given-name" required maxLength={NAME_MAX_LENGTH}
              value={firstName} onChange={event => setFirstName(event.target.value)} disabled={submitting} className={inputClass} />
          </div>
          <div>
            <label htmlFor="signup-last-name" className="mb-1 block font-medium">Nom</label>
            <input id="signup-last-name" autoComplete="family-name" required maxLength={NAME_MAX_LENGTH}
              value={lastName} onChange={event => setLastName(event.target.value)} disabled={submitting} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="signup-branch" className="mb-1 block font-medium">Branche</label>
          <select id="signup-branch" required value={branch} disabled={submitting} className={inputClass}
            onChange={event => setBranch(isBranch(event.target.value) ? event.target.value : '')}>
            <option value="" disabled>Choisissez votre branche</option>
            {BRANCHES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <p className="mt-1 text-sm text-slate-500">Apr&egrave;s l&apos;enregistrement du profil, seul le propri&eacute;taire pourra la modifier.</p>
        </div>
        <div>
          <label htmlFor="signup-email" className="mb-1 block font-medium">Adresse e-mail</label>
          <input id="signup-email" type="email" autoComplete="email" required maxLength={254}
            value={email} onChange={event => setEmail(event.target.value)} disabled={submitting} className={inputClass} />
        </div>
        <div>
          <label htmlFor="signup-password" className="mb-1 block font-medium">Mot de passe</label>
          <input id="signup-password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN_LENGTH} maxLength={72}
            value={password} onChange={event => setPassword(event.target.value)} disabled={submitting} className={inputClass}
            aria-describedby="signup-password-help" />
          <p id="signup-password-help" className="mt-1 text-sm text-slate-500">Au moins {PASSWORD_MIN_LENGTH} caract&egrave;res.</p>
        </div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button type="submit" disabled={submitting || !supabase} className="w-full rounded-xl bg-indigo-700 p-3 font-medium text-white shadow-sm hover:bg-indigo-800 disabled:opacity-60">
          {submitting ? 'Inscription en cours...' : 'Cr\u00e9er mon compte'}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        D&eacute;j&agrave; inscrit ? <Link to="/connexion" className="text-indigo-700 underline">Se connecter</Link>
      </p>
    </section>
  )
}
