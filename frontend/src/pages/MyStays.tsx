import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContentPage } from '../components/ContentPage'
import { cancellationAllowed, confirmationEligibility, formatMoney, getMyStays, stayStatus, workflowAction } from '../lib/memberWorkflows'
import type { Stay } from '../lib/memberWorkflows'

export default function MyStays() {
  const [stays, setStays] = useState<Stay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => {
    setError(null)
    try { setStays(await getMyStays()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Chargement impossible.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void Promise.resolve().then(reload) }, [reload])
  async function cancel(id: string) {
    setBusy(true)
    setError(null)
    try {
      await workflowAction('cancel_family_booking', { p_id: id })
      setCancelId(null)
      await reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'Annulation impossible.') }
    finally { setBusy(false) }
  }
  return <ContentPage title="Mes séjours" intro="Retrouve tes demandes, leurs confirmations et le suivi de tes paiements.">
    <div className="mb-5 flex gap-4">
      <Link className="underline" to="/reservation">Demander un séjour</Link>
      <Link className="underline" to="/sejour-pratique">Fiche pratique</Link>
      <button disabled={busy} className="underline" onClick={() => void reload()}>Actualiser</button>
    </div>
    {error && <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">{error}</p>}
    {loading && <p role="status">Chargement...</p>}
    {!loading && !error && !stays.length && <p>Aucune demande pour le moment.</p>}
    <ul className="space-y-5">{stays.map(stay => <li key={stay.id} className="space-y-3 rounded-2xl bg-white/85 p-6">
      <h2 className="text-xl font-semibold">{stay.check_in} → {stay.check_out}</h2>
      <p className="font-medium">{stayStatus(stay)}</p>
      <p>{stay.guest_count} personnes estimées · {stay.stay_mode === 'open' ? 'Ouvert au partage' : 'Exclusif'}</p>
      {stay.status === 'approved' && <p>Pour une branche non prioritaire, confirmation possible à partir du {confirmationEligibility(stay)}.
        L’approbation ne réserve pas les dates. La confirmation dépend aussi de la priorité annuelle, des disponibilités et de la capacité.</p>}
      {stay.conflict && stay.status === 'approved' && <p className="text-amber-900">Un administrateur doit réexaminer le conflit ; la réservation n’est pas confirmée.</p>}
      {stay.status === 'confirmed' && <section className="space-y-2 border-t border-slate-200 pt-3">
        <h3 className="font-semibold">Paiement du séjour</h3>
        <p>{stay.amount_cents === null ? 'Montant à définir par un administrateur.' :
          `${formatMoney(stay.amount_cents)} — ${stay.paid_at ? 'Paiement reçu' : 'Paiement non enregistré'}`}</p>
        {stay.amount_cents !== null && stay.rate_cents !== null && <p className="text-sm">{stay.guest_count} personnes × {Math.round((Date.parse(stay.check_out) - Date.parse(stay.check_in)) / 86400000)} nuits × {formatMoney(stay.rate_cents)} par personne et par nuit.</p>}
        {!stay.paid_at && (stay.transfer_instructions
          ? <p className="whitespace-pre-wrap">{stay.transfer_instructions}</p>
          : <p>Instructions de virement à définir. Aucun paiement en ligne.</p>)}
      </section>}
      {cancellationAllowed(stay) && (cancelId !== stay.id
        ? <button className="text-red-800 underline" disabled={busy} onClick={() => setCancelId(stay.id)}>Annuler ce séjour</button>
        : <div className="space-y-3 rounded border border-red-300 p-4">
          <p>Confirmer l’annulation ? Les dates confirmées seront libérées. Cette action est définitive.</p>
          <button className="mr-4 text-red-800 underline" disabled={busy} onClick={() => void cancel(stay.id)}>Confirmer l’annulation</button>
          <button className="underline" disabled={busy} onClick={() => setCancelId(null)}>Conserver mon séjour</button>
        </div>)}
      {!cancellationAllowed(stay) && ['pending', 'approved', 'confirmed'].includes(stay.status) && <p className="text-sm">Pour annuler à partir du jour d’arrivée, contacte un administrateur.</p>}
    </li>)}</ul>
  </ContentPage>
}
