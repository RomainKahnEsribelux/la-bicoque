import { supabase } from './supabase'
import { getBookingErrorMessage } from './bookings'

export interface Capabilities { general_admin: boolean; manage_bookings: boolean }
export interface ManagedMember {
  user_id: string; first_name: string; last_name: string; branch: string | null
  email: string; general_admin: boolean; managed_branch: string | null
}
export interface BranchContact { branch: string; user_id: string; first_name: string; last_name: string }
export interface PublicContact { slug: string; display_name: string; email: string | null }

function client() {
  if (!supabase) throw new Error('Supabase indisponible.')
  return supabase
}
export async function getCapabilities(): Promise<Capabilities> {
  const { data, error } = await client().rpc('get_management_capabilities')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (!data || typeof data.general_admin !== 'boolean' || typeof data.manage_bookings !== 'boolean')
    throw new Error('Impossible de vérifier les droits de gestion.')
  return data
}
export async function canManageBookings() {
  return (await getCapabilities()).manage_bookings
}
export async function getManagementMembers(): Promise<ManagedMember[]> {
  const { data, error } = await client().rpc('get_management_members')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (!Array.isArray(data)) throw new Error('Liste des membres invalide.')
  return data
}
export async function getBranchDirectory(): Promise<BranchContact[]> {
  const { data, error } = await client().rpc('get_branch_directory')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (!Array.isArray(data)) throw new Error('Annuaire des responsables invalide.')
  return data
}
export async function getPublicContacts() {
  const { data, error } = await client().from('public_contacts')
    .select('slug,display_name,email').order('sort_order').returns<PublicContact[]>()
  if (error) throw new Error(getBookingErrorMessage(error))
  return data
}
export function notifyRoleChange() {
  window.dispatchEvent(new Event('management-roles-changed'))
}
