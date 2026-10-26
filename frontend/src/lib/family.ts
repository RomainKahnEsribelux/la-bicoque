import { supabase } from './supabase'
import { getBookingErrorMessage } from './bookings'
import { BRANCHES } from './profiles'
export { brusselsToday, sixMonthsFrom, familyYear, dateBefore, remainingCapacity, stayHasConflict } from './familyRules'

export const branches: Record<string, string> = Object.fromEntries(BRANCHES.map(b => [b.value, b.label]))

export interface Priority { start_year: number; branch: string }
export interface FamilySettings { rate_cents: number | null; transfer_instructions: string | null }

export async function getPriorities(): Promise<Priority[]> {
  if (!supabase) throw new Error('Supabase indisponible.')
  const { data, error } = await supabase.from('family_priorities').select('start_year,branch').order('start_year')
  if (error) throw new Error(getBookingErrorMessage(error))
  return data
}

export async function getFamilySettings(): Promise<FamilySettings> {
  if (!supabase) throw new Error('Supabase indisponible.')
  const { data, error } = await supabase.rpc('owner_get_family_settings')
  if (error) throw new Error(getBookingErrorMessage(error))
  return data
}

export async function saveFamilySettings(year: number, branch: string, rate: number | null, transfer: string) {
  if (!supabase) throw new Error('Supabase indisponible.')
  const { error } = await supabase.rpc('owner_save_family_settings', {
    p_year: year, p_branch: branch, p_rate_cents: rate, p_transfer: transfer,
  })
  if (error) throw new Error(getBookingErrorMessage(error))
}

export async function validateBookingRate(id: string, rate: number) {
  if (!supabase) throw new Error('Supabase indisponible.')
  const { error } = await supabase.rpc('owner_validate_booking_rate', { p_id: id, p_rate_cents: rate })
  if (error) throw new Error(getBookingErrorMessage(error))
}
