import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import { ContentPage } from '../components/ContentPage'
import { supabase } from '../lib/supabase'
import { passwordError, resolveAuthLink } from '../lib/authFlow'

export default function ResetPassword() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validation = useRef<Promise<void> | null>(null)
  useEffect(() => {
    let active = true
    async function validate() {
      if (!supabase) throw new Error('Service de connexion indisponible.')
      await resolveAuthLink(supabase, window.location.href, true)
    }
    validation.current ??= validate().finally(() => window.history.replaceState(window.history.state, '', window.location.pathname))
    void validation.current.then(() => { if (active) setReady(true) })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Validation impossible.') })
    return () => { active = false }
  }, [])
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!ready || !supabase || busy) return
    const validationError = passwordError(password, confirmation)
    if (validationError) return setError(validationError)
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw new Error('Modification refusée. Le lien a peut-être expiré ; reconnecte-toi ou demande un nouveau lien.')
      setPassword(''); setConfirmation(''); setDone(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Modification impossible.') }
    finally { setBusy(false) }
  }
  return <ContentPage title="Choisir mon mot de passe" intro="La modification nécessite une session validée par Supabase.">
    {error && <p role="alert" className="mb-4 text-red-800">{error}</p>}
    {done ? <p role="status">Ton mot de passe a été modifié.</p> : ready ? <form onSubmit={submit} className="max-w-md space-y-4">
      <label className="block">Nouveau mot de passe<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 block w-full rounded border p-3" /></label>
      <label className="block">Confirmer le mot de passe<input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 block w-full rounded border p-3" /></label>
      <button disabled={busy} className="rounded bg-indigo-700 px-4 py-3 text-white disabled:opacity-50">Enregistrer mon mot de passe</button>
    </form> : !error && <p role="status">Vérification du lien...</p>}
    <div className="mt-5 flex gap-5"><Link className="underline" to="/connexion">Connexion</Link><Link className="underline" to="/mot-de-passe-oublie">Demander un nouveau lien</Link></div>
  </ContentPage>
}
