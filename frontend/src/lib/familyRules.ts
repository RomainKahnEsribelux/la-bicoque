import type { BookingRequest, OccupiedDates } from './bookings'

export function brusselsToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function sixMonthsFrom(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const last = new Date(Date.UTC(year, month + 6, 0)).getUTCDate()
  return new Date(Date.UTC(year, month + 5, Math.min(day, last))).toISOString().slice(0, 10)
}

export function familyYear(value: string) {
  const [year, month] = value.split('-').map(Number)
  return year - (month < 7 ? 1 : 0)
}

export function dateBefore(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export function remainingCapacity(value: string, occupied: OccupiedDates[], mode: 'open' | 'exclusive') {
  const matches = occupied.filter(p => value >= p.start_date && value < p.end_date)
  if (matches.some(p => p.stay_mode === 'exclusive') || (mode === 'exclusive' && matches.length > 0)) return 0
  return Math.max(0, 30 - matches.reduce((sum, p) => sum + p.guest_count, 0))
}

export function stayHasConflict(start: string, end: string, occupied: OccupiedDates[], count: number, mode: 'open' | 'exclusive') {
  for (let day = start; day < end; day = dateBefore(day, -1)) {
    if (remainingCapacity(day, occupied, mode) < count) return true
  }

  return false
}

export function stayStatus(stay: Pick<BookingRequest, 'status' | 'conflict'>) {
  if (stay.status === 'approved' && stay.conflict) return 'Conflit — à examiner par un administrateur'
  return {
    pending: 'Demande reçue — à approuver',
    approved: 'Approuvée — en attente de confirmation',
    confirmed: 'Confirmée',
    rejected: 'Refusée',
    cancelled: 'Annulée',
  }[stay.status]
}

export function cancellationAllowed(stay: Pick<BookingRequest, 'status' | 'check_in'>, today = brusselsToday()) {
  return ['pending', 'approved', 'confirmed'].includes(stay.status) && stay.check_in > today
}

export const confirmationEligibility = (stay: Pick<BookingRequest, 'check_in'>) => dateBefore(stay.check_in, 21)

export function formatMoney(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Montant invalide.')
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}
