import type { SupabaseClient } from '@supabase/supabase-js'

export function passwordError(password: string, confirmation: string) {
  return password.length < 8 || password !== confirmation
    ? 'Utilise au moins 8 caractères et deux mots de passe identiques.' : null
}

export async function resolveAuthLink(client: SupabaseClient, href: string, recoveryPage = false) {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const value = (name: string) => url.searchParams.get(name) ?? hash.get(name)
  if (value('error') || value('error_code')) throw new Error('Ce lien est invalide, expiré ou déjà utilisé. Demande un nouveau lien ou reconnecte-toi.')
  const purpose = value('type') ?? (recoveryPage ? 'recovery' : 'signup')
  const tokenHash = value('token_hash')
  if (tokenHash && !['signup', 'invite', 'recovery'].includes(purpose)) throw new Error('Type de lien non pris en charge.')
  const initial = await client.auth.getSession()
  if (initial.error) throw new Error('Impossible de lire la session de ce lien. Réessaie de te connecter.')
  if (tokenHash) {
    const type = purpose === 'invite' ? 'invite' : purpose === 'recovery' ? 'recovery' : 'signup'
    const result = await client.auth.verifyOtp({ token_hash: tokenHash, type })
    if (result.error) throw new Error('Ce lien est invalide ou expiré.')
  } else if (value('code') && !initial.data.session) {
    const result = await client.auth.exchangeCodeForSession(value('code')!)
    if (result.error) throw new Error('Ce lien est invalide, expiré ou ouvert dans un autre navigateur.')
  }
  const verified = await client.auth.getUser()
  if (verified.error || !verified.data.user?.email_confirmed_at) {
    throw new Error('Aucune session vérifiée. Ouvre le lien reçu ou connecte-toi.')
  }
  return purpose === 'recovery' || purpose === 'invite' ? 'password' : 'profile'
}
