import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  BRANCHES, NAME_MAX_LENGTH, getBranchLabel, getMyProfile, isBranch, isProfileComplete, saveMyProfile,
} from '../lib/profiles'
import type { Branch, MemberProfile } from '../lib/profiles'

const inputClass = 'w-full rounded-xl border border-slate-400 bg-white p-3 disabled:bg-slate-100'
const cardClass = 'mx-auto max-w-md rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.08)] sm:p-8'
const statusClass = 'rounded-2xl border border-[#5b5d43]/15 bg-white/80 p-6'
const alertClass = 'rounded-2xl border border-red-300 bg-red-50 p-6 text-red-700'

function metadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === 'string' ? value.trim().slice(0, NAME_MAX_LENGTH) : ''
}

export default function Profile() {
  const { session, loading: authLoading, error: authError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const userId = session?.user.id
  const verified = !!session?.user.email_confirmed_at
  const [loaded, setLoaded] = useState<{ userId: string; profile: MemberProfile | null } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [branch, setBranch] = useState<Branch | ''>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!userId || !verified) return
    let active = true
    const metadata = session?.user.user_metadata
    getMyProfile(userId).then(profile => {
      if (!active) return
      setLoadError(null)
      setLoaded({ userId, profile })
      // Signup metadata only pre-fills the form; the database is the source of truth.
      setFirstName(profile?.first_name ?? metadataString(metadata, 'first_name'))
      setLastName(profile?.last_name ?? metadataString(metadata, 'last_name'))
      const metaBranch = metadata?.branch
      setBranch(profile?.branch ?? (isBranch(metaBranch) ? metaBranch : ''))
    }).catch((err: unknown) => {
      if (active) setLoadError(err instanceof Error ? err.message : 'Impossible de charger votre profil.')
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, verified, reloadKey])

  const profile = loaded && loaded.userId === userId ? loaded.profile : null
  const branchLocked = isBranch(profile?.branch)
  const wasComplete = isProfileComplete(profile)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !userId) return
    const effectiveBranch = branchLocked ? profile!.branch! : branch
    if (!isBranch(effectiveBranch)) return setError('Choisissez votre branche.')
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveMyProfile({ firstName, lastName, branch: effectiveBranch })
      const fresh = await getMyProfile(userId)
      setLoaded({ userId, profile: fresh })
      setSaved(true)
      const from = (location.state as { from?: unknown } | null)?.from
      if (!wasComplete && isProfileComplete(fresh) && typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && from !== '/profil') {
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible. R\u00e9essayez.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) return <p role="status" className={statusClass}>Chargement de votre session...</p>
  if (authError) return <p role="alert" className={alertClass}>{authError}</p>
  if (!session) {
    return (
      <section className={cardClass}>
        <h1 className="mb-4 text-3xl font-semibold">Mon profil</h1>
        <p className="mb-6 text-slate-600">Connectez-vous pour acc&eacute;der &agrave; votre profil.</p>
        <Link to="/connexion" className="rounded-xl bg-indigo-700 px-5 py-3 font-medium text-white shadow-sm hover:bg-indigo-800">Se connecter</Link>
      </section>
    )
  }
  if (!verified) {
    return <p role="alert" className={alertClass}>Votre adresse e-mail doit &ecirc;tre confirm&eacute;e avant de compl&eacute;ter votre profil. Ouvrez le lien re&ccedil;u par e-mail.</p>
  }
  if (loadError) {
    return (
      <div role="alert" className={alertClass}>
        <p className="mb-3">{loadError}</p>
        <button type="button" onClick={() => { setLoadError(null); setReloadKey(key => key + 1) }} className="underline">R&eacute;essayer</button>
      </div>
    )
  }
  if (loaded?.userId !== userId) return <p role="status" className={statusClass}>Chargement de votre profil...</p>

  return (
    <section className={cardClass}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">La bicoque</p>
      <h1 className="mb-4 text-3xl font-semibold">Mon profil</h1>
      <p className="mb-6 leading-relaxed text-slate-600">
        {wasComplete
          ? 'Vous pouvez mettre \u00e0 jour votre pr\u00e9nom et votre nom.'
          : 'Compl\u00e9tez votre profil pour acc\u00e9der aux r\u00e9servations. V\u00e9rifiez les informations saisies lors de l\u2019inscription.'}
      </p>
      <p className="mb-5 text-sm text-slate-600">Adresse e-mail : <strong>{session.user.email}</strong></p>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="profile-first-name" className="mb-1 block font-medium">Pr&eacute;nom</label>
          <input id="profile-first-name" autoComplete="given-name" required maxLength={NAME_MAX_LENGTH}
            value={firstName} onChange={event => { setFirstName(event.target.value); setSaved(false) }} disabled={saving} className={inputClass} />
        </div>
        <div>
          <label htmlFor="profile-last-name" className="mb-1 block font-medium">Nom</label>
          <input id="profile-last-name" autoComplete="family-name" required maxLength={NAME_MAX_LENGTH}
            value={lastName} onChange={event => { setLastName(event.target.value); setSaved(false) }} disabled={saving} className={inputClass} />
        </div>
        <div>
          <label htmlFor="profile-branch" className="mb-1 block font-medium">Branche</label>
          {branchLocked ? (
            <>
              <input id="profile-branch" value={getBranchLabel(profile!.branch)} disabled className={inputClass} aria-describedby="profile-branch-help" />
              <p id="profile-branch-help" className="mt-1 text-sm text-slate-500">Seul le propri&eacute;taire peut modifier votre branche.</p>
            </>
          ) : (
            <>
              <select id="profile-branch" required value={branch} disabled={saving} className={inputClass} aria-describedby="profile-branch-help"
                onChange={event => { setBranch(isBranch(event.target.value) ? event.target.value : ''); setSaved(false) }}>
                <option value="" disabled>Choisissez votre branche</option>
                {BRANCHES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <p id="profile-branch-help" className="mt-1 text-sm text-slate-500">Une fois enregistr&eacute;e, seul le propri&eacute;taire pourra la modifier.</p>
            </>
          )}
        </div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {saved && <p role="status" className="text-green-800">Profil enregistr&eacute;.</p>}
        <button type="submit" disabled={saving} className="w-full rounded-xl bg-indigo-700 p-3 font-medium text-white shadow-sm hover:bg-indigo-800 disabled:opacity-60">
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>
      {wasComplete && (
        <p className="mt-6 text-sm text-slate-600">
          <Link to="/reservation" className="text-indigo-700 underline">Aller aux r&eacute;servations</Link>
        </p>
      )}
    </section>
  )
}
