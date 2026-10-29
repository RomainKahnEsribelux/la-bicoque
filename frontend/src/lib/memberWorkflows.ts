import { supabase } from './supabase'
import { getBookingErrorMessage } from './bookings'
import type { BookingRequest } from './bookings'
import { getManagementMembers } from './management'
export { stayStatus, cancellationAllowed, confirmationEligibility, formatMoney } from './familyRules'

export interface Stay extends BookingRequest {
  amount_cents: number | null
  transfer_instructions: string | null
}
export interface Invitation {
  id: string; email: string; role: 'member' | 'admin'; created_at: string
  accepted_at: string | null; cancelled_at: string | null
}
export interface Administrator { user_id: string; email: string; created_at: string }
export interface HistoryEntry {
  id: number; actor_id: string | null; actor_kind: string; entity: string
  entity_id: string; operation: string; details: Record<string, unknown>; reason: string | null; created_at: string
}
export interface PracticalGuide { slug: string; title: string; body: string; updated_at: string }

function client() {
  if (!supabase) throw new Error('Supabase indisponible.')
  return supabase
}
export async function workflowAction(name: string, args: Record<string, string | boolean | null>) {
  const { error } = await client().rpc(name, args)
  if (error) throw new Error(getBookingErrorMessage(error))
}
export async function getMyStays(): Promise<Stay[]> {
  const { data, error } = await client().rpc('get_my_stays')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (!Array.isArray(data)) throw new Error('Impossible de lire tes séjours.')
  return data as Stay[]
}
export async function getMemberManagement() {
  const [invitations, administrators] = await Promise.all([
    client().from('member_invitations').select('id,email,role,created_at,accepted_at,cancelled_at')
      .order('created_at', { ascending: false }).returns<Invitation[]>(),
    getManagementMembers(),
  ])
  if (invitations.error) throw new Error(getBookingErrorMessage(invitations.error))
  return { invitations: invitations.data, members: administrators,
    administrators: administrators.filter(m => m.general_admin).map(m => ({ user_id: m.user_id, email: m.email, created_at: '' })) }
}
export async function getHistory(page: number, entity: string) {
  let query = client().from('admin_history').select('*')
    .order('created_at', { ascending: false }).order('id', { ascending: false })
  if (entity) query = query.eq('entity', entity)
  const { data, error } = await query.range(page * 20, page * 20 + 20).returns<HistoryEntry[]>()
  if (error) throw new Error(getBookingErrorMessage(error))
  return { entries: data.slice(0, 20), hasMore: data.length > 20 }
}
export async function getPracticalGuides() {
  const { data, error } = await client().from('practical_guides')
    .select('slug,title,body,updated_at').order('slug').returns<PracticalGuide[]>()
  if (error) throw new Error(getBookingErrorMessage(error))
  return data
}
export const directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=54%20Rue%20de%20Spa%2C%204970%20Stavelot%2C%20Belgique'
