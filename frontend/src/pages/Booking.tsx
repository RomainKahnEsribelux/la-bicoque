import { useCallback, useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link } from 'react-router-dom'
import AvailabilityCalendar from '../components/AvailabilityCalendar'
import {
  getBookingCapacity,
  getBookingErrorMessage,
  getOccupiedDates,
  submitBookingRequest,
} from '../lib/bookings'
import type { BookingRequest, OccupiedDates } from '../lib/bookings'
import { branches, brusselsToday, dateBefore, familyYear, getPriorities, sixMonthsFrom, stayHasConflict } from '../lib/family'
import type { Priority } from '../lib/family'
import { getMyProfile } from '../lib/profiles'
import { getMyStays, stayStatus } from '../lib/memberWorkflows'

function localDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function followingDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + 1)
  return localDateString(date)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
}

function formatTime(value: string) {
  return value.slice(0, 5)
}

const fullHourOptions = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, '0')}:00`,
)

function BookingStatus({ request }: { request: BookingRequest }) {
  const colours: Record<BookingRequest['status'], string> = {
    pending: 'bg-amber-100 text-amber-900',
    approved: 'bg-blue-100 text-blue-900',
    confirmed: 'bg-green-100 text-green-900',
    rejected: 'bg-red-100 text-red-900',
    cancelled: 'bg-slate-200 text-slate-800',
  }
  return <span className={`inline-block rounded px-2 py-1 text-sm font-medium ${colours[request.status]}`}>{stayStatus(request)}</span>
}

export default function Booking() {
  const [capacity, setCapacity] = useState<number | null>(null)
  const [occupied, setOccupied] = useState<OccupiedDates[]>([])
  const [requests, setRequests] = useState<BookingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guestFirstName, setGuestFirstName] = useState('')
  const [guestLastName, setGuestLastName] = useState('')
  const [guestCount, setGuestCount] = useState('1')
  const [arrivalTime, setArrivalTime] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [note, setNote] = useState('')
  const [stayMode, setStayMode] = useState<'open' | 'exclusive'>('open')
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [profileBranch, setProfileBranch] = useState('')
  const today = brusselsToday()
  const maxDate = sixMonthsFrom(today)

  const reload = useCallback(async () => {
    setAvailabilityError(null)
    try {
      const [nextCapacity, nextOccupied, nextRequests, nextPriorities, profile] = await Promise.all([
        getBookingCapacity(),
        getOccupiedDates(),
        getMyStays(),
        getPriorities(),
        getMyProfile(),
      ])
      setCapacity(nextCapacity)
      setOccupied(nextOccupied)
      setRequests(nextRequests)
      setPriorities(nextPriorities)
      if (profile) {
        setProfileBranch(profile.branch)
        setGuestFirstName(value => value || profile.first_name)
        setGuestLastName(value => value || profile.last_name)
      }
      setAvailabilityLoaded(true)
    } catch (loadError) {
      setAvailabilityLoaded(false)
      setAvailabilityError(loadError instanceof Error ? loadError.message : 'Impossible de charger les disponibilités.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) return reload()
    })
    return () => {
      active = false
    }
  }, [reload])

  const minimumDeparture = followingDate(checkIn || today)
  const alreadyOccupied = checkIn && checkOut && stayHasConflict(checkIn, checkOut, occupied, Number(guestCount), stayMode)
  const priority = priorities.find(p => p.start_year === familyYear(checkIn || today))

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setError(null)
    setNotice(null)
    if (!availabilityLoaded) {
      setError('Les disponibilités ne sont pas vérifiées. Recharge la page ou réessaie.')
      return
    }
    if (!capacity) {
      setError('La capacité doit être configurée par le propriétaire avant d’accepter des demandes.')
      return
    }
    if (!guestFirstName.trim() || !guestLastName.trim()) {
      setError('Indique ton prénom et ton nom.')
      return
    }
    if (guestFirstName.trim().length > 80 || guestLastName.trim().length > 80) {
      setError('Le prénom et le nom ne peuvent pas dépasser 80 caractères chacun.')
      return
    }
    if (!checkIn || !checkOut || !arrivalTime || !departureTime) {
      setError('Indique les dates et les deux heures pleines prévues.')
      return
    }
    if (checkIn < today || checkOut > maxDate || checkOut <= checkIn) {
      setError('Tout le séjour doit être dans les six prochains mois.')
      return
    }
    if (stayHasConflict(checkIn, checkOut, occupied, Number(guestCount), stayMode)) {
      setError('Ces dates ne sont pas disponibles. Choisis une autre période.')
      return
    }

    setSubmitting(true)
    try {
      await submitBookingRequest({
        guestFirstName,
        guestLastName,
        checkIn,
        checkOut,
        guestCount: Number(guestCount),
        arrivalTime,
        departureTime,
        note,
        stayMode,
      })
      setCheckIn('')
      setCheckOut('')
      setGuestFirstName('')
      setGuestLastName('')
      setGuestCount('1')
      setArrivalTime('')
      setDepartureTime('')
      setNote('')
      setNotice('Ta demande est envoyée. Le séjour n’est pas réservé tant que le propriétaire ne l’a pas confirmé.')
      await reload()
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : getBookingErrorMessage({ message: 'unknown' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="mx-auto max-w-4xl py-5 sm:py-8">
      <p className="mb-2 text-sm font-medium uppercase tracking-wide text-indigo-700">La bicoque</p>
      <h1 className="mb-3 text-4xl font-semibold sm:text-5xl">Demander un séjour</h1>
      <p className="mb-8 max-w-3xl leading-relaxed text-slate-700">
        Choisis un séjour ouvert au partage ou exclusif. Les heures indiquées sont tes horaires prévus ;
        le propriétaire les confirmera avec le séjour. L’envoi d’une demande ne réserve pas les dates.
      </p>

      {loading ? <p role="status">Chargement des disponibilités...</p> : !availabilityLoaded ? (
        <div className="rounded border border-red-300 bg-red-50 p-4 text-red-900">
          <p role="alert">{availabilityError ?? 'Les disponibilités n’ont pas pu être vérifiées.'}</p>
          <button type="button" onClick={() => void reload()}
            className="mt-3 rounded border border-red-700 px-3 py-2 font-medium hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {capacity === null && (
            <div className="mb-6 rounded border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p>Le propriétaire doit définir le nombre maximal de voyageurs avant de pouvoir recevoir des demandes.</p>
              <Link to="/gestion" className="mt-2 inline-block font-medium underline">Configurer la maison</Link>
            </div>
          )}

          <AvailabilityCalendar
            today={today}
            maxDate={maxDate}
            guestCount={Number(guestCount) || 1}
            stayMode={stayMode}
            occupied={occupied}
            arrival={checkIn}
            departure={checkOut}
            onSelectArrival={date => {
              setCheckIn(date)
              setCheckOut('')
              setError(null)
              setNotice(null)
            }}
            onSelectDeparture={date => {
              setCheckOut(date)
              setError(null)
              setNotice(null)
            }}
            onSelectionError={setError}
          />

          <form onSubmit={submit} className="space-y-5 rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-5 shadow-[0_18px_50px_rgba(49,54,37,0.06)] sm:p-7">
            <p className="rounded bg-amber-50 p-3">
              {priority ? <>Branche prioritaire {priority.start_year}–{priority.start_year + 1} : <strong>{branches[priority.branch]}</strong>.
                {profileBranch !== priority.branch && checkIn
                  ? <> Après approbation, confirmation au plus tôt le {formatDate(dateBefore(checkIn, 21))}. Les dates ne sont pas garanties avant confirmation.</>
                  : ' Chaque demande doit être approuvée par un admin.'}</>
                : 'La priorité de cette année familiale reste à configurer par un admin.'}
            </p>
            <label className="block font-medium">Type de séjour
              <select value={stayMode} onChange={e => setStayMode(e.target.value === 'open' ? 'open' : 'exclusive')}
                className="mt-1 block w-full rounded border border-slate-400 bg-white p-3">
                <option value="open">Ouvert : d’autres groupes peuvent partager les dates</option>
                <option value="exclusive">Exclusif : la maison pour ce groupe</option>
              </select>
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="guest-first-name" className="mb-1 block font-medium">Prénom</label>
                <input id="guest-first-name" type="text" autoComplete="given-name" maxLength={80}
                  required value={guestFirstName} onChange={event => setGuestFirstName(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
              </div>
              <div>
                <label htmlFor="guest-last-name" className="mb-1 block font-medium">Nom</label>
                <input id="guest-last-name" type="text" autoComplete="family-name" maxLength={80}
                  required value={guestLastName} onChange={event => setGuestLastName(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
                <p className="mt-1 text-sm text-slate-600">
                  Si le séjour est confirmé, ton nom sera visible aux autres membres connectés.
                </p>
              </div>
              <div>
                <label htmlFor="check-in" className="mb-1 block font-medium">Date d’arrivée</label>
                <input id="check-in" type="date" required min={today} max={dateBefore(maxDate, 1)} value={checkIn}
                  onChange={event => {
                    setCheckIn(event.target.value)
                    setError(null)
                    setNotice(null)
                    if (checkOut && event.target.value >= checkOut) setCheckOut('')
                  }}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
              </div>
              <div>
                <label htmlFor="check-out" className="mb-1 block font-medium">Date de départ</label>
                <input id="check-out" type="date" required min={minimumDeparture} max={maxDate}
                  value={checkOut} onChange={event => {
                    setCheckOut(event.target.value)
                    setError(null)
                    setNotice(null)
                  }}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
              </div>
              <div>
                <label htmlFor="guest-count" className="mb-1 block font-medium">Nombre estimé de voyageurs du groupe</label>
                <input id="guest-count" type="number" min="1" max={capacity ?? undefined} step="1"
                  required value={guestCount} onChange={event => setGuestCount(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
                {capacity && <p className="mt-1 text-sm text-slate-600">Maximum : {capacity} voyageurs.</p>}
              </div>
              <div>
                <label htmlFor="arrival-time" className="mb-1 block font-medium">Heure d’arrivée prévue (heure pleine)</label>
                <select id="arrival-time" required value={arrivalTime}
                  onChange={event => setArrivalTime(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3">
                  <option value="">Choisir une heure</option>
                  {fullHourOptions.map(hour => <option key={hour} value={hour}>{hour}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="departure-time" className="mb-1 block font-medium">Heure de départ prévue (heure pleine)</label>
                <select id="departure-time" required value={departureTime}
                  onChange={event => setDepartureTime(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3">
                  <option value="">Choisir une heure</option>
                  {fullHourOptions.map(hour => <option key={hour} value={hour}>{hour}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="guest-note" className="mb-1 block font-medium">Message au propriétaire <span className="font-normal text-slate-500">(facultatif)</span></label>
              <textarea id="guest-note" maxLength={1000} rows={4} value={note}
                onChange={event => setNote(event.target.value)}
                className="w-full rounded border border-slate-400 bg-white p-3" />
            </div>
            {alreadyOccupied && <p role="status" className="text-amber-800">Une période déjà confirmée chevauche ces dates.</p>}
            {error && <p role="alert" className="text-red-700">{error}</p>}
            {notice && <p role="status" className="text-green-800">{notice}</p>}
            <button type="submit" disabled={submitting || loading || !capacity || Boolean(alreadyOccupied)}
              className="rounded bg-indigo-700 px-5 py-3 font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Envoi en cours...' : 'Envoyer ma demande'}
            </button>
          </form>

          <section aria-labelledby="requests-title" className="mt-10">
            <h2 id="requests-title" className="mb-3 text-xl font-semibold">Mes demandes</h2>
            <Link to="/mes-sejours" className="mb-4 inline-block underline">Voir mes séjours, annuler ou consulter les paiements</Link>
            {requests.length === 0
              ? <p className="text-slate-600">Tu n’as pas encore envoyé de demande.</p>
              : <ul className="space-y-3">
                  {requests.map(request => <li key={request.id} className="rounded-lg bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold">{formatDate(request.check_in)} — {formatDate(request.check_out)}</h3>
                      <BookingStatus request={request} />
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      {request.guest_count} voyageurs estimés · {request.stay_mode === 'open' ? 'ouvert au partage' : 'exclusif'} · arrivée prévue à {formatTime(request.planned_arrival_time)}
                      {' '}· départ prévu à {formatTime(request.planned_departure_time)}
                    </p>
                    {request.status === 'approved' && <p className="mt-2 text-sm text-blue-900">
                      Demande approuvée, mais pas encore réservée. Pour les branches hors tour, confirmation au plus tôt le {formatDate(dateBefore(request.check_in, 21))}, sous réserve de place.
                    </p>}
                    {request.conflict && <p className="mt-2 text-sm text-amber-900">Ces dates ou cet effectif ne sont actuellement pas compatibles avec les séjours confirmés. Les admins doivent réexaminer la demande.</p>}
                    {request.guest_note && <p className="mt-2 whitespace-pre-wrap text-sm">{request.guest_note}</p>}
                  </li>)}
                </ul>}
          </section>
        </>
      )}
    </section>
  )
}
