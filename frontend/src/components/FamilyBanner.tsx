import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { branches, brusselsToday, familyYear, getPriorities } from '../lib/family'

export default function FamilyBanner() {
  const { session } = useAuth()
  const [state, setState] = useState<{ userId: string; branch: string | null; error?: string } | null>(null)
  const year = familyYear(brusselsToday())
  useEffect(() => {
    if (!session?.user.email_confirmed_at) return
    let active = true
    const userId = session.user.id
    void getPriorities().then(rows => {
      if (active) setState({ userId, branch: rows.find(r => r.start_year === year)?.branch ?? null })
    }).catch(e => {
      if (active) setState({ userId, branch: null, error: e instanceof Error ? e.message : 'Priorité indisponible.' })
    })
    return () => { active = false }
  }, [session?.user.id, session?.user.email_confirmed_at, year])
  if (!session?.user.email_confirmed_at || state?.userId !== session.user.id) return null
  return <aside className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
    {state.error ? <p role="alert">{state.error}</p>
      : <p>Année familiale {year}–{year + 1} · {state.branch
        ? <>Priorité à la branche <strong>{branches[state.branch]}</strong></>
        : 'Branche prioritaire à configurer'} · du 1er juillet au 30 juin</p>}
  </aside>
}
