import { useCallback, useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import { getHistory, getMemberManagement, workflowAction } from '../lib/memberWorkflows'
import type { Administrator, HistoryEntry, Invitation } from '../lib/memberWorkflows'
import MemberRoles from './MemberRoles'
import { notifyRoleChange } from '../lib/management'
import type { ManagedMember } from '../lib/management'

const button = 'rounded-xl bg-indigo-700 px-4 py-2 text-white disabled:opacity-50'
const input = 'rounded-xl border border-slate-400 bg-white p-3'
const entities: Record<string, string> = {
  booking_requests: 'Séjours et paiements', occupied_periods: 'Occupations et blocages',
  house_settings: 'Paramètres', family_priorities: 'Priorités', member_profiles: 'Profils',
  member_invitations: 'Invitations', site_owners: 'Administrateurs',
  branch_managers: 'Responsables de branche',
}

export default function MemberManagement({ revision, generalAdmin, onRolesChanged }: { revision: number; generalAdmin: boolean; onRolesChanged: () => Promise<boolean> }) {
  const [administrators, setAdministrators] = useState<Administrator[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [page, setPage] = useState(0)
  const [entity, setEntity] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [invitationReason, setInvitationReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [members, setMembers] = useState<ManagedMember[]>([])
  const reload = useCallback(async () => {
    const [management, history] = await Promise.all([getMemberManagement(), getHistory(page, entity)])
    setAdministrators(management.administrators)
    setMembers(management.members)
    setInvitations(management.invitations)
    setEntries(history.entries)
    setHasMore(history.hasMore)
  }, [page, entity])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(reload).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.') })
    return () => { active = false }
  }, [reload, revision])
  async function perform(name: string, args: Record<string, string>, message: string) {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try {
      await workflowAction(name, args)
      await reload()
      setNotice(message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Action impossible.') }
    finally { setBusy(false) }
  }
  async function invite(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (role === 'admin' && !window.confirm('Réserver une place admin général pour cette adresse ? Si son compte est déjà vérifié, les droits sont attribués immédiatement.')) return
    await perform('owner_invite_member', { p_email: email.trim(), p_role: role, p_reason: invitationReason.trim() },
      'Invitation enregistrée. Aucun e-mail envoyé. Pour un compte déjà vérifié, les droits demandés sont appliqués immédiatement.')
  }
  async function copyLink() {
    setError(null); setNotice(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/inscription`)
      setNotice('Lien public d’inscription copié. Il ne contient aucun droit administrateur.')
    } catch { setError('Copie impossible. Copie manuellement le lien affiché ci-dessous.') }
  }
  return <>
    <MemberRoles members={members} generalAdmin={generalAdmin} onChanged={async () => {
      notifyRoleChange()
      if (await onRolesChanged()) await reload()
    }} />
    <section className="space-y-4 rounded-2xl bg-white/85 p-6">
      <h2 className="text-xl font-semibold">Membres et administrateurs</h2>
      {error && <p role="alert" className="text-red-800">{error}</p>}
      {notice && <p role="status" className="text-green-900">{notice}</p>}
      <p>Deux administrateurs généraux maximum, invitations admin en attente comprises, et trois places de responsable de branche. Aucun droit ne peut être choisi par un nouvel inscrit.</p>
      <ul>{administrators.map(admin => <li key={admin.user_id}>{admin.email} — administrateur</li>)}</ul>
      <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">Adresse e-mail
          <input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className={input} />
        </label>
        <label className="grid gap-1">Rôle
          <select value={role} onChange={e => setRole(e.target.value)} className={input}>
            <option value="member">Membre</option>{generalAdmin && <option value="admin">Administrateur général</option>}
          </select>
        </label>
        {generalAdmin && role === 'admin' && <label className="grid gap-1">Motif de nomination
          <input required maxLength={500} value={invitationReason} onChange={e => setInvitationReason(e.target.value)} className={input} />
        </label>}
        <button disabled={busy} className={button}>Enregistrer l’invitation</button>
      </form>
      <p className="rounded bg-amber-50 p-3">Envois d’invitations désactivés en attendant le SMTP. L’invitation réserve les droits associés à cette adresse, mais ne crée pas de compte et n’envoie aucun message.</p>
      <p className="break-all">Lien public : {window.location.origin}/inscription</p>
      <button className={button} onClick={() => void copyLink()}>Copier le lien d’inscription</button>
      <p className="text-sm">La personne doit utiliser exactement l’adresse invitée, confirmer son e-mail et compléter son profil. Les autres membres peuvent aussi s’inscrire librement. Les inscriptions nécessitent un SMTP opérationnel pour recevoir leur confirmation.</p>
      <ul className="space-y-3">{invitations.map(invitation => <li key={invitation.id} className="border-t pt-3">
        <p>{invitation.email} · {invitation.role === 'admin' ? 'Administrateur' : 'Membre'} · {invitation.cancelled_at ? 'Annulée' : invitation.accepted_at ? 'Compte vérifié' : 'En attente de compte vérifié — aucun e-mail envoyé'}</p>
        {!invitation.cancelled_at && !invitation.accepted_at && <button disabled={busy} className="text-red-800 underline"
          onClick={() => {
            if (window.confirm('Annuler cette invitation et libérer sa place administrateur éventuelle ?'))
              void perform('owner_cancel_invitation', { p_id: invitation.id }, 'Invitation annulée.')
          }}>Annuler l’invitation</button>}
      </li>)}</ul>
    </section>
    <section className="space-y-4 rounded-2xl bg-white/85 p-6">
      <h2 className="text-xl font-semibold">Historique des actions</h2>
      <p className="text-sm">Depuis l’installation de ce journal uniquement. Les actions antérieures ne sont pas reconstituées. Les coordonnées bancaires et secrets ne sont pas copiés dans le journal.</p>
      <label className="grid gap-1">Type d’action
        <select value={entity} onChange={e => { setEntity(e.target.value); setPage(0) }} className={input}>
          <option value="">Tous</option>{Object.entries(entities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <button className="underline" onClick={() => void reload().catch(e => setError(e instanceof Error ? e.message : 'Chargement impossible.'))}>Actualiser l’historique</button>
      {entries.length === 0 && <p>Aucune action dans cette vue.</p>}
      <ul className="space-y-4">{entries.map(entry => <li key={entry.id} className="border-t pt-3">
        <p className="font-medium">{entities[entry.entity] ?? entry.entity} · {entry.operation} · {new Date(entry.created_at).toLocaleString('fr-BE')}</p>
        <p className="break-all text-sm">Acteur : {entry.actor_kind === 'system' ? 'Traitement automatique / serveur' :
          administrators.find(a => a.user_id === entry.actor_id)?.email ?? entry.actor_id} · Référence : {entry.entity_id}</p>
        {entry.reason && <p>Motif : {entry.reason}</p>}
        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(entry.details, null, 2)}</pre>
      </li>)}</ul>
      <div className="flex gap-4">
        <button className={button} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Précédent</button>
        <span>Page {page + 1}</span>
        <button className={button} disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Suivant</button>
      </div>
    </section>
  </>
}
