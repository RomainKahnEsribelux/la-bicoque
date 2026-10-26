import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { ContentPage } from '../components/ContentPage'
import { supabase } from '../lib/supabase'
import { authEmailsEnabled, authEmailUnavailable } from '../lib/authEmails'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authEmailsEnabled || busy) return
    setBusy(true); setError(null)
    try {
      if (!supabase) throw new Error('Service de connexion indisponible.')
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/nouveau-mot-de-passe`,
      })
      if (requestError) throw new Error(requestError.status === 429
        ? 'Trop de demandes. Patiente avant de réessayer.'
        : 'La demande de récupération a échoué. Réessaie ou contacte un administrateur.')
      setSent(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Service inaccessible.') }
    finally { setBusy(false) }
  }
  return <ContentPage title="Mot de passe oublié" intro="Demande un lien pour choisir un nouveau mot de passe.">
    {!authEmailsEnabled && <p role="status" className="mb-4 rounded bg-amber-50 p-4">{authEmailUnavailable}</p>}
    {error && <p role="alert" className="mb-4 text-red-800">{error}</p>}
    {sent ? <p role="status">Si un compte correspond à cette adresse, tu recevras un lien de récupération. Vérifie aussi les courriers indésirables.</p>
      : <form onSubmit={submit} className="max-w-md space-y-4">
        <label className="block">Adresse e-mail
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded border p-3" />
        </label>
        <button disabled={!authEmailsEnabled || busy} className="rounded bg-indigo-700 px-4 py-3 text-white disabled:opacity-50">Demander un lien</button>
      </form>}
    <Link className="mt-5 inline-block underline" to="/connexion">Retour à la connexion</Link>
  </ContentPage>
}
