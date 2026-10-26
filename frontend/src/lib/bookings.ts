import { supabase } from './supabase'

export interface BookingRequest {
  id: string
  guest_first_name: string
  guest_last_name: string
  guest_email: string
  check_in: string
  check_out: string
  guest_count: number
  planned_arrival_time: string
  planned_departure_time: string
  guest_note: string | null
  status: 'pending' | 'approved' | 'confirmed' | 'rejected' | 'cancelled'
  branch: string | null
  stay_mode: 'open' | 'exclusive'
  approved_at: string | null
  confirmed_at: string | null
  conflict: boolean
  billing_ready: boolean
  rate_cents: number | null
  paid_at: string | null
  paid_by: string | null
  created_at: string
}

export interface OccupiedDates {
  start_date: string
  end_date: string
  guest_name: string | null
  guest_count: number
  stay_mode: 'open' | 'exclusive'
}

export interface OwnerOccupiedPeriod extends Omit<OccupiedDates, 'guest_name'> {
  id: string
  source_type: 'booking' | 'owner_block'
  note: string | null
  booking_id: string | null
}

function getClient() {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  return supabase
}

export function getBookingErrorMessage(error: { message: string; code?: string }) {
  const messages: Record<string, string> = {
    house_capacity_not_configured: 'Le propriétaire doit encore définir la capacité de la maison.',
    guest_count_exceeds_capacity: 'Le nombre de voyageurs dépasse la capacité de la maison.',
    occupied_dates_conflict: 'Ces dates ne sont plus disponibles. Choisissez d’autres dates.',
    invalid_stay_dates: 'Choisissez une arrivée à partir d’aujourd’hui et un départ après l’arrivée.',
    invalid_guest_count: 'Indiquez un nombre de voyageurs valide.',
    invalid_guest_name: 'Indiquez un prénom et un nom de 80 caractères maximum chacun.',
    arrival_and_departure_times_required: 'Indiquez une heure d’arrivée et une heure de départ prévues.',
    booking_times_must_be_on_hour: 'Choisissez une heure pleine pour l’arrivée et le départ.',
    owner_claim_requires_single_user: 'Le propriétaire doit activer son compte avant la création d’autres comptes.',
    owner_already_claimed: 'Le compte propriétaire a déjà été activé.',
    owner_required: 'Cette action est réservée au propriétaire.',
    invalid_house_capacity: 'La capacité doit être un nombre positif.',
    booking_request_not_found: 'Cette demande n’existe plus.',
    booking_request_not_pending: 'Cette demande a déjà été traitée.',
    invalid_block_dates: 'Choisissez une période à bloquer valide, à partir d’aujourd’hui.',
    owner_block_not_found: 'Cette période bloquée n’existe plus.',
    stay_outside_six_months: 'Tout le séjour doit être compris dans les six prochains mois.',
    profile_required: 'Complète ton profil et ta branche avant de demander un séjour.',
    priority_not_configured: 'Un admin doit définir la branche prioritaire de cette année familiale.',
    verified_email_required: 'Confirme ton adresse e-mail avant de continuer.',
    house_capacity_fixed_at_30: 'La capacité maximale est de 30 personnes.',
    invalid_rate: 'Indique un tarif positif par personne et par nuit.',
    booking_rate_already_validated: 'Le tarif de ce séjour a déjà été validé ou le séjour n’est pas confirmé.',
    cancellation_requires_admin: 'À partir du jour d’arrivée, contacte un administrateur pour annuler.',
    booking_not_cancellable: 'Ce séjour ne peut plus être annulé dans cet état.',
    action_reason_required: 'Indique un motif de 1 à 500 caractères.',
    payment_amount_not_ready: 'Le séjour doit être confirmé et son tarif validé avant de saisir un paiement.',
    invalid_invitation_email: 'Indique une adresse e-mail valide.',
    invitation_already_exists: 'Une invitation existe déjà pour cette adresse.',
    administrator_slots_full: 'Les deux places administrateur sont déjà attribuées ou réservées.',
    already_administrator: 'Ce compte est déjà administrateur.',
    invitation_not_cancellable: 'Cette invitation a déjà été acceptée ou annulée.',
  }

  if (error.message.includes('account_email_required')) {
    return 'Ton compte doit avoir une adresse e-mail confirmée pour envoyer une demande.'
  }
  const knownMessage = Object.entries(messages).find(([key]) => error.message.includes(key))
  if (knownMessage) return knownMessage[1]
  if (error.code === '23P01') return messages.occupied_dates_conflict
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')) {
    return 'La base de réservation doit être mise à jour par un administrateur.'
  }
  return 'Une erreur est survenue. Réessayez. Si le problème persiste, contactez le propriétaire.'
}

export async function isSiteOwner() {
  const { data, error } = await getClient().rpc('is_site_owner')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (typeof data !== 'boolean') throw new Error('Impossible de vérifier les droits propriétaire. Réessaie.')
  return data
}

export async function getBookingCapacity() {
  const { data, error } = await getClient().rpc('get_booking_capacity')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (data !== null && (!Number.isInteger(data) || data <= 0)) {
    throw new Error('La capacité enregistrée dans la base de données est invalide.')
  }
  return data as number | null
}

export async function getOccupiedDates() {
  const { data, error } = await getClient().rpc('get_occupied_dates')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (!Array.isArray(data)) throw new Error('Impossible de lire les dates indisponibles. Réessaie.')
  return data as OccupiedDates[]
}

export async function getMyBookingRequests() {
  const { data, error } = await getClient()
    .from('booking_requests')
    .select('id, guest_first_name, guest_last_name, guest_email, check_in, check_out, guest_count, planned_arrival_time, planned_departure_time, guest_note, status, created_at, branch, stay_mode, approved_at, confirmed_at, conflict, billing_ready, rate_cents, paid_at, paid_by')
    .order('created_at', { ascending: false })
  if (error) throw new Error(getBookingErrorMessage(error))
  if (!Array.isArray(data)) throw new Error('Impossible de lire les demandes de réservation. Réessaie.')
  return data as BookingRequest[]
}

export async function submitBookingRequest(input: {
  guestFirstName: string
  guestLastName: string
  checkIn: string
  checkOut: string
  guestCount: number
  arrivalTime: string
  departureTime: string
  note: string
  stayMode: 'open' | 'exclusive'
}) {
  const { data, error } = await getClient().rpc('submit_booking_request', {
    p_guest_first_name: input.guestFirstName.trim(),
    p_guest_last_name: input.guestLastName.trim(),
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_guest_count: input.guestCount,
    p_planned_arrival_time: input.arrivalTime,
    p_planned_departure_time: input.departureTime,
    p_guest_note: input.note.trim() || null,
    p_stay_mode: input.stayMode,
  })
  if (error) throw new Error(getBookingErrorMessage(error))
  if (typeof data !== 'string') throw new Error('La demande n’a pas pu être confirmée par la base de données. Réessaie.')
  return data as string
}

export async function claimSiteOwner() {
  const { error } = await getClient().rpc('claim_site_owner')
  if (error) throw new Error(getBookingErrorMessage(error))
}

export async function setHouseCapacity(capacity: number) {
  const { error } = await getClient().rpc('owner_set_house_capacity', { p_max_guests: capacity })
  if (error) throw new Error(getBookingErrorMessage(error))
}

export async function confirmBooking(id: string) {
  const { error } = await getClient().rpc('owner_confirm_booking', { p_booking_id: id })
  if (error) throw new Error(getBookingErrorMessage(error))
}

export async function rejectBooking(id: string) {
  const { error } = await getClient().rpc('owner_reject_booking', { p_booking_id: id })
  if (error) throw new Error(getBookingErrorMessage(error))
}

export async function addOwnerBlock(input: { startDate: string; endDate: string; note: string }) {
  const { error } = await getClient().rpc('owner_add_block', {
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_note: input.note.trim() || null,
  })
  if (error) throw new Error(getBookingErrorMessage(error))
}

export async function removeOwnerBlock(id: string) {
  const { error } = await getClient().rpc('owner_remove_block', { p_block_id: id })
  if (error) throw new Error(getBookingErrorMessage(error))
}

export async function getOwnerOccupiedPeriods() {
  const { data, error } = await getClient().rpc('owner_list_occupied_periods')
  if (error) throw new Error(getBookingErrorMessage(error))
  if (!Array.isArray(data)) throw new Error('Impossible de lire le calendrier propriétaire. Réessaie.')
  return data as OwnerOccupiedPeriod[]
}
