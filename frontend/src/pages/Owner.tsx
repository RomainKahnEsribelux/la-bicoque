import { useCallback, useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import {
  addOwnerBlock,
  claimSiteOwner,
  confirmBooking,
  getBookingCapacity,
  getBookingErrorMessage,
  getMyBookingRequests,
  getOwnerOccupiedPeriods,
  isSiteOwner,
  rejectBooking,
  removeOwnerBlock,
  setHouseCapacity,
} from '../lib/bookings'
import type { BookingRequest, OwnerOccupiedPeriod } from '../lib/bookings'

function dateValue(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`))
}

function todayValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function BookingStatus({ status }: { status: BookingRequest['status'] }) {
  const statusLabels: Record<BookingRequest['status'], string> = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    rejected: 'Refusée',
    cancelled: 'Annulée',
  }
  return <span className="rounded bg-slate-100 px-2 py-1 text-sm">{statusLabels[status]}</span>
}

export default function Owner() {
  const [owner, setOwner] = useState<boolean | null>(null)
  const [capacity, setCapacity] = useState<number | null>(null)
  const [capacityInput, setCapacityInput] = useState('')
  const [requests, setRequests] = useState<BookingRequest[]>([])
  const [periods, setPeriods] = useState<OwnerOccupiedPeriod[]>([])
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockNote, setBlockNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [today] = useState(() => todayValue())

  const reload = useCallback(async () => {
    try {
      const isOwner = await isSiteOwner()
      setOwner(isOwner)
      if (!isOwner) return
      const [nextCapacity, nextRequests, nextPeriods] = await Promise.all([
        getBookingCapacity(),
        getMyBookingRequests(),
        getOwnerOccupiedPeriods(),
      ])
      setCapacity(nextCapacity)
      setCapacityInput(nextCapacity?.toString() ?? '')
      setRequests(nextRequests)
      setPeriods(nextPeriods)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les informations du propriétaire.')
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

  async function runAction(action: () => Promise<void>, success: string) {
    if (busy) return false
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(success)
      await reload()
      return true
    } catch (actionError) {
      setError(actionError instanceof Error
        ? actionError.message
        : getBookingErrorMessage({ message: 'unknown' }))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveCapacity(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = Number(capacityInput)
    if (!Number.isSafeInteger(value) || value <= 0) {
      setError('Indique une capacité entière supérieure à zéro.')
      return
    }
    await runAction(() => setHouseCapacity(value), 'La capacité de la maison est enregistrée.')
  }

  async function createBlock(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const succeeded = await runAction(
      () => addOwnerBlock({ startDate: blockStart, endDate: blockEnd, note: blockNote }),
      'La période est bloquée et ne peut plus être demandée.',
    )
    if (succeeded) {
      setBlockStart('')
      setBlockEnd('')
      setBlockNote('')
    }
  }

  async function claim() {
    await runAction(async () => {
      await claimSiteOwner()
      setOwner(true)
    }, 'Les droits propriétaire sont activés pour ce compte.')
  }

  if (loading) return <p role="status">Vérification des droits propriétaire...</p>

  return (
    <section className="mx-auto max-w-5xl py-5 sm:py-8">
      <p className="mb-2 text-sm font-medium uppercase tracking-wide text-indigo-700">La bicoque</p>
      <h1 className="mb-6 text-4xl font-semibold sm:text-5xl">Gestion de la maison</h1>
      {!owner && (
        <div className="max-w-2xl rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.06)]">
          <p className="mb-4 text-slate-700">
            Le projet doit avoir exactement un utilisateur Auth avant l’activation des droits propriétaire.
            Comme les inscriptions publiques sont désactivées, active ces droits avec ton compte propriétaire
            avant d’ajouter ou d’importer d’autres comptes. Cette opération ne peut être effectuée qu’une fois.
          </p>
          {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
          <button type="button" disabled={busy} onClick={() => void claim()}
            className="rounded bg-indigo-700 px-5 py-3 font-medium text-white hover:bg-indigo-800 disabled:opacity-60">
            {busy ? 'Activation...' : 'Activer les droits propriétaire'}
          </button>
        </div>
      )}

      {owner && (
        <div className="space-y-8">
          <form onSubmit={saveCapacity} className="rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.06)]">
            <h2 className="mb-3 text-xl font-semibold">Capacité d’accueil</h2>
            <label htmlFor="capacity" className="mb-1 block font-medium">Nombre maximal de voyageurs</label>
            <div className="flex flex-wrap gap-3">
              <input id="capacity" type="number" min="1" step="1" required value={capacityInput}
                onChange={event => setCapacityInput(event.target.value)}
                className="w-40 rounded border border-slate-400 bg-white p-3" />
              <button type="submit" disabled={busy || Number(capacityInput) === capacity}
                className="rounded bg-indigo-700 px-4 py-2 font-medium text-white disabled:opacity-60">
                Enregistrer
              </button>
            </div>
            {capacity === null && <p className="mt-2 text-amber-800">La capacité doit être renseignée avant toute demande.</p>}
          </form>

          <section className="rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.06)]">
            <h2 className="mb-3 text-xl font-semibold">Demandes des voyageurs</h2>
            {requests.length === 0
              ? <p className="text-slate-600">Aucune demande pour le moment.</p>
              : <ul className="space-y-4">
                  {requests.map(request => <li key={request.id} className="border-t border-slate-200 pt-4 first:border-0 first:pt-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-semibold">{dateValue(request.check_in)} — {dateValue(request.check_out)}</h3>
                      <BookingStatus status={request.status} />
                    </div>
                    <p className="mt-2 text-sm"><strong>{request.guest_first_name} {request.guest_last_name}</strong> · Contact : <a className="text-indigo-700 underline" href={`mailto:${request.guest_email}`}>{request.guest_email}</a></p>
                    <p className="mt-1 text-sm">{request.guest_count} voyageurs · arrivée prévue à {request.planned_arrival_time.slice(0, 5)} · départ prévu à {request.planned_departure_time.slice(0, 5)}</p>
                    {request.guest_note && <p className="mt-2 whitespace-pre-wrap text-sm">{request.guest_note}</p>}
                    {request.status === 'pending' && (
                      <div className="mt-3 flex gap-3">
                        <button type="button" disabled={busy} onClick={() => void runAction(() => confirmBooking(request.id), 'Le séjour est confirmé et ses dates sont bloquées.')}
                          className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Confirmer</button>
                        <button type="button" disabled={busy} onClick={() => void runAction(() => rejectBooking(request.id), 'La demande est refusée.')}
                          className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Refuser</button>
                      </div>
                    )}
                  </li>)}
                </ul>}
          </section>

          <section className="rounded-2xl border border-[#5b5d43]/15 bg-white/85 p-6 shadow-[0_18px_50px_rgba(49,54,37,0.06)]">
            <h2 className="mb-3 text-xl font-semibold">Bloquer des dates</h2>
            <form onSubmit={createBlock} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="block-start" className="mb-1 block font-medium">Du (inclus)</label>
                <input id="block-start" type="date" min={today}
                  required value={blockStart} onChange={event => setBlockStart(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
              </div>
              <div>
                <label htmlFor="block-end" className="mb-1 block font-medium">Au (jour de départ, exclu)</label>
                <input id="block-end" type="date" min={blockStart ? blockStart : today}
                  required value={blockEnd} onChange={event => setBlockEnd(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="block-note" className="mb-1 block font-medium">Note (facultative)</label>
                <input id="block-note" type="text" maxLength={500} value={blockNote}
                  onChange={event => setBlockNote(event.target.value)}
                  className="w-full rounded border border-slate-400 bg-white p-3" />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" disabled={busy || !blockStart || !blockEnd || blockEnd <= blockStart}
                  className="rounded bg-indigo-700 px-4 py-3 font-medium text-white disabled:opacity-60">Bloquer la période</button>
              </div>
            </form>
            <ul className="mt-5 space-y-3">
              {periods.map(period => <li key={period.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <span>
                  {dateValue(period.start_date)} — {dateValue(period.end_date)}
                  {period.source_type === 'owner_block' ? ` · Bloquée${period.note ? ` : ${period.note}` : ''}` : ' · Séjour confirmé'}
                </span>
                {period.source_type === 'owner_block' && <button type="button" disabled={busy}
                  onClick={() => void runAction(() => removeOwnerBlock(period.id), 'La période n’est plus bloquée.')}
                  className="text-sm font-medium text-red-700 underline disabled:opacity-60">Supprimer le blocage</button>}
              </li>)}
            </ul>
          </section>
        </div>
      )}
      {error && owner && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 text-green-800">{notice}</p>}
    </section>
  )
}
