import { useCallback, useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { addOwnerBlock, confirmBooking, getMyBookingRequests, getOwnerOccupiedPeriods, rejectBooking, removeOwnerBlock } from '../lib/bookings'
import type { BookingRequest, OwnerOccupiedPeriod } from '../lib/bookings'
import { branches, brusselsToday, dateBefore, familyYear, getFamilySettings, getPriorities, saveFamilySettings, validateBookingRate } from '../lib/family'
import { supabase } from '../lib/supabase'
import { getBookingErrorMessage } from '../lib/bookings'
import MemberManagement from '../components/MemberManagement'
import { formatMoney, workflowAction } from '../lib/memberWorkflows'
import { getCapabilities } from '../lib/management'

interface Member { user_id: string; first_name: string; last_name: string; branch: string }
interface Delivery { id: string; kind: string; state: string; attempts: number; last_error: string | null; created_at: string }
const statusLabels = { pending: 'À approuver', approved: 'Approuvée — différée', confirmed: 'Confirmée', rejected: 'Refusée', cancelled: 'Annulée' }
const inputClass = 'mt-1 block w-full rounded-xl border border-slate-400 bg-white p-3'
const buttonClass = 'rounded-xl bg-indigo-700 px-4 py-2 font-medium text-white disabled:opacity-50'

function centsFrom(value: string) {
  if (!/^\d+([.,]\d{1,2})?$/.test(value)) throw new Error('Indique un tarif positif avec deux décimales maximum.')
  const result = Math.round(Number(value.replace(',', '.')) * 100)
  if (!Number.isSafeInteger(result) || result <= 0 || result > 2147483647) throw new Error('Tarif invalide.')
  return result
}

export default function Owner() {
  const [owner, setOwner] = useState<boolean | null>(null)
  const [generalAdmin, setGeneralAdmin] = useState(false)
  const [requests, setRequests] = useState<BookingRequest[]>([])
  const [periods, setPeriods] = useState<OwnerOccupiedPeriod[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [year, setYear] = useState(familyYear(brusselsToday()))
  const [branch, setBranch] = useState('helene')
  const [rate, setRate] = useState('')
  const [transfer, setTransfer] = useState('')
  const [filter, setFilter] = useState('active')
  const [blockStart, setBlockStart] = useState('')
  const [blockEnd, setBlockEnd] = useState('')
  const [blockNote, setBlockNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const reload = useCallback(async () => {
    const capabilities = await getCapabilities()
    const allowed = capabilities.manage_bookings
    setOwner(allowed)
    setGeneralAdmin(capabilities.general_admin)
    if (!allowed) {
      setRequests([])
      setPeriods([])
      setMembers([])
      setDeliveries([])
      return false
    }
    if (!supabase) throw new Error('Supabase indisponible.')
    const [nextRequests, nextPeriods, settings, priorities, profiles, emails] = await Promise.all([
      getMyBookingRequests(), getOwnerOccupiedPeriods(), getFamilySettings(), getPriorities(),
      supabase.from('member_profiles').select('user_id,first_name,last_name,branch').order('last_name').returns<Member[]>(),
      capabilities.general_admin ? supabase.from('email_outbox').select('id,kind,state,attempts,last_error,created_at').order('created_at', { ascending: false }).limit(50).returns<Delivery[]>()
        : Promise.resolve({ data: [], error: null }),
    ])
    if (profiles.error) throw new Error(getBookingErrorMessage(profiles.error))
    if (emails.error) throw new Error(getBookingErrorMessage(emails.error))
    setRequests(nextRequests)
    setPeriods(nextPeriods)
    setMembers(profiles.data)
    setDeliveries(emails.data)
    setRate(settings.rate_cents ? (settings.rate_cents / 100).toFixed(2) : '')
    setTransfer(settings.transfer_instructions ?? '')
    setBranch(priorities.find(p => p.start_year === year)?.branch ?? '')
    setRevision(value => value + 1)
    return true
  }, [year])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(reload).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.') })
    return () => { active = false }
  }, [reload])

  async function action(fn: () => Promise<unknown>, message: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      await reload()
      setNotice(message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action impossible. Réessaie.')
    } finally { setBusy(false) }
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    await action(async () => {
      if (!Number.isInteger(year) || !branches[branch]) throw new Error('Choisis une année et une branche.')
      await saveFamilySettings(year, branch, rate ? centsFrom(rate) : null, transfer)
    }, 'Paramètres enregistrés et demandes approuvées réévaluées.')
  }

  const sortedRequests = [...requests].sort((a, b) =>
    Number(!['pending', 'approved'].includes(a.status)) - Number(!['pending', 'approved'].includes(b.status))
    || a.check_in.localeCompare(b.check_in))
  const visible = sortedRequests.filter(r => filter === 'all'
    || (filter === 'active' ? ['pending', 'approved'].includes(r.status) : filter === 'conflict' ? r.conflict : r.status === filter))

  return <section className="mx-auto max-w-5xl space-y-7">
    <h1 className="text-4xl font-semibold">Gestion des Bicoquins</h1>
    {error && <p role="alert" className="rounded bg-red-50 p-4 text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded bg-green-50 p-4 text-green-900">{notice}</p>}
    <button className={buttonClass} disabled={busy} onClick={() => void action(reload, 'Données actualisées.')}>Actualiser</button>
    {owner === null && !error && <p role="status">Vérification des droits...</p>}
    {owner === false && <p>Cette page est réservée aux administrateurs généraux et aux responsables de branche. Leur attribution se fait dans la liste des membres, pas par auto-activation.</p>}
    {owner && <>
      <form onSubmit={save} className="space-y-4 rounded-2xl bg-white/85 p-6">
        <h2 className="text-xl font-semibold">Priorité familiale et récapitulatifs de virement</h2>
        <p>30 personnes maximum par nuit, tous groupes cumulés. L’année familiale va du 1er juillet au 30 juin.</p>
        <label className="block">Année de début
          <input type="number" min="2000" max="2200" value={year} onChange={e => setYear(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="block">Branche prioritaire {year}–{year + 1}
          <select required value={branch} onChange={e => setBranch(e.target.value)} className={inputClass}>
            <option value="">À configurer</option>
            {Object.entries(branches).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="block">Tarif en EUR par personne estimée et par nuit
          <input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} className={inputClass} placeholder="À définir" />
        </label>
        <label className="block">Instructions de virement (bénéficiaire, IBAN, communication)
          <textarea maxLength={2000} value={transfer} onChange={e => setTransfer(e.target.value)} className={inputClass} />
        </label>
        <p className="text-sm">Aucun paiement sur le site. Sans tarif ou instructions, les récapitulatifs restent en attente. Un tarif déjà validé pour un séjour ne change pas rétroactivement.</p>
        <button disabled={busy} className={buttonClass}>Enregistrer</button>
      </form>

      <section className="space-y-4 rounded-2xl bg-white/85 p-6">
        <h2 className="text-xl font-semibold">Demandes et séjours</h2>
        <select aria-label="Filtrer les demandes" value={filter} onChange={e => setFilter(e.target.value)} className={inputClass}>
          <option value="active">À traiter et approuvées</option><option value="conflict">Conflits</option>
          <option value="confirmed">Confirmées</option><option value="all">Toutes</option>
        </select>
        {visible.length === 0 && <p>Aucune demande dans cette vue.</p>}
        <ul className="space-y-5">{visible.map(r => <li key={r.id} className="space-y-2 border-t border-slate-200 pt-4">
          <h3 className="font-semibold">{r.guest_first_name} {r.guest_last_name} — {r.check_in} au {r.check_out}</h3>
          <p>{r.branch ? branches[r.branch] : 'Branche à vérifier'} · {r.guest_count} personnes estimées · {r.stay_mode === 'open' ? 'Ouvert au partage' : 'Exclusif'} · {statusLabels[r.status]}</p>
          <p><a href={`mailto:${r.guest_email}`} className="text-indigo-700 underline">{r.guest_email}</a> · horaires prévus : {r.planned_arrival_time.slice(0, 5)} / {r.planned_departure_time.slice(0, 5)}</p>
          {r.guest_note && <p className="whitespace-pre-wrap">{r.guest_note}</p>}
          {r.approved_at && <p className="text-sm">Approuvée le {new Date(r.approved_at).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' })} · échéance hors tour : {dateBefore(r.check_in, 21)}</p>}
          {r.confirmed_at && <p className="text-sm">Confirmée le {new Date(r.confirmed_at).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' })}</p>}
          {r.conflict && <p className="text-amber-900">Conflit de disponibilité ou de capacité : non confirmée.</p>}
          {['pending', 'approved'].includes(r.status) && <div className="flex flex-wrap gap-3">
            <button disabled={busy} className={buttonClass} onClick={() => void action(() => confirmBooking(r.id), 'Approbation enregistrée. Vérifie le statut : confirmation immédiate ou différée selon la branche et les disponibilités.')}>Approuver / réévaluer</button>
            <button disabled={busy} className={buttonClass} onClick={() => void action(() => rejectBooking(r.id), 'Demande refusée.')}>Refuser</button>
          </div>}
          {r.status === 'confirmed' && !r.billing_ready && <button disabled={busy || !rate} className={buttonClass}
            onClick={() => void action(() => validateBookingRate(r.id, centsFrom(rate)), 'Tarif du séjour validé.')}>
            Valider le tarif de ce séjour : {rate || 'à définir'} EUR/personne/nuit
          </button>}
          {r.status === 'confirmed' && r.billing_ready && r.rate_cents !== null && <div className="space-y-2">
            <p>Paiement : {formatMoney(r.guest_count * Math.round((Date.parse(r.check_out) - Date.parse(r.check_in)) / 86400000) * r.rate_cents)} · {r.paid_at ? 'Reçu' : 'Non enregistré'}</p>
            <button disabled={busy} className={buttonClass} onClick={() => {
              const reason = r.paid_at ? window.prompt('Motif de correction du paiement reçu (obligatoire) :') : null
              if (r.paid_at && !reason?.trim()) return
              if (!r.paid_at && !window.confirm('Confirmer la réception du paiement TOTAL de ce séjour ?')) return
              void action(() => workflowAction('owner_set_booking_paid', {
                p_id: r.id, p_paid: !r.paid_at, p_reason: reason,
              }), r.paid_at ? 'Correction enregistrée dans l’historique.' : 'Paiement reçu enregistré.')
            }}>{r.paid_at ? 'Corriger le paiement reçu' : 'Marquer le paiement reçu'}</button>
          </div>}
          {['pending', 'approved', 'confirmed'].includes(r.status) && <button disabled={busy} className="text-red-800 underline" onClick={() => {
            const reason = window.prompt('Motif de l’annulation administrateur (obligatoire) :')
            if (!reason?.trim() || !window.confirm('Annuler ce séjour et libérer ses dates ?')) return
            void action(() => workflowAction('cancel_family_booking', { p_id: r.id, p_reason: reason }), 'Séjour annulé ; dates libérées et demandes réévaluées.')
          }}>Annuler le séjour (admin)</button>}
        </li>)}</ul>
      </section>

      <section className="rounded-2xl bg-white/85 p-6">
        <h2 className="text-xl font-semibold">Bloquer la maison</h2>
        <form className="mt-3 space-y-3" onSubmit={e => {
          e.preventDefault()
          void action(() => addOwnerBlock({ startDate: blockStart, endDate: blockEnd, note: blockNote }), 'Période bloquée.')
        }}>
          <label className="block">Arrivée incluse<input required type="date" min={brusselsToday()} value={blockStart} onChange={e => setBlockStart(e.target.value)} className={inputClass} /></label>
          <label className="block">Départ exclu<input required type="date" min={blockStart} value={blockEnd} onChange={e => setBlockEnd(e.target.value)} className={inputClass} /></label>
          <label className="block">Note<input maxLength={500} value={blockNote} onChange={e => setBlockNote(e.target.value)} className={inputClass} /></label>
          <button disabled={busy || !blockStart || blockEnd <= blockStart} className={buttonClass}>Bloquer</button>
        </form>
        <ul className="mt-4 space-y-2">{periods.filter(p => p.source_type === 'owner_block').map(p => <li key={p.id}>
          {p.start_date} — {p.end_date} {p.note}
          <button disabled={busy} className="ml-3 text-red-700 underline" onClick={() => void action(() => removeOwnerBlock(p.id), 'Blocage supprimé.')}>Supprimer</button>
        </li>)}</ul>
      </section>

      {generalAdmin && <section className="space-y-3 rounded-2xl bg-white/85 p-6">
        <h2 className="text-xl font-semibold">Profils des membres</h2>
        <p>Une correction de branche ne modifie pas les demandes déjà enregistrées.</p>
        {members.map(member => <MemberEditor key={member.user_id} member={member} busy={busy} run={action} />)}
      </section>}
      {generalAdmin && <section className="space-y-3 rounded-2xl bg-white/85 p-6">
        <h2 className="text-xl font-semibold">Suivi des 50 derniers e-mails</h2>
        <p>Un état « sent » indique l’acceptation par le fournisseur, pas la réception ni le paiement. Un envoi non résolu après 23 h nécessite une vérification manuelle pour éviter les doublons.</p>
        {deliveries.length === 0 && <p>Aucun envoi enregistré.</p>}
        <ul className="space-y-2">{deliveries.map(d => <li key={d.id}>
          {d.kind} · {d.state} · {d.attempts} tentative(s) · {d.last_error ?? 'Aucune erreur enregistrée'}
          {['failed', 'pending', 'sending'].includes(d.state) && <button disabled={busy} className="ml-3 underline" onClick={() => {
            if (!window.confirm('Vérifie dans Resend que cet e-mail n’a PAS été accepté ou envoyé. Une réponse réseau incertaine peut cacher un envoi réussi. Confirmes-tu cette vérification avant de réautoriser l’envoi ?')) return
            void action(async () => {
              if (!supabase) throw new Error('Supabase indisponible.')
              const { error } = await supabase.rpc('owner_retry_family_email', { p_id: d.id, p_delivery_checked: true })
              if (error) throw new Error(getBookingErrorMessage(error))
            }, 'Nouvelle tentative autorisée.')
          }}>Réautoriser après vérification</button>}
        </li>)}</ul>
      </section>}
      <MemberManagement revision={revision} generalAdmin={generalAdmin} onRolesChanged={reload} />
    </>}
  </section>
}

function MemberEditor({ member, busy, run }: {
  member: Member; busy: boolean; run: (fn: () => Promise<unknown>, message: string) => Promise<void>
}) {
  const [branch, setBranch] = useState(member.branch)
  return <form className="flex flex-wrap items-center gap-3 border-t pt-3" onSubmit={e => {
    e.preventDefault()
    void run(async () => {
      if (!supabase) throw new Error('Supabase indisponible.')
      const { error } = await supabase.rpc('owner_update_member_profile', {
        p_user_id: member.user_id, p_first_name: member.first_name, p_last_name: member.last_name, p_branch: branch,
      })
      if (error) throw new Error(getBookingErrorMessage(error))
    }, 'Profil corrigé.')
  }}>
    <span>{member.first_name} {member.last_name}</span>
    <select aria-label={`Branche de ${member.first_name} ${member.last_name}`} value={branch} onChange={e => setBranch(e.target.value)} className="rounded border p-2">
      {Object.entries(branches).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <button disabled={busy || branch === member.branch} className={buttonClass}>Corriger</button>
  </form>
}
