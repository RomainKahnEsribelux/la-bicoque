import { useState } from 'react'
import type { OccupiedDates } from '../lib/bookings'
import { remainingCapacity, stayHasConflict } from '../lib/family'

interface AvailabilityCalendarProps {
  today: string
  maxDate: string
  guestCount: number
  stayMode: 'open' | 'exclusive'
  occupied: OccupiedDates[]
  arrival: string
  departure: string
  onSelectArrival: (date: string) => void
  onSelectDeparture: (date: string) => void
  onSelectionError: (error: string | null) => void
}

const weekdayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const weekdayShortNames = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(parseDate(value))
}

export default function AvailabilityCalendar({
  today,
  maxDate,
  guestCount,
  stayMode,
  occupied,
  arrival,
  departure,
  onSelectArrival,
  onSelectDeparture,
  onSelectionError,
}: AvailabilityCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseDate(today)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(visibleMonth)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const selectedRangeHasConflict = Boolean(
    arrival && departure && stayHasConflict(arrival, departure, occupied, guestCount, stayMode),
  )

  function selectDay(value: string, isOccupied: boolean) {
    onSelectionError(null)

    if (departure && value === departure) {
      onSelectDeparture('')
      return
    }

    if (!arrival || departure || value <= arrival) {
      if (isOccupied) return
      onSelectArrival(value)
      onSelectDeparture('')
      return
    }

    if (stayHasConflict(arrival, value, occupied, guestCount, stayMode)) {
      onSelectionError('La période choisie traverse des dates occupées. Choisis un autre jour de départ.')
      return
    }

    onSelectDeparture(value)
  }

  return (
    <section aria-labelledby="availability-title" className="mb-8 rounded-lg bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="availability-title" className="text-xl font-semibold">Disponibilités</h2>
          <p className="mt-1 text-sm text-slate-600">Clique un jour libre pour choisir l’arrivée, puis un autre pour le départ.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Mois précédent"
            disabled={dateKey(visibleMonth).slice(0, 7) <= today.slice(0, 7)}
            onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}
            className="rounded border border-slate-400 px-3 py-2 font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
            <span aria-hidden="true">←</span>
          </button>
          <h3 aria-live="polite" className="min-w-36 text-center font-semibold capitalize">{monthLabel}</h3>
          <button type="button" aria-label="Mois suivant"
            disabled={dateKey(visibleMonth).slice(0, 7) >= maxDate.slice(0, 7)}
            onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}
            className="rounded border border-slate-400 px-3 py-2 font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700">
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <ul aria-label="Légende des disponibilités" className="my-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="size-4 rounded border border-green-700 bg-green-100" />Libre</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="size-4 rounded border border-red-700 bg-red-100" />Occupé</li>
        <li>Les séjours ouverts peuvent être partagés dans la limite de 30 personnes.</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="size-4 rounded border border-slate-400 bg-slate-200" />Passé</li>
      </ul>
      <p className="mb-3 text-sm text-slate-600">
        Les noms sont affichés uniquement pour les séjours confirmés et visibles aux membres connectés.
      </p>

      <div role="grid" aria-labelledby="availability-title" className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {weekdayNames.map((name, index) => (
          <div key={name} role="columnheader" aria-label={name}
            className="py-2 text-center text-xs font-semibold text-slate-700 sm:text-sm">
            <span aria-hidden="true" className="sm:hidden">{weekdayShortNames[index]}</span>
            <span aria-hidden="true" className="hidden sm:inline">{name}</span>
          </div>
        ))}
        {Array.from({ length: cellCount }, (_, cellIndex) => {
          const day = cellIndex - firstWeekday + 1
          if (day < 1 || day > daysInMonth) {
            return <div key={`empty-${cellIndex}`} role="gridcell" aria-hidden="true" className="min-h-11 sm:min-h-14" />
          }

          const value = dateKey(new Date(year, month, day))
          const isPast = value < today
          const period = occupied.find(item => value >= item.start_date && value < item.end_date)
          const remaining = remainingCapacity(value, occupied, stayMode)
          const isOccupied = remaining < guestCount
          const isArrival = value === arrival
          const isDeparture = value === departure
          const inSelectedRange = Boolean(arrival && departure && value > arrival && value < departure)
          const isToday = value === today
          const canSelectOccupiedCheckout = Boolean(
            isOccupied && arrival && (!departure || isDeparture) &&
            value > arrival && !stayHasConflict(arrival, value, occupied, guestCount, stayMode),
          )
          const stateLabel = isPast ? 'passé'
            : isOccupied ? `${canSelectOccupiedCheckout ? 'occupé, mais départ possible ce jour' : 'occupé, indisponible'}${period?.guest_name ? `, séjour de ${period.guest_name}` : ''}`
              : `disponible, ${remaining} place(s) restante(s)`
          const selectionLabel = isArrival ? ' arrivée sélectionnée'
            : isDeparture ? ' départ sélectionné'
              : inSelectedRange ? ' dans la période choisie'
                : ''
          const disabled = isPast || value > maxDate || (value === maxDate && !arrival) || (isOccupied && !canSelectOccupiedCheckout)
          const stateColour = isPast
            ? 'border-slate-300 bg-slate-200 text-slate-500'
            : isOccupied
              ? 'border-red-700 bg-red-100 text-red-950'
              : 'border-green-700 bg-green-100 text-green-950 hover:bg-green-200'
          const selectedColour = isArrival || isDeparture
            ? 'ring-2 ring-indigo-700 ring-offset-1 font-bold'
            : inSelectedRange ? 'outline outline-2 outline-indigo-400' : ''

          return (
            <div key={value} role="gridcell" aria-selected={isArrival || isDeparture}
              className="min-h-11 sm:min-h-14">
              <button type="button"
                disabled={disabled}
                aria-label={`${formatLongDate(value)}, ${stateLabel}${selectionLabel}`}
                title={period?.guest_name ? `Séjour confirmé : ${period.guest_name}` : undefined}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isArrival || isDeparture}
                onClick={() => selectDay(value, isOccupied)}
                className={`flex size-full min-h-14 flex-col items-center justify-center rounded border text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 sm:min-h-16 sm:text-base disabled:cursor-not-allowed ${stateColour} ${selectedColour}`}>
                <span>{day}</span>
                {period?.guest_name && (
                  <span aria-hidden="true" className="max-w-full truncate px-0.5 text-[9px] font-medium leading-3 sm:text-[10px]">
                    {period.guest_name.split(/\s+/)[0]}
                  </span>
                )}
                {isToday && <span className="sr-only">, aujourd’hui</span>}
              </button>
            </div>
          )
        })}
      </div>

      {arrival && (
        <p aria-live="polite" className="mt-4 text-sm text-slate-700">
          Arrivée choisie : <strong>{formatLongDate(arrival)}</strong>
          {departure ? <> · Départ choisi : <strong>{formatLongDate(departure)}</strong></> : ' · Choisis maintenant le jour du départ.'}
        </p>
      )}
      {selectedRangeHasConflict && (
        <p role="status" className="mt-2 text-sm text-amber-900">La période choisie traverse des dates occupées.</p>
      )}
      {occupied.some(period => period.guest_name) && (
        <section aria-labelledby="confirmed-stays-title" className="mt-5 border-t border-slate-200 pt-4">
          <h3 id="confirmed-stays-title" className="font-semibold">Séjours confirmés</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {occupied.filter(period => period.guest_name).map(period => (
              <li key={`${period.start_date}-${period.end_date}-${period.guest_name}`}>
                {formatLongDate(period.start_date)} — départ {formatLongDate(period.end_date)} : <strong>{period.guest_name}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
