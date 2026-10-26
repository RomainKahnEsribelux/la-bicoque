import { supabase } from './supabase'

export const BRANCHES = [
  { value: 'max-leo', label: 'Max-L\u00e9o' },
  { value: 'gustave', label: 'Gustave' },
  { value: 'helene', label: 'H\u00e9l\u00e8ne' },
] as const

export type Branch = typeof BRANCHES[number]['value']

export interface MemberProfile {
  user_id: string
  first_name: string
  last_name: string
  branch: Branch
}

export const NAME_MAX_LENGTH = 80

export function isBranch(value: unknown): value is Branch {
  return typeof value === 'string' && BRANCHES.some(branch => branch.value === value)
}

export function getBranchLabel(branch: string | null | undefined) {
  return BRANCHES.find(item => item.value === branch)?.label ?? 'Non renseign\u00e9e'
}

export function isProfileComplete(profile: MemberProfile | null): profile is MemberProfile {
  return !!profile && !!profile.first_name.trim() && !!profile.last_name.trim() && isBranch(profile.branch)
}

function getClient() {
  if (!supabase) throw new Error('Supabase n\u2019est pas configur\u00e9.')
  return supabase
}

export function getProfileErrorMessage(error: { message: string; code?: string }) {
  const messages: Record<string, string> = {
    branch_change_requires_admin: 'Seul un administrateur peut corriger votre branche.',
    verified_email_required: 'Confirmez votre adresse e-mail avant de continuer.',
    branch_change_requires_owner: 'La branche ne peut plus \u00eatre modifi\u00e9e que par le propri\u00e9taire.',
    branch_locked: 'La branche ne peut plus \u00eatre modifi\u00e9e que par le propri\u00e9taire.',
    invalid_branch: 'Choisissez une branche valide.',
    invalid_first_name: `Indiquez un pr\u00e9nom de ${NAME_MAX_LENGTH} caract\u00e8res maximum.`,
    invalid_last_name: `Indiquez un nom de ${NAME_MAX_LENGTH} caract\u00e8res maximum.`,
    invalid_name: `Indiquez un pr\u00e9nom et un nom de ${NAME_MAX_LENGTH} caract\u00e8res maximum chacun.`,
    email_not_confirmed: 'Votre adresse e-mail doit \u00eatre confirm\u00e9e avant de compl\u00e9ter votre profil.',
    account_email_required: 'Votre adresse e-mail doit \u00eatre confirm\u00e9e avant de compl\u00e9ter votre profil.',
    owner_required: 'Cette action est r\u00e9serv\u00e9e au propri\u00e9taire.',
    profile_not_found: 'Ce profil n\u2019existe pas.',
    not_authenticated: 'Votre session a expir\u00e9. Reconnectez-vous.',
  }
  const known = Object.entries(messages).find(([key]) => error.message.includes(key))
  if (known) return known[1]
  if (error.code === '42501') return 'Vous n\u2019avez pas les droits pour cette action.'
  return 'Une erreur est survenue avec votre profil. R\u00e9essayez. Si le probl\u00e8me persiste, contactez le propri\u00e9taire.'
}

function parseProfile(value: unknown): MemberProfile {
  if (typeof value !== 'object' || value === null || !('user_id' in value) || typeof value.user_id !== 'string') {
    throw new Error('Le profil re\u00e7u est invalide. R\u00e9essayez.')
  }
  const row = value as Record<string, unknown>
  if (typeof row.first_name !== 'string' || typeof row.last_name !== 'string' || !isBranch(row.branch)) {
    throw new Error('Le profil enregistr\u00e9 est incomplet ou invalide. Contactez le propri\u00e9taire.')
  }
  return { user_id: row.user_id as string, first_name: row.first_name, last_name: row.last_name, branch: row.branch }
}

/** Returns the signed-in user's profile, or null if none exists yet. userId defaults to the current session user. */
export async function getMyProfile(userId?: string): Promise<MemberProfile | null> {
  if (!userId) {
    const { data: sessionData, error: sessionError } = await getClient().auth.getSession()
    if (sessionError) throw new Error('Impossible de lire votre session. Reconnectez-vous.')
    userId = sessionData.session?.user.id
    if (!userId) throw new Error('Votre session a expir\u00e9. Reconnectez-vous.')
  }
  const { data, error } = await getClient()
    .from('member_profiles')
    .select('user_id, first_name, last_name, branch')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(getProfileErrorMessage(error))
  return data ? parseProfile(data) : null
}

export async function checkIsSiteOwner() {
  const { data, error } = await getClient().rpc('is_site_owner')
  if (error) throw new Error(getProfileErrorMessage(error))
  if (typeof data !== 'boolean') throw new Error('Impossible de v\u00e9rifier les droits propri\u00e9taire. R\u00e9essayez.')
  return data
}

function validateNames(firstName: string, lastName: string) {
  const first = firstName.trim()
  const last = lastName.trim()
  if (!first || !last || first.length > NAME_MAX_LENGTH || last.length > NAME_MAX_LENGTH) {
    throw new Error(`Indiquez un pr\u00e9nom et un nom de ${NAME_MAX_LENGTH} caract\u00e8res maximum chacun.`)
  }
  return { first, last }
}

export async function saveMyProfile(input: { firstName: string; lastName: string; branch: Branch }) {
  const { first, last } = validateNames(input.firstName, input.lastName)
  if (!isBranch(input.branch)) throw new Error('Choisissez une branche valide.')
  const { error } = await getClient().rpc('save_my_profile', {
    p_first_name: first,
    p_last_name: last,
    p_branch: input.branch,
  })
  if (error) throw new Error(getProfileErrorMessage(error))
}

export async function listMemberProfiles() {
  const { data, error } = await getClient()
    .from('member_profiles')
    .select('user_id, first_name, last_name, branch')
    .order('last_name', { ascending: true })
  if (error) throw new Error(getProfileErrorMessage(error))
  if (!Array.isArray(data)) throw new Error('Impossible de lire les profils. R\u00e9essayez.')
  return data.map(parseProfile)
}

export async function ownerUpdateMemberProfile(input: { userId: string; firstName: string; lastName: string; branch: Branch }) {
  const { first, last } = validateNames(input.firstName, input.lastName)
  if (!isBranch(input.branch)) throw new Error('Choisissez une branche valide.')
  const { error } = await getClient().rpc('owner_update_member_profile', {
    p_user_id: input.userId,
    p_first_name: first,
    p_last_name: last,
    p_branch: input.branch,
  })
  if (error) throw new Error(getProfileErrorMessage(error))
}
